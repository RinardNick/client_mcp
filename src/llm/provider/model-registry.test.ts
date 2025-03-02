import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry, ModelSelectionCriteria } from './model-registry';
import { ModelCapability } from './types';

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  const testModels: ModelCapability[] = [
    {
      id: 'test-model-1',
      contextWindow: 8000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.01,
      outputCostPer1K: 0.02,
    },
    {
      id: 'test-model-2',
      contextWindow: 32000,
      supportsFunctions: true,
      supportsImages: false,
      inputCostPer1K: 0.03,
      outputCostPer1K: 0.05,
    },
    {
      id: 'test-model-3',
      contextWindow: 4000,
      supportsFunctions: false,
      supportsImages: false,
      inputCostPer1K: 0.001,
      outputCostPer1K: 0.002,
    },
  ];

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  it('should register models and retrieve them by ID', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Get by provider and model ID
    const model1 = registry.getModel('test-provider', 'test-model-1');
    const model2 = registry.getModel('test-provider', 'test-model-2');
    const model3 = registry.getModel('other-provider', 'test-model-3');

    expect(model1).toEqual(testModels[0]);
    expect(model2).toEqual(testModels[1]);
    expect(model3).toEqual(testModels[2]);
  });

  it('should throw an error when getting a non-existent model', () => {
    registry.registerModel('test-provider', testModels[0]);

    // Try to get non-existent model
    expect(() => registry.getModel('test-provider', 'non-existent')).toThrow();
    expect(() => registry.getModel('non-existent', 'test-model-1')).toThrow();
  });

  it('should list all models for a provider', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // List models for test-provider
    const providerModels = registry.listModels('test-provider');
    expect(providerModels).toHaveLength(2);
    expect(providerModels).toContainEqual(testModels[0]);
    expect(providerModels).toContainEqual(testModels[1]);

    // List all models
    const allModels = registry.listModels();
    expect(allModels).toHaveLength(3);
  });

  it('should recommend a model based on context size requirements', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Request model based on context size
    const criteria: ModelSelectionCriteria = {
      minContextWindow: 5000,
    };

    const recommended = registry.getRecommendedModel(criteria);

    // Should recommend the smallest model that meets the requirements
    expect(recommended).toEqual(testModels[0]);
  });

  it('should recommend a model based on tool usage requirements', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Request model that supports functions
    const criteria: ModelSelectionCriteria = {
      requireFunctionCalling: true,
    };

    const recommended = registry.getRecommendedModel(criteria);

    // Should recommend a model that supports functions
    expect(recommended.supportsFunctions).toBe(true);
  });

  it('should recommend a model based on image support requirements', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Request model that supports images
    const criteria: ModelSelectionCriteria = {
      requireImageSupport: true,
    };

    const recommended = registry.getRecommendedModel(criteria);

    // Should recommend a model that supports images
    expect(recommended.supportsImages).toBe(true);
  });

  it('should recommend model based on cost optimization', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Request the cheapest model
    const criteria: ModelSelectionCriteria = {
      optimizeFor: 'cost',
    };

    const recommended = registry.getRecommendedModel(criteria);

    // Should recommend the cheapest model
    expect(recommended).toEqual(testModels[2]);
  });

  it('should recommend model based on performance optimization', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Request the model with largest context window
    const criteria: ModelSelectionCriteria = {
      optimizeFor: 'performance',
    };

    const recommended = registry.getRecommendedModel(criteria);

    // Should recommend the model with largest context window
    expect(recommended).toEqual(testModels[1]);
  });

  it('should throw an error when no model matches the criteria', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);

    // Request model with requirements that can't be met
    const criteria: ModelSelectionCriteria = {
      minContextWindow: 100000,
    };

    expect(() => registry.getRecommendedModel(criteria)).toThrow();
  });

  it('should recommend models from a preferred provider if specified', () => {
    // Register models
    registry.registerModel('test-provider', testModels[0]);
    registry.registerModel('test-provider', testModels[1]);
    registry.registerModel('other-provider', testModels[2]);

    // Request model from a specific provider
    const criteria: ModelSelectionCriteria = {
      preferredProvider: 'other-provider',
    };

    const recommended = registry.getRecommendedModel(criteria);

    // Should recommend model from the preferred provider
    expect(recommended).toEqual(testModels[2]);
  });
});
