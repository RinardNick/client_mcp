import { ConversationMessage } from './types';

/**
 * Generates a unique tool ID
 * @returns A unique ID for a tool call
 */
export function generateToolId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a tool use message from an assistant
 * @param content The text content of the message
 * @param toolName The name of the tool to use
 * @param toolParameters The parameters to pass to the tool
 * @returns A formatted tool use message
 */
export function createToolUseMessage(
  content: string,
  toolName: string,
  toolParameters: any
): ConversationMessage {
  return {
    role: 'assistant',
    content,
    timestamp: new Date(),
    hasTool: true,
    toolName,
    toolParameters,
    toolId: generateToolId(),
  };
}

/**
 * Creates a tool result message
 * @param content The content returned by the tool
 * @param toolId The ID of the tool call this result belongs to
 * @returns A formatted tool result message
 */
export function createToolResultMessage(
  content: string,
  toolId: string
): ConversationMessage {
  return {
    role: 'tool',
    content,
    timestamp: new Date(),
    isToolResult: true,
    toolId,
  };
}
