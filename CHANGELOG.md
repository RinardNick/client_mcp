# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Multi-Provider Support**: Added support for multiple LLM providers (Anthropic, OpenAI, Grok)

  - New configuration format supporting multiple providers in a single config
  - Backward compatibility with legacy configuration format
  - Provider-specific configuration options
  - Provider fallback chains for resilience

- **Provider Management API**: Added methods to manage and interact with multiple providers

  - `getAvailableProviders()`: Get a list of all supported providers
  - `getProviderModels(provider)`: Get all models for a specific provider
  - `getSupportedFeatures(provider, modelId)`: Get features supported by a specific model
  - `estimateCosts(sessionId, provider, modelId)`: Estimate costs for using a specific model

- **Model Switching**: Added ability to switch between providers and models during a session

  - `switchSessionModel(sessionId, provider, modelId, options)`: Switch to a different provider/model
  - Conversation continuity across provider switches
  - Context adaptation for different model capabilities

- **Tool Handling Across Providers**: Added support for using tools with different providers
  - Tool format normalization between providers
  - Capability-aware tool adaptation
  - Graceful degradation for unsupported features

### Changed

- Updated configuration system to support multiple providers while maintaining backward compatibility
- Enhanced session state to track provider-specific information
- Improved token management to handle different provider token counting methods

## [1.2.1] - 2024-07-04

### Fixed

- Fixed OpenAI provider compatibility issue with latest SDK versions
  - Updated stream handling to support different OpenAI SDK implementations
  - Added proper type annotations and runtime checks for better compatibility
  - Improved error handling during streaming operations

## [1.2.0] - Provider Compatibility Checker

### Added

- **Provider Compatibility Checker**: Added `ProviderCompatibilityChecker` for analyzing compatibility between different LLM providers
  - Compatibility detection for context window size, tool handling, and vision capabilities
  - Migration plan generation with token impact analysis and recommendations
  - Support for custom compatibility checks for specific provider combinations
  - Severity-based issue reporting (ERROR, WARNING, INFO)

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

## [1.1.2] - Tool Continuation Fix

### Fixed

- Fixed an issue where the conversation would stop after tool execution, leading to a `done` event without further responses from the LLM
  - Modified the `sendMessageStream` method to track the state of tool execution within the conversation flow
  - Properly sets the `tool_result` flag for tool result messages
  - Ensures conversation history correctly includes tool results
  - Makes appropriate API calls to continue the conversation after tool execution

### Added

- Added comprehensive unit tests to verify:
  - Tool execution and continuation in streaming mode
  - Legacy format tool calls with `<tool>` tags in streaming mode
  - Proper event sequence: tool_start → tool_result → content → done
