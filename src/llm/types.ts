import { LLMConfig } from '../config/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Simple type definitions matching the SDK's structure
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  name: string;
  type?: string;
  description?: string;
  uri?: string;
  mimeType?: string;
}

/**
 * Token metrics for tracking token usage in a session
 */
export interface TokenMetrics {
  userTokens: number;
  assistantTokens: number;
  systemTokens: number;
  totalTokens: number;
  maxContextTokens: number;
  percentUsed: number;
}

export interface ChatSession {
  id: string;
  config: LLMConfig;
  createdAt: Date;
  lastActivityAt: Date;
  messages: ChatMessage[];
  serverClients: Map<string, Client>;
  toolCallCount: number;
  maxToolCalls: number;
  tools: MCPTool[];
  resources: MCPResource[];
  // New token tracking fields
  tokenMetrics?: TokenMetrics;
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  hasToolCall?: boolean;
  toolCall?: ToolCall;
  isToolResult?: boolean;
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}