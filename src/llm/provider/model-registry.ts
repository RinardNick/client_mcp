import { ModelCapability } from './types';

/**
 * Criteria for selecting an appropriate model
 */
export interface ModelSelectionCriteria {
  /**
   * Minimum context window size required
   */
  minContextWindow?: number;

  /**
   * Whether the model needs to support function/tool calling
   */
  requireFunctionCalling?: boolean;

  /**
   * Whether the model needs to support image inputs
   */
  requireImageSupport?: boolean;

  /**
   * Preferred optimization goal
   * - 'cost': select the cheapest suitable model
   * - 'performance': select the most capable model
   * - 'balanced': balance cost and capability
   */
  optimizeFor?: 'cost' | 'performance' | 'balanced';

  /**
   * Preferred provider to use (if multiple providers match criteria)
   */
  preferredProvider?: string;
}

/**
 * Registry that manages model capabilities across providers
 */
export class ModelRegistry {
  private registry: Map<string, Map<string, ModelCapability>> = new Map();

  /**
   * Register a model with its capabilities
   * @param provider Provider identifier
   * @param model Model capability information
   */
  registerModel(provider: string, model: ModelCapability): void {
    // Get or create provider map
    if (!this.registry.has(provider)) {
      this.registry.set(provider, new Map());
    }

    // Store model capability info
    const providerMap = this.registry.get(provider)!;
    providerMap.set(model.id, model);
  }

  /**
   * Get model capability info by provider and model ID
   * @param provider Provider identifier
   * @param modelId Model identifier
   * @returns Model capability information
   */
  getModel(provider: string, modelId: string): ModelCapability {
    // Check if provider exists
    if (!this.registry.has(provider)) {
      throw new Error(`Provider "${provider}" not found in registry`);
    }

    // Check if model exists for provider
    const providerMap = this.registry.get(provider)!;
    if (!providerMap.has(modelId)) {
      throw new Error(
        `Model "${modelId}" not found for provider "${provider}"`
      );
    }

    return providerMap.get(modelId)!;
  }

  /**
   * List all models, optionally filtered by provider
   * @param provider Optional provider to filter by
   * @returns Array of model capability information
   */
  listModels(provider?: string): ModelCapability[] {
    if (provider) {
      // Return models for specific provider
      if (!this.registry.has(provider)) {
        return [];
      }

      const providerMap = this.registry.get(provider)!;
      return Array.from(providerMap.values());
    } else {
      // Return all models across all providers
      const allModels: ModelCapability[] = [];

      for (const providerMap of this.registry.values()) {
        allModels.push(...providerMap.values());
      }

      return allModels;
    }
  }

  /**
   * Get a recommended model based on selection criteria
   * @param criteria Criteria for model selection
   * @returns The most suitable model based on criteria
   */
  getRecommendedModel(criteria: ModelSelectionCriteria): ModelCapability {
    // Get all models
    let candidateModels = this.listModels();

    // Apply preferred provider filter if specified
    if (criteria.preferredProvider) {
      const preferredModels = this.listModels(criteria.preferredProvider);

      // Only filter if we have models from the preferred provider
      if (preferredModels.length > 0) {
        candidateModels = preferredModels;
      }
    }

    // Filter by minimum context window
    if (criteria.minContextWindow) {
      candidateModels = candidateModels.filter(
        model => model.contextWindow >= criteria.minContextWindow!
      );
    }

    // Filter by function calling support
    if (criteria.requireFunctionCalling) {
      candidateModels = candidateModels.filter(
        model => model.supportsFunctions
      );
    }

    // Filter by image support
    if (criteria.requireImageSupport) {
      candidateModels = candidateModels.filter(model => model.supportsImages);
    }

    // Make sure we have at least one model that meets all the requirements
    if (candidateModels.length === 0) {
      throw new Error('No models found that match the specified criteria');
    }

    // Apply optimization criteria
    if (criteria.optimizeFor) {
      switch (criteria.optimizeFor) {
        case 'cost':
          // Sort by lowest combined cost
          return candidateModels.sort((a, b) => {
            const aCost = a.inputCostPer1K + a.outputCostPer1K;
            const bCost = b.inputCostPer1K + b.outputCostPer1K;
            return aCost - bCost;
          })[0];

        case 'performance':
          // Sort by highest context window
          return candidateModels.sort(
            (a, b) => b.contextWindow - a.contextWindow
          )[0];

        case 'balanced':
          // Use a balanced scoring approach
          return candidateModels.sort((a, b) => {
            // Calculate a balanced score (lower is better)
            // This weights context window size against cost
            const aScore =
              (a.inputCostPer1K + a.outputCostPer1K) /
              (Math.log(a.contextWindow) / Math.log(10));
            const bScore =
              (b.inputCostPer1K + b.outputCostPer1K) /
              (Math.log(b.contextWindow) / Math.log(10));
            return aScore - bScore;
          })[0];
      }
    }

    // If no optimization criteria, return the first model that meets the requirements
    // This will typically be the model with the smallest context window that meets the requirements
    return candidateModels[0];
  }
}
