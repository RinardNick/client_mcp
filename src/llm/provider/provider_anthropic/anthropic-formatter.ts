import { ProviderMessageFormatter } from '../compatibility/provider-adapter';
import { ConversationMessage } from '../../types';

/**
 * Formats messages for the Anthropic Claude API
 */
export class AnthropicFormatter implements ProviderMessageFormatter {
  /**
   * Format a list of messages for Anthropic's API
   * @param messages The messages to format
   * @returns Formatted messages for Anthropic API with system extracted
   */
  formatMessages(messages: ConversationMessage[]): any {
    const formattedMessages = [];
    let systemMessage: string | undefined;

    // First pass: extract system message and collect tool pairs
    const toolUseMessages = new Map<string, ConversationMessage>();
    const toolResultMessages = new Map<string, ConversationMessage>();

    // Collect all tool use and result messages by ID for pairing
    messages.forEach(msg => {
      // Extract system message - we'll handle it separately
      if (msg.role === 'system') {
        systemMessage = msg.content;
        return; // Skip adding to formattedMessages
      }

      // Track tool use messages by ID
      if (msg.hasTool && msg.toolId) {
        toolUseMessages.set(msg.toolId, msg);
      }

      // Track tool result messages by ID
      if (msg.isToolResult && msg.toolId) {
        toolResultMessages.set(msg.toolId, msg);
      }
    });

    // Second pass: process messages in sequence, ensuring tool uses and results are properly paired
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Skip system messages - handled separately
      if (msg.role === 'system') continue;

      // Handle regular messages (non-tool messages)
      if (!msg.hasTool && !msg.isToolResult) {
        formattedMessages.push({
          role: msg.role,
          content: msg.content,
        });
        continue;
      }

      // Handle tool use messages (but only if they have a matching result)
      if (msg.hasTool && msg.toolId && toolResultMessages.has(msg.toolId)) {
        const resultMsg = toolResultMessages.get(msg.toolId);

        // Add the tool use message first
        formattedMessages.push({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: msg.content || "I'll use a tool to help with that.",
            },
            {
              type: 'tool_use',
              id: msg.toolId,
              name: msg.toolName || '',
              input: msg.toolParameters || {},
            },
          ],
        });

        // Then immediately add the tool result
        if (resultMsg) {
          formattedMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.toolId,
                content: resultMsg.content,
              },
            ],
          });

          // Remove this result from the map so we don't process it again
          toolResultMessages.delete(msg.toolId);
        }

        // Skip the current message's normal processing since we've handled it specially
        continue;
      }

      // Skip tool result messages as they should be handled with their paired tool use
      if (msg.isToolResult) continue;
    }

    // Return an object with separate system and messages properties
    const result: any = {
      messages: formattedMessages,
    };

    // Add system message as a top-level parameter if it exists
    if (systemMessage) {
      result.system = systemMessage;
    }

    return result;
  }

  /**
   * Format a tool call message for Anthropic
   * @param message The tool call message
   * @returns Formatted tool call for Anthropic
   */
  formatToolCallMessage(message: ConversationMessage): any {
    return {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: message.content || "I'll use a tool to help with that.",
        },
        {
          type: 'tool_use',
          id: message.toolId,
          name: message.toolName || '',
          input: message.toolParameters || {},
        },
      ],
    };
  }

  /**
   * Format a tool result message for Anthropic
   * @param message The tool result message
   * @returns Formatted tool result for Anthropic
   */
  formatToolResultMessage(message: ConversationMessage): any {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolId,
          content: message.content,
        },
      ],
    };
  }
}
