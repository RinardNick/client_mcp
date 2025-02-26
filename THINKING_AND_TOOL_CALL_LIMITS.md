# Thinking and Tool Call Limits Enhancement Plan

## Overview

This document outlines the plan to enhance the MCP client with two new features:

1. **Max Tool Call Limits**: Allow host applications to specify the maximum number of tool calls per message or session
2. **Thinking Functionality**: Leverage Claude 3.7+'s thinking feature for improved tool reasoning and execution

## Technical Implementation

### 1. Max Tool Call Limits Configuration

#### Config Updates
- Add `max_tool_calls` property to the `LLMConfig` interface
- Support both per-message and per-session limits

```typescript
interface LLMConfig {
  // Existing properties
  type: string;
  api_key: string;
  model: string;
  system_prompt: string;
  servers?: Record<string, ServerConfig>;
  
  // New properties
  max_tool_calls?: {
    per_message?: number; // Max tool calls allowed per message
    per_session?: number; // Max tool calls allowed for entire session lifetime
  } | number; // Shorthand for per_message limit
}
```

#### Session Store Updates
- Track tool call count in session data
- Add validation logic before executing tools

```typescript
interface SessionData {
  // Existing properties
  id: string;
  llmConfig: LLMConfig;
  messages: ChatMessage[];
  lastActivity: Date;
  
  // New properties
  toolCallCount: number; // Total tool calls made in this session
}
```

#### Tool Execution Control
- Implement guard clause in tool execution logic
- Return appropriate errors when limits are exceeded

```typescript
// Pseudo-code for tool execution with limits
async function executeToolWithLimits(sessionId: string, toolName: string, params: any) {
  const session = sessionStore.get(sessionId);
  
  // Check per-message limit
  const currentMessageToolCalls = getCurrentMessageToolCallCount(session);
  if (session.llmConfig.max_tool_calls?.per_message && 
      currentMessageToolCalls >= session.llmConfig.max_tool_calls.per_message) {
    throw new Error('Tool call limit exceeded for this message');
  }
  
  // Check per-session limit
  if (session.llmConfig.max_tool_calls?.per_session && 
      session.toolCallCount >= session.llmConfig.max_tool_calls.per_session) {
    throw new Error('Tool call limit exceeded for this session');
  }
  
  // Execute tool and increment counters
  const result = await executeTool(sessionId, toolName, params);
  session.toolCallCount++;
  updateCurrentMessageToolCallCount(session);
  
  return result;
}
```

### 2. Thinking Functionality

#### Model Version Detection
- Add utility to detect if model supports thinking
- Update model string parsing logic

```typescript
function supportsThinking(model: string): boolean {
  // Check if model is Claude 3.7 or higher
  const modelMatch = model.match(/claude-(\d+)\.(\d+)/i);
  if (!modelMatch) return false;
  
  const majorVersion = parseInt(modelMatch[1], 10);
  const minorVersion = parseInt(modelMatch[2], 10);
  
  // Claude 3.7 or higher supports thinking
  return (majorVersion > 3) || (majorVersion === 3 && minorVersion >= 7);
}
```

#### LLM API Integration
- Update Anthropic API calls to include thinking parameter
- Configure default token budget for thinking

```typescript
// Pseudo-code for creating message with thinking
async function createMessage(session: SessionData, userMessage: string) {
  const anthropicParams: any = {
    model: session.llmConfig.model,
    messages: formatMessages(session.messages, userMessage),
    // ... other existing parameters
  };
  
  // Add thinking if supported by model
  if (supportsThinking(session.llmConfig.model)) {
    anthropicParams.thinking = {
      type: "enabled",
      budget_tokens: calculateThinkingBudget(session.llmConfig)
    };
  }
  
  return await anthropicClient.messages.create(anthropicParams);
}

function calculateThinkingBudget(config: LLMConfig): number {
  // Default to 1/3 of model's context window, 
  // or use explicit config if provided
  return config.thinking_budget || getDefaultThinkingBudget(config.model);
}
```

#### Streaming Updates
- Add 'thinking' event type to streaming output
- Pipe thinking content to host application

```typescript
// Add to existing MessageStream type
type MessageStreamChunk = 
  | { type: 'thinking'; content: string }  // New type
  | { type: 'tool_start'; content: string }
  | { type: 'tool_result'; content: string }
  | { type: 'content'; content: string }
  | { type: 'error'; error: string }
  | { type: 'done' };
```

#### Config Interface Update
- Add thinking configuration options

```typescript
interface LLMConfig {
  // Existing properties
  
  // New thinking configuration
  thinking?: {
    enabled?: boolean; // Default to true for supported models
    budget_tokens?: number; // Override default token budget
  };
}
```

## Implementation Plan

1. **Phase 1: Config Schema Updates**
   - Update config interfaces and validation
   - Add model version detection utilities
   - Add documentation for new config options

2. **Phase 2: Session Store Enhancements**
   - Implement tool call counting
   - Add limit validation logic
   - Update session data structure

3. **Phase 3: Anthropic API Integration**
   - Update message creation with thinking parameter
   - Implement thinking content extraction
   - Add streaming support for thinking content

4. **Phase 4: Testing**
   - Test max tool call limits
   - Test thinking with Claude 3.7+
   - Test backward compatibility
   - Performance testing

5. **Phase 5: Documentation & Examples**
   - Update API documentation
   - Add examples for new features
   - Update integration guide

## Host Integration Example

```typescript
// Example host configuration
const config = {
  type: 'claude',
  api_key: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-7-sonnet-20250219',
  system_prompt: 'You are a helpful assistant with access to tools.',
  
  // Tool call limits
  max_tool_calls: {
    per_message: 3,  // Max 3 tool calls per message
    per_session: 20  // Max 20 tool calls for entire session
  },
  
  // Thinking configuration
  thinking: {
    enabled: true,
    budget_tokens: 8000 // Optional: override default budget
  },
  
  // Server configurations
  servers: {
    // ...
  }
};

// Using new features in the host application
const sessionManager = new SessionManager();
const session = await sessionManager.initializeSession(config);

// Streaming with thinking support
const stream = sessionManager.sendMessageStream(
  session.id,
  'Analyze this complex data and tell me what actions to take'
);

for await (const chunk of stream) {
  switch (chunk.type) {
    case 'thinking':
      // Display thinking process to user (new)
      console.log('Assistant is thinking:', chunk.content);
      break;
    // Handle other chunk types...
  }
}
```

## Error Handling

### Tool Call Limit Errors
- Provide clear error messages to host application
- Stream error as part of normal response flow
- Consider fallback options (e.g., continue without tools)

### Backward Compatibility
- Ensure proper fallback for older models
- Handle case where thinking is configured but not supported

## Testing Strategy

1. **Unit Tests**
   - Test model version detection
   - Test limit validation logic
   - Test thinking parameter generation

2. **Integration Tests**
   - Test with actual Claude 3.7+ model
   - Test tool call limits enforcement
   - Test streaming of thinking content

3. **Performance Tests**
   - Measure impact of thinking on response time
   - Test with high tool call counts

## Future Enhancements

1. **Tool Call Budget Management**
   - Implement more sophisticated tool call budgeting
   - Allow prioritization of critical tools
   
2. **Thinking Content Analysis**
   - Provide insights based on thinking content
   - Extract structured reasoning data

3. **Adaptive Limits**
   - Adjust tool call limits based on session history
   - Implement rate limiting for high-frequency tools