import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './openai-provider';
import { MessageOptions } from './types';
import { MCPTool } from '../types';

// Mock the OpenAI SDK
vi.mock('openai', () => {
  const mockCompletion = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: 'This is a mock response',
          tool_calls: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  });

  const mockStreamCompletion = vi.fn().mockImplementation(() => {
    const chunks = [
      { choices: [{ delta: { content: 'This ' } }] },
      { choices: [{ delta: { content: 'is ' } }] },
      { choices: [{ delta: { content: 'a ' } }] },
      { choices: [{ delta: { content: 'streaming ' } }] },
      { choices: [{ delta: { content: 'response' } }] },
      { choices: [{ delta: { finish_reason: 'stop' } }] },
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

  // Create a mock implementation of the OpenAI class
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockImplementation(params => {
          if (params.stream) {
            return mockStreamCompletion();
          }
          return mockCompletion();
        }),
      },
    },
  }));

  // Export as default to match the module structure
  return {
    default: MockOpenAI,
  };
});

// Mock the token counter
vi.mock('../token-counter', () => ({
  countTokens: vi.fn().mockImplementation(text => Math.ceil(text.length / 4)),
}));

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
    // Reset mocks
    vi.clearAllMocks();
  });

  it('should initialize with an API key', async () => {
    await provider.initialize({ apiKey: 'test-key', defaultModel: 'gpt-4' });
    expect(provider['apiKey']).toBe('test-key');
    expect(provider['client']).not.toBeNull();
  });

  it('should define supported models', () => {
    expect(provider.name).toBe('openai');
    expect(provider.supportedModels.length).toBeGreaterThan(0);

    // Check for GPT models
    const modelIds = provider.supportedModels.map(model => model.id);
    expect(modelIds).toContain('gpt-4-turbo');
    expect(modelIds).toContain('gpt-4');
    expect(modelIds).toContain('gpt-3.5-turbo');
  });

  it('should format tools correctly for function calling', () => {
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

    // OpenAI expects tools in a specific format with function schema
    const tool = formattedTools[0] as any;
    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('search');
    expect(tool.function.description).toBe('Search for information');
    expect(tool.function.parameters.properties).toHaveProperty('query');
    expect(tool.function.parameters.required).toContain('query');
  });

  it('should send a message and get a response', async () => {
    await provider.initialize({ apiKey: 'test-key', defaultModel: 'gpt-4' });

    const options: MessageOptions = {
      model: 'gpt-4',
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

  it('should count tokens correctly', () => {
    const text = 'This is a test message';
    const tokenCount = provider.countTokens(text);
    expect(tokenCount).toBe(Math.ceil(text.length / 4));
  });

  it('should parse tool calls from responses', () => {
    // Define a mock response with a function call
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
