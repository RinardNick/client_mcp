# Tool Execution Fix for client_mcp

This README provides step-by-step instructions for implementing the fix for tool execution issues with the Anthropic API in the client_mcp library.

## Issue Description

After implementing multi-provider support, the library experiences errors when executing tools with Anthropic's API:

```
BadRequestError: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.3: `tool_result` block(s) provided when previous message does not contain any `tool_use` blocks"}}
```

This happens because the library is not properly formatting the message sequence for Anthropic, which requires each `tool_result` block to be paired with a matching `tool_use` block in the conversation history.

## Implementation Steps

### Step 1: Enhanced Message Storage (1 day)

1. Update `src/llm/types.ts` to include additional fields for tracking tool usage:

```typescript
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;

  // Add these fields
  hasTool?: boolean; // Flag to identify messages that include tool calls
  toolName?: string; // The name of the tool being called
  toolParameters?: any; // The parameters passed to the tool
  toolId?: string; // Unique ID to track tool calls and results
  isToolResult?: boolean; // Flag to identify tool result messages
}
```

2. Modify the tool call detection in `src/llm/session.ts` to store tool details:

```typescript
// When detecting a tool call in the response
const toolId = `tool_${Date.now()}_${Math.random()
  .toString(36)
  .substring(2, 9)}`;

// Store the message before executing the tool
const toolUseMessage = {
  role: 'assistant',
  content: assistantContent,
  timestamp: new Date(),
  hasTool: true,
  toolName: currentToolName,
  toolParameters: JSON.parse(currentToolParametersJson),
  toolId: toolId,
};
session.messages.push(toolUseMessage);

// When storing the tool result, use the same ID
const toolResultMessage = {
  role: 'assistant',
  content: resultStr,
  isToolResult: true,
  timestamp: new Date(),
  toolId: toolId, // Same ID to maintain the association
};
session.messages.push(toolResultMessage);
```

### Step 2: Create Provider Message Formatter (1 day)

1. Create a new file `src/llm/provider/provider-adapter.ts`:

```typescript
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
      formatMessages: messages => {
        const formattedMessages = [];

        // First pass: collect tool use and tool result messages
        const toolUseMessages = new Map();

        messages.forEach(msg => {
          if (msg.hasTool) {
            toolUseMessages.set(msg.toolId, msg);
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
                    text:
                      toolUseMsg.content ||
                      "I'll use a tool to help answer that.",
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
      },
    });

    // OpenAI formatter
    this.registerFormatter('openai', {
      formatMessages: messages => {
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

    // Add Grok formatter if needed
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
```

2. Add the provider adapter to `SessionManager` class in `src/llm/session.ts`:

```typescript
import { ProviderAdapter } from './provider/provider-adapter';

export class SessionManager {
  private providerAdapter = new ProviderAdapter();

  // ... existing code
}
```

### Step 3: Update Continuation Stream Creation (1 day)

Update the code that creates continuation streams after tool execution in `src/llm/session.ts`:

```typescript
// Find this code
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
            tool_use_id:
              msg.toolId ||
              `tool_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 9)}`,
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

// Replace with
const formattedMessages = this.providerAdapter.formatMessagesForProvider(
  session.messages,
  session.config.provider
);

const continuationApiParams = {
  model: session.config.model,
  max_tokens: 1024,
  messages: formattedMessages,
  tools: tools,
  stream: true,
};
```

### Step 4: Update Anthropic Provider Implementation (1 day)

Modify `src/llm/provider/anthropic-provider.ts` to handle the tool execution flow correctly:

```typescript
// Within the streamMessage method, when handling the response after tool execution
// Make sure to use the formatted messages that properly pair tool_use and tool_result

// Find code where messages are formatted for the API
const messages =
  (options.providerOptions?.messages as Array<{
    role: string;
    content: string;
  }>) || [];

// Replace with
let formattedMessages = (options.providerOptions?.messages as any[]) || [];

// If we have our own message formatter, use it
if (options.providerOptions?.useFormatter) {
  // We'll use the provider adapter's formatter
  const providerAdapter = new ProviderAdapter();
  formattedMessages = providerAdapter.formatMessagesForProvider(
    formattedMessages,
    'anthropic'
  );
}

// Then use formattedMessages in the API call
```

### Step 5: Testing (1-2 days)

