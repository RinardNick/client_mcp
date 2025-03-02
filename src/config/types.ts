/**
 * Configuration types for the MCP client
 */

export interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// Legacy configuration (keeping for backward compatibility)
export interface LLMConfig {
  type: string;
  api_key: string;
  model: string;
  system_prompt: string;
  max_tool_calls?: number;
  use_tools?: boolean;
  servers?: Record<string, ServerConfig>;
  thinking?: {
    enabled?: boolean;
    budget_tokens?: number;
  };
  // Token optimization settings
  token_optimization?: {
    enabled?: boolean;
    auto_truncate?: boolean;
    preserve_system_messages?: boolean;
    preserve_recent_messages?: number;
    truncation_strategy?: 'oldest-first' | 'selective' | 'summarize';
  };
}

// New provider-specific configuration
export interface ProviderConfig {
  api_key: string;
  default_model: string;
  system_prompt: string;
  max_tool_calls?: number;
  use_tools?: boolean;
  thinking?: {
    enabled?: boolean;
    budget_tokens?: number;
  };
  token_optimization?: {
    enabled?: boolean;
    auto_truncate?: boolean;
    preserve_system_messages?: boolean;
    preserve_recent_messages?: number;
    truncation_strategy?: 'oldest-first' | 'selective' | 'summarize';
  };
}

// Extended MCP configuration with multi-provider support
export interface MCPConfig {
  // Legacy field (kept for backward compatibility)
  llm?: LLMConfig;

  // Multi-provider configuration
  providers?: Record<string, ProviderConfig>;
  default_provider?: string;
  provider_fallbacks?: Record<string, string[]>;

  // Common configuration
  max_tool_calls: number;
  servers: Record<string, ServerConfig>;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Check if a configuration is using the legacy format
 */
export function isLegacyConfig(config: MCPConfig): boolean {
  return !!config.llm && !config.providers;
}

/**
 * Convert a legacy configuration to the new multi-provider format
 */
export function convertLegacyConfig(config: MCPConfig): MCPConfig {
  if (!isLegacyConfig(config)) {
    return config;
  }

  const legacyLLM = config.llm!;

  const convertedConfig: MCPConfig = {
    providers: {
      [legacyLLM.type]: {
        api_key: legacyLLM.api_key,
        default_model: legacyLLM.model,
        system_prompt: legacyLLM.system_prompt,
        max_tool_calls: legacyLLM.max_tool_calls,
        use_tools: legacyLLM.use_tools,
        thinking: legacyLLM.thinking,
        token_optimization: legacyLLM.token_optimization,
      },
    },
    default_provider: legacyLLM.type,
    provider_fallbacks: {},
    max_tool_calls: config.max_tool_calls,
    servers: config.servers,
  };

  return convertedConfig;
}

/**
 * Validate a multi-provider configuration
 */
export function validateMultiProviderConfig(
  config: MCPConfig
): asserts config is MCPConfig {
  // Handle legacy configuration
  if (isLegacyConfig(config)) {
    // The legacy configuration is already validated elsewhere
    return;
  }

  // Basic validation
  if (!config || typeof config !== 'object') {
    throw new ConfigurationError('Configuration must be an object');
  }

  // Validate providers section
  if (
    !config.providers ||
    typeof config.providers !== 'object' ||
    Object.keys(config.providers).length === 0
  ) {
    throw new ConfigurationError('At least one provider must be configured');
  }

  // Validate each provider
  for (const [providerName, providerConfig] of Object.entries(
    config.providers
  )) {
    if (!providerConfig || typeof providerConfig !== 'object') {
      throw new ConfigurationError(
        `Provider configuration for '${providerName}' must be an object`
      );
    }

    // Required fields
    const requiredFields: (keyof ProviderConfig)[] = [
      'api_key',
      'default_model',
      'system_prompt',
    ];

    for (const field of requiredFields) {
      if (typeof providerConfig[field] !== 'string' || !providerConfig[field]) {
        throw new ConfigurationError(
          `Provider '${providerName}' requires a non-empty string for '${field}'`
        );
      }
    }
  }

  // Validate default_provider
  if (!config.default_provider) {
    throw new ConfigurationError('default_provider is required');
  }

  if (!config.providers[config.default_provider]) {
    throw new ConfigurationError(
      `default_provider '${config.default_provider}' must be defined in providers`
    );
  }

  // Validate provider_fallbacks
  if (config.provider_fallbacks) {
    for (const [provider, fallbacks] of Object.entries(
      config.provider_fallbacks
    )) {
      // Check that the provider exists
      if (!config.providers[provider]) {
        throw new ConfigurationError(
          `Provider '${provider}' in provider_fallbacks must be defined in providers`
        );
      }

      // Check that all fallbacks exist
      if (!Array.isArray(fallbacks)) {
        throw new ConfigurationError(
          `Fallbacks for provider '${provider}' must be an array`
        );
      }

      for (const fallback of fallbacks) {
        if (!config.providers[fallback]) {
          throw new ConfigurationError(
            `Fallback provider '${fallback}' for '${provider}' must be defined in providers`
          );
        }
      }
    }
  }

  // Validate max_tool_calls
  if (typeof config.max_tool_calls !== 'number' || config.max_tool_calls < 0) {
    throw new ConfigurationError(
      'max_tool_calls is required and must be a non-negative number'
    );
  }

  // Validate servers
  if (!config.servers || typeof config.servers !== 'object') {
    throw new ConfigurationError('servers section is required');
  }
}
