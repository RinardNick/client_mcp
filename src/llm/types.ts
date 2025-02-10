import { LLMConfig } from '../config/types';
import { MCPClient } from '@modelcontextprotocol/sdk';

export interface ChatSession {
  id: string;
  config: LLMConfig;
  createdAt: Date;
  lastActivityAt: Date;
  messages: ChatMessage[];
  mcpClient?: MCPClient;
  toolCallCount: number;
  maxToolCalls: number;
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
