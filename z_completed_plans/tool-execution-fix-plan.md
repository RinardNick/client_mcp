# Updated Tool Execution Fix Implementation Plan

Based on the detailed analysis of provider requirements, I'll update the implementation plan with incremental, testable steps for each provider.

## Phase 1: Enhanced Message Storage and Tracking

### ✅ Step 1.1: Update Message Interface (1 day)

```typescript
// In src/llm/types.ts
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;

  // Add these fields for tool tracking
  hasTool?: boolean; // Flag for messages with tool calls
  isToolResult?: boolean; // Flag for tool result messages
  toolId?: string; // Unique ID to link tool calls with results
  toolName?: string; // Name of the tool being called
  toolParameters?: any; // Parameters passed to the tool
  previousToolId?: string; // For linking tool results to their tool calls
}
```

**Testable output:** The updated interface should compile without errors.

### ✅ Step 1.2: Implement Tool ID Generation (0.5 day)

```typescript
// In src/llm/utils.ts
export function generateToolId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
```

**Testable output:** The function should generate unique IDs in the expected format.

### ✅ Step 1.3: Add Helper Functions for Tool Messages (0.5 day)

```typescript
// In src/llm/utils.ts
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
```

**Testable output:** Functions should create properly formatted messages with all required fields.

## Phase 2: Provider-Specific Message Formatters

### ✅ Step 2.1: Create Provider Adapter Interface (0.5 day)

```typescript
// In src/llm/provider/provider-adapter.ts
export interface ProviderMessageFormatter {
  formatMessages(messages: ConversationMessage[]): any[];
  formatToolCallMessage(message: ConversationMessage): any;
  formatToolResultMessage(message: ConversationMessage): any;
}

export class ProviderAdapter {
  private formatters: Record<string, ProviderMessageFormatter> = {};

  constructor() {
    this.registerDefaultFormatters();
  }

  registerFormatter(
    provider: string,
    formatter: ProviderMessageFormatter
  ): void {
    this.formatters[provider] = formatter;
  }

  formatMessagesForProvider(
    messages: ConversationMessage[],
    provider: string
  ): any[] {
    const formatter = this.formatters[provider];
    if (!formatter) {
      throw new Error(`No message formatter found for provider: ${provider}`);
    }
    return formatter.formatMessages(messages);
  }

  private registerDefaultFormatters(): void {
    // Will be implemented in subsequent steps
  }
}
```

**Testable output:** The adapter class should compile without errors and throw the appropriate error when a formatter is not found.

### ✅ Step 2.2: Implement Anthropic Message Formatter (1 day)

```typescript
// In src/llm/provider/formatters/anthropic-formatter.ts
import { ProviderMessageFormatter } from '../provider-adapter';
import { ConversationMessage } from '../../types';

export class AnthropicFormatter implements ProviderMessageFormatter {
  formatMessages(messages: ConversationMessage[]): any[] {
    const formattedMessages = [];
    const toolUseMessages = new Map<string, ConversationMessage>();

    // First collect all tool use messages
    messages.forEach(msg => {
      if (msg.hasTool && msg.toolId) {
        toolUseMessages.set(msg.toolId, msg);
      }
    });

    // Then format messages ensuring tool_use precedes tool_result
    for (const msg of messages) {
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

    return formattedMessages;
  }

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
```

**Testable output:** Write a unit test to verify the formatter correctly pairs tool_use with tool_result messages and maintains proper sequence.

### ✅ Step 2.3: Implement OpenAI Message Formatter (1 day)

```typescript
// In src/llm/provider/formatters/openai-formatter.ts
import { ProviderMessageFormatter } from '../provider-adapter';
import { ConversationMessage } from '../../types';

export class OpenAIFormatter implements ProviderMessageFormatter {
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

  formatToolResultMessage(message: ConversationMessage): any {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolId,
    };
  }
}
```

**Testable output:** Write a unit test to verify the formatter correctly transforms message objects to OpenAI's format.

