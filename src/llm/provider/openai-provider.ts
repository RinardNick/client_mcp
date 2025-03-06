import OpenAI from 'openai';
import {
  LLMProviderInterface,
  ModelCapability,
  ProviderConfig,
  MessageOptions,
  LLMResponse,
  LLMResponseChunk,
} from './types';
import { MCPTool } from '../types';
import { ToolCall, ConversationMessage } from '../types';
import { countTokens } from '../token-counter';
import { ProviderAdapter } from './provider-adapter';

/**
 * OpenAI GPT provider implementation
 */
export class OpenAIProvider implements LLMProviderInterface {
  name = 'openai';
  private client: OpenAI | null = null;
  private apiKey: string = '';

  /**
   * Supported OpenAI models and their capabilities
   */
  supportedModels: ModelCapability[] = [
    {
      id: 'gpt-4-turbo',
      contextWindow: 128000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.01,
      outputCostPer1K: 0.03,
    },
    {
      id: 'gpt-4',
      contextWindow: 8192,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.03,
      outputCostPer1K: 0.06,
    },
    {
      id: 'gpt-3.5-turbo',
      contextWindow: 16385,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.0005,
      outputCostPer1K: 0.0015,
    },
  ];

  /**
   * Initialize the OpenAI provider with API credentials
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey;
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
  }

  /**
   * Format tools for OpenAI API format (function calling)
   */
  formatToolsForProvider(tools: MCPTool[]): any[] {
    return tools.map((tool: MCPTool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: {
          type: 'object',
          properties: tool.inputSchema?.properties || {},
          required: tool.inputSchema?.required || [],
        },
      },
    }));
  }

  /**
   * Parse a tool call from an OpenAI response
   */
  parseToolCall(response: LLMResponse): ToolCall | null {
    // If it already has a toolCall property (from our standardized format)
    if (response.toolCall) {
      return response.toolCall;
    }

    // Otherwise check the raw OpenAI response if available
    if (response.rawResponse) {
      const openaiResponse = response.rawResponse as any;
      if (
        openaiResponse.choices &&
        openaiResponse.choices[0]?.message?.tool_calls &&
        openaiResponse.choices[0].message.tool_calls.length > 0
      ) {
        const toolCall = openaiResponse.choices[0].message.tool_calls[0];
        return {
          name: toolCall.function.name,
          parameters: JSON.parse(toolCall.function.arguments),
        };
      }
    }

    return null;
  }

  /**
   * Count tokens for OpenAI models
   */
  countTokens(text: string, model?: string): number {
    return countTokens(text, model || 'gpt-4-turbo');
  }

  /**
   * Convert messages to OpenAI format
   */
  private formatMessages(userMessage: string, options: MessageOptions): any[] {
    // Check if we should use the provider adapter for formatting
    if (options.providerOptions?.useProviderFormatting) {
      const providerAdapter = new ProviderAdapter();

      // Get existing messages
      const existingMessages =
        (options.providerOptions?.messages as ConversationMessage[]) || [];

      // Add the new user message to the messages array
      const messagesWithNewMessage = [
        ...existingMessages,
        {
          role: 'user',
          content: userMessage,
          timestamp: new Date(),
        } as ConversationMessage,
      ];

      // Format messages using the provider adapter
      return providerAdapter.formatMessagesForProvider(
        messagesWithNewMessage,
        'openai'
      );
    }

    // Legacy formatting method
    const messages: any[] = [];

    // Add system message if provided
    if (options.systemMessage) {
      messages.push({
        role: 'system',
        content: options.systemMessage,
      });
    }

    // Add history messages if provided
    if (options.providerOptions?.messages) {
      const historyMessages = options.providerOptions.messages as any[];
      messages.push(...historyMessages);
    }

    // Add the new user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * Send a message to OpenAI and get a complete response
   */
  async sendMessage(
    message: string,
    options: MessageOptions
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const modelToUse = options.model || 'gpt-4-turbo';

    // Format messages for OpenAI
    const messages = this.formatMessages(message, options);

    // Format tools if available
    const functions =
      options.tools && options.tools.length > 0
        ? this.formatToolsForProvider(options.tools)
        : undefined;

    // Prepare API request parameters
    const apiParams: any = {
      model: modelToUse,
      messages: messages,
      max_tokens: options.maxTokens || 1024,
    };

    // Add temperature if specified
    if (options.temperature !== undefined) {
      apiParams.temperature = options.temperature;
    }

    // Add tools if available
    if (functions) {
      apiParams.tools = functions;
    }

    try {
      // Send the completion request
      const response = await this.client.chat.completions.create(apiParams);

      // Extract the content
      const content =
        response.choices[0]?.message.content || 'No content returned';

      // Check for tool calls
      let toolCall: ToolCall | undefined = undefined;
      if (
        response.choices[0]?.message.tool_calls &&
        response.choices[0].message.tool_calls.length > 0
      ) {
        const openaiToolCall = response.choices[0].message.tool_calls[0];
        toolCall = {
          name: openaiToolCall.function.name,
          parameters: JSON.parse(openaiToolCall.function.arguments),
        };
      }

      // Return formatted response
      return {
        content,
        toolCall,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        rawResponse: response,
      };
    } catch (error) {
      throw new Error(
        `OpenAI API error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Stream a message to OpenAI and yield response chunks
   */
  async *streamMessage(
    message: string,
    options: MessageOptions
  ): AsyncGenerator<LLMResponseChunk> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const modelToUse = options.model || 'gpt-4-turbo';

    // Format messages for OpenAI
    const messages = this.formatMessages(message, options);

    // Format tools if available
    const functions =
      options.tools && options.tools.length > 0
        ? this.formatToolsForProvider(options.tools)
        : undefined;

    // Prepare streaming API request parameters
    const streamApiParams: any = {
      model: modelToUse,
      messages: messages,
      max_tokens: options.maxTokens || 1024,
      stream: true,
    };

    // Add temperature if specified
    if (options.temperature !== undefined) {
      streamApiParams.temperature = options.temperature;
    }

    // Add tools if available
    if (functions) {
      streamApiParams.tools = functions;
      streamApiParams.tool_choice = 'auto';
    }

    try {
      // Create the stream properly using the OpenAI SDK's stream method
      const stream = await this.client.chat.completions.create(streamApiParams);

      // Process the stream - correct method for OpenAI's SDK
      try {
        // Use the proper stream handling method based on the OpenAI SDK version
        // Handle different versions of the OpenAI SDK and their stream implementations
        // @ts-ignore - Ignore TypeScript error as we're checking at runtime
        if (stream.on && typeof stream.on === 'function') {
          // Stream using event emitter pattern (older versions of SDK)
          return this.handleStreamWithEventEmitter(stream);
        } else {
          // Modern OpenAI SDK with async iterator
          // @ts-ignore - We're handling the type checking at runtime
          for await (const chunk of stream) {
            // Handle text content
            if (chunk.choices[0]?.delta?.content) {
              yield {
                type: 'content',
                content: chunk.choices[0].delta.content,
              };
            }

            // Handle tool calls
            if (chunk.choices[0]?.delta?.tool_calls?.length > 0) {
              const toolCall = chunk.choices[0].delta.tool_calls[0];
              if (toolCall.function?.name && toolCall.function?.arguments) {
                try {
                  const args = JSON.parse(toolCall.function.arguments || '{}');
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      name: toolCall.function.name,
                      parameters: args,
                    },
                  };
                } catch (error) {
                  console.error(
                    '[OPENAI] Failed to parse tool arguments:',
                    error
                  );
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('[OPENAI] Error processing stream:', error);
        yield { type: 'error', error: 'Error processing OpenAI stream' };
      }

      // Signal end of stream
      yield { type: 'done' };
    } catch (error) {
      console.error('[OPENAI] Error processing stream:', error);
      yield { type: 'error', error: 'Error processing OpenAI stream' };
    }
  }

  // Helper method to handle streams with event emitter pattern
  private async *handleStreamWithEventEmitter(
    stream: any
  ): AsyncGenerator<LLMResponseChunk> {
    const chunks: LLMResponseChunk[] = [];

    return new Promise<AsyncGenerator<LLMResponseChunk>>(async resolve => {
      // Set up event handlers
      stream.on('data', (chunk: any) => {
        // Handle text content
        if (chunk.choices[0]?.delta?.content) {
          chunks.push({
            type: 'content',
            content: chunk.choices[0].delta.content,
          });
        }

        // Handle tool calls
        if (chunk.choices[0]?.delta?.tool_calls?.length > 0) {
          const toolCall = chunk.choices[0].delta.tool_calls[0];
          if (toolCall.function?.name && toolCall.function?.arguments) {
            try {
              const args = JSON.parse(toolCall.function.arguments || '{}');
              chunks.push({
                type: 'tool_call',
                toolCall: {
                  name: toolCall.function.name,
                  parameters: args,
                },
              });
            } catch (error) {
              console.error('[OPENAI] Failed to parse tool arguments:', error);
            }
          }
        }
      });

      stream.on('end', () => {
        chunks.push({ type: 'done' });
        resolve(
          (async function* () {
            for (const chunk of chunks) {
              yield chunk;
            }
          })()
        );
      });

      stream.on('error', (error: Error) => {
        console.error('[OPENAI] Stream error:', error);
        chunks.push({ type: 'error', error: error.message });
        resolve(
          (async function* () {
            for (const chunk of chunks) {
              yield chunk;
            }
          })()
        );
      });
    });
  }
}
