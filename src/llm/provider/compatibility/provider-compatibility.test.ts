import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProviderCompatibilityChecker,
  CompatibilityResult,
  CompatibilitySeverity,
} from './provider-compatibility';
import { ModelRegistry } from '../model-registry';

// Mock model registry for testing
class MockModelRegistry extends ModelRegistry {
  constructor() {
    super();
    // Add mock models
    this.registerModel('anthropic', {
      id: 'claude-3-opus-20240229',
      contextWindow: 200000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 15,
      outputCostPer1K: 75,
    });

    this.registerModel('anthropic', {
      id: 'claude-2.1',
      contextWindow: 100000,
      supportsFunctions: true,
      supportsImages: false,
      inputCostPer1K: 8,
      outputCostPer1K: 24,
    });

    this.registerModel('openai', {
      id: 'gpt-4o',
      contextWindow: 128000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 10,
      outputCostPer1K: 30,
    });

    this.registerModel('openai', {
      id: 'gpt-3.5-turbo',
      contextWindow: 16000,
      supportsFunctions: true,
      supportsImages: true,
      inputCostPer1K: 0.5,
      outputCostPer1K: 1.5,
    });

    this.registerModel('grok', {
      id: 'grok-1',
      contextWindow: 8000,
      supportsFunctions: true,
      supportsImages: false,
      inputCostPer1K: 0,
      outputCostPer1K: 0,
    });
  }
}

describe('ProviderCompatibilityChecker', () => {
  let compatibilityChecker: ProviderCompatibilityChecker;
  let mockRegistry: MockModelRegistry;

  beforeEach(() => {
    mockRegistry = new MockModelRegistry();
    compatibilityChecker = new ProviderCompatibilityChecker(mockRegistry);
  });

  it('should identify incompatibilities between providers', () => {
    // Basic compatibility check
    const result = compatibilityChecker.checkCompatibility(
      'anthropic',
      'claude-3-opus-20240229',
      'openai',
      'gpt-4o'
    );

    expect(result).toBeDefined();
    expect(result.compatible).toBeTypeOf('boolean');
    expect(Array.isArray(result.incompatibilities)).toBe(true);
  });

  it('should detect incompatibilities related to context window size', () => {
    // Check context window differences
    const result = compatibilityChecker.checkCompatibility(
      'anthropic',
      'claude-3-opus-20240229',
      'openai',
      'gpt-3.5-turbo'
    );

    // Claude 3 Opus has a much larger context window than GPT-3.5
    const contextIssue = result.incompatibilities.find(
      issue => issue.type === 'context_window'
    );

    expect(contextIssue).toBeDefined();
    expect(contextIssue?.severity).toBe(CompatibilitySeverity.WARNING);
    expect(contextIssue?.description).toContain('context window');
  });

  it('should detect incompatibilities in tool handling capabilities', () => {
    // Check tool handling
    const result = compatibilityChecker.checkCompatibility(
      'anthropic',
      'claude-3-opus-20240229',
      'grok',
      'grok-1'
    );

    const toolIssue = result.incompatibilities.find(
      issue => issue.type === 'tool_format'
    );

    expect(toolIssue).toBeDefined();
    expect(toolIssue?.description).toContain('tool');
  });

  it('should register custom compatibility checks', () => {
    // Custom compatibility check for specific provider pairs
    compatibilityChecker.registerCompatibilityCheck(
      'anthropic',
      'openai',
      (sourceProvider, sourceModel, targetProvider, targetModel) => {
        return {
          type: 'custom_check',
          severity: CompatibilitySeverity.INFO,
          description:
            'Custom compatibility check between Anthropic and OpenAI',
          sourceProvider,
          sourceModel,
          targetProvider,
          targetModel,
        };
      }
    );

    const result = compatibilityChecker.checkCompatibility(
      'anthropic',
      'claude-3-opus-20240229',
      'openai',
      'gpt-4o'
    );

    const customIssue = result.incompatibilities.find(
      issue => issue.type === 'custom_check'
    );

    expect(customIssue).toBeDefined();
    expect(customIssue?.description).toContain('Custom compatibility check');
  });

  it('should generate migration recommendations', () => {
    // Check migration recommendations
    const migration = compatibilityChecker.getMigrationPlan(
      'anthropic',
      'claude-3-opus-20240229',
      'openai',
      'gpt-4o',
      { currentContextSize: 10000 }
    );

    expect(migration).toBeDefined();
    expect(migration.requiredActions).toBeDefined();
    expect(Array.isArray(migration.requiredActions)).toBe(true);
    expect(migration.estimatedTokenImpact).toBeDefined();
    expect(migration.potentialLossAreas).toBeDefined();
  });

  it('should handle models with different vision capabilities', () => {
    // Check vision capabilities
    const result = compatibilityChecker.checkCompatibility(
      'anthropic',
      'claude-3-opus-20240229', // supports vision
      'anthropic',
      'claude-2.1' // doesn't support vision
    );

    const visionIssue = result.incompatibilities.find(
      issue => issue.type === 'vision_support'
    );

    expect(visionIssue).toBeDefined();
    expect(visionIssue?.severity).toBe(CompatibilitySeverity.WARNING);
    expect(visionIssue?.description).toContain('vision');
  });
});
