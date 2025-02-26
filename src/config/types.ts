/**
 * Configuration types for the MCP client
 */

export interface ServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPConfig {
  llm: LLMConfig;
  max_tool_calls: number;
  servers: Record<string, ServerConfig>;
}

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
  // New token optimization settings
  token_optimization?: {
    enabled?: boolean;
    auto_truncate?: boolean;
    preserve_system_messages?: boolean;
    preserve_recent_messages?: number;
    truncation_strategy?: 'oldest-first' | 'selective' | 'summarize';
  };
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}