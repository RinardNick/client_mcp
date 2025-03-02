import { LLMProviderInterface, ProviderConfig } from './types';

/**
 * Factory for creating and managing LLM providers
 */
export class LLMProviderFactory {
  /**
   * Registry of provider implementations
   */
  private static providerRegistry: Map<string, new () => LLMProviderInterface> =
    new Map();

  /**
   * Get a provider instance by type
   * @param type Provider type identifier (e.g., "anthropic", "openai")
   * @param config Provider configuration
   * @returns Initialized provider instance
   */
  static async getProvider(
    type: string,
    config: ProviderConfig
  ): Promise<LLMProviderInterface> {
    // Check if the provider type is registered
    const ProviderClass = this.providerRegistry.get(type);
    if (!ProviderClass) {
      throw new Error(`Provider type "${type}" is not registered`);
    }

    // Create provider instance
    const provider = new ProviderClass();

    // Initialize provider with configuration
    await provider.initialize(config);

    return provider;
  }

  /**
   * Register a provider implementation
   * @param type Provider type identifier
   * @param providerClass Provider class that implements LLMProviderInterface
   */
  static registerProvider(
    type: string,
    providerClass: new () => LLMProviderInterface
  ): void {
    // Validate type
    if (!type || typeof type !== 'string') {
      throw new Error('Provider type must be a non-empty string');
    }

    // Register the provider
    this.providerRegistry.set(type, providerClass);
  }

  /**
   * Get a list of all registered provider types
   * @returns Array of provider type identifiers
   */
  static getSupportedProviders(): string[] {
    return Array.from(this.providerRegistry.keys());
  }

  /**
   * Check if a provider type is registered
   * @param type Provider type identifier
   * @returns True if the provider is registered
   */
  static isProviderSupported(type: string): boolean {
    return this.providerRegistry.has(type);
  }

  /**
   * Clear all registered providers (mainly for testing)
   */
  static clearProviders(): void {
    this.providerRegistry.clear();
  }
}
