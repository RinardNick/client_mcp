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
        model: 'claude-3-5-test-sonnet-20241022',
      },
      createdAt: new Date(),
      lastActivityAt: new Date(),
      messages: [],
    }),
    sendMessageStream: vi.fn().mockImplementation(async function* () {
      yield { type: 'content', content: 'Hello' };
      yield { type: 'content', content: ' world' };
      yield { type: 'done' };
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

describe('Chat Streaming API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /chat/session/:sessionId/stream', () => {
    it('should stream message responses', async () => {
      const response = await request(app)
        .post('/chat/session/test-session-id/stream')
        .send({ message: 'Hello' })
        .expect('Content-Type', 'text/event-stream')
        .expect(200);

      const events = response.text.split('\n\n').filter(Boolean);
      expect(events).toHaveLength(3);

      const parsedEvents = events.map(event =>
        JSON.parse(event.replace('data: ', ''))
      );
      expect(parsedEvents).toEqual([
        { type: 'content', content: 'Hello' },
        { type: 'content', content: ' world' },
        { type: 'done' },
      ]);
    });

    it('should return 400 for empty message', async () => {
      const response = await request(app)
        .post('/chat/session/test-session-id/stream')
        .send({})
        .expect('Content-Type', 'application/json; charset=utf-8')
        .expect(400);

      expect(response.body).toEqual({
        error: 'Message is required',
      });
    });

    it('should return 404 for invalid session', async () => {
      const response = await request(app)
        .post('/chat/session/invalid-session/stream')
        .send({ message: 'Hello' })
        .expect('Content-Type', 'application/json; charset=utf-8')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Session not found',
      });
    });
  });
});
