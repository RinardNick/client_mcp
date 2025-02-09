import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { SessionManager } from '../llm/session';
import { LLMError } from '../llm/types';

// Mock the SessionManager
vi.mock('../llm/session', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    initializeSession: vi.fn().mockResolvedValue({
      id: 'test-session-id',
      config: {
        type: 'claude',
        api_key: 'test-key',
        system_prompt: 'Test prompt',
        model: 'claude-3-sonnet-20240229',
      },
      createdAt: new Date(),
      lastActivityAt: new Date(),
      messages: [],
    }),
    sendMessage: vi.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Test response',
    }),
    getSession: vi.fn().mockImplementation(id => {
      if (id !== 'test-session-id') {
        throw new LLMError('Session not found');
      }
      return {
        id: 'test-session-id',
        messages: [],
      };
    }),
  })),
}));

describe('Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /chat/session', () => {
    it('should create a new chat session', async () => {
      const config = {
        type: 'claude',
        api_key: 'test-key',
        system_prompt: 'Test prompt',
        model: 'claude-3-sonnet-20240229',
      };

      const response = await request(app)
        .post('/chat/session')
        .send({ config })
        .expect(201);

      expect(response.body).toEqual({
        sessionId: 'test-session-id',
      });
    });

    it('should return 400 for invalid config', async () => {
      const response = await request(app)
        .post('/chat/session')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid configuration',
      });
    });
  });

  describe('POST /chat/session/:sessionId/message', () => {
    it('should send a message and return response', async () => {
      const response = await request(app)
        .post('/chat/session/test-session-id/message')
        .send({ message: 'Hello' })
        .expect(200);

      expect(response.body).toEqual({
        role: 'assistant',
        content: 'Test response',
      });
    });

    it('should return 400 for empty message', async () => {
      const response = await request(app)
        .post('/chat/session/test-session-id/message')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Message is required',
      });
    });

    it('should return 404 for invalid session', async () => {
      const response = await request(app)
        .post('/chat/session/invalid-session/message')
        .send({ message: 'Hello' })
        .expect(404);

      expect(response.body).toEqual({
        error: 'Session not found',
      });
    });
  });
});
