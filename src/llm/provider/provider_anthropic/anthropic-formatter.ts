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
    const toolUseMessages = new Map<string, ConversationMessage>();
    let systemMessage: string | undefined;

    // First collect all tool use messages and extract system message
    messages.forEach(msg => {
      if (msg.hasTool && msg.toolId) {
        toolUseMessages.set(msg.toolId, msg);
      }

      // Extract system message - we'll handle it differently
      if (msg.role === 'system') {
        systemMessage = msg.content;
        return; // Skip adding to formattedMessages
      }
    });

    // Process messages sequentially
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Skip system messages - handled separately
      if (msg.role === 'system') continue;

      // Skip tool use messages - they'll be paired with results
      if (msg.hasTool) continue;

      // Handle tool results by pairing with their tool use
      if (msg.isToolResult && msg.toolId) {
        const toolUseMsg = toolUseMessages.get(msg.toolId);

        if (toolUseMsg) {
          // Add the tool use message first
          formattedMessages.push({
            role: 'assistant',
            content: [
              {
                type: 'text',
                text:
                  toolUseMsg.content || "I'll use a tool to help with that.",
              },
              {
                type: 'tool_use',
                id: toolUseMsg.toolId,
                name: toolUseMsg.toolName,
                input: toolUseMsg.toolParameters,
              },
            ],
          });

          // Then add the tool result
          formattedMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.toolId,
                content: msg.content,
              },
            ],
          });
        }
      } else {
        // Regular message
        formattedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
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
          name: message.toolName,
          input: message.toolParameters,
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
