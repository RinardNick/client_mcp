# SessionManager Refactoring Plan

## Current SessionManager Analysis

The `SessionManager` class in `session.ts` is currently a monolithic class with approximately 3,000 lines of code. It handles multiple responsibilities that should be delegated to specialized components:

### Current Responsibilities

1. **Session Lifecycle Management**

   - Creation and initialization of sessions
   - Retrieval and storage of sessions
   - Cleanup and termination of sessions

2. **Provider Interaction**

   - Initializing provider-specific clients
   - Converting between provider message formats
   - Managing provider-specific data and metadata
   - Switching between different models and providers

3. **Tool Management**

   - Formatting tools for different LLMs
   - Executing tools based on LLM requests
   - Processing tool calls in messages
   - Managing tool call limits and validation

4. **Context Management**

   - Token counting and optimization
   - Context window management
   - Implementing different truncation strategies
   - Message summarization and pruning

5. **Server Management**
   - Launching and managing MCP servers
   - Server discovery and connection
   - Managing server clients

## Key Methods to Refactor

The following methods in `SessionManager` should be extracted to specialized components:

### Provider-Related Methods

- `switchSessionModel`
- `storeProviderData`/`getProviderData`
- `getAvailableProviders`
- `getProviderModels`
- `getSupportedFeatures`
- `estimateCosts`

### Tool-Related Methods

- `formatToolsForLLM`
- `mapToolName`
- `executeTool`
- `processToolCall`
- `handleToolCallLimit`
- `executeToolAndAddResult`

### Context Management Methods

- `optimizeContext`
- `truncateBySummarization`
- `truncateByRelevance`
- `truncateOldestMessages`
- `getModelContextLimit`
- `updateTokenMetrics`
- `getSessionTokenUsage`
- `getTokenCostEstimate`
- `getCostSavingsReport`
- `setContextSettings`
- `getSummarizationStatus`

## Proposed New Components

### 1. ProviderManager

```typescript
// src/llm/provider/provider-manager.ts
import { LLMProviderInterface, ProviderConfig } from './types';
import { LLMProviderFactory } from './factory';
import { ChatSession, LLMConfig } from '../types';

export interface ProviderManager {
  getProvider(
    providerType: string,
    config: ProviderConfig
  ): Promise<LLMProviderInterface>;
  switchSessionModel(
    session: ChatSession,
    providerType: string,
    modelId: string,
    options: any
  ): Promise<ChatSession>;
  getAvailableProviders(): string[];
  getProviderModels(provider: string): any[];
  getSupportedFeatures(provider: string, modelId: string): any;
  estimateCosts(session: ChatSession, provider: string, modelId: string): any;
}

export class DefaultProviderManager implements ProviderManager {
  private providerFactory: typeof LLMProviderFactory;

  constructor(providerFactory = LLMProviderFactory) {
    this.providerFactory = providerFactory;
  }

  async getProvider(
    providerType: string,
    config: ProviderConfig
  ): Promise<LLMProviderInterface> {
    return this.providerFactory.getProvider(providerType, config);
  }

  // Implementation of the other methods...
}
```

### 2. ToolManager

```typescript
// src/llm/tools/tool-manager.ts
import { MCPTool, ChatSession, ChatMessage, ToolCall } from '../types';

export interface ToolManager {
  formatToolsForProvider(tools: MCPTool[], providerType: string): any[];
  executeTool(
    session: ChatSession,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<unknown>;
  processToolCall(
    session: ChatSession,
    message: ChatMessage
  ): Promise<ChatMessage>;
  isToolCallLimitReached(session: ChatSession): boolean;
}

export class DefaultToolManager implements ToolManager {
  private toolAdapter: any;

  constructor(toolAdapter: any) {
    this.toolAdapter = toolAdapter;
  }

  // Implementation of methods...
}
```

### 3. ContextManager

```typescript
// src/llm/context_management/context-manager.ts
import {
  ChatSession,
  TokenMetrics,
  ContextSettings,
  SummarizationMetrics,
} from '../types';

export interface ContextManager {
  optimizeContext(session: ChatSession): Promise<TokenMetrics>;
  truncateMessages(
    session: ChatSession,
    strategy: string,
    targetTokens?: number
  ): Promise<ChatMessage[]>;
  updateTokenMetrics(session: ChatSession): TokenMetrics;
  getContextLimit(modelId: string): number;
  setContextSettings(
    session: ChatSession,
    settings: Partial<ContextSettings>
  ): void;
  getSummarizationStatus(session: ChatSession): SummarizationMetrics;
}

export class DefaultContextManager implements ContextManager {
  // Implementation of methods...
}
```

### 4. MessageRouter

