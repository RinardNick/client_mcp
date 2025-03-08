import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session';
import { ChatSession, ChatMessage, LLMError } from './types';
import { LLMConfig, MCPConfig } from '../config/types';
import { Anthropic } from '@anthropic-ai/sdk';
import { LLMProviderFactory } from './provider/factory';
import { AnthropicProvider, OpenAIProvider, GrokProvider } from './provider';
import { InMemorySessionStorage } from './storage';
import { LLMProviderInterface, ProviderConfig } from './provider/types';
import { getProviderConfig } from '../config/loader';

// Mock the config loader
vi.mock('../config/loader', () => {
  return {
    getProviderConfig: vi.fn().mockImplementation((config, providerName) => {
      if (config.llm) {
        // Legacy config
        return {
          provider: config.llm.type,
          apiKey: config.llm.api_key,
          model: config.llm.model,
          systemPrompt: config.llm.system_prompt,
          options: {
            maxToolCalls: config.llm.max_tool_calls,
            useTools: config.llm.use_tools,
            thinking: config.llm.thinking,
            tokenOptimization: config.llm.token_optimization,
          },
        };
      } else {
        // Multi-provider config
        const provider = providerName || config.default_provider;
        const providerConfig = config.providers[provider];
        return {
          provider,
          apiKey: providerConfig.api_key,
          model: providerConfig.default_model,
          systemPrompt: providerConfig.system_prompt,
          options: {
            maxToolCalls: providerConfig.max_tool_calls,
            useTools: providerConfig.use_tools,
            thinking: providerConfig.thinking,
            tokenOptimization: providerConfig.token_optimization,
          },
        };
      }
    }),
  };
});

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

  it('should initialize a session with multi-provider configuration', async () => {
    const config: MCPConfig = {
      providers: {
        anthropic: {
          api_key: 'test-anthropic-key',
          default_model: 'claude-3-sonnet-20240229',
          system_prompt: 'You are a helpful assistant',
        },
        openai: {
          api_key: 'test-openai-key',
          default_model: 'gpt-4',
          system_prompt: 'You are a helpful assistant',
        },
      },
      default_provider: 'anthropic',
      provider_fallbacks: {
        anthropic: ['openai'],
        openai: ['anthropic'],
      },
      max_tool_calls: 5,
      servers: {
        test: {
          command: 'node',
          args: ['server.js'],
          env: {},
        },
      },
    };

    // Add a method to initialize with multi-provider config
    const initializeWithMultiProvider = async () => {
      // Use the getProviderConfig helper to extract provider info
      const providerInfo = getProviderConfig(config);

      // Create a legacy-style config that the current initializeSession can use
      const legacyConfig: LLMConfig = {
        type: providerInfo.provider,
        api_key: providerInfo.apiKey,
        model: providerInfo.model,
        system_prompt: providerInfo.systemPrompt,
        max_tool_calls: config.max_tool_calls,
      };

      return sessionManager.initializeSession(legacyConfig);
    };

    const session = await initializeWithMultiProvider();

    // Verify the session has correct provider information
    expect(session.provider).toBe('anthropic');
    expect(session.modelId).toBe('claude-3-sonnet-20240229');
    expect(session.providerInstance).toBeDefined();
    expect(session.previousProviders).toEqual([]);
    expect(session.maxToolCalls).toBe(5);
  });

  it('should switch providers during a session', async () => {
    // Start with Anthropic
    const config: LLMConfig = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
    };

    const session = await sessionManager.initializeSession(config);
    expect(session.provider).toBe('anthropic');

    // Switch to OpenAI
    const updatedSession = await sessionManager.switchSessionModel(
      session.id,
      'openai',
      'gpt-4',
      { api_key: 'test-openai-key' }
    );

    // Verify the provider was switched
    expect(updatedSession.provider).toBe('openai');
    expect(updatedSession.modelId).toBe('gpt-4');
    expect(updatedSession.previousProviders).toContainEqual({
      provider: 'anthropic',
      modelId: 'claude-3-sonnet-20240229',
      switchTime: expect.any(Date),
    });
  });
});
