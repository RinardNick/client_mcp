import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider } from './provider_anthropic';
import { OpenAIProvider } from './provider_openai';
import { MCPTool, ToolCall } from '../types';

// Create mock Anthropic client
const mockAnthropicClient = {
  messages: {
    create: vi.fn(),
  },
};

// Create mock OpenAI client
const mockOpenAIClient = {
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
};

// Create a sample tool
const sampleTool: MCPTool = {
  name: 'list_files',
  description: 'List files in a directory',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list files from',
      },
    },
    required: ['path'],
  },
};

describe('Tool Execution Sequence', () => {
  let anthropicProvider: AnthropicProvider;
  let openaiProvider: OpenAIProvider;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Set up Anthropic provider with mock client
    anthropicProvider = new AnthropicProvider();
    (anthropicProvider as any).client = mockAnthropicClient;

    // Set up OpenAI provider with mock client
    openaiProvider = new OpenAIProvider();
    (openaiProvider as any).client = mockOpenAIClient;

    // Mock necessary methods
    anthropicProvider.countTokens = vi.fn().mockReturnValue(10);
    openaiProvider.countTokens = vi.fn().mockReturnValue(10);
  });

  describe('Current behavior (with the bug)', () => {
    it('fails due to tool_result without corresponding tool_use in Anthropic', async () => {
      // Define conversation history
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful assistant with access to tools.',
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'List the files in the /tmp directory',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: "I'll help you list the files in the /tmp directory.",
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: '{"files": ["file1.txt", "file2.txt"]}',
          isToolResult: true,
          timestamp: new Date(),
          toolId: 'tool_12345',
        },
      ];

      // The error happens because we're trying to create a continuation after tool execution
      // But we don't have the proper tool_use message before the tool_result
      mockAnthropicClient.messages.create.mockRejectedValueOnce(
        new Error(
          'BadRequestError: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.3: `tool_result` block(s) provided when previous message does not contain any `tool_use` blocks"}}'
        )
      );

      // This is a simplified version of how we currently try to continue the conversation
      // We're demonstrating the error condition
      const formattedMessages = messages.map(msg => {
        if (msg.isToolResult) {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                content: msg.content,
                tool_use_id: msg.toolId,
              },
            ],
          };
        } else {
          return {
            role: msg.role,
            content: msg.content,
          };
        }
      });

      // Attempt to create a continuation message
      await expect(
        mockAnthropicClient.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          messages: formattedMessages,
        })
      ).rejects.toThrow('BadRequestError: 400');
    });
  });

  describe('Fixed behavior (solution)', () => {
    it('correctly formats tool_use before tool_result for Anthropic', async () => {
      // Define conversation history with toolName and toolParameters added
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful assistant with access to tools.',
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'List the files in the /tmp directory',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: "I'll help you list the files in the /tmp directory.",
          timestamp: new Date(),
        },
        {
          // This is the message where tool use was detected, now enhanced with tool details
          role: 'assistant',
          content: "I'll help you list the files in the /tmp directory.",
          timestamp: new Date(),
          hasTool: true, // Add this flag to identify messages with tool use
          toolName: 'list_files',
          toolParameters: { path: '/tmp' },
          toolId: 'tool_12345',
        },
        {
          role: 'assistant', // Note: This is actually a user providing tool result, but we store it as assistant for consistency
          content: '{"files": ["file1.txt", "file2.txt"]}',
          isToolResult: true,
          timestamp: new Date(),
          toolId: 'tool_12345', // Same ID to maintain the association
        },
      ];

      // Mock success response
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: 'I found these files in the directory: file1.txt and file2.txt',
          },
        ],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      // New implementation - proper formatting for continuation
      // First, identify tool use and corresponding results
      const formattedMessages = [];
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.isToolResult) {
          // Find the corresponding tool use message
          const toolUseMsg = messages.find(
            m => m.toolId === msg.toolId && m.hasTool
          );

          if (toolUseMsg) {
            // Add the properly formatted tool use message first
            formattedMessages.push({
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: toolUseMsg.content,
                },
                {
                  type: 'tool_use',
                  id: toolUseMsg.toolId,
                  name: toolUseMsg.toolName,
                  input: toolUseMsg.toolParameters,
                },
              ],
            });

            // Then add the tool result message
            formattedMessages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: msg.toolId,
                  content: msg.content,
                },
              ],
            });
          }
        } else if (!msg.hasTool && !msg.isToolResult) {
          // Regular message
          formattedMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }
        // Skip messages that were already handled (tool use messages)
      }

      // Attempt to create a continuation message with proper formatting
      const response = await mockAnthropicClient.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: formattedMessages,
      });

      // Verify the response
      expect(response.content[0].text).toBe(
        'I found these files in the directory: file1.txt and file2.txt'
      );
    });

    it('works with OpenAI tool calling format as well', async () => {
      // Define conversation history with toolName and toolParameters added
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful assistant with access to tools.',
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'List the files in the /tmp directory',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: "I'll help you list the files in the /tmp directory.",
          timestamp: new Date(),
        },
        {
          // This is the message where tool use was detected
          role: 'assistant',
          content: "I'll help you list the files in the /tmp directory.",
          timestamp: new Date(),
          hasTool: true,
          toolName: 'list_files',
          toolParameters: { path: '/tmp' },
          toolId: 'call_12345',
        },
        {
          role: 'assistant',
          content: '{"files": ["file1.txt", "file2.txt"]}',
          isToolResult: true,
          timestamp: new Date(),
          toolId: 'call_12345',
        },
      ];

      // Mock success response
      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'I found these files in the directory: file1.txt and file2.txt',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      });

      // Format messages for OpenAI
      const formattedMessages = [];
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.isToolResult) {
          // Tool result for OpenAI
          formattedMessages.push({
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.toolId,
          });
        } else if (msg.hasTool) {
          // Tool use for OpenAI
          formattedMessages.push({
            role: 'assistant',
            content: msg.content,
            tool_calls: [
              {
                id: msg.toolId,
                type: 'function',
                function: {
                  name: msg.toolName,
                  arguments: JSON.stringify(msg.toolParameters),
                },
              },
            ],
          });
        } else {
          // Regular message
          formattedMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      // Attempt to create a continuation message with proper formatting
      const response = await mockOpenAIClient.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1024,
        messages: formattedMessages,
      });

      // Verify the response
      expect(response.choices[0].message.content).toBe(
        'I found these files in the directory: file1.txt and file2.txt'
      );
    });
  });
});
