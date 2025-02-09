export interface LLMConfig {
  type: string;
  api_key: string;
  system_prompt: string;
  model: string;
}

export interface MCPConfig {
  llm: LLMConfig;
  max_tool_calls?: number;
  servers?: Record<string, ServerConfig>;
}

export interface ServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

// Error types for configuration validation
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
