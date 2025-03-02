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

### Fixed

- Fixed issues with context window adaptation when switching between models with different limits
