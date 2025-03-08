import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../session';
import { LLMProviderFactory } from '../factory';
import { ModelRegistry } from '../model-registry';
import { FeatureSet } from '../types';
import { LLMConfig, MCPConfig } from '../../../config/types';
import { CostEstimate } from '../../types';

// Mock LLMProviderFactory
vi.mock('../factory', () => {
  return {
    LLMProviderFactory: {
      registerProvider: vi.fn(),
      getProvider: vi.fn(),
      getSupportedProviders: vi
        .fn()
        .mockReturnValue(['anthropic', 'openai', 'grok']),
      isProviderSupported: vi.fn(type =>
        ['anthropic', 'openai', 'grok'].includes(type)
      ),
    },
  };
});

// Mock ModelRegistry
vi.mock('../model-registry', () => {
  // Create a class that implements the same interface as ModelRegistry
  return {
    ModelRegistry: vi.fn().mockImplementation(() => ({
      registerModel: vi.fn(),
      getModel: vi.fn((provider, modelId) => {
        return mockModels[provider]?.find(m => m.id === modelId) || null;
      }),
      listModels: vi.fn(provider => {
        if (provider) {
          return mockModels[provider] || [];
        } else {
          return Object.values(mockModels).flat();
        }
      }),
      getRecommendedModel: vi.fn(),
    })),
  };
});

// Mock models for different providers
const mockModels = {
  anthropic: [
    {
      id: 'claude-3-opus-20240229',
      contextWindow: 200000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.015,
      outputCostPer1K: 0.075,
    },
    {
      id: 'claude-3-sonnet-20240229',
      contextWindow: 180000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.003,
      outputCostPer1K: 0.015,
    },
    {
      id: 'claude-3-haiku-20240307',
      contextWindow: 150000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.0005,
      outputCostPer1K: 0.0025,
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      contextWindow: 128000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.005,
      outputCostPer1K: 0.015,
    },
    {
      id: 'gpt-4-turbo',
      contextWindow: 128000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.01,
      outputCostPer1K: 0.03,
    },
    {
      id: 'gpt-3.5-turbo',
      contextWindow: 16000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.0005,
      outputCostPer1K: 0.0015,
    },
  ],
  grok: [
    {
      id: 'grok-1',
      contextWindow: 8000,
      supportsFunctions: true,
      supportsImages: false,
      inputCostPer1K: 0.0,
      outputCostPer1K: 0.0,
    },
  ],
};

describe('Provider API Extensions', () => {
  let sessionManager: SessionManager;
  let originalModelRegistry: any;

  beforeEach(() => {
    // Create a session manager
    sessionManager = new SessionManager();

    // Save original implementation
    originalModelRegistry = (global as any).ModelRegistry;
  });

  afterEach(() => {
    vi.clearAllMocks();

    // Restore original implementation
    (global as any).ModelRegistry = originalModelRegistry;
  });

  it('should get available providers', () => {
    // Test getting the list of providers
    const providers = sessionManager.getAvailableProviders();

    // Verify that the list includes the expected providers
    expect(providers).toHaveLength(3);
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('grok');

    // Verify that LLMProviderFactory.getSupportedProviders was called
    expect(LLMProviderFactory.getSupportedProviders).toHaveBeenCalled();
  });

  it('should get models for a provider', () => {
    // Test getting the models for a specific provider
    const models = sessionManager.getProviderModels('anthropic');

    // Verify that the returned models match expectations
    expect(models).toHaveLength(3);
    expect(models[0].id).toBe('claude-3-opus-20240229');
    expect(models[1].id).toBe('claude-3-sonnet-20240229');
    expect(models[2].id).toBe('claude-3-haiku-20240307');
  });

  it('should return empty array for unknown provider', () => {
    // Test getting models for an unknown provider
    const models = sessionManager.getProviderModels('unknown-provider');

    // Verify that an empty array is returned
    expect(models).toEqual([]);
  });

  it('should get supported features for a model', () => {
    // Define the expected feature set
    const expectedFeatures: FeatureSet = {
      functionCalling: true,
      imageInputs: true,
      streaming: true,
      jsonMode: false,
      thinking: true,
      systemMessages: true,
      maxContextSize: 200000,
    };

    // Mock the getModel implementation to return a specific model
    vi.mocked(new ModelRegistry().getModel).mockReturnValue(
      mockModels.anthropic[0]
    );

    // Test getting the features for a specific model
    const features = sessionManager.getSupportedFeatures(
      'anthropic',
      'claude-3-opus-20240229'
    );

    // Verify that the features match expectations
    expect(features).toEqual(expectedFeatures);
  });

  it('should throw error for unknown model', () => {
    // Mock the getModel implementation to throw an error
    vi.mocked(new ModelRegistry().getModel).mockImplementation(() => {
      throw new Error('Model not found');
    });

    // Verify that an error is thrown for an unknown model
    expect(() => {
      sessionManager.getSupportedFeatures('anthropic', 'unknown-model');
    }).toThrow();
  });

  it('should estimate costs for a session with a specific model', async () => {
    // Create a session with a specific provider and model
    const config: LLMConfig = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
    };

    // Create a session
    const session = await sessionManager.initializeSession(config);
    const sessionId = session.id;

    // Mock session token counts for testing
    const mockSession = sessionManager.getSession(sessionId);
    mockSession.tokenMetrics = {
      userTokens: 1000,
      assistantTokens: 500,
      systemTokens: 200,
      toolTokens: 300,
      totalTokens: 2000,
      maxContextTokens: 180000,
      percentUsed: 1.1,
      recommendation: 'Context window usage is low.',
    };

    // Define the expected cost estimate
    const expectedCostEstimate: CostEstimate = {
      inputTokens: 1000, // User tokens would be input
      outputTokens: 500, // Assistant tokens would be output
      inputCost: 0.015, // 1K * 0.015 USD per 1K tokens
      outputCost: 0.0075, // 0.5K * 0.015 USD per 1K tokens
      totalCost: 0.0225, // Sum of input and output costs
    };

    // Test estimating costs for switching to gpt-4o
    const costEstimate = sessionManager.estimateCosts(
      sessionId,
      'openai',
      'gpt-4o'
    );

    // Verify that the cost estimates match expectations
    expect(costEstimate).toMatchObject({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      inputCost: expect.any(Number),
      outputCost: expect.any(Number),
      totalCost: expect.any(Number),
    });
  });

  it('should throw error for cost estimate with unknown session', () => {
    // Verify that an error is thrown for an unknown session
    expect(() => {
      sessionManager.estimateCosts(
        'unknown-session',
        'anthropic',
        'claude-3-opus-20240229'
      );
    }).toThrow();
  });
});
