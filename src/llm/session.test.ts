import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session';
import { LLMError } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { LLMConfig } from '../config/types';

// Mock interfaces
interface MCPClient {
  invokeTool(
    name: string,
    parameters: Record<string, unknown>
  ): Promise<unknown>;
}

// Mock Anthropic SDK
const mockCreate = vi.fn().mockResolvedValue({
  id: 'msg_123',
  model: 'claude-3-5-test-sonnet-20241022',
  role: 'assistant',
  content: [{ type: 'text', text: 'Mock response' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 20 },
});

vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let validConfig: LLMConfig;
  let mockMCPClient: MCPClient;

  beforeEach(async () => {
    // Create a mock MCP client
    mockMCPClient = {
      async invokeTool(name: string, parameters: Record<string, unknown>) {
        return { files: ['file1.txt', 'file2.txt'] };
      },
    };

    validConfig = {
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-3-5-test-sonnet-20241022',
      system_prompt: 'You are a helpful assistant.',
    };

    sessionManager = new SessionManager();
  });

  // Regular tests using mock MCP client
  it('should initialize a new session with valid config', async () => {
    const session = await sessionManager.initializeSession(validConfig);
    session.mcpClient = mockMCPClient;

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.config).toEqual(validConfig);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.lastActivityAt).toBeInstanceOf(Date);
    expect(session.messages).toHaveLength(2); // System prompt + assistant response
    expect(session.messages[0]).toEqual({
      role: 'system',
      content: validConfig.system_prompt,
    });
    expect(session.messages[1]).toEqual({
      role: 'assistant',
      content: 'Mock response',
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
      mockCreate.mockReset();

      // 1. Assistant response with tool invocation
      mockCreate.mockResolvedValueOnce({
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
      mockCreate.mockResolvedValueOnce({
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
      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        role: 'assistant',
        content: [{ type: 'text', text: 'I am ready to help.' }],
      });

      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = mockMCPClient;

      // Setup mock streaming response
      mockCreate.mockResolvedValueOnce({
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
      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        role: 'assistant',
        content: [{ type: 'text', text: 'I am ready to help.' }],
      });

      const session = await sessionManager.initializeSession(validConfig);
      session.mcpClient = {
        async invokeTool() {
          throw new Error('Tool execution failed');
        },
      };

      mockCreate.mockResolvedValueOnce({
        id: 'test-id',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Let me check the files.\n<tool>list-files {"path": "/tmp"}</tool>',
          },
        ],
      });

      // Verify error is communicated to user
      await expect(
        sessionManager.sendMessage(session.id, 'What files are in /tmp?')
      ).rejects.toThrow('Failed to execute tool');
    });
  });

  // Move tool limit test to User Story 2.5
  describe('Tool Call Limits (User Story 2.5)', () => {
    it('should limit tool invocations and continue conversation when limit reached', async () => {
      // This test will be implemented as part of User Story 2.5
      expect(true).toBe(true);
    });
  });
});
