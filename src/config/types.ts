export interface ThinkingConfig {
  enabled?: boolean;
  budget_tokens?: number;
}

export interface LLMConfig {
  type: string;
  api_key: string;
  system_prompt: string;
  model: string;
  servers?: Record<string, ServerConfig>;
  // New fields
  max_tool_calls?: number;
  thinking?: ThinkingConfig;
}

export interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPConfig {
  llm: LLMConfig;
  max_tool_calls?: number;
  servers?: Record<string, ServerConfig>;
}

// Error types for configuration validation
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
