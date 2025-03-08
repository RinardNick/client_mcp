import { Anthropic } from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import {
  LLMProviderInterface,
  ModelCapability,
  ProviderConfig,
  MessageOptions,
  LLMResponse,
  LLMResponseChunk,
} from '../types';
import { MCPTool } from '../../types';
import { ToolCall, ConversationMessage } from '../../types';
import { countTokens } from '../../tokens/token-counter';
import { ProviderAdapter } from '../compatibility/provider-adapter';

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider implements LLMProviderInterface {
  name = 'anthropic';
  private client: Anthropic | null = null;
  private apiKey: string = '';

  /**
   * Supported Claude models and their capabilities
   */
  supportedModels: ModelCapability[] = [
    {
      id: 'claude-3-5-sonnet-20241022',
      contextWindow: 200000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.015,
      outputCostPer1K: 0.075,
    },
    {
      id: 'claude-3-7-sonnet-20250222',
      contextWindow: 200000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.003,
      outputCostPer1K: 0.015,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      contextWindow: 150000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.00025,
      outputCostPer1K: 0.00125,
    },
  ];

  /**
   * Initialize the Anthropic provider with API credentials
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey;
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  /**
   * Format tools for Anthropic API format
   */
  formatToolsForProvider(tools: MCPTool[]): Tool[] {
    return tools.map((tool: MCPTool) => ({
      name: tool.name,
      input_schema: {
        type: 'object',
        properties: tool.inputSchema?.properties || {},
      },
      description: tool.description || '',
    }));
  }

  /**
   * Parse a tool call from an Anthropic response
   */
  parseToolCall(response: LLMResponse): ToolCall | null {
    if (!response.toolCall) {
      return null;
    }

    return response.toolCall;
  }

  /**
   * Count tokens for Anthropic models
   */
  countTokens(text: string, model?: string): number {
    return countTokens(text, model || 'claude-3-sonnet-20240229');
  }

  /**
   * Send a message to Anthropic and get a complete response
   */
  async sendMessage(
    message: string,
    options: MessageOptions
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const modelToUse = options.model || 'claude-3-sonnet-20240229';

    // Prepare messages array with existing history and new message
    let messages: any[] = (options.providerOptions?.messages as any[]) || [];
    let systemMessageFromFormatter: string | undefined;

    // Check if we should use the provider adapter for formatting
    if (options.providerOptions?.useProviderFormatting) {
      const providerAdapter = new ProviderAdapter();

      // Add the new user message to the messages array
      const messagesWithNewMessage = [
        ...(messages as ConversationMessage[]),
        {
          role: 'user',
          content: message,
          timestamp: new Date(),
        } as ConversationMessage,
      ];

      // Format messages using the provider adapter
      const formattedResult = providerAdapter.formatMessagesForProvider(
        messagesWithNewMessage,
        'anthropic'
      );

      // Handle Anthropic's special format with top-level system parameter
      if (formattedResult && typeof formattedResult === 'object') {
        // Check if the formatter returned an object with messages and system properties
        if ('messages' in formattedResult) {
          messages = formattedResult.messages;
          if ('system' in formattedResult) {
            systemMessageFromFormatter = formattedResult.system;
          }
        } else {
          // Fall back to treating the result as just messages
          messages = formattedResult as any[];
        }
      } else {
        // Fall back to treating the result as just messages
        messages = formattedResult as any[];
      }
    } else {
      // Add the new user message directly (legacy method)
      messages.push({
        role: 'user',
        content: message,
      });
    }

    // Format tools if available
    const tools =
      options.tools && options.tools.length > 0
        ? this.formatToolsForProvider(options.tools)
        : undefined;

    // Prepare API request parameters
    const apiParams: any = {
      model: modelToUse,
      max_tokens: options.maxTokens || 1024,
      messages: messages,
    };

    // Add system message if provided - prefer the formatter's system message over the options
    if (systemMessageFromFormatter) {
      apiParams.system = systemMessageFromFormatter;
    } else if (options.systemMessage) {
      apiParams.system = options.systemMessage;
    }

    // Add tools if available
    if (tools) {
      apiParams.tools = tools;
    }

    // Add temperature if specified
    if (options.temperature !== undefined) {
      apiParams.temperature = options.temperature;
    }

    // Add thinking for Claude 3.7+ models if configured
    if (modelToUse.includes('claude-3') && options.providerOptions?.thinking) {
      apiParams.thinking = options.providerOptions.thinking;
    }

    try {
      // Send message to Anthropic
      const response = await this.client.messages.create(apiParams);

      // Process response
      let content = '';
      let toolCall = undefined;

      // Look for tool calls in the structured response
      const toolCalls = response.content.filter(
        item => item.type === 'tool_use'
      );

      if (toolCalls && toolCalls.length > 0) {
        // We have a tool call
        const toolUse = toolCalls[0]; // Use the first tool call

        if (toolUse.id && toolUse.name && toolUse.input) {
          toolCall = {
            name: toolUse.name,
            parameters: toolUse.input,
          };
        }
      }

      // Extract text content
      const textContent = response.content.filter(item => item.type === 'text');
      if (textContent && textContent.length > 0) {
        content = textContent[0].text;
      } else if (toolCalls.length > 0) {
        // If we only have tool calls, create a placeholder content
        content = `I need to use the ${toolCalls[0].name} tool.`;
      }

      // Check for legacy format tool calls
      if (!toolCall) {
        const toolMatch = content.match(/<tool>(.*?)<\/tool>/s);
        if (toolMatch && toolMatch[1]) {
          const toolContent = toolMatch[1].trim();
          const spaceIndex = toolContent.indexOf(' ');
          if (spaceIndex > -1) {
            toolCall = {
              name: toolContent.slice(0, spaceIndex),
              parameters: JSON.parse(toolContent.slice(spaceIndex + 1)),
            };
          }
        }
      }

      // Return formatted response
      return {
        content,
        toolCall,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
        rawResponse: response,
      };
    } catch (error) {
      throw new Error(
        `Anthropic API error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Stream a message to Anthropic and yield response chunks
   */
  async *streamMessage(
    message: string,
    options: MessageOptions
  ): AsyncGenerator<LLMResponseChunk> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const modelToUse = options.model || 'claude-3-sonnet-20240229';

    // Prepare messages array with existing history and new message
    let messages: any[] = (options.providerOptions?.messages as any[]) || [];
    let systemMessageFromFormatter: string | undefined;

    // Check if we should use the provider adapter for formatting
    if (options.providerOptions?.useProviderFormatting) {
      const providerAdapter = new ProviderAdapter();

      // Add the new user message to the messages array
      const messagesWithNewMessage = [
        ...(messages as ConversationMessage[]),
        {
          role: 'user',
          content: message,
          timestamp: new Date(),
        } as ConversationMessage,
      ];

      // Format messages using the provider adapter
      const formattedResult = providerAdapter.formatMessagesForProvider(
        messagesWithNewMessage,
        'anthropic'
      );

      // Handle Anthropic's special format with top-level system parameter
      if (formattedResult && typeof formattedResult === 'object') {
        // Check if the formatter returned an object with messages and system properties
        if ('messages' in formattedResult) {
          messages = formattedResult.messages;
          if ('system' in formattedResult) {
            systemMessageFromFormatter = formattedResult.system;
          }
        } else {
          // Fall back to treating the result as just messages
          messages = formattedResult as any[];
        }
      } else {
        // Fall back to treating the result as just messages
        messages = formattedResult as any[];
      }
    } else {
      // Add the new user message directly (legacy method)
      messages.push({
        role: 'user',
        content: message,
      });
    }

    // Format tools if available
    const tools =
      options.tools && options.tools.length > 0
        ? this.formatToolsForProvider(options.tools)
        : undefined;

    // Prepare streaming API request parameters
    const streamApiParams: any = {
      model: modelToUse,
      max_tokens: options.maxTokens || 1024,
      messages: messages,
      stream: true,
    };

    // Add system message if provided - prefer the formatter's system message over the options
    if (systemMessageFromFormatter) {
      streamApiParams.system = systemMessageFromFormatter;
    } else if (options.systemMessage) {
      streamApiParams.system = options.systemMessage;
    }

    // Add tools if available
    if (tools) {
      streamApiParams.tools = tools;
    }

    // Add temperature if specified
    if (options.temperature !== undefined) {
      streamApiParams.temperature = options.temperature;
    }

    // Add thinking for Claude 3.7+ models if configured
    if (modelToUse.includes('claude-3') && options.providerOptions?.thinking) {
      streamApiParams.thinking = options.providerOptions.thinking;
    }

    try {
      // Send streaming request to Anthropic
      const stream = await this.client.messages.create(streamApiParams);

      // Use the Anthropic SDK's built-in async iterator
      const iterator = (stream as any)[Symbol.asyncIterator]();
      let iterResult = await iterator.next();

      // Variables for tracking the current tool call being built
      let collectingToolUse = false;
      let currentToolName = '';
      let currentToolParametersJson = '';

      while (!iterResult.done) {
        const chunk = iterResult.value;

        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          // Handle text content
          const text = chunk.delta.text || '';

          // Check if this is part of a tool call using legacy format <tool> tags
          if (text.includes('<tool>') && !collectingToolUse) {
            // Start of a tool call
            collectingToolUse = true;
            const startPos = text.indexOf('<tool>') + 6;
            const endPos = text.indexOf('</tool>');

            if (endPos > startPos) {
              // Complete tool call in a single chunk
              const toolContent = text.substring(startPos, endPos).trim();
              const spaceIndex = toolContent.indexOf(' ');

              if (spaceIndex > -1) {
                currentToolName = toolContent.slice(0, spaceIndex);
                currentToolParametersJson = toolContent.slice(spaceIndex + 1);

                // Yield the tool_call event
                yield {
                  type: 'tool_call',
                  toolCall: {
                    name: currentToolName,
                    parameters: JSON.parse(currentToolParametersJson),
                  },
                };

                // Reset tool collection state
                collectingToolUse = false;
                currentToolName = '';
                currentToolParametersJson = '';
              }
            } else {
              // Start of a multi-chunk tool call, only collect the name for now
              const partialContent = text.substring(startPos);
              const spaceIndex = partialContent.indexOf(' ');

              if (spaceIndex > -1) {
                // We have the name and part of parameters
                currentToolName = partialContent.slice(0, spaceIndex);
                currentToolParametersJson = partialContent.slice(
                  spaceIndex + 1
                );
              } else {
                // We only have part of the name
                currentToolName = partialContent;
              }
            }
          } else if (collectingToolUse) {
            // Continue collecting tool parameters
            if (text.includes('</tool>')) {
              // End of the tool call
              const endPos = text.indexOf('</tool>');
              currentToolParametersJson += text.substring(0, endPos);
              collectingToolUse = false;

              // Complete tool call collected
              yield {
                type: 'tool_call',
                toolCall: {
                  name: currentToolName,
                  parameters: JSON.parse(currentToolParametersJson),
                },
              };

              // Reset tool collection state
              collectingToolUse = false;
              currentToolName = '';
              currentToolParametersJson = '';
            } else {
              // Continue collecting parameters
              currentToolParametersJson += text;
            }
          } else {
            // Normal content
            yield { type: 'content', content: text };
          }
        } else if (
          chunk.type === 'content_block_start' &&
          chunk.content_block.type === 'tool_use'
        ) {
          // Modern structured tool call
          const toolName = chunk.content_block.name || 'unknown';

          // Modern tool calls collect parameters over multiple chunks
          // We'll collect them in the tool_use_delta events
          currentToolName = toolName;
          currentToolParametersJson = '{}'; // Initialize with empty object
        } else if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'tool_use_delta'
        ) {
          // Tool call parameter delta for modern structured tool calls
          if (chunk.delta.input) {
            // Update parameters
            try {
              const currentParams = JSON.parse(currentToolParametersJson);
              const deltaParams = chunk.delta.input;
              currentToolParametersJson = JSON.stringify({
                ...currentParams,
                ...deltaParams,
              });
            } catch (e) {
              console.error('Error parsing tool parameters:', e);
            }
          }
        } else if (chunk.type === 'content_block_stop' && currentToolName) {
          // End of tool call block, yield the tool call
          yield {
            type: 'tool_call',
            toolCall: {
              name: currentToolName,
              parameters: JSON.parse(currentToolParametersJson),
            },
          };

          // Reset tool state
          currentToolName = '';
          currentToolParametersJson = '';
        } else if (chunk.type === 'thinking') {
          // Thinking chunks
          yield {
            type: 'thinking',
            content: chunk.thinking || 'Thinking...',
          };
        }

        iterResult = await iterator.next();
      }

      // Signal end of stream
      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        error: `Anthropic streaming error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