```typescript
// src/llm/message-router.ts
import { ChatSession, ChatMessage } from './types';
import { ProviderManager } from './provider/provider-manager';
import { ToolManager } from './tools/tool-manager';

export interface MessageRouter {
  sendMessage(session: ChatSession, message: string): Promise<ChatMessage>;
  sendMessageStream(
    session: ChatSession,
    message: string
  ): AsyncGenerator<{ type: string; content?: string; error?: string }>;
  createContinuationStream(
    session: ChatSession
  ): AsyncGenerator<{ type: string; content?: string; error?: string }>;
}

export class DefaultMessageRouter implements MessageRouter {
  private providerManager: ProviderManager;
  private toolManager: ToolManager;

  constructor(providerManager: ProviderManager, toolManager: ToolManager) {
    this.providerManager = providerManager;
    this.toolManager = toolManager;
  }

  // Implementation of methods...
}
```

### 5. Refined SessionManager

```typescript
// src/llm/session.ts
import { ChatSession, LLMConfig } from './types';
import { ProviderManager } from './provider/provider-manager';
import { ToolManager } from './tools/tool-manager';
import { ContextManager } from './context_management/context-manager';
import { MessageRouter } from './message-router';
import { SessionStorage } from './storage';

export class SessionManager {
  private sessions: Map<string, ChatSession>;
  private sessionStorage: SessionStorage | null;
  private providerManager: ProviderManager;
  private toolManager: ToolManager;
  private contextManager: ContextManager;
  private messageRouter: MessageRouter;

  constructor(
    providerManager: ProviderManager,
    toolManager: ToolManager,
    contextManager: ContextManager,
    messageRouter: MessageRouter,
    sessionStorage: SessionStorage | null = null
  ) {
    this.sessions = new Map();
    this.sessionStorage = sessionStorage;
    this.providerManager = providerManager;
    this.toolManager = toolManager;
    this.contextManager = contextManager;
    this.messageRouter = messageRouter;
  }

  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    // Core session initialization logic
    // Delegate to specialized managers for specific operations
  }

  getSession(sessionId: string): ChatSession {
    // Session retrieval logic
  }

  // Other core session management methods...

  // Public API methods that delegate to specialized managers
  async sendMessage(sessionId: string, message: string): Promise<ChatMessage> {
    const session = this.getSession(sessionId);
    return this.messageRouter.sendMessage(session, message);
  }

  async *sendMessageStream(sessionId: string, message: string) {
    const session = this.getSession(sessionId);
    yield* this.messageRouter.sendMessageStream(session, message);
  }

  // Additional delegation methods...
}
```

## Phase-By-Phase Refactoring Approach

### Phase 1: Preparation

1. **Create Interfaces**

   - Define clear interfaces for each component
   - Ensure all methods have proper JSDoc documentation
   - Add unit tests for interfaces

2. **Setup Dependency Injection Framework**
   - Choose a lightweight DI approach (functions or simple container)
   - Update SessionManager constructor to accept dependencies

### Phase 2: Extract Provider Management

1. **Create ProviderManager Implementation**

   - Move provider-related methods from SessionManager
   - Create unit tests for the new component

2. **Update SessionManager**
   - Replace direct provider operations with ProviderManager calls
   - Update existing tests to use the new structure

### Phase 3: Extract Tool Management

1. **Create ToolManager Implementation**

   - Move tool-related methods from SessionManager
   - Create unit tests for the new component

2. **Update SessionManager**
   - Replace direct tool operations with ToolManager calls
   - Update existing tests

### Phase 4: Extract Context Management

1. **Create ContextManager Implementation**

   - Move context-related methods from SessionManager
   - Create unit tests for the new component

2. **Update SessionManager**
   - Replace direct context operations with ContextManager calls
   - Update existing tests

### Phase 5: Create MessageRouter

1. **Create MessageRouter Implementation**

   - Move message routing logic from SessionManager
   - Create unit tests for the new component

2. **Update SessionManager**
   - Replace direct message operations with MessageRouter calls
   - Update existing tests

### Phase 6: Cleanup and Documentation

1. **Remove Duplication**

   - Identify and remove any remaining duplicated code
   - Ensure all components follow consistent patterns

2. **Update Documentation**
   - Add component diagrams
   - Update API documentation
   - Add developer guidelines for new components

## Testing Strategy

1. **Unit Tests for Each Component**

   - Test each component in isolation
   - Use mocks for dependencies

2. **Integration Tests**

   - Test components working together
   - Ensure correct delegation between components

3. **Regression Tests**
   - Compare behavior before and after refactoring
   - Verify that refactored code produces identical results

## Backward Compatibility

To maintain backward compatibility during the refactoring process:

1. **Keep Public API Unchanged**

   - All public methods in SessionManager should remain available
   - Internal implementation changes should be transparent to users

2. **Use Facade Pattern If Needed**

   - If API changes are inevitable, implement a facade for backward compatibility
   - Deprecate old methods gradually

3. **Feature Flags**
   - Consider using feature flags to toggle between old and new implementations
   - Allow gradual adoption of the new architecture

## Success Metrics

The refactoring will be considered successful when:

1. Each component has a clear, single responsibility
2. The SessionManager class is reduced to core session management logic
3. All tests pass with the new architecture
4. Code maintainability metrics improve (e.g., cyclomatic complexity)
5. No regression in functionality or performance
