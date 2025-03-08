# LLM Package Refactoring: Phase 1 Implementation Plan

This document outlines the detailed implementation plan for Phase 1 of the LLM package refactoring, focusing on interface definitions and initial setup.

## Phase 1 Goals

1. Define interfaces for all major components
2. Set up dependency injection framework
3. Create scaffolding for new component implementation
4. Prepare tests for the new architecture

## Timeline: 1 Week

### Day 1-2: Interface Definitions

#### 1. Provider Management Interfaces

```typescript
// src/llm/provider/interfaces.ts

export interface ProviderManager {
  /**
   * Create a provider instance
   * @param providerType Type of provider (e.g., "anthropic", "openai")
   * @param config Provider configuration
   * @returns Promise resolving to the provider instance
   */
  createProvider(
    providerType: string,
    config: ProviderConfig
  ): Promise<LLMProviderInterface>;

  /**
   * Send a message to the provider
   * @param session Current session
   * @param message Message to send
   * @param options Provider options
   * @returns Promise resolving to the provider response
   */
  sendMessage(
    session: ChatSession,
    message: string,
    options?: MessageOptions
  ): Promise<LLMResponse>;

  /**
   * Stream a message to the provider
   * @param session Current session
   * @param message Message to send
   * @param options Provider options
   * @returns AsyncGenerator yielding response chunks
   */
  streamMessage(
    session: ChatSession,
    message: string,
    options?: MessageOptions
  ): AsyncGenerator<LLMResponseChunk>;

  /**
   * Switch the model for a session
   * @param session Current session
   * @param newProviderType New provider type
   * @param newModelId New model ID
   * @returns Promise resolving to the updated session
   */
  switchModel(
    session: ChatSession,
    newProviderType: string,
    newModelId: string
  ): Promise<ChatSession>;

  /**
   * Get available providers
   * @returns List of provider types
   */
  getAvailableProviders(): string[];

  /**
   * Get models for a provider
   * @param providerType Provider type
   * @returns List of model capabilities
   */
  getProviderModels(providerType: string): ModelCapability[];
}
```

#### 2. Tool Management Interfaces

```typescript
// src/llm/tools/interfaces.ts

export interface ToolManager {
  /**
   * Register a tool with the system
   * @param tool Tool to register
   */
  registerTool(tool: MCPTool): void;

  /**
   * Format tools for a specific provider
   * @param tools List of tools
   * @param providerType Provider type
   * @returns Formatted tools for the provider
   */
  formatTools(tools: MCPTool[], providerType: string): unknown[];

  /**
   * Process a tool call in a message
   * @param session Current session
   * @param message Message containing tool call
   * @returns Promise resolving to processed message
   */
  processToolCall(
    session: ChatSession,
    message: ChatMessage
  ): Promise<ChatMessage>;

  /**
   * Execute a tool with parameters
   * @param session Current session
   * @param toolName Name of the tool
   * @param parameters Tool parameters
   * @returns Promise resolving to tool result
   */
  executeTool(
    session: ChatSession,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<unknown>;

  /**
   * Check if tool call limit reached
   * @param session Current session
   * @returns Whether limit reached
   */
  isToolCallLimitReached(session: ChatSession): boolean;
}
```

#### 3. Context Management Interfaces

```typescript
// src/llm/context_management/interfaces.ts

export interface ContextManager {
  /**
   * Check if context optimization is needed
   * @param session Current session
   * @returns Whether optimization is needed
   */
  checkContext(session: ChatSession): boolean;

  /**
   * Update token metrics for session
   * @param session Current session
   * @returns Updated token metrics
   */
  updateMetrics(session: ChatSession): TokenMetrics;

  /**
   * Optimize context using selected strategy
   * @param session Current session
   * @returns Promise resolving to optimized session
   */
  optimizeContext(session: ChatSession): Promise<TokenMetrics>;

  /**
   * Get token usage for session
   * @param session Current session
   * @returns Token usage metrics
   */
  getTokenUsage(session: ChatSession): TokenMetrics;

  /**
   * Set context settings
   * @param session Current session
   * @param settings Context settings
   */
  setContextSettings(
    session: ChatSession,
    settings: Partial<ContextSettings>
  ): void;
}
```

#### 4. Server Management Interfaces

