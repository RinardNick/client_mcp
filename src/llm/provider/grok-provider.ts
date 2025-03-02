import {
  LLMProviderInterface,
  ModelCapability,
  ProviderConfig,
  MessageOptions,
  LLMResponse,
  LLMResponseChunk,
} from './types';
import { MCPTool } from '../types';
import { ToolCall } from '../types';
import { countTokens } from '../token-counter';
import { GrokClient, GrokCompletionOptions, GrokMessage } from '../grok-client';

/**
 * Grok provider implementation
 */
export class GrokProvider implements LLMProviderInterface {
  name = 'grok';
  private client: GrokClient | null = null;
  private apiKey: string = '';

  /**
   * Supported Grok models and their capabilities
   */
  supportedModels: ModelCapability[] = [
    {
      id: 'grok-1',
      contextWindow: 128000, // Approximate value based on available information
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.01, // Approximate value
      outputCostPer1K: 0.03, // Approximate value
    },
    {
      id: 'grok-1-mini',
      contextWindow: 32000, // Approximate value
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.0015, // Approximate value
      outputCostPer1K: 0.003, // Approximate value
    },
  ];

  /**
   * Initialize the Grok provider with API credentials
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey;
    this.client = new GrokClient(this.apiKey);
  }

  /**
   * Format tools for Grok API format
   */
  formatToolsForProvider(tools: MCPTool[]): any[] {
    return tools.map((tool: MCPTool) => ({
      name: tool.name,
      description: tool.description || '',
      parameters: {
        type: 'object',
        properties: tool.inputSchema?.properties || {},
        required: tool.inputSchema?.required || [],
      },
    }));
  }

  /**
   * Parse a tool call from a Grok response
   */
  parseToolCall(response: LLMResponse): ToolCall | null {
    // If it already has a toolCall property (from our standardized format)
    if (response.toolCall) {
      return response.toolCall;
    }

    // Otherwise check the raw Grok response if available
    if (response.rawResponse) {
      const grokResponse = response.rawResponse as any;
      if (
        grokResponse.message?.tool_calls &&
        grokResponse.message.tool_calls.length > 0
      ) {
        const toolCall = grokResponse.message.tool_calls[0];
        return {
          name: toolCall.name,
          parameters: toolCall.parameters,
        };
      }
    }

    return null;
  }

  /**
   * Count tokens for Grok models
   */
  countTokens(text: string, model?: string): number {
    // Use the existing token counter - may need adjustment for Grok-specific tokenization
    return countTokens(text, model || 'grok-1');
  }

  /**
   * Convert messages to Grok format
   */
  private formatMessages(
    userMessage: string,
    options: MessageOptions
  ): GrokMessage[] {
    const messages: GrokMessage[] = [];

    // Add history messages if provided
    if (options.providerOptions?.messages) {
      const historyMessages = options.providerOptions.messages as GrokMessage[];
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
   * Send a message to Grok and get a complete response
   */
  async sendMessage(
    message: string,
    options: MessageOptions
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('Grok client not initialized');
    }

    const modelToUse = options.model || 'grok-1';

    // Format messages for Grok
    const messages = this.formatMessages(message, options);

    // Format tools if available
    const tools =
      options.tools && options.tools.length > 0
        ? this.formatToolsForProvider(options.tools)
        : undefined;

    // Prepare API request parameters
    const completionOptions: GrokCompletionOptions = {
      model: modelToUse,
      messages: messages,
      max_tokens: options.maxTokens || 1024,
    };

    // Add system message if provided
    if (options.systemMessage) {
      completionOptions.system_prompt = options.systemMessage;
    }

    // Add temperature if specified
    if (options.temperature !== undefined) {
      completionOptions.temperature = options.temperature;
    }

    // Add tools if available
    if (tools) {
      completionOptions.tools = tools;
    }

    try {
      // Send the completion request
      const response = await this.client.complete(completionOptions);

      // Extract the content
      const content = response.message.content;

      // Check for tool calls
      let toolCall: ToolCall | undefined = undefined;
      if (
        response.message.tool_calls &&
        response.message.tool_calls.length > 0
      ) {
        const grokToolCall = response.message.tool_calls[0];
        toolCall = {
          name: grokToolCall.name,
          parameters: grokToolCall.parameters,
        };
      }

      // Return formatted response
      return {
        content,
        toolCall,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        rawResponse: response,
      };
    } catch (error) {
      throw new Error(
        `Grok API error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Stream a message to Grok and yield response chunks
   */
  async *streamMessage(
    message: string,
    options: MessageOptions
  ): AsyncGenerator<LLMResponseChunk> {
    if (!this.client) {
      throw new Error('Grok client not initialized');
    }

    const modelToUse = options.model || 'grok-1';

    // Format messages for Grok
    const messages = this.formatMessages(message, options);

    // Format tools if available
    const tools =
      options.tools && options.tools.length > 0
        ? this.formatToolsForProvider(options.tools)
        : undefined;

    // Prepare streaming API request parameters
    const streamOptions: GrokCompletionOptions = {
      model: modelToUse,
      messages: messages,
      max_tokens: options.maxTokens || 1024,
      stream: true,
    };

    // Add system message if provided
    if (options.systemMessage) {
      streamOptions.system_prompt = options.systemMessage;
    }

    // Add temperature if specified
    if (options.temperature !== undefined) {
      streamOptions.temperature = options.temperature;
    }

    // Add tools if available
    if (tools) {
      streamOptions.tools = tools;
    }

    try {
      // Variables for tracking the current tool call being built
      let currentToolCall: any = null;
      let currentToolParameters: Record<string, any> = {};

      // Get the stream
      const stream = await this.client.streamComplete(streamOptions);

      // Process the stream
      for await (const chunk of stream) {
        // Handle errors
        if (chunk.error) {
          yield { type: 'error', error: chunk.error };
          continue;
        }

        // Handle done signal
        if (chunk.done) {
          yield { type: 'done' };
          continue;
        }

        // Handle text content
        if (chunk.content) {
          yield { type: 'content', content: chunk.content };
        }

        // Handle tool calls
        if (chunk.tool_call) {
          // If it's the first chunk of a tool call
          if (!currentToolCall) {
            currentToolCall = {
              name: chunk.tool_call.name || '',
              parameters: {},
            };
          }

          // Update tool call info
          if (chunk.tool_call.name) {
            currentToolCall.name = chunk.tool_call.name;
          }

          // Add parameter updates
          if (chunk.tool_call.parameters) {
            currentToolParameters = {
              ...currentToolParameters,
              ...chunk.tool_call.parameters,
            };
            currentToolCall.parameters = currentToolParameters;
          }

          // If the tool call is complete, yield it
          if (chunk.tool_call.complete) {
            yield {
              type: 'tool_call',
              toolCall: {
                name: currentToolCall.name,
                parameters: currentToolCall.parameters,
              },
            };

            // Reset tool call tracking
            currentToolCall = null;
            currentToolParameters = {};
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error: `Grok streaming error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
