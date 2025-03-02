import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session';
import { ChatSession, ChatMessage, LLMError } from './types';
import { LLMConfig } from '../config/types';
import { Anthropic } from '@anthropic-ai/sdk';
import { LLMProviderFactory } from './provider/factory';
import { AnthropicProvider } from './provider/anthropic-provider';
import { OpenAIProvider } from './provider/openai-provider';
import { InMemorySessionStorage } from './storage';
import { LLMProviderInterface, ProviderConfig } from './provider/types';

// Mock the provider factory
vi.mock('./provider/factory', () => {
  return {
    LLMProviderFactory: {
      registerProvider: vi.fn(),
      getProvider: vi.fn().mockImplementation((type, config) => {
        if (type === 'anthropic') {
          return new AnthropicProvider();
        } else if (type === 'openai') {
          return new OpenAIProvider();
        }
        throw new Error(`Unknown provider type: ${type}`);
      }),
      getSupportedProviders: vi.fn().mockReturnValue(['anthropic', 'openai']),
    },
  };
});

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockImplementation(options => {
          return {
            content: [{ type: 'text', text: 'Mock response from Anthropic' }],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
            },
          };
        }),
      },
    })),
  };
});

// Mock OpenAI provider
vi.mock('./provider/openai-provider', () => {
  return {
    OpenAIProvider: vi.fn().mockImplementation(() => ({
      name: 'openai',
      supportedModels: [
        {
          id: 'gpt-4',
          contextWindow: 8000,
          supportsFunctions: true,
          supportsImages: true,
          inputCostPer1K: 0.03,
          outputCostPer1K: 0.06,
        },
      ],
      initialize: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockImplementation((message, options) => {
        return {
          content: 'Mock response from OpenAI',
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
        };
      }),
      streamMessage: vi.fn(),
      countTokens: vi.fn().mockReturnValue(10),
      formatToolsForProvider: vi.fn(),
      parseToolCall: vi.fn(),
    })),
  };
});

// Mock Anthropic provider
vi.mock('./provider/anthropic-provider', () => {
  return {
    AnthropicProvider: vi.fn().mockImplementation(() => ({
      name: 'anthropic',
      supportedModels: [
        {
          id: 'claude-3-sonnet-20240229',
          contextWindow: 180000,
          supportsFunctions: true,
          supportsImages: true,
          inputCostPer1K: 0.003,
          outputCostPer1K: 0.015,
        },
      ],
      initialize: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockImplementation((message, options) => {
        return {
          content: 'Mock response from Anthropic',
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
        };
      }),
      streamMessage: vi.fn(),
      countTokens: vi.fn().mockReturnValue(10),
      formatToolsForProvider: vi.fn(),
      parseToolCall: vi.fn(),
    })),
  };
});

// Create mock provider instances
const mockAnthropicProvider: Partial<LLMProviderInterface> = {
  name: 'anthropic',
  supportedModels: [
    {
      id: 'claude-3-sonnet-20240229',
      contextWindow: 180000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.003,
      outputCostPer1K: 0.015,
    },
  ],
  initialize: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue({
    id: 'mock-message-id',
    content: 'Mock response from Anthropic',
    model: 'claude-3-sonnet-20240229',
    role: 'assistant',
  }),
  countTokens: vi.fn().mockReturnValue(200),
  formatToolsForProvider: vi.fn(),
  parseToolCall: vi.fn(),
  streamMessage: vi.fn(),
};

const mockOpenAIProvider: Partial<LLMProviderInterface> = {
  name: 'openai',
  supportedModels: [
    {
      id: 'gpt-4',
      contextWindow: 8000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.03,
      outputCostPer1K: 0.06,
    },
  ],
  initialize: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue({
    id: 'mock-message-id',
    content: 'Mock response from OpenAI',
    model: 'gpt-4',
    role: 'assistant',
  }),
  countTokens: vi.fn().mockReturnValue(250),
  formatToolsForProvider: vi.fn(),
  parseToolCall: vi.fn(),
  streamMessage: vi.fn(),
};

