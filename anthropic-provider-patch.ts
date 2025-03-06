/**
 * This file contains the necessary changes to fix the tool execution issue in the Anthropic provider.
 * These changes should be applied to src/llm/provider/anthropic-provider.ts and session.ts.
 */

/**
 * 1. Update the message formatting in AnthropicProvider.streamMessage
 * Add this code to the stream message handling in anthropic-provider.ts
 */

// Before formatting messages for the API, transform them to ensure tool use/result pairing
const prepareMessagesForAnthropicAPI = (messages) => {
  const formattedMessages = [];
  
  // First pass: collect tool use and tool result messages
  const toolUseMessages = new Map();
  const toolResultMessages = new Map();
  
  messages.forEach(msg => {
    if (msg.hasTool) {
      toolUseMessages.set(msg.toolId, msg);
    } else if (msg.isToolResult) {
      toolResultMessages.set(msg.toolId, msg);
    }
  });
  
  // Second pass: properly format all messages
  for (const msg of messages) {
    // Skip tool use messages - they'll be paired with results
    if (msg.hasTool) continue;
    
    // For tool results, pair them with their tool use message
    if (msg.isToolResult) {
      const toolUseMsg = toolUseMessages.get(msg.toolId);
      
      if (toolUseMsg) {
        // Add the tool use message first
        formattedMessages.push({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: toolUseMsg.content || "I'll use a tool to help answer that.",
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
  
  return formattedMessages;
};

/**
 * 2. Update session.ts to store tool details when detecting tool calls
 * Add these fields to session messages in session.ts when a tool call is detected
 */

// When detecting a tool call in stream processing
// Add this before executing the tool

// Store the original message before tool calls
const toolUseMsg = {
  role: 'assistant',
  content: assistantContent, // This is the content before tool use
  timestamp: new Date(),
  hasTool: true, // Flag to mark this as a tool use message
  toolName: currentToolName,
  toolParameters: JSON.parse(currentToolParametersJson),
  toolId: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
};

session.messages.push(toolUseMsg);

// Then when adding the tool result, use the same ID
const toolResultMessage = {
  role: 'assistant',
  content: resultStr,
  isToolResult: true,
  timestamp: new Date(),
  toolId: toolUseMsg.toolId, // Use the same ID to maintain the association
};

/**
 * 3. Modify the session's createContinuationStream function to prepare messages properly
 * Update the continuation stream creation code in session.ts
 */

// Replace:
const continuationApiParams = {
  model: session.config.model,
  max_tokens: 1024,
  messages: session.messages.map(msg => {
    if (msg.isToolResult) {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content: msg.content,
            tool_use_id: msg.toolId || `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          },
        ],
      };
    } else {
      return {
        role: msg.role === 'system' ? 'user' : msg.role,
        content: msg.content,
      };
    }
  }),
  tools: tools,
  stream: true,
};

// With:
const formattedMessages = prepareMessagesForAnthropicAPI(session.messages);
const continuationApiParams = {
  model: session.config.model,
  max_tokens: 1024,
  messages: formattedMessages,
  tools: tools,
  stream: true,
};

/**
 * 4. Add a provider-specific message formatter in ProviderAdapter
 * Add this capability to handle different formats per provider
 */

// Add this to a new provider-adapter.ts file
export interface ProviderMessageFormatter {
  formatMessages: (messages: any[]) => any[];
}

export class ProviderAdapter {
  private formatters: Record<string, ProviderMessageFormatter> = {};
  
  constructor() {
    this.registerDefaultFormatters();
  }
  
  private registerDefaultFormatters() {
    // Anthropic formatter
    this.registerFormatter('anthropic', {
      formatMessages: prepareMessagesForAnthropicAPI,
    });
    
    // OpenAI formatter 
    this.registerFormatter('openai', {
      formatMessages: (messages) => {
        return messages.map(msg => {
          if (msg.isToolResult) {
            return {
              role: 'tool',
              content: msg.content,
              tool_call_id: msg.toolId,
            };
          } else if (msg.hasTool) {
            return {
              role: 'assistant',
              content: msg.content,
              tool_calls: [
                {
                  id: msg.toolId,
                  type: 'function',
                  function: {
                    name: msg.toolName,
                    arguments: JSON.stringify(msg.toolParameters),
                  },
                },
              ],
            };
          } else {
            return {
              role: msg.role,
              content: msg.content,
            };
          }
        });
      },
    });
  }
  
  registerFormatter(provider: string, formatter: ProviderMessageFormatter) {
    this.formatters[provider] = formatter;
  }
  
  formatMessagesForProvider(messages: any[], provider: string): any[] {
    const formatter = this.formatters[provider];
    if (!formatter) {
      throw new Error(`No message formatter found for provider: ${provider}`);
    }
    
    return formatter.formatMessages(messages);
  }
}

/**
 * 5. Update the main session continuation flow to use the provider adapter
 */

// In the SessionManager class, add:
private providerAdapter = new ProviderAdapter();

// Then when creating a continuation stream:
const formattedMessages = this.providerAdapter.formatMessagesForProvider(
  session.messages, 
  session.config.provider
);

// Use these formatted messages in the API call 