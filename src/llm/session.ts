import { v4 as uuidv4 } from 'uuid';
import { LLMConfig } from '../config/types';
import {
  ChatMessage,
  LLMError,
  TokenMetrics,
  TokenCost,
  ContextSettings,
  TokenAlert,
} from './types';
import { Anthropic } from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { MCPTool, MCPResource } from './types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ServerLauncher } from '../server/launcher';
import { ServerDiscovery } from '../server/discovery';
import { globalSessions } from './store';
import {
  calculateMessageTokens,
  calculateTokenCost,
  getContextLimit,
  supportsThinking,
  getDefaultThinkingBudget,
  isContextWindowCritical,
  getContextRecommendation,
  calculateContextUsage,
  countTokens,
} from './token-counter';
import { pruneMessagesByRelevance } from './relevance-pruning';

// Note: Both of these interfaces are now imported from types.ts
// So we don't need to re-declare them here
import { ToolCall, ChatSession } from './types';

export class SessionManager {
  private anthropic!: Anthropic;
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;

  private formatToolsForLLM(tools: MCPTool[]): Tool[] {
    console.log('[SESSION] Formatting tools for LLM:', tools);
    return tools.map((tool: MCPTool) => ({
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
        maxToolCalls: config.max_tool_calls || 2, // Use configured limit or default to 2
        tools: [],
        resources: [],
        // Initialize token metrics with enhanced tracking
        tokenMetrics: {
          userTokens: 0,
          assistantTokens: 0,
          systemTokens: 0,
          toolTokens: 0,
          totalTokens: 0,
          maxContextTokens: getContextLimit(config.model),
          percentUsed: 0,
          recommendation: 'Context window usage is low.',
        },
        tokenCost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          currency: 'USD',
        },
        // Initialize context settings from config or defaults
        contextSettings: {
          autoTruncate: config.token_optimization?.auto_truncate || false,
          preserveSystemMessages:
            config.token_optimization?.preserve_system_messages !== false, // default to true
          preserveRecentMessages:
            config.token_optimization?.preserve_recent_messages || 4,
          truncationStrategy:
            config.token_optimization?.truncation_strategy || 'oldest-first',
        },
        isContextWindowCritical: false,
      };

      // Initialize Anthropic client
      console.log('[SESSION] Initializing Anthropic client');
      this.anthropic = new Anthropic({
        apiKey: config.api_key,
      });

      // Store the system prompt in the session with token count
      const systemMessage = {
        role: 'system' as const,
        content: config.system_prompt,
        timestamp: new Date(),
        tokens: countTokens(config.system_prompt, config.model),
      };
      session.messages.push(systemMessage);

      // Update token metrics for system message
      session.tokenMetrics!.systemTokens += systemMessage.tokens;
      session.tokenMetrics!.totalTokens += systemMessage.tokens;
      session.tokenMetrics!.percentUsed = calculateContextUsage(
        session.tokenMetrics!.totalTokens,
        config.model
      );

      // Launch MCP servers if configured
      if (config.servers) {
        console.log('[SESSION] Launching MCP servers');
        console.log(
          `[SESSION] Server configurations: ${JSON.stringify(
            Object.keys(config.servers)
          )}`
        );
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
            console.log(
              `[SESSION] Registered tools from ${serverName}: ${JSON.stringify(
                result.capabilities.tools.map(t => t.name)
              )}`
            );
            console.log(
              `[SESSION] Active server clients: ${session.serverClients.size}`
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

  /**
   * Maps from camelCase tool names to snake_case tool names to handle
   * different SDK versions that might be in use by various servers
   */
  private mapToolName(toolName: string): string[] {
    // Define mappings to handle different naming conventions
    const toolMap: Record<string, string[]> = {
      // camelCase → snake_case mappings
      readFile: ['read_file', 'readFile'],
      listFiles: ['list_directory', 'list_files', 'listFiles', 'listDirectory'],
      executeCommand: ['run_command', 'execute_command', 'executeCommand'],
      // Add more mappings as needed
    };

    // Return array of possible tool names to try
    if (toolMap[toolName]) {
      return toolMap[toolName];
    }

    // If no mapping exists, try both the original name and a snake_case version
    const snakeCase = toolName.replace(/([A-Z])/g, '_$1').toLowerCase();
    return [toolName, snakeCase];
  }

  private async executeTool(
    session: ChatSession,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    console.log(`[SESSION] Starting tool execution for: ${toolName}`);
    console.log(`[SESSION] Tool parameters: ${JSON.stringify(parameters)}`);
    console.log(
      `[SESSION] Server clients available: ${session.serverClients.size}`
    );

    // Get potential tool names to try
    const potentialToolNames = this.mapToolName(toolName);
    console.log(
      `[SESSION] Potential tool names for ${toolName}:`,
      potentialToolNames
    );

    // Find the client that can handle this tool
    for (const [serverName, client] of session.serverClients.entries()) {
      try {
        // Log available tools for debugging
        console.log(
          `[SESSION] Server ${serverName} has tools:`,
          session.tools.map(t => t.name)
        );

        // Try each potential tool name
        for (const mappedToolName of potentialToolNames) {
          // Check if this server has the tool with this name
          const tool = session.tools.find(t => t.name === mappedToolName);
          if (tool) {
            console.log(
              `[SESSION] Executing tool ${mappedToolName} (mapped from ${toolName}) with server ${serverName}`
            );
            // Call the tool using the client
            try {
              const result = await client.callTool({
                name: mappedToolName,
                parameters,
              });
              return result;
            } catch (error) {
              console.error(
                `[SESSION] Error executing tool ${mappedToolName}:`,
                error
              );
              // Continue to try other tool names or servers
            }
          }
        }
      } catch (error) {
        console.error(
          `[SESSION] Error checking tools in ${serverName}:`,
          error
        );
      }
    }
    throw new Error(
      `No server found that can handle tool ${toolName} (tried: ${potentialToolNames.join(
        ', '
      )})`
    );
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
      // First, look for structured tool calls
      let hasNextToolCall = false;
      let nextToolCall = undefined;

      if (followUpResponse.content) {
        // Look for structured tool calls
        const toolCalls = followUpResponse.content.filter(
          item => item.type === 'tool_use'
        );

        if (toolCalls && toolCalls.length > 0) {
          console.log(
            '[SESSION] Found another structured tool call in follow-up response'
          );
          const toolUse = toolCalls[0];

          if (toolUse.id && toolUse.name && toolUse.input) {
            hasNextToolCall = true;
            nextToolCall = {
              name: toolUse.name,
              parameters: toolUse.input,
            };
          }
        }
      }

      // Fall back to legacy format if no structured tool call found
      if (!hasNextToolCall) {
        const nextToolMatch = followUpContent.match(/<tool>(.*?)<\/tool>/s);
        if (nextToolMatch && nextToolMatch[1]) {
          console.log(
            '[SESSION] Found another legacy tool call in follow-up response'
          );
          hasNextToolCall = true;
          const toolContent = nextToolMatch[1].trim();
          const spaceIndex = toolContent.indexOf(' ');
          if (spaceIndex > -1) {
            nextToolCall = {
              name: toolContent.slice(0, spaceIndex),
              parameters: JSON.parse(toolContent.slice(spaceIndex + 1)),
            };
          }
        }
      }

      // Process next tool call if found
      if (hasNextToolCall && nextToolCall) {
        followUpMessage.hasToolCall = true;
        followUpMessage.toolCall = nextToolCall;
        session.messages.push(followUpMessage);
        session.toolCallCount++; // Increment counter before processing next tool
        console.log('[SESSION] Processing next tool call:', nextToolCall);
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

      // Add user message to history with token count
      const userMessage = {
        role: 'user' as const,
        content: message,
        timestamp: new Date(),
        tokens: countTokens(message, session.config.model),
      };
      session.messages.push(userMessage);
      console.log(
        `[SESSION] Added user message to history (${userMessage.tokens} tokens)`
      );

      // Update token metrics for the new message
      this.updateTokenMetrics(sessionId);

      // Check if context window is approaching limits
      if (
        session.isContextWindowCritical &&
        session.contextSettings?.autoTruncate
      ) {
        console.log(
          '[SESSION] Context window approaching limits, optimizing context'
        );
        this.optimizeContext(sessionId);
      }

      // Format tools for Anthropic if available
      const tools =
        session.tools.length > 0
          ? this.formatToolsForLLM(session.tools)
          : undefined;
      console.log('[SESSION] Formatted tools for Anthropic:', tools);

      // Update token metrics
      this.updateTokenMetrics(sessionId);

      // Prepare API request parameters
      const apiParams: any = {
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
      };

      // Add thinking parameter for Claude 3.7+ models
      if (supportsThinking(session.config.model)) {
        console.log(
          '[SESSION] Model supports thinking, adding thinking parameter'
        );

        // If thinking is explicitly disabled in config, don't add it
        if (session.config.thinking?.enabled !== false) {
          // Get budget from config or use default
          const budgetTokens =
            session.config.thinking?.budget_tokens ||
            getDefaultThinkingBudget(session.config.model);

          apiParams.thinking = {
            type: 'enabled',
            budget_tokens: budgetTokens,
          };

          console.log(
            `[SESSION] Added thinking with budget: ${budgetTokens} tokens`
          );
        }
      }

      // Send message to Anthropic
      console.log('[SESSION] Sending message to Anthropic');
      const response = await this.anthropic.messages.create(apiParams);

      // Process response - check for tool calls first
      console.log('[SESSION] Checking for tool calls in response');
      console.log(
        '[SESSION] Response content:',
        JSON.stringify(response.content)
      );

      let content = '';
      let hasToolCall = false;
      let toolCall = undefined;

      // Look for tool calls in the structured response
      const toolCalls = response.content.filter(
        item => item.type === 'tool_use'
      );

      if (toolCalls && toolCalls.length > 0) {
        // We have a tool call
        console.log('[SESSION] Tool call detected in structured response');
        const toolUse = toolCalls[0]; // Use the first tool call for now

        if (toolUse.id && toolUse.name && toolUse.input) {
          hasToolCall = true;
          try {
            toolCall = {
              name: toolUse.name,
              parameters: toolUse.input,
            };
            console.log('[SESSION] Parsed structured tool call:', toolCall);
          } catch (error) {
            console.error('[SESSION] Failed to parse tool parameters:', error);
            throw new LLMError('Invalid tool parameters format');
          }
        }
      }

      // Extract text content
      const textContent = response.content.filter(item => item.type === 'text');
      if (textContent && textContent.length > 0) {
        content = textContent[0].text;
      } else if (toolCalls.length > 0) {
        // If we only have tool calls, create a placeholder content
        content = `I need to use the ${toolCalls[0].name} tool.`;
      } else {
        console.error('[SESSION] Empty response from LLM');
        throw new LLMError('Empty response from LLM');
      }

      // For backward compatibility, also check for <tool> tag format
      if (!hasToolCall) {
        const toolMatch = content.match(/<tool>(.*?)<\/tool>/s);

        if (toolMatch && toolMatch[1]) {
          console.log('[SESSION] Tool call detected in legacy tag format');
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
              console.log('[SESSION] Parsed legacy tool call:', toolCall);
            } catch (error) {
              console.error(
                '[SESSION] Failed to parse tool parameters:',
                error
              );
              throw new LLMError('Invalid tool parameters format');
            }
          }
        }
      }

      // Create assistant message with token count
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content,
        hasToolCall,
        toolCall,
        timestamp: new Date(),
        tokens: countTokens(content, session.config.model),
      };

      // Execute tool call if available
      console.log(
        `[SESSION] Tool execution check: hasToolCall=${hasToolCall}, toolCall=${JSON.stringify(
          toolCall
        )}, serverClients.size=${session.serverClients.size}`
      );
      console.log(
        `[SESSION] All registered tools: ${JSON.stringify(
          session.tools.map(t => t.name)
        )}`
      );

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

      // Update token metrics
      this.updateTokenMetrics(sessionId);

      // Prepare streaming API request parameters
      const streamApiParams: any = {
        model: session.config.model,
        max_tokens: 1024,
        messages: session.messages.map(msg => ({
          role: msg.role === 'system' ? 'user' : msg.role,
          content: msg.content,
        })),
        tools: tools,
        stream: true,
      };

      // Add thinking parameter for Claude 3.7+ models
      if (supportsThinking(session.config.model)) {
        console.log(
          '[SESSION] Model supports thinking for streaming, adding thinking parameter'
        );

        // If thinking is explicitly disabled in config, don't add it
        if (session.config.thinking?.enabled !== false) {
          // Get budget from config or use default
          const budgetTokens =
            session.config.thinking?.budget_tokens ||
            getDefaultThinkingBudget(session.config.model);

          streamApiParams.thinking = {
            type: 'enabled',
            budget_tokens: budgetTokens,
          };

          console.log(
            `[SESSION] Added thinking with budget: ${budgetTokens} tokens`
          );
        }
      }

      try {
        // Send message to Anthropic with streaming
        console.log('[SESSION] Creating Anthropic stream');
        const stream = await this.anthropic.messages.create(streamApiParams);

        console.log('[SESSION] Starting to process Anthropic stream');

        // Use the Anthropic SDK's built-in async iterator
        // Cast to any to avoid TypeScript errors with the stream type
        const iterator = (stream as any)[Symbol.asyncIterator]();
        let iterResult = await iterator.next();

        // Track if we've seen tool calls
        let hasSeenToolCall = false;

        while (!iterResult.done) {
          const chunk = iterResult.value;

          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            // Content chunks
            yield { type: 'content', content: chunk.delta.text };
          } else if (chunk.type === 'thinking') {
            // Thinking chunks
            console.log('[SESSION] Received thinking chunk');
            yield {
              type: 'thinking',
              content: chunk.thinking || 'Thinking...',
            };
          } else if (
            chunk.type === 'content_block_start' &&
            chunk.content_block.type === 'tool_use'
          ) {
            // Tool call detected
            console.log(
              '[SESSION] Tool call detected in stream',
              JSON.stringify(chunk.content_block)
            );
            hasSeenToolCall = true;
            const toolName = chunk.content_block.name || 'unknown';
            yield {
              type: 'tool_start',
              content: `Using tool: ${toolName}`,
            };
          } else if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'tool_use_delta'
          ) {
            // Tool call parameter delta
            // We don't yield this as it's internal tool call building
            console.log('[SESSION] Tool parameter delta received');
          } else if (chunk.type === 'message_delta' && chunk.usage) {
            // Usage information - can be used to update token metrics
            console.log('[SESSION] Usage information received:', chunk.usage);
          }

          iterResult = await iterator.next();
        }
      } catch (error) {
        console.error('[SESSION] Error processing stream:', error);
        yield { type: 'error', error: 'Error processing stream' };
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
   * Update token metrics for a session based on current messages
   * Now with enhanced metrics and cost calculation
   */
  updateTokenMetrics(sessionId: string): TokenMetrics {
    const session = this.getSession(sessionId);
    const modelName = session.config.model;

    // Calculate current token usage with the enhanced method
    const tokenCounts = calculateMessageTokens(session.messages, modelName);
    const maxContextTokens = getContextLimit(modelName);
    const percentUsed = calculateContextUsage(
      tokenCounts.totalTokens,
      modelName
    );

    // Calculate if context is approaching critical limits
    const isCritical = isContextWindowCritical(
      tokenCounts.totalTokens,
      modelName
    );
    const recommendation = getContextRecommendation(
      tokenCounts.totalTokens,
      modelName
    );

    // Update token metrics
    const metrics: TokenMetrics = {
      userTokens: tokenCounts.userTokens,
      assistantTokens: tokenCounts.assistantTokens,
      systemTokens: tokenCounts.systemTokens,
      toolTokens: tokenCounts.toolTokens,
      totalTokens: tokenCounts.totalTokens,
      maxContextTokens: maxContextTokens,
      percentUsed: percentUsed,
      recommendation: recommendation,
    };

    // Update cost estimation
    const costEstimate = calculateTokenCost(tokenCounts, modelName);

    // Update session data
    session.tokenMetrics = metrics;
    session.tokenCost = costEstimate;
    session.isContextWindowCritical = isCritical;

    // Log meaningful information
    console.log(`[SESSION] Updated token metrics for ${sessionId}:`, {
      totalTokens: metrics.totalTokens,
      percentUsed: metrics.percentUsed,
      isCritical: isCritical,
      estimatedCost: `$${costEstimate.totalCost.toFixed(4)}`,
    });

    return metrics;
  }

  /**
   * Get current token usage for a session with recommendations
   */
  getSessionTokenUsage(sessionId: string): TokenMetrics {
    return this.updateTokenMetrics(sessionId);
  }

  /**
   * Get cost estimates for a session
   */
  getTokenCostEstimate(sessionId: string): TokenCost {
    const session = this.getSession(sessionId);

    // Make sure metrics are up to date
    this.updateTokenMetrics(sessionId);

    if (!session.tokenCost) {
      throw new LLMError('Token cost not available for session');
    }

    return session.tokenCost;
  }

  /**
   * Set context optimization settings
   */
  setContextSettings(
    sessionId: string,
    settings: Partial<ContextSettings>
  ): void {
    const session = this.getSession(sessionId);

    if (!session.contextSettings) {
      session.contextSettings = {
        autoTruncate: false,
        preserveSystemMessages: true,
        preserveRecentMessages: 4,
        truncationStrategy: 'oldest-first',
      };
    }

    // Update only provided settings
    session.contextSettings = {
      ...session.contextSettings,
      ...settings,
    };

    console.log(
      `[SESSION] Updated context settings for ${sessionId}:`,
      session.contextSettings
    );
  }

  /**
   * Apply basic context optimization based on settings
   */
  optimizeContext(sessionId: string): TokenMetrics {
    const session = this.getSession(sessionId);

    if (!session.contextSettings?.autoTruncate) {
      console.log(
        `[SESSION] Context optimization skipped (autoTruncate disabled)`
      );
      return this.getSessionTokenUsage(sessionId);
    }

    if (!session.isContextWindowCritical) {
      console.log(
        `[SESSION] Context optimization not needed (usage not critical)`
      );
      return this.getSessionTokenUsage(sessionId);
    }

    console.log(`[SESSION] Applying context optimization for ${sessionId}`);

    // Select optimization strategy based on config
    if (session.contextSettings.truncationStrategy === 'selective') {
      // Use relevance-based pruning for selective strategy
      this.truncateByRelevance(session);
    } else if (session.contextSettings.truncationStrategy === 'oldest-first') {
      // Use traditional oldest-first truncation
      this.truncateOldestMessages(session);
    }

    // Update token metrics after optimization
    return this.updateTokenMetrics(sessionId);
  }

  /**
   * Truncate messages using relevance-based pruning
   * This strategy removes less relevant messages first, preserving crucial context
   */
  private truncateByRelevance(session: ChatSession): void {
    console.log(`[SESSION] Using relevance-based pruning strategy`);

    const totalTokens = session.messages.reduce(
      (sum, msg) => sum + (msg.tokens || 0),
      0
    );
    const maxTokens =
      session.contextSettings?.maxTokenLimit ||
      this.getModelContextLimit(session.config.model);

    // Target 70% of max tokens to leave room for new messages
    const targetTokens = Math.floor(maxTokens * 0.7);

    // Skip if we're already below target
    if (totalTokens <= targetTokens) {
      console.log(
        `[SESSION] Skipping relevance pruning: ${totalTokens} tokens already under target ${targetTokens}`
      );
      return;
    }

    // Apply relevance-based pruning
    const originalMessageCount = session.messages.length;
    const prunedMessages = pruneMessagesByRelevance(
      session.messages,
      session.contextSettings!,
      targetTokens
    );

    // Update session with pruned messages
    session.messages = prunedMessages;

    console.log(
      `[SESSION] Relevance pruning: reduced from ${originalMessageCount} to ${prunedMessages.length} messages`
    );
  }

  /**
   * Truncate oldest messages, preserving system messages and recent messages
   */
  private truncateOldestMessages(session: ChatSession): void {
    const { preserveSystemMessages, preserveRecentMessages } =
      session.contextSettings!;

    // Create a copy of messages to work with
    const messages = [...session.messages];

    // Separate system messages if we need to preserve them
    const systemMessages = preserveSystemMessages
      ? messages.filter(m => m.role === 'system')
      : [];

    // Get non-system messages
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Keep only the most recent N messages
    const recentMessages = nonSystemMessages.slice(-preserveRecentMessages);

    // Combine system messages with recent messages
    const newMessages = [...systemMessages, ...recentMessages];

    console.log(
      `[SESSION] Truncated messages from ${messages.length} to ${newMessages.length}`
    );

    // Update session messages
    session.messages = newMessages;
  }

  /**
   * Get the maximum context window size for a given model
   * @param model The model identifier
   * @returns Maximum context size in tokens
   */
  private getModelContextLimit(model: string): number {
    // Add a conservative default for unknown models
    const DEFAULT_LIMIT = 100000; // 100k tokens as a safe default

    if (model.includes('claude-3-opus')) {
      return 200000; // 200k tokens
    } else if (
      model.includes('claude-3-sonnet') ||
      model.includes('claude-3-5-sonnet')
    ) {
      return 180000; // 180k tokens
    } else if (model.includes('claude-3-haiku')) {
      return 150000; // 150k tokens
    } else if (
      model.includes('claude-2') ||
      model.includes('claude-2.0') ||
      model.includes('claude-2.1')
    ) {
      return 100000; // 100k tokens
    } else if (model.includes('claude-instant')) {
      return 100000; // 100k tokens
    } else {
      // For all other models, use a conservative default
      console.warn(
        `[SESSION] Unknown model ${model}, using default context limit of ${DEFAULT_LIMIT} tokens`
      );
      return DEFAULT_LIMIT;
    }
  }

  /**
   * Restart a server for a session
   * This is primarily used for recovering from server failures
   *
   * @param sessionId The ID of the session
   * @param serverName The name of the server to restart
   */
  async _restartServer(sessionId: string, serverName: string): Promise<void> {
    console.log(
      `[SESSION] Restarting server ${serverName} for session ${sessionId}`
    );

    const session = this.getSession(sessionId);

    // Get the server configuration from the session
    const serverConfig = session.config.servers?.[serverName];
    if (!serverConfig) {
      throw new Error(`Server configuration not found for ${serverName}`);
    }

    // Get the current client
    const client = session.serverClients.get(serverName);
    if (client) {
      // Close the current client
      try {
        await client.close();
      } catch (error) {
        console.error(
          `[SESSION] Error closing client for ${serverName}:`,
          error
        );
      }

      // Remove the client
      session.serverClients.delete(serverName);
    }

    // Stop the existing server if it's still in the launcher
    try {
      // Get the current server process
      const currentProcess = this.serverLauncher.getServerProcess(serverName);
      if (currentProcess) {
        // Manually clean up the process
        try {
          console.log(`[SESSION] Killing server process: ${serverName}`);
          currentProcess.kill('SIGKILL');
        } catch (error) {
          console.error(`[SESSION] Error killing process: ${error}`);
        }
      }
    } catch (error) {
      console.error(`[SESSION] Error checking server process: ${error}`);
    }

    // Force cleanup in the launcher using public method
    this.serverLauncher.cleanup(serverName);

    // Restart the server
    const serverProcess = await this.serverLauncher.launchServer(
      serverName,
      serverConfig
    );

    // Discover capabilities
    const result = await this.serverDiscovery.discoverCapabilities(
      serverName,
      serverProcess
    );

    // Store client and capabilities
    session.serverClients.set(serverName, result.client);

    // Update tools - remove existing tools from this server and add new ones
    const existingTools = new Set(session.tools.map(tool => tool.name));
    result.capabilities.tools.forEach(tool => {
      if (!existingTools.has(tool.name)) {
        session.tools.push(tool);
      }
    });

    console.log(`[SESSION] Server ${serverName} restarted successfully`);
  }

  /**
   * Clean up all sessions and resources
   * This method:
   * 1. Closes all client connections to release transport resources
   * 2. Stops all server processes
   * 3. Clears the session store
   */
  async cleanup() {
    console.log('[SESSION] Starting cleanup...');

    // Close all connections
    for (const [sessionId, session] of globalSessions.entries()) {
      console.log(`[SESSION] Closing connections for session ${sessionId}`);
      for (const [serverName, client] of session.serverClients.entries()) {
        if (client && typeof client.close === 'function') {
          try {
            client.close();
            console.log(`[SESSION] Closed client for ${serverName}`);
          } catch (error) {
            console.error(
              `[SESSION] Error closing client for ${serverName}:`,
              error
            );
          }
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
