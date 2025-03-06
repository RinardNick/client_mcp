import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from './session';
import { AnthropicProvider } from './provider/anthropic-provider';
import { OpenAIProvider } from './provider/openai-provider';
import { GrokProvider } from './provider/grok-provider';
import { ChatMessage } from './types';
import { LLMConfig } from '../config/types';
import { createToolUseMessage, createToolResultMessage } from './utils';

// Mock the provider APIs
vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll help you list files.",
          },
          {
            type: 'tool_use',
            id: 'tool_12345',
            name: 'list_files',
            input: { path: '/tmp' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    };
  },
}));

vi.mock('openai', () => {
  return {
    OpenAI: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: "I'll help you list files.",
                  tool_calls: [
                    {
                      id: 'tool_12345',
                      type: 'function',
                      function: {
                        name: 'list_files',
                        arguments: '{"path":"/tmp"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }),
        },
      };
    },
  };
});

// Mock the Grok client - fixed mock implementation
vi.mock('./grok-client', () => {
  const mockClient = {
    streamChatCompletion: vi.fn().mockImplementation(() => {
      const events = [
        {
          type: 'content',
          content: "I'll help you list files.",
        },
        {
          type: 'function_call',
          name: 'list_files',
          arguments: { path: '/tmp' },
        },
        { type: 'done' },
      ];

      return {
        events,
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next: async () => {
              if (i < events.length) {
                return { done: false, value: events[i++] };
              }
              return { done: true, value: undefined };
            },
          };
        },
      };
    }),
  };

  return {
    default: vi.fn(() => mockClient),
  };
});

describe('Tool Execution Integration', () => {
  // Test with Anthropic provider
  describe('Anthropic Provider', () => {
    let sessionManager: SessionManager;
    let validConfig: LLMConfig;

    beforeEach(() => {
      // Reset mocks
      vi.clearAllMocks();

      // Create session manager and mock tools
      sessionManager = new SessionManager();

      // Mock executeTool method to return a specific result
      const executeTool = vi.spyOn(sessionManager as any, 'executeTool');
      executeTool.mockResolvedValue({ files: ['file1.txt', 'file2.txt'] });

      // Create valid config
      validConfig = {
        type: 'anthropic',
        api_key: 'test-key',
        model: 'claude-3-opus-20240229',
        system_prompt: 'You are a helpful assistant.',
      };
    });

    it('successfully executes a tool with Anthropic provider', async () => {
      // Initialize a session with Anthropic provider
      const session = await sessionManager.initializeSession(validConfig);

      // Set up a mock tool
      const toolName = 'list_files';
      const toolParameters = { path: '/tmp' };
      const assistantContent = "I'll help you list files.";

      // Execute the tool and get the result
      const result = await sessionManager.executeToolAndAddResult(
        session.id,
        toolName,
        toolParameters,
        assistantContent
      );

      // Verify the result
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');

      // Check that the messages contain tool use and tool result
      const toolUseMsg = session.messages.find(m => m.hasToolCall);
      const toolResultMsg = session.messages.find(m => m.isToolResult);

      expect(toolUseMsg).toBeDefined();
      expect(toolResultMsg).toBeDefined();

      if (toolUseMsg && toolResultMsg) {
        expect(toolUseMsg.toolId).toBe(toolResultMsg.toolId);
        expect(toolUseMsg.toolCall?.name).toBe(toolName);
        expect(JSON.parse(toolResultMsg.content)).toEqual({
          files: ['file1.txt', 'file2.txt'],
        });
      }
    });
  });

  // Test with OpenAI provider
  describe('OpenAI Provider', () => {
    let sessionManager: SessionManager;
    let validConfig: LLMConfig;

    beforeEach(() => {
      // Reset mocks
      vi.clearAllMocks();

      // Create session manager and mock tools
      sessionManager = new SessionManager();

      // Mock executeTool method to return a specific result
      const executeTool = vi.spyOn(sessionManager as any, 'executeTool');
      executeTool.mockResolvedValue({ files: ['file1.txt', 'file2.txt'] });

      // Create valid config
      validConfig = {
        type: 'openai',
        api_key: 'test-key',
        model: 'gpt-4',
        system_prompt: 'You are a helpful assistant.',
      };
    });

    it('successfully executes a tool with OpenAI provider', async () => {
      // Initialize a session with OpenAI provider
      const session = await sessionManager.initializeSession(validConfig);

      // Set up a mock tool
      const toolName = 'list_files';
      const toolParameters = { path: '/tmp' };
      const assistantContent = "I'll help you list files.";

      // Execute the tool and get the result
      const result = await sessionManager.executeToolAndAddResult(
        session.id,
        toolName,
        toolParameters,
        assistantContent
      );

      // Verify the result
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');

      // Check that the messages contain tool use and tool result
      const toolUseMsg = session.messages.find(m => m.hasToolCall);
      const toolResultMsg = session.messages.find(m => m.isToolResult);

      expect(toolUseMsg).toBeDefined();
      expect(toolResultMsg).toBeDefined();

      if (toolUseMsg && toolResultMsg) {
        expect(toolUseMsg.toolId).toBe(toolResultMsg.toolId);
        expect(toolUseMsg.toolCall?.name).toBe(toolName);
        expect(JSON.parse(toolResultMsg.content)).toEqual({
          files: ['file1.txt', 'file2.txt'],
        });
      }
    });
  });

  // Test with Grok provider
  describe('Grok Provider', () => {
    let sessionManager: SessionManager;
    let validConfig: LLMConfig;

    beforeEach(() => {
      // Reset mocks
      vi.clearAllMocks();

      // Create session manager and mock tools
      sessionManager = new SessionManager();

      // Mock executeTool method to return a specific result
      const executeTool = vi.spyOn(sessionManager as any, 'executeTool');
      executeTool.mockResolvedValue({ files: ['file1.txt', 'file2.txt'] });

      // Create valid config
      validConfig = {
        type: 'grok',
        api_key: 'test-key',
        model: 'grok-1',
        system_prompt: 'You are a helpful assistant.',
      };
    });

    it('successfully executes a tool with Grok provider', async () => {
      // Initialize a session with Grok provider
      const session = await sessionManager.initializeSession(validConfig);

      // Set up a mock tool
      const toolName = 'list_files';
      const toolParameters = { path: '/tmp' };
      const assistantContent = "I'll help you list files.";

      // Execute the tool and get the result
      const result = await sessionManager.executeToolAndAddResult(
        session.id,
        toolName,
        toolParameters,
        assistantContent
      );

      // Verify the result
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');

      // Check that the messages contain tool use and tool result
      const toolUseMsg = session.messages.find(m => m.hasToolCall);
      const toolResultMsg = session.messages.find(m => m.isToolResult);

      expect(toolUseMsg).toBeDefined();
      expect(toolResultMsg).toBeDefined();

      if (toolUseMsg && toolResultMsg) {
        expect(toolUseMsg.toolId).toBe(toolResultMsg.toolId);
        expect(toolUseMsg.toolCall?.name).toBe(toolName);
        expect(JSON.parse(toolResultMsg.content)).toEqual({
          files: ['file1.txt', 'file2.txt'],
        });
      }
    });
  });
});
