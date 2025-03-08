import { MCPTool, ToolCall } from '../types';

/**
 * Interface for a provider-specific tool adapter
 */
export interface ProviderToolAdapter {
  /**
   * Convert an MCP tool to provider-specific format
   */
  adaptTool: (tool: MCPTool) => unknown;

  /**
   * Parse a provider-specific tool call response to canonical format
   */
  parseToolCall: (response: any) => ToolCall | null;
}

/**
 * ToolAdapter provides normalization and conversion of tool formats between different providers
 */
export class ToolAdapter {
  private adapters: Record<string, ProviderToolAdapter> = {};

  constructor() {
    this.initializeDefaultAdapters();
  }

  /**
   * Set up default adapters for known providers
   */
  private initializeDefaultAdapters(): void {
    // Anthropic adapter
    this.registerToolAdapter('anthropic', {
      adaptTool: (tool: MCPTool) => ({
        name: tool.name,
        description: tool.description || '',
        input_schema: {
          type: 'object',
          properties: tool.inputSchema?.properties || {},
          required: tool.inputSchema?.required || [],
        },
      }),
      parseToolCall: (response: any): ToolCall | null => {
        if (response.toolCall) {
          return response.toolCall;
        }

        try {
          const rawResponse = response.rawResponse;
          const content = rawResponse?.content;

          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'tool_use' && item.tool_use) {
                return {
                  name: item.tool_use.name,
                  parameters: item.tool_use.input || {},
                };
              }
            }
          }
        } catch (error) {
          console.warn('Error parsing Anthropic tool call:', error);
        }

        return null;
      },
    });

    // OpenAI adapter
    this.registerToolAdapter('openai', {
      adaptTool: (tool: MCPTool) => ({
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
      }),
      parseToolCall: (response: any): ToolCall | null => {
        if (response.toolCall) {
          return response.toolCall;
        }

        try {
          const rawResponse = response.rawResponse;
          const choices = rawResponse?.choices;

          if (Array.isArray(choices) && choices.length > 0) {
            const message = choices[0].message;
            const toolCalls = message?.tool_calls;

            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              const toolCall = toolCalls[0];
              if (toolCall.function) {
                let parameters = {};
                try {
                  parameters = JSON.parse(toolCall.function.arguments);
                } catch (e) {
                  console.warn('Error parsing OpenAI tool call arguments:', e);
                }

                return {
                  name: toolCall.function.name,
                  parameters,
                };
              }
            }
          }
        } catch (error) {
          console.warn('Error parsing OpenAI tool call:', error);
        }

        return null;
      },
    });

    // Grok adapter
    this.registerToolAdapter('grok', {
      adaptTool: (tool: MCPTool) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: {
          type: 'object',
          properties: tool.inputSchema?.properties || {},
          required: tool.inputSchema?.required || [],
        },
      }),
      parseToolCall: (response: any): ToolCall | null => {
        if (response.toolCall) {
          return response.toolCall;
        }

        try {
          const rawResponse = response.rawResponse;
          const toolCalls = rawResponse?.tool_calls;

          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            const toolCall = toolCalls[0];
            return {
              name: toolCall.name,
              parameters: toolCall.parameters || {},
            };
          }
        } catch (error) {
          console.warn('Error parsing Grok tool call:', error);
        }

        return null;
      },
    });
  }

  /**
   * Register a tool adapter for a provider
   * @param provider Provider name
   * @param adapter Provider-specific adapter
   */
  registerToolAdapter(provider: string, adapter: ProviderToolAdapter): void {
    this.adapters[provider] = adapter;
  }

  /**
   * Get a list of supported providers
   * @returns Array of provider names
   */
  getSupportedProviders(): string[] {
    return Object.keys(this.adapters);
  }

  /**
   * Convert an MCP tool to provider-specific format
   * @param tool MCP tool to convert
   * @param provider Target provider
   * @returns Provider-specific tool format
   */
  adaptToolForProvider(tool: MCPTool, provider: string): unknown {
    const adapter = this.adapters[provider];
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }

    return adapter.adaptTool(tool);
  }

  /**
   * Convert an array of MCP tools to provider-specific format
   * @param tools Array of MCP tools to convert
   * @param provider Target provider
   * @returns Array of provider-specific tools
   */
  adaptToolsForProvider(tools: MCPTool[], provider: string): unknown[] {
    return tools.map(tool => this.adaptToolForProvider(tool, provider));
  }

  /**
   * Parse a provider-specific tool call to canonical format
   * @param response LLM response containing a tool call
   * @param provider Source provider
   * @returns Canonical tool call or null if no tool call found
   */
  parseToolCallFromProvider(response: any, provider: string): ToolCall | null {
    const adapter = this.adapters[provider];
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }

    return adapter.parseToolCall(response);
  }

  /**
   * Get the canonical format of an MCP tool (identity function)
   * @param tool MCP tool
   * @returns The same MCP tool (canonical format)
   */
  getCanonicalFormat(tool: MCPTool): MCPTool {
    return { ...tool };
  }
}
