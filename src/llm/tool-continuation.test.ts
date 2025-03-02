import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../llm/session';
import { LLMConfig } from '../config/types';
import { Anthropic } from '@anthropic-ai/sdk';
import { EventEmitter } from 'stream';

// Mock Anthropic SDK
const mockAnthropicInstance = {
  messages: {
    create: vi.fn().mockImplementation(options => {
      // Determine if this is the initial request or a continuation after tool execution
      // by checking if there's a tool result in the messages
      const messages = options.messages || [];
      const hasToolResult = messages.some(
        (m: any) => m.isToolResult || m.tool_result
      );

      if (options.stream) {
        if (hasToolResult) {
          // This is a continuation stream after tool execution
          console.log(
            '[MOCK] Returning continuation stream after tool execution'
          );
          return {
            [Symbol.asyncIterator]: async function* () {
              // Content block start
              yield {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              };

              // LLM processing the tool result
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: 'Based on the tool results, I found these files:',
                },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: ' file1.txt and file2.txt',
                },
              };

              // Content block stop and message stop
              yield {
                type: 'content_block_stop',
                index: 0,
              };

              yield {
                type: 'message_stop',
              };
            },
          };
        } else {
          // Initial stream with tool call
          console.log('[MOCK] Returning initial stream with tool call');
          return {
            [Symbol.asyncIterator]: async function* () {
              // Initial content
              yield {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              };

              yield {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: 'Let me check the files for you.',
                },
              };

              // Finish first content block
              yield {
                type: 'content_block_stop',
                index: 0,
              };

              // Tool call block
              yield {
                type: 'content_block_start',
                index: 1,
                content_block: {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'list-files',
                  input: { path: '.' },
                },
              };

              // Tool call complete
              yield {
                type: 'content_block_stop',
                index: 1,
              };

              // Message complete
              yield {
                type: 'message_stop',
              };
            },
          };
        }
      }

      // Non-streaming responses
      return {
        id: 'msg_123',
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: hasToolResult
              ? 'Based on the tool results, I found these files: file1.txt and file2.txt'
              : 'Let me check the files for you.',
          },
          ...(hasToolResult
            ? []
            : [
                {
                  type: 'tool_use',
                  id: 'tool_123',
                  name: 'list-files',
                  input: { path: '.' },
                },
              ]),
        ],
      };
    }),
  },
};

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: vi.fn().mockImplementation(() => mockAnthropicInstance),
  };
});

// Mock MCP Client
const mockMCPClient = {
  callTool: vi.fn().mockResolvedValue({ files: ['file1.txt', 'file2.txt'] }),
  close: vi.fn(),
  // Add required properties for Client type
  _clientInfo: {},
  _capabilities: {},
  registerCapabilities: vi.fn(),
  assertCapability: vi.fn(),
  callMethod: vi.fn(),
};

// Mock server discovery
vi.mock('../../server/discovery', () => ({
  ServerDiscovery: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue({
      client: mockMCPClient,
      capabilities: {
        tools: [
          {
            name: 'list-files',
            description: 'List files in a directory',
            inputSchema: {
              properties: {
                path: { type: 'string' },
              },
            },
          },
        ],
        resources: [{ name: 'filesystem', type: 'fs' }],
      },
    }),
  })),
}));

// Mock server launcher
vi.mock('../../server/launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue({
      pid: 123,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    }),
    getServerProcess: vi.fn().mockReturnValue({
      pid: 123,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    }),
    cleanup: vi.fn(),
    stopAll: vi.fn(),
  })),
}));

// Mock globalSessions
vi.mock('../store', () => ({
  globalSessions: new Map(),
}));