```typescript
// src/llm/server/interfaces.ts

export interface ServerManager {
  /**
   * Start a server
   * @param serverName Server name
   * @param config Server configuration
   * @returns Promise resolving to client
   */
  startServer(serverName: string, config: ServerConfig): Promise<Client>;

  /**
   * Stop a server
   * @param serverName Server name
   * @returns Promise resolving when server stopped
   */
  stopServer(serverName: string): Promise<void>;

  /**
   * Restart a server
   * @param serverName Server name
   * @returns Promise resolving to client
   */
  restartServer(serverName: string): Promise<Client>;

  /**
   * Stop all servers
   * @returns Promise resolving when all servers stopped
   */
  stopAll(): Promise<void>;

  /**
   * Register session servers
   * @param sessionId Session ID
   * @param serverNames Server names
   */
  registerSessionServers(sessionId: string, serverNames: string[]): void;

  /**
   * Release session servers
   * @param sessionId Session ID
   * @returns Promise resolving when servers released
   */
  releaseSessionServers(sessionId: string): Promise<void>;
}
```

#### 5. Message Router Interfaces

```typescript
// src/llm/message-router/interfaces.ts

export interface MessageRouter {
  /**
   * Route a message to the appropriate provider
   * @param session Current session
   * @param message Message to route
   * @returns Promise resolving to response
   */
  routeMessage(session: ChatSession, message: string): Promise<ChatMessage>;

  /**
   * Stream a message to the appropriate provider
   * @param session Current session
   * @param message Message to route
   * @returns AsyncGenerator yielding response chunks
   */
  streamMessage(
    session: ChatSession,
    message: string
  ): AsyncGenerator<{ type: string; content?: string; error?: string }>;

  /**
   * Create a continuation stream for a session
   * @param session Current session
   * @returns AsyncGenerator yielding response chunks
   */
  continuationStream(
    session: ChatSession
  ): AsyncGenerator<{ type: string; content?: string; error?: string }>;

  /**
   * Process a response including tool calls
   * @param session Current session
   * @param response Provider response
   * @returns Promise resolving to processed response
   */
  processResponse(
    session: ChatSession,
    response: ChatMessage
  ): Promise<ChatMessage>;
}
```

### Day 3: Dependency Injection Setup

#### 1. Dependency Container

```typescript
// src/llm/di/container.ts

import { ProviderManager } from '../provider/interfaces';
import { ToolManager } from '../tools/interfaces';
import { ContextManager } from '../context_management/interfaces';
import { ServerManager } from '../server/interfaces';
import { MessageRouter } from '../message-router/interfaces';

/**
 * Simple dependency injection container
 */
export class DIContainer {
  private static instance: DIContainer;
  private dependencies: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  /**
   * Register a dependency
   * @param key Dependency key
   * @param implementation Implementation
   */
  register<T>(key: string, implementation: T): void {
    this.dependencies.set(key, implementation);
  }

  /**
   * Get a dependency
   * @param key Dependency key
   * @returns Dependency implementation
   */
  get<T>(key: string): T {
    const implementation = this.dependencies.get(key);
    if (!implementation) {
      throw new Error(`Dependency ${key} not found`);
    }
    return implementation as T;
  }
}

/**
 * Keys for standard dependencies
 */
export const DI_KEYS = {
  PROVIDER_MANAGER: 'providerManager',
  TOOL_MANAGER: 'toolManager',
  CONTEXT_MANAGER: 'contextManager',
  SERVER_MANAGER: 'serverManager',
  MESSAGE_ROUTER: 'messageRouter',
};
```

#### 2. Unit Test for Container

```typescript
// src/llm/di/container.test.ts

import { DIContainer, DI_KEYS } from './container';

describe('DIContainer', () => {
  let container: DIContainer;

  beforeEach(() => {
    // Reset singleton instance for tests
    (DIContainer as any).instance = undefined;
    container = DIContainer.getInstance();
  });

  test('should register and retrieve dependencies', () => {
    const mockDependency = { test: 'value' };
    container.register('testKey', mockDependency);

    const retrieved = container.get('testKey');
    expect(retrieved).toBe(mockDependency);
  });

  test('should throw error when dependency not found', () => {
    expect(() => container.get('nonExistentKey')).toThrow();
  });

  test('should maintain singleton instance', () => {
    const instance1 = DIContainer.getInstance();
    const instance2 = DIContainer.getInstance();

    expect(instance1).toBe(instance2);
  });
});
```

### Day 4-5: Create Mock Implementations

#### 1. Mock Provider Manager

