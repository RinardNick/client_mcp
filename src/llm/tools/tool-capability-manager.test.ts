import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCapabilityManager } from './tool-capability-manager';
import { MCPTool } from '../types';

describe('ToolCapabilityManager', () => {
  let capabilityManager: ToolCapabilityManager;

  beforeEach(() => {
    capabilityManager = new ToolCapabilityManager();
  });

  describe('Tool Capability Detection', () => {
    it('should define capability levels for different providers', () => {
      expect(capabilityManager.getSupportedProviders()).toContain('anthropic');
      expect(capabilityManager.getSupportedProviders()).toContain('openai');
      expect(capabilityManager.getSupportedProviders()).toContain('grok');
    });

    const fileTool: MCPTool = {
      name: 'read_file',
      description: 'Read the contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file',
          },
          encoding: {
            type: 'string',
            enum: ['utf8', 'base64', 'binary'],
            description: 'File encoding',
          },
        },
        required: ['path'],
      },
    };

    it('should detect tool capability support for different providers', () => {
      const anthropicSupport = capabilityManager.checkToolSupport(
        fileTool,
        'anthropic'
      );
      const openaiSupport = capabilityManager.checkToolSupport(
        fileTool,
        'openai'
      );

      expect(anthropicSupport.supported).toBeDefined();
      expect(openaiSupport.supported).toBeDefined();
    });

    it('should identify specific capabilities not supported by a provider', () => {
      // Create a tool with complex schema features
      const complexTool: MCPTool = {
        name: 'complex_tool',
        description: 'Tool with complex features',
        inputSchema: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                deeplyNested: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                  },
                },
              },
            },
            enumValue: {
              type: 'string',
              enum: ['option1', 'option2'],
            },
            arrayParam: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['nested'],
        },
      };

      // Some providers might not support deeply nested objects
      const support = capabilityManager.checkToolSupport(complexTool, 'grok');

      expect(support.unsupportedFeatures).toBeDefined();
      expect(support.unsupportedFeatures.length).toBeGreaterThan(0);

      // Check details of unsupported features
      const featureDetails = support.unsupportedFeatures[0];
      expect(featureDetails).toHaveProperty('feature');
      expect(featureDetails).toHaveProperty('location');
      expect(featureDetails).toHaveProperty('severity');
    });
  });

  describe('Tool Adaptation', () => {
    const originalTool: MCPTool = {
      name: 'search_database',
      description: 'Search a database with complex criteria',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                operator: {
                  type: 'string',
                  enum: ['equals', 'contains', 'gt', 'lt'],
                },
                value: { type: 'string' },
              },
            },
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results',
          },
        },
        required: ['query'],
      },
    };

    it('should simplify tools for providers with limited capabilities', () => {
      // Simplify for a provider with limited schema support
      const simplified = capabilityManager.simplifyToolForProvider(
        originalTool,
        'limited_provider'
      );

      expect(simplified).toHaveProperty('name', 'search_database');
      // Check that complex features have been simplified
      expect(simplified.inputSchema.properties).not.toHaveProperty(
        'filters.items.properties.operator.enum'
      );

      // The simplified tool should still have the essential properties
      expect(simplified.inputSchema.properties).toHaveProperty('query');
      expect(simplified.inputSchema.required).toContain('query');
    });

    it('should provide fallbacks for unsupported features', () => {
      // Register a provider with specific constraints
      capabilityManager.registerProviderCapabilities('test_provider', {
        maxNestingDepth: 1,
        supportedTypes: ['string', 'number'],
        supportsEnums: false,
        supportsArrays: false,
      });

      const adapted = capabilityManager.simplifyToolForProvider(
        originalTool,
        'test_provider'
      );

      // Check that arrays were converted to strings
      expect(adapted.inputSchema.properties.filters).toBeDefined();
      expect(adapted.inputSchema.properties.filters.type).toBe('string');
      expect(adapted.inputSchema.properties.filters.description).toContain(
        'JSON string'
      );
    });

    it('should give warnings when simplifying tools', () => {
      const warnings = capabilityManager.getSimplificationWarnings(
        originalTool,
        'limited_provider'
      );

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toHaveProperty('message');
      expect(warnings[0]).toHaveProperty('severity');
    });
  });

  describe('Capability Negotiation', () => {
    it('should find the common capabilities between providers', () => {
      const commonCapabilities = capabilityManager.findCommonCapabilities([
        'anthropic',
        'openai',
        'grok',
      ]);

      expect(commonCapabilities).toHaveProperty('maxNestingDepth');
      expect(commonCapabilities).toHaveProperty('supportedTypes');
      expect(commonCapabilities.supportedTypes).toContain('string');
    });

    it('should adapt tools to work with multiple providers', () => {
      const tool: MCPTool = {
        name: 'multi_provider_tool',
        description: 'A tool that works across providers',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: {
              type: 'object',
              properties: {
                subParam: { type: 'number' },
              },
            },
          },
          required: ['param1'],
        },
      };

      const adaptedTool = capabilityManager.createMultiProviderCompatibleTool(
        tool,
        ['anthropic', 'openai', 'grok']
      );

      // The adapted tool should work with all specified providers
      const anthropicSupport = capabilityManager.checkToolSupport(
        adaptedTool,
        'anthropic'
      );
      const openaiSupport = capabilityManager.checkToolSupport(
        adaptedTool,
        'openai'
      );
      const grokSupport = capabilityManager.checkToolSupport(
        adaptedTool,
        'grok'
      );

      expect(anthropicSupport.supported).toBe(true);
      expect(openaiSupport.supported).toBe(true);
      expect(grokSupport.supported).toBe(true);

      // All adaptations were documented
      expect(adaptedTool).toHaveProperty('_compatibility');
    });

    it('should register custom capability handlers', () => {
      // Register a custom handler
      capabilityManager.registerCapabilityHandler(
        'custom_feature',
        (tool: MCPTool, provider: string) => {
          if (provider === 'limited_provider' && tool.name === 'special_tool') {
            return {
              supported: false,
              unsupportedFeatures: [
                {
                  feature: 'custom_feature',
                  location: 'tool.name',
                  severity: 'error',
                  message: 'Special tools not supported',
                },
              ],
            };
          }
          return { supported: true, unsupportedFeatures: [] };
        }
      );

      const result = capabilityManager.checkToolSupport(
        { name: 'special_tool', description: 'Special tool' },
        'limited_provider'
      );

      expect(result.supported).toBe(false);
      expect(result.unsupportedFeatures[0].feature).toBe('custom_feature');
    });
  });

  describe('Migration Planning', () => {
    it('should create migration plans when switching providers', () => {
      const tools: MCPTool[] = [
        {
          name: 'tool1',
          description: 'Simple tool',
          inputSchema: {
            type: 'object',
            properties: {
              param: { type: 'string' },
            },
            required: ['param'],
          },
        },
        {
          name: 'tool2',
          description: 'Complex tool',
          inputSchema: {
            type: 'object',
            properties: {
              complexParam: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nestedField: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ];

      const migrationPlan = capabilityManager.createToolMigrationPlan(
        tools,
        'source_provider',
        'target_provider'
      );

      expect(migrationPlan).toHaveProperty('compatibleTools');
      expect(migrationPlan).toHaveProperty('incompatibleTools');
      expect(migrationPlan).toHaveProperty('adaptedTools');
      expect(migrationPlan).toHaveProperty('recommendations');
    });
  });
});
