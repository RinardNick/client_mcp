import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMProviderInterface, ProviderConfig } from './types';
import { LLMProviderFactory } from './factory';

// Create a mock provider class for testing
class MockProvider implements LLMProviderInterface {
  name = 'mock-provider';
  supportedModels = [
    {
      id: 'mock-model',
      contextWindow: 10000,
      supportsFunctions: true,
      supportsImages: false,
      inputCostPer1K: 0.01,
      outputCostPer1K: 0.02,
    },
  ];

  async initialize(config: ProviderConfig): Promise<void> {
    // Mock implementation
  }

  async sendMessage(message: string, options: any): Promise<any> {
    return { content: 'mock response' };
  }

  async *streamMessage(message: string, options: any): AsyncGenerator<any> {
    yield { type: 'content', content: 'mock stream response' };
  }

  countTokens(text: string): number {
    return text.length / 4; // Simplistic mock
  }

  formatToolsForProvider(tools: any[]): unknown {
    return tools;
  }

  parseToolCall(response: any): any {
    return null;
  }
}

describe('LLM Provider Implementation', () => {
  it('should be able to implement the provider interface correctly', () => {
    // Verify we can create an instance of a class that implements the interface
    const mockProvider = new MockProvider();
    expect(mockProvider).toBeDefined();
    expect(mockProvider.name).toBe('mock-provider');
    expect(mockProvider.supportedModels.length).toBe(1);
    expect(typeof mockProvider.sendMessage).toBe('function');
    expect(typeof mockProvider.streamMessage).toBe('function');
    expect(typeof mockProvider.countTokens).toBe('function');
    expect(typeof mockProvider.formatToolsForProvider).toBe('function');
    expect(typeof mockProvider.parseToolCall).toBe('function');
  });
});

describe('LLM Provider Factory', () => {
  beforeEach(() => {
    // Clear registry before each test
    LLMProviderFactory.clearProviders();
  });

  it('should register and retrieve a provider', async () => {
    // Register the mock provider
    LLMProviderFactory.registerProvider('mock', MockProvider);

    // Verify it's in the supported providers list
    expect(LLMProviderFactory.getSupportedProviders()).toContain('mock');
    expect(LLMProviderFactory.isProviderSupported('mock')).toBe(true);

    // Get an instance of the provider
    const provider = await LLMProviderFactory.getProvider('mock', {
      apiKey: 'test-key',
      defaultModel: 'mock-model',
    });

    // Verify the provider instance
    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.name).toBe('mock-provider');
  });

  it('should throw an error for unregistered providers', async () => {
    // Attempt to get an unregistered provider
    await expect(
      LLMProviderFactory.getProvider('nonexistent', {
        apiKey: 'test-key',
        defaultModel: 'test-model',
      })
    ).rejects.toThrow('Provider type "nonexistent" is not registered');
  });

  it('should validate provider type during registration', () => {
    // Try to register with invalid type
    expect(() => {
      LLMProviderFactory.registerProvider('', MockProvider);
    }).toThrow('Provider type must be a non-empty string');
  });

  it('should clear all registered providers', () => {
    // Register a provider
    LLMProviderFactory.registerProvider('mock', MockProvider);
    expect(LLMProviderFactory.getSupportedProviders().length).toBe(1);

    // Clear the registry
    LLMProviderFactory.clearProviders();
    expect(LLMProviderFactory.getSupportedProviders().length).toBe(0);
  });
});
