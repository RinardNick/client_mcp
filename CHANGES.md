# Changes

## 1.4.0 - Tool Capability Management

### Changes

- Added `ToolCapabilityManager` class for handling differences in tool capabilities between providers
- Implemented detection of incompatible tool features between providers
- Added automatic simplification of complex tools to work with limited providers
- Implemented migration planning when moving tools between providers with different capabilities

### Implementation Details

- Created `src/llm/tool-capability-manager.ts` with the `ToolCapabilityManager` class
- Added comprehensive test suite in `src/llm/tool-capability-manager.test.ts`
- Implemented capability profiles for Anthropic, OpenAI, and Grok providers
- Added support for custom capability checks and provider definitions
- Created simplification mechanisms that maintain tool functionality when possible
- Implemented migration planning with actionable recommendations

### How to Verify

```typescript
import { ToolCapabilityManager, MCPTool } from '@rinardnick/client_mcp';

// Create a capability manager
const capabilityManager = new ToolCapabilityManager();

// Check tool compatibility with a provider
const compatibility = capabilityManager.checkToolSupport(complexTool, 'grok');
if (!compatibility.supported) {
  console.log('Incompatible features detected');
}

// Simplify a tool for a provider with limitations
const simplifiedTool = capabilityManager.simplifyToolForProvider(
  complexTool,
  'limited_provider'
);

// Create a migration plan when switching providers
const migrationPlan = capabilityManager.createToolMigrationPlan(
  tools,
  'anthropic',
  'openai'
);
```

### Next Steps

- Integrate the capability manager with the session manager
- Add automatic tool adaptation during model switching
- Create UI components to display compatibility warnings
- Implement best practices documentation for multi-provider tools

## 1.3.0 - Tool Format Normalization

### Changes

- Added `ToolAdapter` class for normalizing tool formats between different LLM providers
- Implemented automatic conversion of tools to provider-specific formats
- Added bidirectional conversion between provider formats and canonical format
- Support for registering custom provider adapters

### Implementation Details

- Created `src/llm/tool-adapter.ts` with the `ToolAdapter` class
- Added comprehensive test suite in `src/llm/tool-adapter.test.ts`
- Implemented adapters for Anthropic, OpenAI, and Grok providers
- Created standardized parsing for tool calls from different providers

### How to Verify

```typescript
import { ToolAdapter, MCPTool } from '@rinardnick/client_mcp';

// Create a tool adapter
const toolAdapter = new ToolAdapter();

// Define a tool in canonical format
const weatherTool: MCPTool = {
  name: 'get_weather',
  description: 'Get weather information',
  inputSchema: {
    type: 'object',
    properties: {
      location: { type: 'string' },
    },
  },
};

// Convert to different provider formats
const anthropicTool = toolAdapter.adaptToolForProvider(
  weatherTool,
  'anthropic'
);
const openaiTool = toolAdapter.adaptToolForProvider(weatherTool, 'openai');

// Parse tool calls
const toolCall = toolAdapter.parseToolCallFromProvider(response, 'anthropic');
```

### Next Steps

- Integrate the tool adapter with the session manager
- Add automatic tool format conversion during model switching
- Provide graceful fallbacks for provider-specific features

## 1.2.0 - Provider Compatibility Checker

### Changes

- Added `ProviderCompatibilityChecker` for analyzing compatibility between different LLM providers
- Implemented compatibility detection for context window size, tool handling, and vision capabilities
- Added migration plan generation with token impact analysis and recommendations
- Support for custom compatibility checks for specific provider combinations

### Implementation Details

- Created `src/llm/provider-compatibility.ts` with the `ProviderCompatibilityChecker` class
- Added comprehensive test suite in `src/llm/provider-compatibility.test.ts`
- Integrated with the existing model registry for capability-based compatibility analysis
- Implemented severity-based issue reporting (ERROR, WARNING, INFO)

### How to Verify

```typescript
import { ProviderCompatibilityChecker } from '@rinardnick/client_mcp';

// Create a compatibility checker
const compatibilityChecker = new ProviderCompatibilityChecker();

// Check compatibility between providers/models
const compatibility = compatibilityChecker.checkCompatibility(
  { provider: 'anthropic', modelId: 'claude-3-opus-20240229' },
  { provider: 'openai', modelId: 'gpt-4o' }
);

console.log(`Found ${compatibility.issues.length} compatibility issues`);

// Generate a migration plan
const migrationPlan = compatibilityChecker.getMigrationPlan(
  { provider: 'anthropic', modelId: 'claude-3-opus-20240229' },
  { provider: 'openai', modelId: 'gpt-4o' },
  { currentTokenCount: 15000 }
);

console.log(`Migration impact: ${migrationPlan.tokenImpact} tokens`);
```

### Next Steps

- Use the compatibility checker when switching models in a session
- Add UI components to display compatibility warnings
- Implement automatic migration recommendations in the session manager

## 1.1.2 - Tool Continuation Fix

## Summary of Changes

We've fixed an issue where the conversation would stop after tool execution, leading to a `done` event without further responses from the LLM.

## Implementation Details

1. Modified the `sendMessageStream` method in `src/llm/session.ts` to:

   - Track the state of tool execution within the conversation flow
   - Set the `tool_result` flag for tool result messages
   - Ensure conversation history correctly includes tool results
   - Make appropriate API calls to continue the conversation after tool execution

2. Added comprehensive unit tests in `src/llm/__tests__/tool-continuation.test.ts` to verify:

   - Tool execution and continuation in streaming mode
   - Legacy format tool calls with `<tool>` tags in streaming mode
   - Proper event sequence: tool_start → tool_result → content → done

3. Created a verification script (`verify-tool-continuation.sh`) to build and test the fix

4. Updated documentation:
   - Added implementation notes in IMPLEMENTATION_NOTES.md
   - Updated README.md with information about the tool continuation feature
   - Created this CHANGES.md file to document the changes

## How to Verify

Run the verification script:

```bash
./verify-tool-continuation.sh
```

The script builds the project and runs the unit tests, confirming that the tool continuation issue is resolved.

## Next Steps

1. This fix is ready to be released in version 1.1.2
2. Users should update to this version for proper tool continuation behavior
3. No further changes are required for this specific fix
