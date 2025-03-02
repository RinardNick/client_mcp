import { describe, it, expect } from 'vitest';
import {
  MCPConfig,
  LLMConfig,
  ServerConfig,
  validateMultiProviderConfig,
  isLegacyConfig,
  convertLegacyConfig,
} from './types';

describe('Multi-Provider Configuration', () => {
  describe('Config Validation', () => {
    it('should validate a correct multi-provider configuration', () => {
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

      expect(() => validateMultiProviderConfig(config)).not.toThrow();
    });

    it('should validate a legacy configuration', () => {
      const legacyConfig: MCPConfig = {
        llm: {
          type: 'anthropic',
          api_key: 'test-api-key',
          model: 'claude-3-sonnet-20240229',
          system_prompt: 'You are a helpful assistant',
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

      expect(isLegacyConfig(legacyConfig)).toBe(true);
      expect(() => validateMultiProviderConfig(legacyConfig)).not.toThrow();
    });

    it('should convert legacy config to multi-provider format', () => {
      const legacyConfig: MCPConfig = {
        llm: {
          type: 'anthropic',
          api_key: 'test-api-key',
          model: 'claude-3-sonnet-20240229',
          system_prompt: 'You are a helpful assistant',
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

      const convertedConfig = convertLegacyConfig(legacyConfig);

      expect(convertedConfig).toEqual({
        providers: {
          anthropic: {
            api_key: 'test-api-key',
            default_model: 'claude-3-sonnet-20240229',
            system_prompt: 'You are a helpful assistant',
          },
        },
        default_provider: 'anthropic',
        provider_fallbacks: {},
        max_tool_calls: 5,
        servers: {
          test: {
            command: 'node',
            args: ['server.js'],
            env: {},
          },
        },
      });
    });

    it('should reject a configuration with missing required fields', () => {
      const invalidConfig = {
        providers: {
          anthropic: {
            // missing api_key
            default_model: 'claude-3-sonnet-20240229',
            system_prompt: 'You are a helpful assistant',
          },
        },
        default_provider: 'anthropic',
        max_tool_calls: 5,
        servers: {
          test: {
            command: 'node',
            args: ['server.js'],
            env: {},
          },
        },
      };

      expect(() => validateMultiProviderConfig(invalidConfig as any)).toThrow();
    });

    it('should reject a configuration with invalid default_provider', () => {
      const invalidConfig: MCPConfig = {
        providers: {
          anthropic: {
            api_key: 'test-api-key',
            default_model: 'claude-3-sonnet-20240229',
            system_prompt: 'You are a helpful assistant',
          },
        },
        default_provider: 'openai', // not defined in providers
        max_tool_calls: 5,
        servers: {
          test: {
            command: 'node',
            args: ['server.js'],
            env: {},
          },
        },
      };

      expect(() => validateMultiProviderConfig(invalidConfig)).toThrow();
    });

    it('should reject a configuration with invalid fallback providers', () => {
      const invalidConfig: MCPConfig = {
        providers: {
          anthropic: {
            api_key: 'test-api-key',
            default_model: 'claude-3-sonnet-20240229',
            system_prompt: 'You are a helpful assistant',
          },
        },
        default_provider: 'anthropic',
        provider_fallbacks: {
          anthropic: ['grok'], // grok not defined in providers
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

      expect(() => validateMultiProviderConfig(invalidConfig)).toThrow();
    });
  });
});
