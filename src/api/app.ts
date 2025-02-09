import express from 'express';
import { SessionManager } from '../llm/session';
import { LLMError } from '../llm/types';

export const app = express();
app.use(express.json());

const sessionManager = new SessionManager();

// Create a new chat session
app.post('/chat/session', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Invalid configuration' });
    }

    const session = await sessionManager.initializeSession(config);
    return res.status(201).json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a message in an existing chat session
app.post('/chat/session/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
      await sessionManager.getSession(sessionId);
    } catch (error) {
      if (error instanceof LLMError && error.message === 'Session not found') {
        return res.status(404).json({ error: 'Session not found' });
      }
      throw error;
    }

    const response = await sessionManager.sendMessage(sessionId, message);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a message in an existing chat session with streaming response
app.post('/chat/session/:sessionId/stream', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    try {
      await sessionManager.getSession(sessionId);
    } catch (error) {
      if (error instanceof LLMError && error.message === 'Session not found') {
        return res.status(404).json({ error: 'Session not found' });
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
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: 'Internal server error',
      })}\n\n`
    );
    res.end();
  }
});
