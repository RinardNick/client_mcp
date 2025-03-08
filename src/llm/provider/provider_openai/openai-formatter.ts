import { ProviderMessageFormatter } from '../compatibility/provider-adapter';
import { ConversationMessage } from '../../types';

/**
 * Formats messages for the OpenAI API
 */
export class OpenAIFormatter implements ProviderMessageFormatter {
  /**
   * Format a list of messages for OpenAI's API
   * @param messages The messages to format
   * @returns Formatted messages for OpenAI API
   */
  formatMessages(messages: ConversationMessage[]): any[] {
    return messages.map(msg => {
      if (msg.isToolResult && msg.toolId) {
        return this.formatToolResultMessage(msg);
      } else if (msg.hasTool) {
        return this.formatToolCallMessage(msg);
      } else {
        return {
          role: msg.role,
          content: msg.content,
        };
      }
    });
  }

  /**
   * Format a tool call message for OpenAI
   * @param message The tool call message
   * @returns Formatted tool call for OpenAI
   */
  formatToolCallMessage(message: ConversationMessage): any {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: [
        {
          id: message.toolId,
          type: 'function',
          function: {
            name: message.toolName,
            arguments: JSON.stringify(message.toolParameters),
          },
        },
      ],
    };
  }

  /**
   * Format a tool result message for OpenAI
   * @param message The tool result message
   * @returns Formatted tool result for OpenAI
   */
  formatToolResultMessage(message: ConversationMessage): any {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolId,
    };
  }
}