describe('Multi-Provider Session Support', () => {
  let sessionManager: SessionManager;
  let sessionStorage: InMemorySessionStorage;
  const sessionId = 'test-session-123';

  // Mock LLMProviderFactory.getProvider
  const originalGetProvider = LLMProviderFactory.getProvider;

  beforeEach(() => {
    // Setup session storage
    sessionStorage = new InMemorySessionStorage();
    sessionManager = new SessionManager(sessionStorage);

    // Mock LLMProviderFactory.getProvider
    LLMProviderFactory.getProvider = vi
      .fn()
      .mockImplementation((type: string, config: ProviderConfig) => {
        if (type === 'anthropic') {
          return Promise.resolve(mockAnthropicProvider as LLMProviderInterface);
        } else if (type === 'openai') {
          return Promise.resolve(mockOpenAIProvider as LLMProviderInterface);
        } else {
          return Promise.reject(new Error(`Provider ${type} not supported`));
        }
      });

    // Mock the sendMessage method to avoid actual API calls
    vi.spyOn(sessionManager, 'sendMessage').mockImplementation(
      async (sessionId: string, message: string) => {
        // Get the current session
        const session = sessionManager.getSession(sessionId);

        // Create and add user message
        const userMessage = {
          role: 'user' as const,
          content: message,
          timestamp: new Date(),
          tokens: 10, // Mock token count
        };
        session.messages.push(userMessage);

        // Create and add assistant message
        const assistantMessage = {
          role: 'assistant' as const,
          content: 'Mock response from test',
          timestamp: new Date(),
          tokens: 10, // Mock token count
        };
        session.messages.push(assistantMessage);

        // Return the assistant message
        return assistantMessage;
      }
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up mocks
    vi.clearAllMocks();

    // Restore original method
    LLMProviderFactory.getProvider = originalGetProvider;
  });

  it('should initialize a session with provider information', async () => {
    const config: LLMConfig = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
    };

    const session = await sessionManager.initializeSession(config);

    // Verify the session has provider information
    expect(session.provider).toBe('anthropic');
    expect(session.modelId).toBe('claude-3-sonnet-20240229');
    expect(session.providerInstance).toBeDefined();
    expect(session.previousProviders).toEqual([]);
  });

  it('should support switching providers during a session', async () => {
    // Initialize with Anthropic
    const config: LLMConfig = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
    };

    const session = await sessionManager.initializeSession(config);
    const sessionId = session.id;

    // Add some messages
    await sessionManager.sendMessage(sessionId, 'Hello from Anthropic');

    // Switch to OpenAI
    const switchedSession = await sessionManager.switchSessionModel(
      sessionId,
      'openai',
      'gpt-4',
      { api_key: 'openai-api-key' }
    );

    // Verify the provider was switched
    expect(switchedSession.provider).toBe('openai');
    expect(switchedSession.modelId).toBe('gpt-4');
    expect(switchedSession.providerInstance).toBeDefined();

    // Verify previous provider was tracked
    expect(switchedSession.previousProviders).toHaveLength(1);
    expect(switchedSession.previousProviders![0].provider).toBe('anthropic');
    expect(switchedSession.previousProviders![0].modelId).toBe(
      'claude-3-sonnet-20240229'
    );
    expect(switchedSession.previousProviders![0].switchTime).toBeInstanceOf(
      Date
    );

    // Messages should be preserved
    expect(switchedSession.messages.length).toBeGreaterThan(1);
  });

  it('should store provider-specific data', async () => {
    // Initialize with Anthropic
    const config: LLMConfig = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
    };

    const session = await sessionManager.initializeSession(config);
    const sessionId = session.id;

    // Store provider-specific data
    sessionManager.storeProviderData(sessionId, 'testKey', {
      customValue: 'test',
    });

    // Retrieve provider-specific data
    const data = sessionManager.getProviderData(sessionId, 'testKey');
    expect(data).toEqual({ customValue: 'test' });
  });

  it('should handle errors when switching to an invalid provider', async () => {
    // Mock the provider factory to throw an error for invalid providers
    const getProviderMock = vi.spyOn(LLMProviderFactory, 'getProvider');
    getProviderMock.mockImplementation((type, config) => {
      if (type === 'invalid-provider') {
        throw new Error('Invalid provider type');
      }
      return Promise.resolve({} as any);
    });

    // Initialize with Anthropic
    const config: LLMConfig = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
    };

    const session = await sessionManager.initializeSession(config);
    const sessionId = session.id;

    // Attempt to switch to an invalid provider
    await expect(
      sessionManager.switchSessionModel(
        sessionId,
        'invalid-provider',
        'invalid-model',
        { api_key: 'invalid-key' }
      )
    ).rejects.toThrow();

    // Session should still use the original provider
    const currentSession = sessionManager.getSession(sessionId);
    expect(currentSession.provider).toBe('anthropic');
    expect(currentSession.modelId).toBe('claude-3-sonnet-20240229');
  });
});
