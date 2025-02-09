export { SessionManager } from './llm/session';
export { ChatSession, ChatMessage, LLMError } from './llm/types';
export { LLMConfig, ConfigurationError } from './config/types';
export { loadConfig } from './config/loader';

// Helper function to create a new chat session
import { ChatSession } from './llm/types';
export async function createSession(config: LLMConfig): Promise<ChatSession> {
  const sessionManager = new SessionManager();
  return sessionManager.initializeSession(config);
}

// Express middleware and router
import express, { Request, Response, Router } from 'express';
import { SessionManager } from './llm/session';
import { LLMError } from './llm/types';
import { LLMConfig } from './config/types';

interface CreateSessionRequest {
  config: LLMConfig;
}

interface MessageRequest {
  message: string;
}

type SessionParams = { sessionId: string };
type EmptyResponse = Record<string, never>;

export function createChatRouter(
  sessionManager: SessionManager = new SessionManager()
) {
  const router = Router();
  router.use(express.json());

  // Create a new chat session
  router.post<EmptyResponse, any, CreateSessionRequest>(
    '/session',
    async (req, res): Promise<void> => {
      try {
        const { config } = req.body;
        if (!config) {
          res.status(400).json({ error: 'Invalid configuration' });
          return;
        }

        const session = await sessionManager.initializeSession(config);
        res.status(201).json({ sessionId: session.id });
      } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Send a message in an existing chat session
  router.post<SessionParams, any, MessageRequest>(
    '/session/:sessionId/message',
    async (req, res): Promise<void> => {
      try {
        const { sessionId } = req.params;
        const { message } = req.body;

        if (!message) {
          res.status(400).json({ error: 'Message is required' });
          return;
        }

        try {
          await sessionManager.getSession(sessionId);
        } catch (error) {
          if (
            error instanceof LLMError &&
            error.message === 'Session not found'
          ) {
            res.status(404).json({ error: 'Session not found' });
            return;
          }
          throw error;
        }

        const response = await sessionManager.sendMessage(sessionId, message);
        res.status(200).json(response);
      } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Send a message in an existing chat session with streaming response
  router.post<SessionParams, any, MessageRequest>(
    '/session/:sessionId/stream',
    async (req, res): Promise<void> => {
      try {
        const { sessionId } = req.params;
        const { message } = req.body;

        if (!message) {
          res.status(400).json({ error: 'Message is required' });
          return;
        }

        try {
          await sessionManager.getSession(sessionId);
        } catch (error) {
          if (
            error instanceof LLMError &&
            error.message === 'Session not found'
          ) {
            res.status(404).json({ error: 'Session not found' });
            return;
          }
          throw error;
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Stream the response
        for await (const chunk of sessionManager.sendMessageStream(
          sessionId,
          message
        )) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.end();
      } catch (error) {
        console.error('Error streaming message:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
          return;
        }
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'Internal server error',
          })}\n\n`
        );
        res.end();
      }
    }
  );

  return router;
}
