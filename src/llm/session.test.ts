import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session';
import { LLMError } from './types';
import { LLMConfig } from '../config/types';
import { Anthropic } from '@anthropic-ai/sdk';
import { EventEmitter } from 'stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
      const hasToolResult = messages.some(
        (m: { content: string; isToolResult?: boolean }) => m.isToolResult
      );
      const isListFilesRequest = messages.some(
        (m: { content: string }) =>
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
      client: mockMCPClient,
      capabilities: {
        tools: [
          {
            name: 'list-files',
            description: 'List files in a directory',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
        resources: [{ name: 'filesystem', type: 'fs' }],
      },
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
  callTool: vi.fn().mockResolvedValue({ files: ['file1.txt', 'file2.txt'] }),
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
    session.serverClients.set('test', mockMCPClient as unknown as Client);

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.config).toEqual(validConfig);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.lastActivityAt).toBeInstanceOf(Date);
    expect(session.messages).toHaveLength(1); // Only system prompt
    // Check system message with flexible token tracking
    expect(session.messages[0].role).toEqual('system');
    expect(session.messages[0].content).toEqual(validConfig.system_prompt);
    expect(session.messages[0].timestamp).toBeInstanceOf(Date);
    expect(typeof session.messages[0].tokens).toBe('number');
  });

  it('should retrieve an existing session', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.serverClients.set('test', mockMCPClient as unknown as Client);
    const retrieved = sessionManager.getSession(session.id);
    expect(retrieved).toEqual(session);
  });

  it('should throw error for non-existent session', () => {
    expect(() => sessionManager.getSession('non-existent')).toThrow(LLMError);
  });

  it('should update session activity timestamp', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.serverClients.set('test', mockMCPClient as unknown as Client);
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
    session.serverClients.set('test', mockMCPClient as unknown as Client);
    const message = 'Hello';

    const response = await sessionManager.sendMessage(session.id, message);

    // Check response with flexible token tracking
    expect(response.role).toEqual('assistant');
    expect(response.content).toEqual('Mock response');
    expect(response.hasToolCall).toEqual(false);
    expect(response.toolCall).toBeUndefined();
    expect(response.timestamp).toBeInstanceOf(Date);
    expect(typeof response.tokens).toBe('number');
  });

  describe('Token Tracking and Optimization', () => {
    it('should track token usage properly', async () => {
      const session = await sessionManager.initializeSession(validConfig);
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      
      // Get initial token metrics
      const initialMetrics = sessionManager.getSessionTokenUsage(session.id);
      expect(initialMetrics).toBeDefined();
      expect(initialMetrics.systemTokens).toBeGreaterThan(0); // System prompt
      expect(initialMetrics.userTokens).toBe(0); // No user messages yet
      expect(initialMetrics.assistantTokens).toBe(0); // No assistant messages yet
      expect(initialMetrics.totalTokens).toBeGreaterThan(0);
      expect(initialMetrics.percentUsed).toBeGreaterThanOrEqual(0);
      expect(initialMetrics.maxContextTokens).toBeGreaterThan(0);
      expect(initialMetrics.recommendation).toBeDefined();
      
      // Send a message and check updated metrics
      await sessionManager.sendMessage(session.id, 'Hello, how are you?');
      const updatedMetrics = sessionManager.getSessionTokenUsage(session.id);
      
      expect(updatedMetrics.userTokens).toBeGreaterThan(0); // User message added
      expect(updatedMetrics.assistantTokens).toBeGreaterThan(0); // Assistant response added
      expect(updatedMetrics.totalTokens).toBeGreaterThan(initialMetrics.totalTokens);
      expect(updatedMetrics.percentUsed).toBeGreaterThanOrEqual(initialMetrics.percentUsed);
    });
    
    it('should provide cost estimation', async () => {
      const session = await sessionManager.initializeSession(validConfig);
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      
      // Send a message to generate some token usage
      await sessionManager.sendMessage(session.id, 'Hello, how are you?');
      
      // Get cost estimate
      const costEstimate = sessionManager.getTokenCostEstimate(session.id);
      
      expect(costEstimate).toBeDefined();
      expect(costEstimate.inputCost).toBeGreaterThanOrEqual(0);
      expect(costEstimate.outputCost).toBeGreaterThanOrEqual(0);
      expect(costEstimate.totalCost).toBeGreaterThanOrEqual(0);
      expect(costEstimate.currency).toBe('USD');
    });
    
    it('should apply context optimization when needed', async () => {
      const session = await sessionManager.initializeSession(validConfig);
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      
      // Configure context optimization settings
      sessionManager.setContextSettings(session.id, {
        autoTruncate: true,
        preserveSystemMessages: true,
        preserveRecentMessages: 2,
        truncationStrategy: 'oldest-first'
      });
      
      // Artificially add messages to simulate a long conversation
      for (let i = 0; i < 10; i++) {
        session.messages.push({
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date(),
          tokens: 10
        });
        session.messages.push({
          role: 'assistant',
          content: `Response ${i}`,
          timestamp: new Date(),
          tokens: 10
        });
      }
      
      // Force the context to be critical
      session.isContextWindowCritical = true;
      
      // Count messages before optimization
      const beforeCount = session.messages.length;
      
      // Apply optimization
      const optimizedMetrics = sessionManager.optimizeContext(session.id);
      
      // Count messages after optimization
      const afterCount = session.messages.length;
      
      // Verify optimization worked
      expect(afterCount).toBeLessThan(beforeCount);
      expect(afterCount).toBe(3); // System message + 2 recent messages
      expect(session.messages[0].role).toBe('system'); // System message preserved
      expect(optimizedMetrics).toBeDefined();
    });
  });

  describe('Tool Invocation (User Story 2.4)', () => {
    it('should execute tools and incorporate results into conversation', async () => {
      // Setup
      const session = await sessionManager.initializeSession(validConfig);
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      session.tools = [{
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }];

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
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      session.tools = [{
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }];

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
      const errorMockClient = {
        callTool: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
      };
      session.serverClients.set('test', errorMockClient as unknown as Client);
      session.tools = [{
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }];

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
        'Failed to execute tool list-files: No server found that can handle tool list-files'
      );
    });

    it('should enforce tool invocation limits', async () => {
      // Setup
      const session = await sessionManager.initializeSession(validConfig);
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      session.tools = [{
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }];

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
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      session.tools = [{
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }];
      
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
      session.serverClients.set('test', mockMCPClient as unknown as Client);
      session.tools = [{
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      }];
      
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