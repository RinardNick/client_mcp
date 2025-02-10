import { v4 as uuidv4 } from 'uuid';
import { LLMConfig } from '../config/types';
import { ChatSession, ChatMessage, LLMError } from './types';
import Anthropic from '@anthropic-ai/sdk';

// Global session store shared across imports
const globalSessions = new Map<string, ChatSession>();

export class SessionManager {
  private anthropic!: Anthropic;

  constructor() {
    // No need to initialize sessions map here anymore
  }

  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    try {
      // Create a new session with unique ID
      const sessionId = uuidv4();
      const session: ChatSession = {
        id: sessionId,
        config,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        messages: [],
      };

      // Initialize Anthropic client
      this.anthropic = new Anthropic({
        apiKey: config.api_key,
      });

      // Create initial message with system prompt
      const response = await this.anthropic.messages.create({
        model: config.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: config.system_prompt,
          },
        ],
      });

      // Store the session
      session.messages.push({
        role: 'system',
        content: config.system_prompt,
      });

      const content =
        response.content[0].type === 'text' ? response.content[0].text : null;

      if (content) {
        session.messages.push({
          role: 'assistant',
          content: content,
        });
      }

      globalSessions.set(sessionId, session);
      console.log(`Initialized new chat session: ${sessionId}`);
      return session;
    } catch (error) {
      console.error('Failed to initialize chat session:', error);
      throw new LLMError(
        error instanceof Error
          ? error.message
          : 'Unknown error during session initialization'
      );
    }
  }

  async sendMessage(sessionId: string, message: string): Promise<ChatMessage> {
    try {
      const session = this.getSession(sessionId);

      // Initialize Anthropic client if not already initialized
      if (!this.anthropic) {
        this.anthropic = new Anthropic({
          apiKey: session.config.api_key,
        });
      }

      // Add user message to history
      session.messages.push({
        role: 'user',
        content: message,
      });

      // Send message to Anthropic
      const response = await this.anthropic.messages.create({
        model: session.config.model,
        max_tokens: 1024,
        messages: session.messages.map(msg => ({
          role: msg.role === 'system' ? 'user' : msg.role,
          content: msg.content,
        })),
      });

      // Process response
      const content =
        response.content[0].type === 'text' ? response.content[0].text : null;

      if (!content) {
        throw new LLMError('Empty response from LLM');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: content,
      };

      // Add assistant message to history
      session.messages.push(assistantMessage);

      // Update session activity
      this.updateSessionActivity(sessionId);

      return assistantMessage;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw new LLMError(
        error instanceof Error
          ? error.message
          : 'Unknown error during message sending'
      );
    }
  }

  async *sendMessageStream(
    sessionId: string,
    message: string
  ): AsyncGenerator<{ type: string; content?: string; error?: string }> {
    try {
      console.log('[SESSION] Getting session:', sessionId);
      const session = this.getSession(sessionId);

      // Initialize Anthropic client if not already initialized
      if (!this.anthropic) {
        console.log('[SESSION] Initializing Anthropic client');
        this.anthropic = new Anthropic({
          apiKey: session.config.api_key,
        });
      }

      // Add user message to history
      session.messages.push({
        role: 'user',
        content: message,
      });

      console.log('[SESSION] Creating stream with messages:', session.messages);

      // Send message to Anthropic with streaming
      console.log('[SESSION] Creating Anthropic stream');
      const stream = await this.anthropic.messages.create({
        model: session.config.model,
        max_tokens: 1024,
        messages: session.messages.map(msg => ({
          role: msg.role === 'system' ? 'user' : msg.role,
          content: msg.content,
        })),
        stream: true,
      });

      let accumulatedContent = '';
      console.log('[SESSION] Starting to process Anthropic stream');

      for await (const chunk of stream) {
        console.log('[SESSION] Raw Anthropic chunk:', chunk);
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta?.type === 'text_delta'
        ) {
          accumulatedContent += chunk.delta.text;
          console.log('[SESSION] Yielding content:', chunk.delta.text);
          yield { type: 'content', content: chunk.delta.text };
        }
      }

      // Add assistant message to history
      session.messages.push({
        role: 'assistant',
        content: accumulatedContent,
      });

      // Update session activity
      this.updateSessionActivity(sessionId);

      console.log('[SESSION] Stream complete, yielding done');
      yield { type: 'done' };
    } catch (error) {
      console.error('[SESSION] Error in stream:', error);
      yield {
        type: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during message sending',
      };
    }
  }

  getSession(sessionId: string): ChatSession {
    const session = globalSessions.get(sessionId);
    if (!session) {
      throw new LLMError(`Session not found: ${sessionId}`);
    }
    return session;
  }

  updateSessionActivity(sessionId: string): void {
    const session = this.getSession(sessionId);
    session.lastActivityAt = new Date();
  }
}
