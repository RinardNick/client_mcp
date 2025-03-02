import fs from 'fs/promises';
import {
  MCPConfig,
  ConfigurationError,
  LLMConfig,
  ServerConfig,
  validateMultiProviderConfig,
  isLegacyConfig,
  convertLegacyConfig,
} from './types';

export async function loadConfig(configPath: string): Promise<MCPConfig> {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // Validate configuration (whether legacy or multi-provider)
    if (isLegacyConfig(config)) {
      // Legacy configuration, validate as before
      validateLegacyConfig(config);
    } else {
      // Multi-provider configuration
      validateMultiProviderConfig(config);
    }

    return config;
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new ConfigurationError(
        `Failed to load configuration: ${error.message}`
      );
    }
    throw new ConfigurationError('Failed to load configuration: Unknown error');
  }
}

/**
 * Validate a legacy MCP configuration
 */
function validateLegacyConfig(config: any): asserts config is MCPConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigurationError('Configuration must be an object');
  }

  validateLLMConfig(config.llm);

  if (typeof config.max_tool_calls !== 'number' || config.max_tool_calls < 0) {
    throw new ConfigurationError(
      'max_tool_calls is required and must be a non-negative number'
    );
  }

  if (!config.servers || typeof config.servers !== 'object') {
    throw new ConfigurationError('servers section is required');
  }

  validateServers(config.servers);
}

/**
 * Validate a legacy LLM configuration
 */
function validateLLMConfig(llm: any): asserts llm is LLMConfig {
  if (!llm || typeof llm !== 'object') {
    throw new ConfigurationError('LLM configuration is required');
  }

  const requiredFields: (keyof LLMConfig)[] = [
    'type',
    'api_key',
    'system_prompt',
    'model',
  ];
  for (const field of requiredFields) {
    if (typeof llm[field] !== 'string' || !llm[field]) {
      throw new ConfigurationError(
        `LLM configuration requires a non-empty string for '${field}'`
      );
    }
  }
}

/**
 * Validate server configurations
 */
function validateServers(servers: Record<string, unknown>) {
  if (typeof servers !== 'object') {
    throw new ConfigurationError('Servers configuration must be an object');
  }

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      throw new ConfigurationError(
        `Invalid server configuration for '${serverName}'`
      );
    }

    const server = serverConfig as Partial<ServerConfig>;

    if (typeof server.command !== 'string' || !server.command) {
      throw new ConfigurationError(`Server '${serverName}' requires a command`);
    }

    if (!Array.isArray(server.args)) {
      throw new ConfigurationError(
        `Server '${serverName}' args must be an array`
      );
    }

    if (server.env !== undefined && typeof server.env !== 'object') {
      throw new ConfigurationError(
        `Server '${serverName}' env must be an object if provided`
      );
    }

    // Validate that all args are strings
    for (const arg of server.args) {
      if (typeof arg !== 'string') {
        throw new ConfigurationError(
          `Server '${serverName}' args must all be strings`
        );
      }
    }

    // Validate that all env values are strings if env is provided
    if (server.env) {
      for (const [key, value] of Object.entries(server.env)) {
        if (typeof value !== 'string') {
          throw new ConfigurationError(
            `Server '${serverName}' env values must all be strings`
          );
        }
      }
    }
  }
}

/**
 * Get provider configuration from an MCPConfig
 * This is a helper function that handles both legacy and multi-provider configs
 */
export function getProviderConfig(
  config: MCPConfig,
  providerName?: string
): {
  provider: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  options?: Record<string, unknown>;
} {
  if (isLegacyConfig(config)) {
    // Legacy configuration
    const llm = config.llm!;
    return {
      provider: llm.type,
      apiKey: llm.api_key,
      model: llm.model,
      systemPrompt: llm.system_prompt,
      options: {
        maxToolCalls: llm.max_tool_calls,
        useTools: llm.use_tools,
        thinking: llm.thinking,
        tokenOptimization: llm.token_optimization,
      },
    };
  } else {
    // Multi-provider configuration
    const providerKey = providerName || config.default_provider;

    if (!providerKey) {
      throw new ConfigurationError(
        'No provider specified and no default provider configured'
      );
    }

    const providerConfig = config.providers?.[providerKey];

    if (!providerConfig) {
      throw new ConfigurationError(
        `Provider '${providerKey}' not found in configuration`
      );
    }

    return {
      provider: providerKey,
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
}

/**
 * Get all configured providers with their models
 */
export function getAllProviderConfigs(config: MCPConfig): Record<
  string,
  {
    apiKey: string;
    defaultModel: string;
    systemPrompt: string;
    options?: Record<string, unknown>;
  }
> {
  if (isLegacyConfig(config)) {
    // Convert legacy config to multi-provider format
    const converted = convertLegacyConfig(config);
    return getAllProviderConfigs(converted);
  }

  const result: Record<
    string,
    {
      apiKey: string;
      defaultModel: string;
      systemPrompt: string;
      options?: Record<string, unknown>;
    }
  > = {};

  if (!config.providers) {
    return result;
  }

  for (const [providerName, providerConfig] of Object.entries(
    config.providers
  )) {
    result[providerName] = {
      apiKey: providerConfig.api_key,
      defaultModel: providerConfig.default_model,
      systemPrompt: providerConfig.system_prompt,
      options: {
        maxToolCalls: providerConfig.max_tool_calls,
        useTools: providerConfig.use_tools,
        thinking: providerConfig.thinking,
        tokenOptimization: providerConfig.token_optimization,
      },
    };
  }

  return result;
}

/**
 * Get fallback providers for a given provider
 */
export function getProviderFallbacks(
  config: MCPConfig,
  provider: string
): string[] {
  if (isLegacyConfig(config)) {
    // Legacy configuration has no fallbacks
    return [];
  }

  return config.provider_fallbacks?.[provider] || [];
}