```typescript
// src/llm/provider/mock-provider-manager.ts

import { ProviderManager } from './interfaces';
import { LLMProviderInterface, ProviderConfig, MessageOptions } from './types';
import {
  ChatSession,
  LLMResponse,
  LLMResponseChunk,
  ModelCapability,
} from '../types';

/**
 * Mock implementation of ProviderManager for testing
 */
export class MockProviderManager implements ProviderManager {
  private providers: Map<string, LLMProviderInterface> = new Map();

  async createProvider(
    providerType: string,
    config: ProviderConfig
  ): Promise<LLMProviderInterface> {
    // Simple mock implementation
    const provider = {
      name: providerType,
      async initialize() {},
      async sendMessage() {
        return { content: `Mock response from ${providerType}` };
      },
      async *streamMessage() {
        yield { type: 'content', content: `Mock stream from ${providerType}` };
      },
      countTokens() {
        return 10;
      },
    } as any;

    this.providers.set(providerType, provider);
    return provider;
  }

  async sendMessage(
    session: ChatSession,
    message: string,
    options?: MessageOptions
  ): Promise<LLMResponse> {
    // Return mock response
    return {
      content: `Mock: ${message}`,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async *streamMessage(
    session: ChatSession,
    message: string,
    options?: MessageOptions
  ): AsyncGenerator<LLMResponseChunk> {
    // Yield mock chunks
    yield { type: 'content', content: `Mock stream: ${message} (part 1)` };
    yield { type: 'content', content: `Mock stream: ${message} (part 2)` };
    yield { type: 'done' };
  }

  async switchModel(
    session: ChatSession,
    newProviderType: string,
    newModelId: string
  ): Promise<ChatSession> {
    // Create shallow copy of session with updated model
    return {
      ...session,
      providerType: newProviderType,
      modelId: newModelId,
    };
  }

  getAvailableProviders(): string[] {
    return ['anthropic', 'openai', 'grok'];
  }

  getProviderModels(providerType: string): ModelCapability[] {
    return [
      {
        id: `${providerType}-model-1`,
        contextWindow: 16000,
        supportsFunctions: true,
        supportsImages: false,
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
      },
    ];
  }
}
```

#### 2. Similarly create mock implementations for other components:

- MockToolManager
- MockContextManager
- MockServerManager
- MockMessageRouter

### Day 6-7: SessionManager Refactoring Preparation

#### 1. Add DI to SessionManager

```typescript
// src/llm/session.ts

// Import interfaces
import { ProviderManager } from './provider/interfaces';
import { ToolManager } from './tools/interfaces';
import { ContextManager } from './context_management/interfaces';
import { ServerManager } from './server/interfaces';
import { MessageRouter } from './message-router/interfaces';
import { DIContainer, DI_KEYS } from './di/container';

// Keep existing SessionManager class but add constructor with dependencies
export class SessionManager {
  // Existing properties
  private anthropic!: Anthropic;
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;
  private useSharedServers: boolean;
  private sessionStorage: SessionStorage | null = null;
  private providerAdapter = new ProviderAdapter();

  // New DI properties
  private providerManager: ProviderManager;
  private toolManager: ToolManager;
  private contextManager: ContextManager;
  private serverManager: ServerManager;
  private messageRouter: MessageRouter;

  constructor(
    optionsOrStorage?: { useSharedServers?: boolean } | SessionStorage,
    options?: { useSharedServers?: boolean },
    // New DI parameters with defaults from container
    providerManager?: ProviderManager,
    toolManager?: ToolManager,
    contextManager?: ContextManager,
    serverManager?: ServerManager,
    messageRouter?: MessageRouter
  ) {
    // Existing constructor logic
    this.serverLauncher = new ServerLauncher();
    this.serverDiscovery = new ServerDiscovery();

    // Handle different parameter patterns for backward compatibility
    if (optionsOrStorage && 'storeSession' in optionsOrStorage) {
      // First parameter is SessionStorage
      this.sessionStorage = optionsOrStorage;
      this.useSharedServers = options?.useSharedServers ?? false;
    } else {
      // First parameter is options object (or undefined)
      this.sessionStorage = null;
      this.useSharedServers =
        (optionsOrStorage as { useSharedServers?: boolean } | undefined)
          ?.useSharedServers ?? false;
    }

    // Initialize dependencies from DI container if not provided
    const container = DIContainer.getInstance();
    this.providerManager =
      providerManager ||
      container.get<ProviderManager>(DI_KEYS.PROVIDER_MANAGER);
    this.toolManager =
      toolManager || container.get<ToolManager>(DI_KEYS.TOOL_MANAGER);
    this.contextManager =
      contextManager || container.get<ContextManager>(DI_KEYS.CONTEXT_MANAGER);
    this.serverManager =
      serverManager || container.get<ServerManager>(DI_KEYS.SERVER_MANAGER);
    this.messageRouter =
      messageRouter || container.get<MessageRouter>(DI_KEYS.MESSAGE_ROUTER);
  }

  // Rest of the class remains unchanged for now
  // We'll refactor methods in later phases
}
```

