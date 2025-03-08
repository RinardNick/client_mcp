import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from './anthropic-provider';
import { MessageOptions } from '../types';
import { MCPTool } from '../../types';
import { ConversationMessage } from '../../types';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'This is a mock response' }],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
    },
  });

  const mockStreamCreate = vi.fn().mockResolvedValue({
    [Symbol.asyncIterator]: () => {
      let index = 0;
      const chunks = [
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'This ' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'is ' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'a ' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'streaming ' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'response' },
        },
      ];

      return {
        next: async () => {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false };
          }
          return { done: true };
        },
      };
    },
  });

  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Mock the token counter
vi.mock('../token-counter', () => ({
  countTokens: vi.fn().mockImplementation(text => Math.ceil(text.length / 4)),
}));

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider();
    vi.clearAllMocks();
  });

  it('should initialize with an API key', async () => {
    await provider.initialize({
      apiKey: 'test-key',
      defaultModel: 'claude-3-sonnet-20240229',
    });
    expect(provider['apiKey']).toBe('test-key');
    expect(provider['client']).not.toBeNull();
  });

  it('should define supported models', () => {
    expect(provider.name).toBe('anthropic');
    expect(provider.supportedModels.length).toBeGreaterThan(0);

    // Check for Claude models
    const modelIds = provider.supportedModels.map(model => model.id);
    expect(modelIds).toContain('claude-3-opus-20240229');
    expect(modelIds).toContain('claude-3-sonnet-20240229');
    expect(modelIds).toContain('claude-3-haiku-20240307');
  });

  it('should format tools correctly for Anthropic API', () => {
    const mcpTools: MCPTool[] = [
      {
        name: 'search',
        description: 'Search for information',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      },
    ];

    const formattedTools = provider.formatToolsForProvider(mcpTools);
    expect(formattedTools).toHaveLength(1);
    expect(formattedTools[0].name).toBe('search');
    expect(formattedTools[0].description).toBe('Search for information');
    expect(formattedTools[0].input_schema.properties).toHaveProperty('query');
  });

  it('should send a message and get a response from Anthropic API', async () => {
    await provider.initialize({
      apiKey: 'test-key',
      defaultModel: 'claude-3-sonnet-20240229',
    });

    const options: MessageOptions = {
      model: 'claude-3-sonnet-20240229',
      maxTokens: 1000,
      systemMessage: 'You are a helpful assistant',
      temperature: 0.7,
    };

    const response = await provider.sendMessage('Hello, world!', options);

    expect(response.content).toBe('This is a mock response');
    expect(response.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('should count tokens using Anthropic token counting logic', () => {
    const text = 'This is a test message';
    const tokenCount = provider.countTokens(text);
    expect(tokenCount).toBe(5);
  });

  it('should parse tool calls from Anthropic response format', () => {
    // Define a mock response with a tool call in Anthropic format
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

  it('should return null for Anthropic responses without tool calls', () => {
    const mockResponse = {
      content: 'This is a regular response without a tool call',
    };

    const toolCall = provider.parseToolCall(mockResponse);
    expect(toolCall).toBeNull();
  });
});
