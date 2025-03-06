# Tool Execution Fix Plan

## Problem Statement

The client_mcp library fails when executing tools with Anthropic's API after implementing multi-provider support. The specific error is:

```
BadRequestError: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.3: `tool_result` block(s) provided when previous message does not contain any `tool_use` blocks"}}
```

This indicates a mismatch in message formatting where tool_result blocks are not properly paired with tool_use blocks from previous messages.

## Goal

Fix the tool execution flow to maintain proper message sequence across providers, with emphasis on Anthropic's requirements, while ensuring compatibility with other providers.

## Implementation Plan

### Phase 1: Diagnosis & Analysis (1-2 days)

1. **Verify current behavior**

   - Create a test that reproduces the error with Anthropic
   - Log the exact message structure being sent to Anthropic
   - Compare with Anthropic's API documentation requirements

2. **Analyze other providers**
   - Test OpenAI tool execution with the same patterns
   - Test Grok tool execution if applicable
   - Document format requirements for each provider

### Phase 2: Core Fix Implementation (2-3 days)

1. **Fix message formatting for Anthropic**

   - Update `anthropic-provider.ts` to properly format tool_use and tool_result
   - Ensure consistent tool IDs between tool_use and tool_result blocks
   - Example change:

   ```typescript
   // When formatting messages for continuation
   if (msg.isToolResult) {
     // Find the corresponding tool_use message
     const toolUseMsg = session.messages.find(
       m => m.role === 'assistant' && m.toolId === msg.toolId
     );

     // Include both the tool_use and tool_result properly formatted
     return {
       role: 'assistant',
       content: [
         {
           type: 'tool_use',
           id: msg.toolId,
           name: toolUseMsg?.toolName || 'unknown_tool',
           input: toolUseMsg?.toolParameters || {},
         },
       ],
     };

     // Following message with tool_result
     // (Ensure this appears after the tool_use message)
     return {
       role: 'user',
       content: [
         {
           type: 'tool_result',
           tool_use_id: msg.toolId,
           content: msg.content,
         },
       ],
     };
   }
   ```

2. **Enhance message tracking**

   - Add `toolName` and `toolParameters` to message objects when storing tool calls
   - Ensure all tool calls have consistent, trackable IDs
   - Add a `previousToolId` reference for tool result messages

3. **Create provider-agnostic tool execution flow**
   - Abstract the tool execution sequence to handle provider differences
   - Implement provider-specific message formatters

### Phase 3: Testing & Validation (2 days)

1. **Unit tests**

   - Test tool execution format for Anthropic
   - Test tool execution format for OpenAI
   - Test cross-provider message conversion

2. **Integration tests**

   - Test complete tool execution flow with Anthropic
   - Test tool execution with provider switching
   - Test multiple sequential tool calls

3. **Edge cases**
   - Test error handling during tool execution
   - Test tool execution with large context windows
   - Test complex tool input/output scenarios

### Phase 4: Documentation & Release (1 day)

1. **Update documentation**

   - Document the proper message sequence for each provider
   - Add example code for tool execution patterns
   - Update troubleshooting guides

2. **Create release notes**
   - Document the fix for tool execution
   - Highlight any API changes users should be aware of
   - Provide migration notes if needed

## Specific Implementation Details

### Tool Message Structure

#### Anthropic Format

```typescript
// Tool use (from assistant)
{
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'Let me check the files for you.'
    },
    {
      type: 'tool_use',
      id: 'tool_1234567890',
      name: 'list_files',
      input: { path: '/some/directory' }
    }
  ]
}

// Tool result (from user)
{
  role: 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: 'tool_1234567890',
      content: '{"files": ["file1.txt", "file2.txt"]}'
    }
  ]
}
```

#### OpenAI Format

```typescript
// Tool use (from assistant)
{
  role: 'assistant',
  content: null,
  tool_calls: [
    {
      id: 'call_1234567890',
      type: 'function',
      function: {
        name: 'list_files',
        arguments: '{"path": "/some/directory"}'
      }
    }
  ]
}

// Tool result (from user)
{
  role: 'tool',
  content: '{"files": ["file1.txt", "file2.txt"]}',
  tool_call_id: 'call_1234567890'
}
```

## Implementation Priority

1. Fix Anthropic tool execution first (most urgent)
2. Verify and adjust OpenAI if needed
3. Check Grok implementation last (lowest usage)

## Success Criteria

- Tool execution works correctly with Anthropic
- All tests pass for each provider
- No regressions in other functionality
- Consistent developer experience across providers