#### 2. Initial Entry Point for New Architecture

```typescript
// src/llm/modern-session.ts

import { ProviderManager } from './provider/interfaces';
import { ToolManager } from './tools/interfaces';
import { ContextManager } from './context_management/interfaces';
import { ServerManager } from './server/interfaces';
import { MessageRouter } from './message-router/interfaces';
import { DIContainer, DI_KEYS } from './di/container';
import { ChatSession, LLMConfig } from './types';
import { SessionStorage } from './storage';

/**
 * Modern implementation of SessionManager using the new architecture
 * This will initially be used alongside the legacy implementation
 */
export class ModernSessionManager {
  private sessions: Map<string, ChatSession> = new Map();
  private sessionStorage: SessionStorage | null;

  constructor(
    private providerManager: ProviderManager,
    private toolManager: ToolManager,
    private contextManager: ContextManager,
    private serverManager: ServerManager,
    private messageRouter: MessageRouter,
    sessionStorage: SessionStorage | null = null
  ) {
    this.sessionStorage = sessionStorage;
  }

  /**
   * Static factory method for creating an instance with DI
   */
  static create(
    sessionStorage: SessionStorage | null = null
  ): ModernSessionManager {
    const container = DIContainer.getInstance();

    return new ModernSessionManager(
      container.get<ProviderManager>(DI_KEYS.PROVIDER_MANAGER),
      container.get<ToolManager>(DI_KEYS.TOOL_MANAGER),
      container.get<ContextManager>(DI_KEYS.CONTEXT_MANAGER),
      container.get<ServerManager>(DI_KEYS.SERVER_MANAGER),
      container.get<MessageRouter>(DI_KEYS.MESSAGE_ROUTER),
      sessionStorage
    );
  }

  // Implement core methods as skeleton - these will be fleshed out later

  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    // Placeholder implementation
    throw new Error('Not implemented yet');
  }

  getSession(sessionId: string): ChatSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  async sendMessage(sessionId: string, message: string): Promise<any> {
    const session = this.getSession(sessionId);
    return this.messageRouter.routeMessage(session, message);
  }

  async *sendMessageStream(
    sessionId: string,
    message: string
  ): AsyncGenerator<any> {
    const session = this.getSession(sessionId);
    yield* this.messageRouter.streamMessage(session, message);
  }

  async cleanup(): Promise<void> {
    // Release resources
    await this.serverManager.stopAll();
    this.sessions.clear();
  }
}
```

#### 3. Registration Setup

```typescript
// src/llm/register-components.ts

import { DIContainer, DI_KEYS } from './di/container';
import { MockProviderManager } from './provider/mock-provider-manager';
import { MockToolManager } from './tools/mock-tool-manager';
import { MockContextManager } from './context_management/mock-context-manager';
import { MockServerManager } from './server/mock-server-manager';
import { MockMessageRouter } from './message-router/mock-message-router';

/**
 * Register mock implementations for testing
 */
export function registerMockComponents(): void {
  const container = DIContainer.getInstance();

  container.register(DI_KEYS.PROVIDER_MANAGER, new MockProviderManager());
  container.register(DI_KEYS.TOOL_MANAGER, new MockToolManager());
  container.register(DI_KEYS.CONTEXT_MANAGER, new MockContextManager());
  container.register(DI_KEYS.SERVER_MANAGER, new MockServerManager());
  container.register(DI_KEYS.MESSAGE_ROUTER, new MockMessageRouter());
}

/**
 * This will later be updated to register real implementations
 */
export function registerComponents(): void {
  // For now, just use mocks
  registerMockComponents();
}
```

## Testing Plan

1. **Unit Tests for Interfaces**

   - Create tests to validate that mock implementations correctly implement interfaces
   - Test that interfaces cover required functionality

2. **DI Container Tests**

   - Test singleton behavior
   - Test dependency registration and retrieval

3. **Modern SessionManager Tests**

   - Test that dependencies are correctly injected
   - Test that the factory method works properly

4. **Integration Tests**
   - Test that mock components can be used together
   - Test basic workflow with mock implementation

## Phase 1 Deliverables

1. Interface definitions for all components
2. Dependency injection framework
3. Mock implementations of all interfaces
4. Modern SessionManager scaffold with DI
5. Tests for all new components

## Next Steps for Phase 2

1. Implement the first real component (likely TokenCounter and ContextManager)
2. Begin extracting functionality from legacy SessionManager
3. Create adapter to maintain backward compatibility
4. Update tests to use real implementations