describe('Tool Continuation', () => {
  let sessionManager: SessionManager;
  let config: LLMConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log('\n===========================================');
    console.log('STARTING TEST WITH FRESH ENVIRONMENT');
    console.log('===========================================');

    config = {
      type: 'anthropic',
      api_key: 'sk-ant-test123',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant.',
      servers: {},
    };
    sessionManager = new SessionManager();
  });

  it('should execute a tool and continue the conversation in streaming mode', async () => {
    // Add debug logs to understand call sequence
    console.log('\nTEST EXECUTION DETAILS');
    console.log('==============================');

    // Initialize session
    const session = await sessionManager.initializeSession(config);
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    console.log('✓ Session initialized successfully');

    // Manually set up the session for testing
    session.tools = [
      {
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
        },
      },
    ];
    session.serverClients.set('filesystem', mockMCPClient as any);

    // Create tracking variables for our test
    const events: { type: string; content?: string }[] = [];
    let seenToolResult = false;
    let seenContentAfterToolResult = false;

    // Send a message and collect all the chunks
    console.log('\nStreaming response chunks:');
    console.log('------------------------------');
    for await (const chunk of sessionManager.sendMessageStream(
      session.id,
      'List files in the directory'
    )) {
      events.push(chunk);
      console.log(
        `Chunk #${events.length}: [${chunk.type}] ${
          chunk.content?.substring(0, 30) || ''
        }`
      );

      // Track if we've seen a tool result
      if (chunk.type === 'tool_result') {
        seenToolResult = true;
        console.log('✓ Tool result received');
      }

      // Track if we've seen content after a tool result
      if (seenToolResult && chunk.type === 'content') {
        seenContentAfterToolResult = true;
        console.log('✓ Content received after tool result');
      }
    }

    // Print summary
    console.log('\nSummary:');
    console.log('------------------------------');
    console.log(`Total chunks received: ${events.length}`);
    console.log(`Tool result received: ${seenToolResult ? 'Yes' : 'No'}`);
    console.log(
      `Content after tool result: ${seenContentAfterToolResult ? 'Yes' : 'No'}`
    );
    console.log(
      `Mock Anthropic calls: ${mockAnthropicInstance.messages.create.mock.calls.length}`
    );

    // Verify message history
    console.log('\nSession message history:');
    console.log('------------------------------');
    session.messages.forEach((msg, idx) => {
      const preview =
        msg.content.substring(0, 30) + (msg.content.length > 30 ? '...' : '');
      console.log(
        `[${idx}] ${msg.role}${
          msg.isToolResult ? ' (TOOL RESULT)' : ''
        }: ${preview}`
      );
    });

    // Verify that we executed a tool
    expect(seenToolResult).toBe(true);

    // Verify that we received content after the tool result - this is the key test
    expect(seenContentAfterToolResult).toBe(true);

    // Anthropic should have been called twice
    expect(mockAnthropicInstance.messages.create).toHaveBeenCalledTimes(2);

    // Verify message history contains tool result and assistant response
    expect(session.messages.some(m => m.isToolResult)).toBe(true);

    // Find assistant messages after tool result
    const toolResultIndex = session.messages.findIndex(m => m.isToolResult);
    const assistantMessagesAfterTool = session.messages.filter(
      (m, i) => i > toolResultIndex && m.role === 'assistant' && !m.isToolResult
    );

    expect(assistantMessagesAfterTool.length).toBeGreaterThan(0);
  });

  it('should handle legacy format tool calls with <tool> tags in streaming mode', async () => {
    // Initialize session
    const session = await sessionManager.initializeSession(config);
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    console.log('✓ Session initialized successfully');

    // Manually set up the session for testing
    session.tools = [
      {
        name: 'list-files',
        description: 'List files in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
        },
      },
    ];
    session.serverClients.set('filesystem', mockMCPClient as any);

    // Create tracking variables for our test
    const events: { type: string; content?: string }[] = [];
    let seenToolResult = false;
    let seenContentAfterToolResult = false;

    // Override the mock for this specific test to return legacy format
    mockAnthropicInstance.messages.create.mockImplementationOnce(options => {
      return {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: {
              type: 'text_delta',
              text: 'Let me check the files for you.',
            },
          };

          yield {
            type: 'content_block_delta',
            delta: {
              type: 'text_delta',
              text: '\n<tool>list-files {"path": "."}</tool>',
            },
          };
        },
      };
    });

    // Send a message and collect all the chunks
    for await (const chunk of sessionManager.sendMessageStream(
      session.id,
      'List files in the directory'
    )) {
      events.push(chunk);
      console.log(
        `[TEST] Received chunk: ${chunk.type}`,
        chunk.content?.substring(0, 30)
      );

      // Track if we've seen a tool result
      if (chunk.type === 'tool_result') {
        seenToolResult = true;
      }

      // Track if we've seen content after a tool result
      if (seenToolResult && chunk.type === 'content') {
        seenContentAfterToolResult = true;
      }
    }

    // Verify that we executed a tool
    expect(seenToolResult).toBe(true);

    // Verify that we received content after the tool result - this is the key test
    expect(seenContentAfterToolResult).toBe(true);

    // Verify message history contains tool result and assistant response
    expect(session.messages.some(m => m.isToolResult)).toBe(true);
  });
});