### ✅ Step 2.4: Implement Grok Message Formatter (1 day)

```typescript
// In src/llm/provider/formatters/grok-formatter.ts
import { ProviderMessageFormatter } from '../provider-adapter';
import { ConversationMessage } from '../../types';

export class GrokFormatter implements ProviderMessageFormatter {
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

  formatToolCallMessage(message: ConversationMessage): any {
    return {
      role: 'assistant',
      content: `Please call ${message.toolName} with ${JSON.stringify(
        message.toolParameters
      )}`,
    };
  }

  formatToolResultMessage(message: ConversationMessage): any {
    return {
      role: 'user',
      content: message.content,
    };
  }
}
```

**Testable output:** Write a unit test to verify the formatter correctly handles sequential function calls and results.

### ✅ Step 2.5: Register Formatters in Provider Adapter (0.5 day)

```typescript
// In src/llm/provider/provider-adapter.ts
import { AnthropicFormatter } from './formatters/anthropic-formatter';
import { OpenAIFormatter } from './formatters/openai-formatter';
import { GrokFormatter } from './formatters/grok-formatter';

export class ProviderAdapter {
  // ... existing code ...

  private registerDefaultFormatters(): void {
    this.registerFormatter('anthropic', new AnthropicFormatter());
    this.registerFormatter('openai', new OpenAIFormatter());
    this.registerFormatter('grok', new GrokFormatter());
  }
}
```

**Testable output:** Verify the adapter correctly registers and retrieves formatters for each provider.

## Phase 3: Session Management Updates

### ✅ Step 3.1: Update Tool Result Storage in Session Manager (1 day)

```typescript
// In src/llm/session.ts
import {
  generateToolId,
  createToolUseMessage,
  createToolResultMessage,
} from './utils';
import { ProviderAdapter } from './provider/provider-adapter';

export class SessionManager {
  private providerAdapter = new ProviderAdapter();

  // ... existing code ...

  async executeToolAndAddResult(
    sessionId: string,
    toolName: string,
    toolParameters: any,
    assistantContent: string
  ): Promise<string> {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Create and store the tool use message
    const toolUseMessage = createToolUseMessage(
      assistantContent,
      toolName,
      toolParameters
    );
    session.messages.push(toolUseMessage);

    // Execute the tool
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);

    try {
      const result = await tool(toolParameters);
      const resultStr =
        typeof result === 'string' ? result : JSON.stringify(result);

      // Create and store the tool result message
      const toolResultMessage = createToolResultMessage(
        resultStr,
        toolUseMessage.toolId
      );
      session.messages.push(toolResultMessage);

      return resultStr;
    } catch (error) {
      // Handle tool execution errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const toolResultMessage = createToolResultMessage(
        `Error: ${errorMessage}`,
        toolUseMessage.toolId
      );
      session.messages.push(toolResultMessage);

      return `Error: ${errorMessage}`;
    }
  }
}
```

**Testable output:** Verify the method correctly creates and stores tool use and result messages with matching IDs.

### ✅ Step 3.2: Implement Message Formatting for API Calls (1 day)

```typescript
// In src/llm/session.ts
export class SessionManager {
  // ... existing code ...

  async sendMessageStream(
    sessionId: string,
    message: string,
    options?: any
  ): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Add user message
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Format messages for the provider
    const formattedMessages = this.providerAdapter.formatMessagesForProvider(
      session.messages,
      session.config.provider
    );

    // Create API parameters
    const apiParams = {
      model: session.config.model,
      messages: formattedMessages,
      tools: this.getToolDefinitions(),
      // Other parameters
    };

    // Get the provider
    const provider = this.providers.get(session.config.provider);
    if (!provider)
      throw new Error(`Provider not found: ${session.config.provider}`);

    // Call the provider with formatted messages
    return provider.streamMessage(apiParams);
  }

  async createContinuationStream(sessionId: string): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Format messages for the provider
    const formattedMessages = this.providerAdapter.formatMessagesForProvider(
      session.messages,
      session.config.provider
    );

    // Create API parameters
    const apiParams = {
      model: session.config.model,
      messages: formattedMessages,
      tools: this.getToolDefinitions(),
      stream: true,
      // Other parameters
    };

    // Get the provider
    const provider = this.providers.get(session.config.provider);
    if (!provider)
      throw new Error(`Provider not found: ${session.config.provider}`);

    // Call the provider with formatted messages
    return provider.streamMessage(apiParams);
  }
}
```

