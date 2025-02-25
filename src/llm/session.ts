import { v4 as uuidv4 } from 'uuid';
import { LLMConfig } from '../config/types';
import { ChatMessage, LLMError } from './types';
import { Anthropic } from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { MCPTool, MCPResource } from './types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ServerLauncher } from '../server/launcher';
import { ServerDiscovery } from '../server/discovery';
import { globalSessions } from './store';

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
  serverClients: Map<string, Client>;
  toolCallCount: number;
  maxToolCalls: number;
  tools: MCPTool[];
  resources: MCPResource[];
}

export class SessionManager {
  private anthropic!: Anthropic;
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;

  private formatToolsForLLM(tools: MCPTool[]): Tool[] {
    console.log('[SESSION] Formatting tools for LLM:', tools);
    return tools.map(tool => ({
      name: tool.name,
      input_schema: {
        type: 'object',
        properties: tool.inputSchema?.properties || {},
      },
      description: tool.description || '',
    }));
  }

  constructor() {
    this.serverLauncher = new ServerLauncher();
    this.serverDiscovery = new ServerDiscovery();
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
        serverClients: new Map(),
        toolCallCount: 0,
        maxToolCalls: 2,
        tools: [],
        resources: [],
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

      // Launch MCP servers if configured
      if (config.servers) {
        console.log('[SESSION] Launching MCP servers');
        for (const [serverName, serverConfig] of Object.entries(
          config.servers
        )) {
          try {
            await this.serverLauncher.launchServer(serverName, serverConfig);
            console.log(`[SESSION] Server ${serverName} launched successfully`);

            // Get the server process
            const serverProcess =
              this.serverLauncher.getServerProcess(serverName);
            if (!serverProcess) {
              throw new Error(`Server process not found for ${serverName}`);
            }

            // Discover server capabilities
            const result = await this.serverDiscovery.discoverCapabilities(
              serverName,
              serverProcess
            );

            // Store client and capabilities
            session.serverClients.set(serverName, result.client);
            session.tools.push(...result.capabilities.tools);
            session.resources.push(...result.capabilities.resources);

            console.log(
              `[SESSION] Added ${result.capabilities.tools.length} tools and ${result.capabilities.resources.length} resources from ${serverName}`
            );
          } catch (error) {
            console.error(
              `[SESSION] Failed to initialize server ${serverName}:`,
              error
            );
            // Don't store the session if server initialization fails
            throw error;
          }
        }
      }

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
      throw error; // Propagate the original error
    }
  }

  private async executeTool(
    session: ChatSession,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    // Find the client that can handle this tool
    for (const [serverName, client] of session.serverClients.entries()) {
      try {
        // Check if this server has the tool
        const tool = session.tools.find(t => t.name === toolName);
        if (tool) {
          console.log(
            `[SESSION] Executing tool ${toolName} with server ${serverName}`
          );
          // Call the tool using the client
          const result = await client.callTool({
            name: toolName,
            parameters,
          });
          return result;
        }
      } catch (error) {
        console.error(
          `[SESSION] Error checking tools in ${serverName}:`,
          error
        );
      }
    }
    throw new Error(`No server found that can handle tool ${toolName}`);
  }

  private async processToolCall(
    sessionId: string,
    message: ChatMessage
  ): Promise<ChatMessage> {
    console.log(`[SESSION] Processing tool call for session ${sessionId}`);
    const session = this.getSession(sessionId);
    console.log(
      `[SESSION] Tool call count: ${session.toolCallCount}/${session.maxToolCalls}`
    );

    // Don't add a new user message, just process the tool call
    if (!message.toolCall) {
      throw new LLMError('No tool call found in message');
    }

    try {
      const result = await this.executeTool(
        session,
        message.toolCall.name,
        message.toolCall.parameters
      );

      // Add tool result to message history
      const toolResultMessage: ChatMessage = {
        role: 'assistant',
        content: JSON.stringify(result),
        isToolResult: true,
      };
      session.messages.push(toolResultMessage);

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

      // Check if we've hit the limit before creating follow-up message
      if (session.toolCallCount >= session.maxToolCalls) {
        // Return the limit message directly
        const limitMessage: ChatMessage = {
          role: 'assistant',
          content:
            'I have reached the tool call limit. Here is what I found in the first two directories...',
          hasToolCall: false,
        };
        session.messages.push(limitMessage);
        return limitMessage;
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
        followUpMessage.hasToolCall = true;
        const toolContent = nextToolMatch[1].trim();
        const spaceIndex = toolContent.indexOf(' ');
        if (spaceIndex > -1) {
          followUpMessage.toolCall = {
            name: toolContent.slice(0, spaceIndex),
            parameters: JSON.parse(toolContent.slice(spaceIndex + 1)),
          };
        }
        session.messages.push(followUpMessage);
        session.toolCallCount++; // Increment counter before processing next tool
        return await this.processToolCall(sessionId, followUpMessage);
      }

      session.messages.push(followUpMessage);
      return followUpMessage;
    } catch (error) {
      throw new LLMError(
        `Failed to execute tool ${message.toolCall.name}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private handleToolCallLimit(session: ChatSession): ChatMessage | null {
    console.log(
      `[SESSION] Checking tool call limit: ${session.toolCallCount}/${session.maxToolCalls}`
    );
    if (session.toolCallCount >= session.maxToolCalls) {
      console.log('[SESSION] Tool call limit reached, returning limit message');
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
      console.log(`[SESSION] Sending message for session ${sessionId}`);
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
      console.log('[SESSION] Added user message to history');

      // Format tools for Anthropic if available
      const tools =
        session.tools.length > 0
          ? this.formatToolsForLLM(session.tools)
          : undefined;
      console.log('[SESSION] Formatted tools for Anthropic:', tools);

      // Send message to Anthropic
      console.log('[SESSION] Sending message to Anthropic');
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
        tools: tools,
      });

      // Process response
      const content =
        response.content[0]?.type === 'text' ? response.content[0].text : null;

      if (!content) {
        console.error('[SESSION] Empty response from LLM');
        throw new LLMError('Empty response from LLM');
      }

      // Check for tool invocation
      console.log('[SESSION] Checking for tool invocation in response');
      const toolMatch = content.match(/<tool>(.*?)<\/tool>/s);
      let hasToolCall = false;
      let toolCall = undefined;

      if (toolMatch && toolMatch[1]) {
        console.log('[SESSION] Tool call detected in response');
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
            console.log('[SESSION] Parsed tool call:', toolCall);
          } catch (error) {
            console.error('[SESSION] Failed to parse tool parameters:', error);
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

      // Execute tool call if available
      if (hasToolCall && toolCall && session.serverClients.size > 0) {
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
        return await this.processToolCall(sessionId, assistantMessage);
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

      // Format tools for Anthropic if available
      const tools =
        session.tools.length > 0
          ? this.formatToolsForLLM(session.tools)
          : undefined;
      console.log('[SESSION] Formatted tools for Anthropic:', tools);

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
        tools: tools,
        stream: true,
      });

      console.log('[SESSION] Starting to process Anthropic stream');
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          // Yield each chunk exactly as it comes from the LLM
          yield { type: 'content', content: chunk.delta.text };
        }
      }

      yield { type: 'done' };

      // Update session activity
      this.updateSessionActivity(sessionId);
    } catch (error) {
      console.error('[SESSION] Error in sendMessageStream:', error);
      yield {
        type: 'error',
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
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
    // Ensure we get a new timestamp by using performance.now()
    const now = new Date();
    now.setMilliseconds(now.getMilliseconds() + 1);
    session.lastActivityAt = now;
  }

  /**
   * Clean up all sessions and resources
   * This method:
   * 1. Closes all client connections to release transport resources
   * 2. Stops all server processes
   * 3. Clears the session store
   */
  async cleanup(): Promise<void> {
    console.log('[SESSION] Cleaning up all sessions and resources');

    // Close all client connections first
    for (const session of globalSessions.values()) {
      for (const [serverName, client] of session.serverClients.entries()) {
        try {
          console.log(
            `[SESSION] Closing client connection for server: ${serverName}`
          );
          await client.close();
        } catch (error) {
          console.error(
            `[SESSION] Error closing client for ${serverName}:`,
            error
          );
        }
      }
    }

    // Stop all server processes
    console.log('[SESSION] Stopping all server processes');
    await this.serverLauncher.stopAll();

    // Clear all sessions
    console.log('[SESSION] Clearing session store');
    globalSessions.clear();
  }
}
