import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session';
import { LLMError } from './types';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate.mockResolvedValue({
          id: 'test-id',
          model: 'claude-3-sonnet-20240229',
          role: 'assistant',
          content: [{ type: 'text', text: 'Mock response' }],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    })),
    mockCreate, // Export for test access
  };
});

describe('SessionManager', () => {
  const validConfig = {
    type: 'claude',
    api_key: 'test-key',
    system_prompt: 'You are a helpful assistant.',
    model: 'claude-3-sonnet-20240229',
  };

  let sessionManager: SessionManager;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionManager = new SessionManager();
    mockCreate = vi.fn();
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: mockCreate.mockResolvedValue({
          id: 'test-id',
          model: 'claude-3-sonnet-20240229',
          role: 'assistant',
          content: [{ type: 'text', text: 'Mock response' }],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    }));
  });

  it('should initialize a new session with valid config', async () => {
    const session = await sessionManager.initializeSession(validConfig);

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
    const retrieved = sessionManager.getSession(session.id);
    expect(retrieved).toEqual(session);
  });

  it('should throw error for non-existent session', () => {
    expect(() => sessionManager.getSession('non-existent')).toThrow(LLMError);
  });

  it('should update session activity timestamp', async () => {
    const session = await sessionManager.initializeSession(validConfig);
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
    const response = await sessionManager.sendMessage(session.id, 'Hello');

    expect(response).toEqual({
      role: 'assistant',
      content: 'Mock response',
      hasToolCall: false,
      toolCall: undefined,
    });

    const updatedSession = sessionManager.getSession(session.id);
    expect(updatedSession.messages).toHaveLength(4); // System + assistant + user + assistant
    expect(updatedSession.messages[2]).toEqual({
      role: 'user',
      content: 'Hello',
    });
    expect(updatedSession.messages[3]).toEqual({
      role: 'assistant',
      content: 'Mock response',
      hasToolCall: false,
      toolCall: undefined,
    });
  });

  describe('Tool Invocation', () => {
    it('should detect tool invocation in LLM response', async () => {
      const session = await sessionManager.initializeSession(validConfig);

      // Mock Anthropic response with a tool invocation
      mockCreate.mockResolvedValueOnce({
        id: 'test-id',
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I will use the list-files tool to check the directory.\n<tool>list-files {"path": "/tmp"}</tool>',
          },
        ],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const response = await sessionManager.sendMessage(
        session.id,
        'List files in /tmp'
      );

      expect(response.content).toContain('list-files');
      expect(response.hasToolCall).toBe(true);
      expect(response.toolCall).toEqual({
        name: 'list-files',
        parameters: { path: '/tmp' },
      });
    });
  });
});
