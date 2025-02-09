import { v4 as uuidv4 } from 'uuid';
import { LLMConfig } from '../config/types';
import { ChatSession, ChatMessage, LLMError } from './types';
import Anthropic from '@anthropic-ai/sdk';

export class SessionManager {
  private sessions: Map<string, ChatSession>;
  private anthropic!: Anthropic;

  constructor() {
    this.sessions = new Map();
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

      this.sessions.set(sessionId, session);
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

  getSession(sessionId: string): ChatSession {
    const session = this.sessions.get(sessionId);
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