**Testable output:** Verify the methods correctly format messages for the selected provider before API calls.

## Phase 4: Provider Implementation Updates

### ✅ Step 4.1: Update Anthropic Provider (1 day)

```typescript
// In src/llm/provider/anthropic-provider.ts
import { ProviderAdapter } from './provider-adapter';

export class AnthropicProvider {
  // ... existing code ...

  async streamMessage(options: any): Promise<any> {
    // Check if we should format messages
    if (options.useProviderFormatting !== false) {
      const providerAdapter = new ProviderAdapter();
      options.messages = providerAdapter.formatMessagesForProvider(
        options.messages,
        'anthropic'
      );
    }

    // Configure Anthropic-specific options
    const anthropicOptions = {
      ...options,
      model: options.model,
      max_tokens: options.max_tokens || 1024,
      messages: options.messages,
      tools: options.tools,
      stream: true,
      disable_parallel_tool_use: options.disable_parallel_tool_use || false,
    };

    // Call Anthropic API
    // ... existing API call code ...
  }
}
```

**Testable output:** Verify the provider correctly formats messages for the Anthropic API requirements.

### ✅ Step 4.2: Update OpenAI Provider (1 day)

```typescript
// In src/llm/provider/openai-provider.ts
import { ProviderAdapter } from './provider-adapter';

export class OpenAIProvider {
  // ... existing code ...

  async streamMessage(options: any): Promise<any> {
    // Check if we should format messages
    if (options.useProviderFormatting !== false) {
      const providerAdapter = new ProviderAdapter();
      options.messages = providerAdapter.formatMessagesForProvider(
        options.messages,
        'openai'
      );
    }

    // Configure OpenAI-specific options
    const openaiOptions = {
      ...options,
      model: options.model,
      max_tokens: options.max_tokens || 1024,
      messages: options.messages,
      tools: options.tools,
      stream: true,
    };

    // Call OpenAI API
    // ... existing API call code ...
  }
}
```

**Testable output:** Verify the provider correctly formats messages for the OpenAI API requirements.

### ✅ Step 4.3: Update Grok Provider (1 day)

```typescript
// In src/llm/provider/grok-provider.ts
import { ProviderAdapter } from './provider-adapter';

export class GrokProvider {
  // ... existing code ...

  async streamMessage(options: any): Promise<any> {
    // Check if we should format messages
    if (options.useProviderFormatting !== false) {
      const providerAdapter = new ProviderAdapter();
      options.messages = providerAdapter.formatMessagesForProvider(
        options.messages,
        'grok'
      );
    }

    // Configure Grok-specific options
    const grokOptions = {
      ...options,
      model: options.model,
      max_tokens: options.max_tokens || 1024,
      messages: options.messages,
      tools: options.tools,
      stream: true,
    };

    // Call Grok API
    // ... existing API call code ...
  }
}
```

**Testable output:** Verify the provider correctly formats messages for the Grok API requirements.

## Phase 5: Testing and Validation

### ✅ Step 5.1: Unit Tests for Formatters (1 day)