1. Create unit tests for the provider adapter:

```typescript
// In src/llm/provider/provider-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { ProviderAdapter } from './provider-adapter';

describe('ProviderAdapter', () => {
  it('correctly formats messages for Anthropic with tool use/result pairing', () => {
    const adapter = new ProviderAdapter();

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant with access to tools.',
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'List files in /tmp',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: "I'll help you list files.",
        timestamp: new Date(),
        hasTool: true,
        toolName: 'list_files',
        toolParameters: { path: '/tmp' },
        toolId: 'tool_12345',
      },
      {
        role: 'assistant',
        content: '{"files": ["file1.txt", "file2.txt"]}',
        isToolResult: true,
        timestamp: new Date(),
        toolId: 'tool_12345',
      },
    ];

    const formatted = adapter.formatMessagesForProvider(messages, 'anthropic');

    // Check the formatted results
    expect(formatted.length).toBe(3); // system, user, and paired tool_use/result

    // Check the tool_use message
    const toolUseMsg = formatted[2];
    expect(toolUseMsg.role).toBe('assistant');
    expect(toolUseMsg.content.length).toBe(2);
    expect(toolUseMsg.content[1].type).toBe('tool_use');
    expect(toolUseMsg.content[1].name).toBe('list_files');

    // Check the tool_result message
    const toolResultMsg = formatted[3];
    expect(toolResultMsg.role).toBe('user');
    expect(toolResultMsg.content[0].type).toBe('tool_result');
    expect(toolResultMsg.content[0].tool_use_id).toBe('tool_12345');
  });
});
```

2. Create integration tests for tool execution:

```typescript
// In src/llm/tool-integration.test.ts (add a new test)
it('successfully continues conversation after tool execution with Anthropic', async () => {
  // Set up test with mocked anthropic client
  // Ensure the test exercises the full tool execution flow
  // Verify the proper sequence of messages is maintained
});
```

### Step 6: Documentation and Release (1 day)

1. Update documentation in README.md to explain the tool execution flow:

```markdown
## Tool Execution Flow

When using tools with different providers, the client_mcp library ensures correct message formatting:

### Anthropic

With Anthropic, tool execution requires specific message formatting:

1. Assistant message with `tool_use` block
2. User message with `tool_result` block referencing the tool_use ID

### OpenAI

With OpenAI, tool execution uses:

1. Assistant message with `tool_calls` array
2. Tool message with results and tool_call_id reference

The library handles these differences automatically.
```

2. Update the CHANGELOG.md to document the fix:

```markdown
## [1.2.2] - 2024-03-XX

### Fixed

- Tool execution with Anthropic API now works correctly by maintaining proper message sequence
- Improved tool_use/tool_result pairing for consistent behavior across providers
- Fixed continuation messages after tool execution
```

## Testing the Fix

1. Create a basic test script that:
   - Initializes a session with the Anthropic provider
   - Sends a message that triggers tool execution
   - Verifies the tool executes successfully
   - Checks that the continuation with Anthropic works correctly

```typescript
// Example test code
const main = async () => {
  const config = {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    apiKey: process.env.ANTHROPIC_API_KEY,
  };

  const sessionManager = new SessionManager(config);

  // Register a tool
  sessionManager.registerTool('list_files', async () => {
    return { files: ['file1.txt', 'file2.txt'] };
  });

  // Create a session
  const sessionId = await sessionManager.createSession();

  // Send a message that will trigger the tool
  const stream = await sessionManager.sendMessageStream(
    sessionId,
    'List the files available'
  );

  // Process the stream
  for await (const chunk of stream) {
    console.log(`Chunk type: ${chunk.type}`);

    if (chunk.type === 'content') {
      console.log(`Content: ${chunk.content}`);
    } else if (chunk.type === 'tool_start') {
      console.log('Tool execution started');
    } else if (chunk.type === 'tool_result') {
      console.log(`Tool result: ${chunk.content}`);
    } else if (chunk.type === 'error') {
      console.error(`Error: ${chunk.error}`);
      throw new Error(chunk.error);
    }
  }

  console.log('Test completed successfully!');
};

main().catch(console.error);
```

## Success Criteria

- All tests pass
- Tool execution works correctly with Anthropic
- No regressions in other functionality
- The client_mcp library handles tool execution consistently across providers
