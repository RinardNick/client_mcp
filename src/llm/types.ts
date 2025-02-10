import { LLMConfig } from '../config/types';

export interface ChatSession {
  id: string;
  config: LLMConfig;
  createdAt: Date;
  lastActivityAt: Date;
  messages: ChatMessage[];
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
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}