```typescript
// In src/llm/provider/formatters/anthropic-formatter.test.ts
import { describe, it, expect } from 'vitest';
import { AnthropicFormatter } from './anthropic-formatter';
import { ConversationMessage } from '../../types';

describe('AnthropicFormatter', () => {
  it('correctly formats messages with tool use and results', () => {
    const formatter = new AnthropicFormatter();

    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: 'List the files in /tmp',
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
        role: 'tool',
        content: '{"files": ["file1.txt", "file2.txt"]}',
        timestamp: new Date(),
        isToolResult: true,
        toolId: 'tool_12345',
      },
    ];

    const formatted = formatter.formatMessages(messages);

    // Verify user message format
    expect(formatted[0]).toEqual({
      role: 'user',
      content: 'List the files in /tmp',
    });

    // Verify tool_use message format
    expect(formatted[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: "I'll help you list files.",
        },
        {
          type: 'tool_use',
          id: 'tool_12345',
          name: 'list_files',
          input: { path: '/tmp' },
        },
      ],
    });

    // Verify tool_result message format
    expect(formatted[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tool_12345',
          content: '{"files": ["file1.txt", "file2.txt"]}',
        },
      ],
    });
  });
});
```

Create similar test files for OpenAI and Grok formatters.

**Testable output:** All formatter unit tests should pass.

### ✅ Step 5.2: Integration Test for Tool Execution (1 day)

```typescript
// In src/llm/tool-execution.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from './session';
import { AnthropicProvider } from './provider/anthropic-provider';

// Mock Anthropic API response
vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_12345',
            name: 'list_files',
            input: { path: '/tmp' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    };
  },
}));

describe('Tool Execution', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
      apiKey: 'test-key',
    });

    // Register a test tool
    sessionManager.registerTool('list_files', async params => {
      return { files: ['file1.txt', 'file2.txt'] };
    });
  });

  it('successfully executes a tool with Anthropic provider', async () => {
    const sessionId = await sessionManager.createSession();

    // Send a message that will trigger tool use
    const stream = await sessionManager.sendMessageStream(
      sessionId,
      'List files in /tmp'
    );

    // Process the stream
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Verify tool execution
    const session = sessionManager.getSession(sessionId);

    // Check that the messages contain tool use and tool result
    const toolUseMsg = session.messages.find(m => m.hasTool);
    const toolResultMsg = session.messages.find(m => m.isToolResult);

    expect(toolUseMsg).toBeDefined();
    expect(toolResultMsg).toBeDefined();
    expect(toolUseMsg.toolId).toBe(toolResultMsg.toolId);
    expect(toolUseMsg.toolName).toBe('list_files');
    expect(JSON.parse(toolResultMsg.content)).toEqual({
      files: ['file1.txt', 'file2.txt'],
    });
  });
});
```

Create similar tests for OpenAI and Grok providers.

**Testable output:** All integration tests should pass, demonstrating successful tool execution with each provider.

## Implementation Progress Summary

### Completed Phases:

- ✅ Phase 1: Enhanced Message Storage and Tracking
- ✅ Phase 2: Provider-Specific Message Formatters
- ✅ Phase 3: Session Management Updates
- ✅ Phase 4: Provider Implementation Updates
- ✅ Phase 5: Testing and Validation

### Next Steps:

- Phase 6: Documentation and Release

We have successfully implemented the core functionality for the tool execution fix. The next steps involve comprehensive testing and documentation to ensure the solution is robust and well-documented.

## Phase 6: Documentation and Release

### Step 6.1: Update Provider Documentation (0.5 day)

Update readme provider-specific documentation to explain:

- Message formatting requirements for each provider
- Limitations and special considerations
- Best practices for tool execution

### Step 6.2: Update Tool Execution Guide (0.5 day)

Update Readme with a comprehensive guide on tool execution covering:

- Registering tools
- Handling tool results
- Provider-specific considerations
- Troubleshooting common issues

### Step 6.3: Update CHANGELOG and Release Notes (0.5 day)

Document the changes in the CHANGELOG.md file and prepare release notes highlighting:

- Fixed tool execution issues
- Enhanced message formatting for providers
- Improved debugging capabilities
- Any breaking changes
