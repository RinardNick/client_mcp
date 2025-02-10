import fs from 'fs/promises';
import {
  MCPConfig,
  ConfigurationError,
  LLMConfig,
  ServerConfig,
} from './types';

export async function loadConfig(configPath: string): Promise<MCPConfig> {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    validateConfig(config);
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

function validateConfig(config: any): asserts config is MCPConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigurationError('Configuration must be an object');
  }

  validateLLMConfig(config.llm);

  if (
    config.max_tool_calls !== undefined &&
    (typeof config.max_tool_calls !== 'number' || config.max_tool_calls < 0)
  ) {
    throw new ConfigurationError(
      'max_tool_calls must be a positive number if specified'
    );
  }

  if (config.servers) {
    validateServers(config.servers);
  }
}

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

    if (!server.env || typeof server.env !== 'object') {
      throw new ConfigurationError(
        `Server '${serverName}' env must be an object`
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

    // Validate that all env values are strings
    for (const [key, value] of Object.entries(server.env)) {
      if (typeof value !== 'string') {
        throw new ConfigurationError(
          `Server '${serverName}' env values must all be strings`
        );
      }
    }
  }
}
