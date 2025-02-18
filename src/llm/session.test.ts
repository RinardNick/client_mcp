import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session';
import { LLMError } from './types';
import { LLMConfig } from '../config/types';
import { Anthropic } from '@anthropic-ai/sdk';
import { EventEmitter } from 'stream';

// Mock interfaces
interface MCPClient {
  invokeTool(
    name: string,
    parameters: Record<string, unknown>
  ): Promise<unknown>;
}

// Mock Anthropic SDK
const mockAnthropicInstance = {
  messages: {
    create: vi.fn().mockImplementation(options => {
      // Verify tools are properly passed
      if (options.tools) {
        console.log('Tools passed to mock:', options.tools);
      }

      // Check message content
      const messages = options.messages || [];
      const hasToolResult = messages.some(m => m.isToolResult);
      const isListFilesRequest = messages.some(
        m =>
          m.content.toLowerCase().includes('list') &&
          m.content.toLowerCase().includes('file')
      );

      if (options.stream) {
        return {
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' },
            };

            if (hasToolResult) {
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: 'I found these files: test.txt',
                },
              };
            } else {
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Let me check the files.' },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: '\n<tool>list-files {"path": "/tmp"}</tool>',
                },
              };
            }

            yield {
              type: 'content_block_stop',
              index: 0,
            };

            yield {
              type: 'message_stop',
            };
          },
        };
      }

      // Handle regular message responses
      if (hasToolResult) {
        return {
          id: 'msg_123',
          model: 'claude-3-sonnet-20240229',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I found these files: test.txt',
            },
          ],
        };
      } else if (isListFilesRequest) {
        return {
          id: 'msg_123',
          model: 'claude-3-sonnet-20240229',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check the files.\n<tool>list-files {"path": "/tmp"}</tool>',
            },
          ],
        };
      }

      // Default response
      return {
        id: 'msg_123',
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        content: [{ type: 'text', text: 'Mock response' }],
      };
    }),
  },
};

vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: vi.fn().mockImplementation(() => mockAnthropicInstance),
  };
});

// Mock server discovery
vi.mock('../server/discovery', () => ({
  ServerDiscovery: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'list-files',
          description: 'List files in a directory',
          parameters: { properties: {} },
        },
      ],
      resources: [{ name: 'filesystem', type: 'fs' }],
    }),
  })),
}));

// Mock server launcher
vi.mock('../server/launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue(undefined),
    getServerProcess: vi.fn().mockReturnValue({
      pid: 123,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    }),
  })),
}));

