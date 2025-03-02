import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrokProvider } from './grok-provider';
import { MessageOptions } from './types';
import { MCPTool } from '../types';

// Mock the Grok API client
// We're creating a custom mock since there's no official SDK yet
vi.mock('../grok-client', () => {
  const mockComplete = vi.fn().mockResolvedValue({
    message: {
      content: 'This is a mock Grok response',
      tool_calls: null,
    },
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  });

  const mockStreamComplete = vi.fn().mockImplementation(() => {
    const chunks = [
      { content: 'This ' },
      { content: 'is ' },
      { content: 'a ' },
      { content: 'streaming ' },
      { content: 'Grok ' },
      { content: 'response' },
      { done: true },
    ];

    // Return an object with the async iterator protocol
    return {
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () => {
            if (index < chunks.length) {
              return { value: chunks[index++], done: false };
            }
            return { done: true };
          },
        };
      },
    };
  });

  // Create a mock Grok client
  return {
    GrokClient: vi.fn().mockImplementation(() => ({
      complete: mockComplete,
      streamComplete: mockStreamComplete,
    })),
  };
});

// Mock the token counter
vi.mock('../token-counter', () => ({
  countTokens: vi.fn().mockImplementation(text => Math.ceil(text.length / 4)),
}));

describe('GrokProvider', () => {
  let provider: GrokProvider;

  beforeEach(() => {
    provider = new GrokProvider();
    // Reset mocks
    vi.clearAllMocks();
  });

  it('should initialize with API credentials', async () => {
    await provider.initialize({ apiKey: 'test-key', defaultModel: 'grok-1' });
    expect(provider['apiKey']).toBe('test-key');
    expect(provider['client']).not.toBeNull();
  });

  it('should define supported models', () => {
    expect(provider.name).toBe('grok');
    expect(provider.supportedModels.length).toBeGreaterThan(0);

    // Check for Grok models
    const modelIds = provider.supportedModels.map(model => model.id);
    expect(modelIds).toContain('grok-1');
  });

  it('should format tools correctly for Grok function calling', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'search',
        description: 'Search for information',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    ];

    const formattedTools = provider.formatToolsForProvider(mcpTools);
    expect(formattedTools).toHaveLength(1);

    // Grok expects tools in a specific format
    const tool = formattedTools[0] as any;
    expect(tool.name).toBe('search');
    expect(tool.description).toBe('Search for information');
    expect(tool.parameters.properties).toHaveProperty('query');
    expect(tool.parameters.required).toContain('query');
  });

  it('should send a message and get a response', async () => {
    await provider.initialize({ apiKey: 'test-key', defaultModel: 'grok-1' });

    const options: MessageOptions = {
      model: 'grok-1',
      maxTokens: 1000,
      systemMessage: 'You are a helpful assistant',
      temperature: 0.7,
    };

    const response = await provider.sendMessage('Hello, world!', options);

    expect(response.content).toBe('This is a mock Grok response');
    expect(response.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('should count tokens correctly', () => {
    const text = 'This is a test message';
    const tokenCount = provider.countTokens(text);
    expect(tokenCount).toBe(Math.ceil(text.length / 4));
  });

  it('should parse tool calls from responses', () => {
    // Define a mock response with a tool call
    const mockResponse = {
      content: 'I need to use a tool',
      toolCall: {
        name: 'search',
        parameters: { query: 'test query' },
      },
    };

    const toolCall = provider.parseToolCall(mockResponse);
    expect(toolCall).not.toBeNull();
    expect(toolCall?.name).toBe('search');
    expect(toolCall?.parameters).toEqual({ query: 'test query' });
  });

  it('should return null for responses without tool calls', () => {
    const mockResponse = {
      content: 'This is a regular response without a tool call',
    };

    const toolCall = provider.parseToolCall(mockResponse);
    expect(toolCall).toBeNull();
  });
});
