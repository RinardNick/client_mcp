# LLM Architecture Comparison: Component-Based vs. Domain-Driven

This document compares two architectural approaches for the LLM package: the original component-based architecture and the refined domain-driven architecture.

## Visual Comparison

### Original Component-Based Architecture

```mermaid
graph TD
    %% Central hub pattern with direct component dependencies
    Client[Client Application] --> SessionManager

    %% Core components with direct references
    SessionManager --> ProviderManager
    SessionManager --> ToolManager
    SessionManager --> ContextManager
    SessionManager --> ServerManager
    SessionManager --> MessageRouter

    %% Cross-component dependencies
    MessageRouter --> ProviderManager
    MessageRouter --> ToolManager
    MessageRouter --> ContextManager

    %% Circular dependency example
    SummarizationService --> ProviderManager
    ContextManager --> SummarizationService

    %% Component internals omitted for clarity

    %% Styling
    classDef core fill:#f96,stroke:#333,stroke-width:2px
    classDef component fill:#bbf,stroke:#333,stroke-width:1px

    %% Apply classes
    class SessionManager core
    class ProviderManager,ToolManager,ContextManager,ServerManager,MessageRouter,SummarizationService component
```

### Refined Domain-Driven Architecture

```mermaid
graph TD
    %% Client interactions
    Client[Client Application] --> SessionManager

    %% Infrastructure components
    CommandBus([Command Bus])
    EventBus([Event Bus])
    SessionState[(Session State Repository)]

    %% Domain groups
    subgraph SessionDomain[Session Domain]
        SessionManager
    end

    subgraph MessageDomain[Message Domain]
        MessageRouter
    end

    subgraph ProviderDomain[Provider Domain]
        ProviderManager
    end

    subgraph ToolDomain[Tool Domain]
        ToolManager
    end

    subgraph ContextDomain[Context Domain]
        ContextManager
        SummarizationService
    end

    subgraph ServerDomain[Server Domain]
        ServerManager
    end

    %% Command/Event interactions instead of direct dependencies
    SessionManager --> CommandBus
    CommandBus --> MessageRouter
    CommandBus --> ProviderManager
    CommandBus --> ToolManager
    CommandBus --> ContextManager
    CommandBus --> ServerManager

    %% Event publications
    SessionManager --> EventBus
    MessageRouter --> EventBus
    ProviderManager --> EventBus
    ToolManager --> EventBus
    ContextManager --> EventBus
    ServerManager --> EventBus

    %% State repository interactions
    SessionManager --> SessionState
    MessageRouter -.-> SessionState
    ToolManager -.-> SessionState
    ContextManager -.-> SessionState

    %% Component internals omitted for clarity

    %% Styling
    classDef domain fill:#e4f0f5,stroke:#333,stroke-width:1px
    classDef bus fill:#fcf7d5,stroke:#333,stroke-width:1px
    classDef repo fill:#e2f0cb,stroke:#333,stroke-width:1px

    %% Apply classes
    class SessionDomain,MessageDomain,ProviderDomain,ToolDomain,ContextDomain,ServerDomain domain
    class CommandBus,EventBus bus
    class SessionState repo
```

## Key Differences

### 1. Communication Patterns

**Original Architecture:**

- Components communicate through direct method calls
- SessionManager acts as a central hub for most operations
- High coupling between components (e.g., MessageRouter directly calls ProviderManager)

**Refined Architecture:**

- Components communicate through Command and Event patterns
- CommandBus handles operation requests
- EventBus handles state change notifications
- No direct dependencies between domain components

### 2. Message Flow Comparison

#### Original Message Flow:

```mermaid
sequenceDiagram
    participant Client
    participant SM as SessionManager
    participant MR as MessageRouter
    participant PM as ProviderManager
    participant TM as ToolManager
    participant CM as ContextManager

    Client->>SM: sendMessage(sessionId, message)
    SM->>MR: routeMessage(session, message)
    MR->>CM: checkContext(session)
    MR->>PM: sendMessage(session, message)
    PM-->>MR: response

    alt Contains Tool Call
        MR->>TM: processToolCall(session, response)
        TM-->>MR: toolResult
    end

    MR->>CM: updateMetrics(session)
    MR-->>SM: finalResponse
    SM-->>Client: response
```

#### Refined Message Flow:

```mermaid
sequenceDiagram
    participant Client
    participant SM as SessionManager
    participant CB as CommandBus
    participant MR as MessageRouter
    participant PM as ProviderManager
    participant TM as ToolManager
    participant CM as ContextManager
    participant EB as EventBus

    Client->>SM: sendMessage(sessionId, message)
    SM->>CB: SendMessageCommand(sessionId, message)
    CB->>MR: handle(SendMessageCommand)

    MR->>CB: CheckContextCommand(session)
    CB->>CM: handle(CheckContextCommand)
    CM-->>CB: ContextCheckResult
    CB-->>MR: ContextCheckResult

    MR->>CB: GetProviderResponseCommand(session, message)
    CB->>PM: handle(GetProviderResponseCommand)
    PM-->>CB: ProviderResponseResult
    CB-->>MR: ProviderResponseResult

    alt Contains Tool Call
        MR->>CB: ExecuteToolCommand(session, toolCall)
        CB->>TM: handle(ExecuteToolCommand)
        TM-->>CB: ToolExecutionResult
        CB-->>MR: ToolExecutionResult
    end

    MR->>EB: publish(MessageProcessedEvent)
    EB->>CM: notify(MessageProcessedEvent)
    CM->>EB: publish(MetricsUpdatedEvent)

    MR-->>CB: MessageProcessedResult
    CB-->>SM: MessageProcessedResult
    SM-->>Client: response
```

### 3. State Management

**Original Architecture:**

- Multiple components directly modify session state
- Potential for inconsistent state or race conditions
- No clear ownership of state

**Refined Architecture:**

- SessionManager owns session state
- Changes requested through commands
- Updates notified through events
- Repository pattern provides controlled access

### 4. Extensibility

**Original Architecture:**

- Adding new functionality often requires modifying multiple components
- Tight coupling makes extensions difficult
- Changes to one component may affect others

**Refined Architecture:**

- New functionality can be added by creating new command handlers
- No need to modify existing components
- Clear extension points through command and event systems

## Benefits of the Refined Architecture

1. **Reduced Coupling**: Components interact through well-defined interfaces (Command/Event buses)

2. **Clearer Responsibilities**: Each domain has a specific focus with clear boundaries

3. **Better Testability**: Components can be tested in isolation with mocked buses

4. **Improved Maintainability**: Changes in one domain don't affect others

5. **Enhanced Scalability**: Domains can be deployed and scaled independently if needed

6. **Easier Debugging**: Command/event flow provides clear traceability of operations

## Practical Implementation Considerations

1. **Migration Path**: Gradual transition from component-based to domain-driven

   - Implement buses and repositories first
   - Refactor one domain at a time
   - Use adapters to bridge old and new implementations

2. **Performance Considerations**:

   - Command/event pattern adds some overhead
   - Can be optimized with in-memory buses for single-process deployments
   - Benefits in maintainability usually outweigh the minor performance cost

3. **Learning Curve**:
   - Team needs to understand DDD, CQRS, and event-sourcing concepts
   - More complex initially but simpler to maintain long-term
   - Good documentation and examples are essential