// Mock MCP Client
const mockMCPClient = {
  invokeTool: vi.fn().mockResolvedValue({ files: ['file1.txt', 'file2.txt'] }),
  tools: [
    {
      name: 'list-files',
      description: 'List files in a directory',
      parameters: { properties: {} },
    },
  ],
};

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let validConfig: LLMConfig;

  beforeEach(async () => {
    vi.clearAllMocks();
    validConfig = {
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-3-5-test-sonnet-20241022',
      system_prompt: 'You are a helpful assistant.',
    };

    sessionManager = new SessionManager();
  });

  it('should initialize a new session with valid config', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.mcpClient = mockMCPClient;

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.config).toEqual(validConfig);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.lastActivityAt).toBeInstanceOf(Date);
    expect(session.messages).toHaveLength(1); // Only system prompt
    expect(session.messages[0]).toEqual({
      role: 'system',
      content: validConfig.system_prompt,
    });
  });

  it('should retrieve an existing session', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.mcpClient = mockMCPClient;
    const retrieved = sessionManager.getSession(session.id);
    expect(retrieved).toEqual(session);
  });

  it('should throw error for non-existent session', () => {
    expect(() => sessionManager.getSession('non-existent')).toThrow(LLMError);
  });

  it('should update session activity timestamp', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.mcpClient = mockMCPClient;
    const originalTimestamp = session.lastActivityAt;

    // Wait a small amount to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1));

    sessionManager.updateSessionActivity(session.id);
    const updated = sessionManager.getSession(session.id);

    expect(updated.lastActivityAt.getTime()).toBeGreaterThan(
      originalTimestamp.getTime()
    );
  });

  it('should send a message and receive a response', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.mcpClient = mockMCPClient;
    const message = 'Hello';

    const response = await sessionManager.sendMessage(session.id, message);

    expect(response).toEqual({
      role: 'assistant',
      content: 'Mock response',
      hasToolCall: false,
      toolCall: undefined,
    });
  });

  describe('Tool Invocation (User Story 2.4)', () => {
    it('should execute tools and incorporate results into conversation', async () => {
      // Setup
      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = mockMCPClient;

      // 1. Assistant response with tool invocation
      mockAnthropicInstance.messages.create.mockResolvedValueOnce({
        id: 'test-id',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Let me check the files.\n<tool>list-files {"path": "/tmp"}</tool>',
          },
        ],
      });

      // 2. Assistant response after tool execution
      mockAnthropicInstance.messages.create.mockResolvedValueOnce({
        id: 'test-id-2',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Here are the files I found: file1.txt and file2.txt',
          },
        ],
      });

      // User asks to list files
      const response = await sessionManager.sendMessage(
        session.id,
        'What files are in /tmp?'
      );

      // Verify acceptance criteria
      const conversation = sessionManager.getSession(session.id).messages;

      // 1. Tool invocation detected in LLM response
      const toolResponse = conversation.find(m =>
        m.content.includes('<tool>list-files')
      );
      expect(toolResponse).toBeDefined();
      expect(toolResponse?.hasToolCall).toBe(true);

      // 2. Tool request properly formatted and executed
      const toolResult = conversation.find(m => m.isToolResult);
      expect(toolResult).toBeDefined();
      expect(JSON.parse(toolResult!.content)).toEqual({
        files: ['file1.txt', 'file2.txt'],
      });

      // 3. Tool output incorporated in conversation
      const finalResponse = conversation[conversation.length - 1];
      expect(finalResponse.content).toContain('file1.txt');
      expect(finalResponse.content).toContain('file2.txt');
    });

    it('should stream conversation including tool results to host', async () => {
      // Setup initial mock response for session initialization
      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = mockMCPClient;

      // Reset mock for streaming test
      mockAnthropicInstance.messages.create.mockImplementation(options => {
        if (options.stream) {
          return {
            [Symbol.asyncIterator]: async function* () {
              // Initial response with tool call
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Let me check the files.' },
              };
              yield {
                type: 'content_block_delta',
                delta: {
                  type: 'text_delta',
                  text: '\n<tool>list-files {"path": "/tmp"}</tool>',
                },
              };

              // Tool execution results
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'I found these files: ' },
              };
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'file1.txt and file2.txt' },
              };
            },
          };
        }
        return {
          id: 'msg_123',
          role: 'assistant',
          content: [{ type: 'text', text: 'Mock response' }],
        };
      });

      // Collect streamed responses
      const streamedContent: string[] = [];
      for await (const chunk of sessionManager.sendMessageStream(
        session.id,
        'What files are in /tmp?'
      )) {
        if (chunk.type === 'content' && chunk.content) {
          streamedContent.push(chunk.content);
        }
      }

      // Verify streaming behavior matches user story requirements
      expect(streamedContent).toEqual([
        'Let me check the files.',
        '\n<tool>list-files {"path": "/tmp"}</tool>',
        'I found these files: ',
        'file1.txt and file2.txt',
      ]);
    });

    it('should handle tool execution errors gracefully', async () => {
      // Setup initial mock response for session initialization
      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = {
        ...mockMCPClient,
        invokeTool: vi
          .fn()
          .mockRejectedValue(new Error('Tool execution failed')),
      };

      // Reset mock for error test
      mockAnthropicInstance.messages.create.mockImplementation(options => {
        if (options.stream) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Let me check the files.' },
              };
            },
          };
        }
        return {
          id: 'test-id',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check the files.\n<tool>list-files {"path": "/tmp"}</tool>',
            },
          ],
        };
      });

      // Verify error is communicated to user
      await expect(
        sessionManager.sendMessage(session.id, 'What files are in /tmp?')
      ).rejects.toThrow(
        'Failed to execute tool list-files: Tool execution failed'
      );
    });

    it('should enforce tool invocation limits', async () => {
      // Setup
      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = mockMCPClient;

      // First tool call
      mockAnthropicInstance.messages.create
        .mockResolvedValueOnce({
          id: 'test-id-1',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check the first directory.\n<tool>list-files {"path": "/tmp"}</tool>',
            },
          ],
        })
        // Response after first tool execution
        .mockResolvedValueOnce({
          id: 'test-id-2',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check another directory.\n<tool>list-files {"path": "/var"}</tool>',
            },
          ],
        })
        // Response after second tool execution
        .mockResolvedValueOnce({
          id: 'test-id-3',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'I have reached the tool call limit. Here is what I found in the first two directories...',
            },
          ],
        });

      // Execute the test
      const response = await sessionManager.sendMessage(
        session.id,
        'List files in multiple directories'
      );

      // Verify the conversation flow
      const conversation = session.messages;

      // Should have:
      // 1. System message
      // 2. User message
      // 3. First tool call message
      // 4. First tool result
      // 5. Second tool call message
      // 6. Second tool result
      // 7. Final limit message
      expect(conversation).toHaveLength(7);
      expect(conversation.filter(m => m.role === 'user')).toHaveLength(1);
      expect(conversation.filter(m => m.hasToolCall)).toHaveLength(2); // Only 2 tool calls should be processed
      expect(conversation.filter(m => m.isToolResult)).toHaveLength(2); // Only 2 tool results
      expect(response.content).toContain('tool call limit');
      expect(session.toolCallCount).toBe(2); // Should have reached the limit
    });
  });

  // Move tool limit test to User Story 2.5
  describe('Tool Call Limits (User Story 2.5)', () => {
    it('should limit tool invocations and continue conversation when limit reached', async () => {
      // This test will be implemented as part of User Story 2.5
      expect(true).toBe(true);
    });
  });

  describe('Tool Integration', () => {
    beforeEach(() => {
      // Reset mock before each test
      mockAnthropicInstance.messages.create.mockClear();
    });

    it('should format and include tools in LLM messages', async () => {
      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = mockMCPClient;
      session.tools = mockMCPClient.tools; // Add tools to session
      const message = 'List the files';
      await sessionManager.sendMessage(session.id, message);

      expect(mockAnthropicInstance.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: message,
            }),
          ]),
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'list-files',
              description: 'List files in a directory',
            }),
          ]),
        })
      );
    });

    it('should format and include tools in streaming messages', async () => {
      // Initialize session with tools in config
      const configWithTools: LLMConfig = {
        ...validConfig,
        servers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            env: {},
          },
        },
      };

      // Reset and configure mock for streaming
      mockAnthropicInstance.messages.create.mockImplementation(options => {
        if (options.stream) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Let me check the files.' },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: '\n<tool>list-files {"path": "/tmp"}</tool>',
                },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'I found these files: ' },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'file1.txt and file2.txt' },
              };

              yield {
                type: 'content_block_stop',
                index: 0,
              };

              yield {
                type: 'message_stop',
              };
            },
          };
        }
        return {
          id: 'msg_123',
          role: 'assistant',
          content: [{ type: 'text', text: 'Mock response' }],
        };
      });

      const session = await sessionManager.initializeSession(configWithTools);
      session.mcpClient = mockMCPClient;
      const message = 'List the files';

      // Collect streamed content
      const streamedContent: string[] = [];
      for await (const chunk of sessionManager.sendMessageStream(
        session.id,
        message
      )) {
        if (chunk.type === 'content' && chunk.content) {
          streamedContent.push(chunk.content);
        }
      }

      expect(mockAnthropicInstance.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: message,
            }),
          ]),
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'list-files',
              description: 'List files in a directory',
            }),
          ]),
          stream: true,
        })
      );

      // Verify streamed content
      expect(streamedContent).toEqual([
        'Let me check the files.',
        '\n<tool>list-files {"path": "/tmp"}</tool>',
        'I found these files: ',
        'file1.txt and file2.txt',
      ]);
    });
  });
});
