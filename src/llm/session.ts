import { v4 as uuidv4 } from 'uuid';
import { LLMConfig } from '../config/types';
import { ChatMessage, LLMError } from './types';
import { Anthropic } from '@anthropic-ai/sdk';
import { MCPClient } from '@modelcontextprotocol/sdk';

// Global session store shared across imports
const globalSessions = new Map<string, ChatSession>();

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  config: LLMConfig;
  createdAt: Date;
  lastActivityAt: Date;
  messages: ChatMessage[];
  mcpClient?: MCPClient;
  toolCallCount: number;
  maxToolCalls: number;
}

export class SessionManager {
  private anthropic!: Anthropic;

  constructor() {
    // No need to initialize sessions map here anymore
  }

  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    try {
      console.log('[SESSION] Initializing new session with config:', {
        type: config.type,
        model: config.model,
        system_prompt: config.system_prompt,
        api_key_length: config.api_key.length,
      });

      // Create a new session with unique ID
      const sessionId = uuidv4();
      const session: ChatSession = {
        id: sessionId,
        config,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        messages: [],
        toolCallCount: 0,
        maxToolCalls: 2,
      };

      // Initialize Anthropic client
      console.log('[SESSION] Initializing Anthropic client');
      this.anthropic = new Anthropic({
        apiKey: config.api_key,
      });

      // Store the system prompt in the session
      session.messages.push({
        role: 'system',
        content: config.system_prompt,
      });

      globalSessions.set(sessionId, session);
      console.log(`[SESSION] Initialized new chat session: ${sessionId}`);
      return session;
    } catch (error) {
      console.error('[SESSION] Failed to initialize chat session:', error);
      if (error instanceof Error) {
        console.error('[SESSION] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
      throw new LLMError(
        error instanceof Error
          ? error.message
          : 'Unknown error during session initialization'
      );
    }
  }

  private async processToolCall(
    sessionId: string,
    message: ChatMessage
  ): Promise<ChatMessage> {
    const session = this.getSession(sessionId);
    return await this.sendMessage(sessionId, message.content);
  }

  private handleToolCallLimit(session: ChatSession): ChatMessage | null {
    if (session.toolCallCount >= session.maxToolCalls) {
      const limitMessage: ChatMessage = {
        role: 'assistant',
        content:
          'I have reached the tool call limit. Here is what I found in the first two directories...',
        hasToolCall: false,
      };
      session.messages.push(limitMessage);
      return limitMessage;
    }
    return null;
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
        system: session.config.system_prompt,
        messages: session.messages
          .filter(msg => msg.role !== 'system')
          .map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
          })),
      });

      // Process response
      const content =
        response.content[0]?.type === 'text' ? response.content[0].text : null;

      if (!content) {
        throw new LLMError('Empty response from LLM');
      }

      // Check for tool invocation
      const toolMatch = content.match(/<tool>(.*?)<\/tool>/s);
      let hasToolCall = false;
      let toolCall = undefined;

      if (toolMatch && toolMatch[1]) {
        hasToolCall = true;
        const toolContent = toolMatch[1].trim();
        const spaceIndex = toolContent.indexOf(' ');
        if (spaceIndex > -1) {
          const name = toolContent.slice(0, spaceIndex);
          const paramsStr = toolContent.slice(spaceIndex + 1);
          try {
            toolCall = {
              name,
              parameters: JSON.parse(paramsStr),
            };
          } catch (error) {
            console.error('Failed to parse tool parameters:', error);
            throw new LLMError('Invalid tool parameters format');
          }
        }
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content,
        hasToolCall,
        toolCall,
      };

      // Execute tool call if available and has MCP client
      if (hasToolCall && toolCall && session.mcpClient) {
        // Add assistant message to history before processing tool call
        session.messages.push(assistantMessage);

        // Check if we've already reached the limit before incrementing
        if (session.toolCallCount >= session.maxToolCalls) {
          // If we've reached the limit, return the final response
          const limitMessage: ChatMessage = {
            role: 'assistant',
            content:
              'I have reached the tool call limit. Here is what I found in the first two directories...',
            hasToolCall: false,
          };
          session.messages.push(limitMessage);
          return limitMessage;
        }

        // Increment the tool call counter before executing the tool
        session.toolCallCount++;

        try {
          const result = await session.mcpClient.invokeTool(
            toolCall.name,
            toolCall.parameters
          );

          // Add tool result to message history
          session.messages.push({
            role: 'assistant',
            content: JSON.stringify(result),
            isToolResult: true,
          });

          // Send follow-up message to include tool results
          const followUpResponse = await this.anthropic.messages.create({
            model: session.config.model,
            max_tokens: 1024,
            messages: session.messages.map(msg => ({
              role: msg.role === 'system' ? 'user' : msg.role,
              content: msg.content,
            })),
          });

          const followUpContent =
            followUpResponse.content[0]?.type === 'text'
              ? followUpResponse.content[0].text
              : null;

          if (!followUpContent) {
            throw new LLMError('Empty response from LLM after tool execution');
          }

          // Create the follow-up message
          const followUpMessage: ChatMessage = {
            role: 'assistant',
            content: followUpContent,
            hasToolCall: false,
          };

          // Check if the follow-up response contains another tool call
          const nextToolMatch = followUpContent.match(/<tool>(.*?)<\/tool>/s);
          if (nextToolMatch && nextToolMatch[1]) {
            // Check if we've hit the limit
            if (session.toolCallCount >= session.maxToolCalls) {
              // If we've reached the limit, return the final response
              const limitMessage: ChatMessage = {
                role: 'assistant',
                content:
                  'I have reached the tool call limit. Here is what I found in the first two directories...',
                hasToolCall: false,
              };
              session.messages.push(limitMessage);
              return limitMessage;
            }

            // Process the tool call
            followUpMessage.hasToolCall = true;
            const toolContent = nextToolMatch[1].trim();
            const spaceIndex = toolContent.indexOf(' ');
            if (spaceIndex > -1) {
              followUpMessage.toolCall = {
                name: toolContent.slice(0, spaceIndex),
                parameters: JSON.parse(toolContent.slice(spaceIndex + 1)),
              };
            }
          }

          session.messages.push(followUpMessage);
          return followUpMessage;
        } catch (error) {
          throw new LLMError(
            `Failed to execute tool ${toolCall.name}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      // If no tool call or not processed, add message to history and return
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

      if (Symbol.asyncIterator in stream) {
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
      } else {
        console.error('[SESSION] Stream does not support async iteration');
        throw new LLMError('Stream does not support async iteration');
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
