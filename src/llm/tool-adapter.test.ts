import { describe, it, expect, beforeEach } from 'vitest';
import { ToolAdapter } from './tool-adapter';
import { MCPTool, ToolCall } from './types';

describe('ToolAdapter', () => {
  let toolAdapter: ToolAdapter;

  beforeEach(() => {
    toolAdapter = new ToolAdapter();
  });

  it('should initialize with default adapters for known providers', () => {
    expect(toolAdapter).toBeDefined();
    // Check that the adapter has formatters for known providers
    expect(toolAdapter.getSupportedProviders()).toContain('anthropic');
    expect(toolAdapter.getSupportedProviders()).toContain('openai');
    expect(toolAdapter.getSupportedProviders()).toContain('grok');
  });

  describe('Tool Format Conversion', () => {
    const sampleTool: MCPTool = {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'The unit of temperature',
          },
        },
        required: ['location'],
      },
    };

    it('should convert an MCPTool to Anthropic format', () => {
      const anthropicTool = toolAdapter.adaptToolForProvider(
        sampleTool,
        'anthropic'
      );

      expect(anthropicTool).toHaveProperty('name', 'get_weather');
      expect(anthropicTool).toHaveProperty(
        'description',
        'Get the current weather for a location'
      );
      expect(anthropicTool).toHaveProperty('input_schema');
      expect(anthropicTool.input_schema).toHaveProperty('type', 'object');
      expect(anthropicTool.input_schema.properties).toHaveProperty('location');
    });

    it('should convert an MCPTool to OpenAI format', () => {
      const openaiTool = toolAdapter.adaptToolForProvider(sampleTool, 'openai');

      expect(openaiTool).toHaveProperty('type', 'function');
      expect(openaiTool.function).toHaveProperty('name', 'get_weather');
      expect(openaiTool.function).toHaveProperty(
        'description',
        'Get the current weather for a location'
      );
      expect(openaiTool.function.parameters).toHaveProperty('type', 'object');
      expect(openaiTool.function.parameters.properties).toHaveProperty(
        'location'
      );
      expect(openaiTool.function.parameters.required).toContain('location');
    });

    it('should convert an MCPTool to Grok format', () => {
      const grokTool = toolAdapter.adaptToolForProvider(sampleTool, 'grok');

      expect(grokTool).toHaveProperty('name', 'get_weather');
      expect(grokTool).toHaveProperty(
        'description',
        'Get the current weather for a location'
      );
      expect(grokTool.parameters).toHaveProperty('type', 'object');
      expect(grokTool.parameters.properties).toHaveProperty('location');
      expect(grokTool.parameters.required).toContain('location');
    });

    it('should handle converting an array of MCPTools to provider format', () => {
      const tools = [
        sampleTool,
        {
          name: 'get_time',
          description: 'Get the current time for a location',
          inputSchema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state',
              },
            },
            required: ['location'],
          },
        },
      ];

      const anthropicTools = toolAdapter.adaptToolsForProvider(
        tools,
        'anthropic'
      );
      expect(anthropicTools).toHaveLength(2);
      expect(anthropicTools[0]).toHaveProperty('name', 'get_weather');
      expect(anthropicTools[1]).toHaveProperty('name', 'get_time');

      const openaiTools = toolAdapter.adaptToolsForProvider(tools, 'openai');
      expect(openaiTools).toHaveLength(2);
      expect(openaiTools[0].function).toHaveProperty('name', 'get_weather');
      expect(openaiTools[1].function).toHaveProperty('name', 'get_time');
    });

    it('should throw an error for unknown providers', () => {
      expect(() => {
        toolAdapter.adaptToolForProvider(sampleTool, 'unknown_provider');
      }).toThrow();
    });
  });

  describe('Tool Call Parsing', () => {
    it('should parse an Anthropic tool call to canonical format', () => {
      const anthropicResponse = {
        content: '',
        rawResponse: {
          content: [
            {
              type: 'tool_use',
              tool_use: {
                name: 'get_weather',
                input: {
                  location: 'San Francisco, CA',
                  unit: 'celsius',
                },
              },
            },
          ],
        },
      };

      const toolCall = toolAdapter.parseToolCallFromProvider(
        anthropicResponse,
        'anthropic'
      );

      expect(toolCall).toBeDefined();
      expect(toolCall).toHaveProperty('name', 'get_weather');
      expect(toolCall.parameters).toHaveProperty(
        'location',
        'San Francisco, CA'
      );
      expect(toolCall.parameters).toHaveProperty('unit', 'celsius');
    });

    it('should parse an OpenAI tool call to canonical format', () => {
      const openaiResponse = {
        content: '',
        rawResponse: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: 'get_weather',
                      arguments: JSON.stringify({
                        location: 'San Francisco, CA',
                        unit: 'celsius',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const toolCall = toolAdapter.parseToolCallFromProvider(
        openaiResponse,
        'openai'
      );

      expect(toolCall).toBeDefined();
      expect(toolCall).toHaveProperty('name', 'get_weather');
      expect(toolCall.parameters).toHaveProperty(
        'location',
        'San Francisco, CA'
      );
      expect(toolCall.parameters).toHaveProperty('unit', 'celsius');
    });

    it('should parse a Grok tool call to canonical format', () => {
      const grokResponse = {
        content: '',
        rawResponse: {
          tool_calls: [
            {
              name: 'get_weather',
              parameters: {
                location: 'San Francisco, CA',
                unit: 'celsius',
              },
            },
          ],
        },
      };

      const toolCall = toolAdapter.parseToolCallFromProvider(
        grokResponse,
        'grok'
      );

      expect(toolCall).toBeDefined();
      expect(toolCall).toHaveProperty('name', 'get_weather');
      expect(toolCall.parameters).toHaveProperty(
        'location',
        'San Francisco, CA'
      );
      expect(toolCall.parameters).toHaveProperty('unit', 'celsius');
    });

    it('should return null if no tool call is found', () => {
      const response = {
        content: 'Just a regular response with no tool calls',
        rawResponse: {},
      };

      const toolCall = toolAdapter.parseToolCallFromProvider(
        response,
        'anthropic'
      );

      expect(toolCall).toBeNull();
    });

    it('should register a custom adapter for a new provider', () => {
      // Register a custom adapter
      toolAdapter.registerToolAdapter('custom_provider', {
        adaptTool: (tool: MCPTool) => ({
          customName: tool.name,
          customDescription: tool.description,
          schema: tool.inputSchema,
        }),
        parseToolCall: (response: any): ToolCall | null => {
          if (response.rawResponse?.custom_tool_call) {
            return {
              name: response.rawResponse.custom_tool_call.customName,
              parameters: response.rawResponse.custom_tool_call.args,
            };
          }
          return null;
        },
      });

      // Test the custom adapter
      const customTool = toolAdapter.adaptToolForProvider(
        {
          name: 'test_tool',
          description: 'A test tool',
        },
        'custom_provider'
      );

      expect(customTool).toHaveProperty('customName', 'test_tool');
      expect(customTool).toHaveProperty('customDescription', 'A test tool');

      // Test parsing custom tool call
      const customResponse = {
        content: '',
        rawResponse: {
          custom_tool_call: {
            customName: 'test_tool',
            args: { param1: 'value1' },
          },
        },
      };

      const parsedToolCall = toolAdapter.parseToolCallFromProvider(
        customResponse,
        'custom_provider'
      );

      expect(parsedToolCall).toBeDefined();
      expect(parsedToolCall).toHaveProperty('name', 'test_tool');
      expect(parsedToolCall.parameters).toHaveProperty('param1', 'value1');
    });
  });

  describe('Canonical Tool Format', () => {
    it('should provide a method to get the canonical format', () => {
      const canonicalTool = toolAdapter.getCanonicalFormat({
        name: 'get_weather',
        description: 'Get the current weather for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
          },
          required: ['location'],
        },
      });

      expect(canonicalTool).toHaveProperty('name', 'get_weather');
      expect(canonicalTool).toHaveProperty(
        'description',
        'Get the current weather for a location'
      );
      expect(canonicalTool).toHaveProperty('inputSchema');
      expect(canonicalTool.inputSchema).toHaveProperty('type', 'object');
      expect(canonicalTool.inputSchema.properties).toHaveProperty('location');
    });
  });
});
