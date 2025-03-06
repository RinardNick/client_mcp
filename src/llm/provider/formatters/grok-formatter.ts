import { ProviderMessageFormatter } from '../provider-adapter';
import { ConversationMessage } from '../../types';

/**
 * Formats messages for the Grok API
 */
export class GrokFormatter implements ProviderMessageFormatter {
  /**
   * Format a list of messages for Grok's API
   * @param messages The messages to format
   * @returns Formatted messages for Grok API
   */
  formatMessages(messages: ConversationMessage[]): any[] {
    const formattedMessages = [];

    // Process messages sequentially, ensuring function calls are followed by results
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.hasTool) {
        // For tool use messages, format them as function calls
        formattedMessages.push({
          role: 'assistant',
          content: `Please call ${msg.toolName} with ${JSON.stringify(
            msg.toolParameters
          )}`,
        });

        // Check if the next message is the result for this tool
        if (
          i + 1 < messages.length &&
          messages[i + 1].isToolResult &&
          messages[i + 1].toolId === msg.toolId
        ) {
          // Add the tool result message
          formattedMessages.push({
            role: 'user',
            content: messages[i + 1].content,
          });

          // Skip the next message since we already processed it
          i++;
        }
      } else if (!msg.isToolResult) {
        // Skip tool results that weren't paired
        // Regular message
        formattedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return formattedMessages;
  }

  /**
   * Format a tool call message for Grok
   * @param message The tool call message
   * @returns Formatted tool call for Grok
   */
  formatToolCallMessage(message: ConversationMessage): any {
    return {
      role: 'assistant',
      content: `Please call ${message.toolName} with ${JSON.stringify(
        message.toolParameters
      )}`,
    };
  }

  /**
   * Format a tool result message for Grok
   * @param message The tool result message
   * @returns Formatted tool result for Grok
   */
  formatToolResultMessage(message: ConversationMessage): any {
    return {
      role: 'user',
      content: message.content,
    };
  }
}
