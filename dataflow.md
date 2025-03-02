# MCP Client Data Flow

## Component Responsibilities

### User

- Initiates conversations through the chat interface
- Views real-time progress of tool executions and LLM responses
- Receives and interprets different types of messages (thinking, tool execution, results)
- Selects preferred LLM provider and model when supported

### Host (MCP Host)

- Provides web-based user interface
- Renders chat messages and tool outputs
- Displays real-time streaming updates
- Shows loading and error states
- Handles user input and interaction
- Forwards messages to client
- Maintains minimal UI state (loading flags, display preferences)
- Provides debugging interface for development
- Shows available tools in the UI
- Displays provider selection options

### Client (TS-MCP-Client)

- Manages all session state and lifecycle
- Handles session persistence and recovery
- Tracks session activity and expiry
- Coordinates all LLM interactions across multiple providers (Anthropic, OpenAI, Grok)
- Manages server lifecycle through SDK (launch, health, shutdown)
- Leverages SDK for tool discovery and execution
- Enforces tool call limits
- Maintains conversation history
- Provides streaming updates of operations
- Handles error recovery and retries using SDK mechanisms
- Maintains server capabilities registry through SDK
- Uses SDK for MCP protocol communication
- Manages configuration validation and loading
- Caches tool capabilities using SDK utilities
- Handles provider switching and compatibility
- Normalizes tool formats across different providers
- Adapts conversation context for different model capabilities
- Optimizes token usage through smart context management
- Detects provider compatibility issues
- Provides cost estimation and optimization

### MCP Servers

- Expose tool capabilities through standard JSON-RPC 2.0 endpoints
- Execute tool requests according to MCP protocol
- Provide health status through SDK protocol handshake
- Return tool results or errors in SDK-compliant format
- Maintain their own state and cleanup
- Handle resource management and access control
- Implement server-specific security measures

### LLM Providers (Anthropic, OpenAI, Grok)

- Process messages with context
- Make decisions about tool usage
- Format tool call requests
- Interpret tool results
- Maintain conversation coherence
- Provide natural language responses
- Adhere to system prompts and constraints
- Manage token limits and response formatting
- Expose provider-specific capabilities

## System Components Flow Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant H as Host
    participant C as Client
    participant P as Provider Adapter
    participant S as SDK
    participant M as MCP Servers
    participant L as LLM Providers

    %% Initialization Flow
    U->>H: Open Chat Interface
    H->>C: Initialize Client
    C->>C: Load Config
    C->>P: Create Provider(s)
    C->>S: Create MCP Client
    S->>M: Launch Servers
    S->>M: Protocol Handshake
    M-->>S: Protocol Version
    S->>M: Get Capabilities (JSON-RPC)
    M-->>S: Tool List (JSON-RPC)
    C->>P: Initialize Session with Tools
    P->>L: Create Session with Provider
    L-->>P: Session Created
    P-->>C: Provider Session Ready
    C->>C: Store Session State
    C-->>H: Session Ready + Tools List + Available Providers
    H-->>U: Display Interface

    %% Message Flow
    U->>H: Send Message
    H->>C: Forward Message
    C->>C: Update Session Activity
    C->>P: Adapt Message for Provider
    P->>L: Send w/Tools Context
    L-->>P: Response w/Tool Call
    P-->>C: Normalized Tool Call

    Note over H,C: Begin Streaming
    C-->>H: Stream: Thinking
    H-->>U: Display Thinking

    C->>S: Execute Tool via SDK
    S->>M: JSON-RPC Tool Call
    M-->>S: JSON-RPC Response
    S-->>C: Tool Result
    C-->>H: Stream: Tool Result
    H-->>U: Display Tool Result

    C->>P: Send Tool Result
    P->>L: Forward Tool Result to Provider
    L-->>P: Final Response
    P-->>C: Normalized Response
    C->>C: Update Session State
    C-->>H: Stream: Content
    H-->>U: Display Content
```

## Provider Management Flow

```mermaid
stateDiagram-v2
    [*] --> Configuration: Load Configuration
    Configuration --> ProviderInitialization: Create Provider Factory
    ProviderInitialization --> ProviderRegistry: Register Available Providers
    ProviderRegistry --> DefaultProvider: Select Default Provider
    DefaultProvider --> Ready: Provider Ready

    Ready --> ProviderSwitch: Switch Provider Request
    ProviderSwitch --> CompatibilityCheck: Check Compatibility
    CompatibilityCheck --> MigrationPlan: Generate Migration Plan
    MigrationPlan --> ContextAdaptation: Adapt Conversation Context
    ContextAdaptation --> Ready: Provider Ready

    Ready --> ToolExecution: Execute Tool
    ToolExecution --> ToolAdaptation: Adapt Tool Format
    ToolAdaptation --> ToolExecution: Execute Adapted Tool
    ToolExecution --> Ready: Tool Complete
```

## Multi-Provider Support

```mermaid
classDiagram
    class LLMProviderFactory {
        +static providerRegistry: Map
        +static registerProvider(type, providerClass)
        +static getProvider(type, config): Provider
        +static getAvailableProviders(): string[]
    }

    class LLMProviderInterface {
        <<interface>>
        +name: string
        +supportedModels: ModelCapability[]
        +initialize(config): Promise
        +formatToolsForProvider(tools): any[]
        +parseToolCall(response): ToolCall
        +countTokens(text, model): number
        +sendMessage(message, options): Promise
        +streamMessage(message, options): AsyncGenerator
    }

    class AnthropicProvider {
        +name: "anthropic"
        +initialize(config): Promise
        +formatToolsForProvider(tools): any[]
        +parseToolCall(response): ToolCall
    }

    class OpenAIProvider {
        +name: "openai"
        +initialize(config): Promise
        +formatToolsForProvider(tools): any[]
        +parseToolCall(response): ToolCall
    }

    class GrokProvider {
        +name: "grok"
        +initialize(config): Promise
        +formatToolsForProvider(tools): any[]
        +parseToolCall(response): ToolCall
    }

    LLMProviderInterface <|.. AnthropicProvider
    LLMProviderInterface <|.. OpenAIProvider
    LLMProviderInterface <|.. GrokProvider
    LLMProviderFactory ..> LLMProviderInterface : creates
```

## Server Lifecycle Management

### Server Launch and Discovery Flow

```mermaid
stateDiagram-v2
    [*] --> Launching: Launch Server
    Launching --> SDKHandshake: Server Started
    SDKHandshake --> CapabilityDiscovery: Protocol Verified
    CapabilityDiscovery --> Ready: Tools & Resources Discovered
    Ready --> Active: Begin Tool Execution
    Active --> Ready: Tool Complete
    Active --> Error: Tool Error
    Error --> Ready: Error Handled
    Ready --> [*]: Shutdown
```

### SDK Health Management Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as SDK Client
    participant M as MCP Server

    C->>S: createMCPClient(transport)
    activate S
    S->>M: Protocol Handshake
    M-->>S: Protocol Version
    S->>M: Capability Query
    M-->>S: Capabilities
    S-->>C: Initialized Client
    deactivate S

    Note over C,M: Health Verification Built into Protocol

    C->>S: invokeTool()
    activate S
    S->>M: JSON-RPC Call
    M-->>S: Response
    S-->>C: Result
    deactivate S

    Note over C,M: Connection Health Auto-Managed
```

## Tool Adaptation Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Tool Adapter
    participant P as Provider

    C->>A: adaptToolsForProvider(tools, provider)
    A->>A: Get adapter for provider
    A->>P: Convert tools to provider format
    P-->>A: Provider-specific tool format
    A-->>C: Adapted tools

    C->>P: Send message with tools
    P-->>C: Response with tool call

    C->>A: parseToolCallFromProvider(response, provider)
    A->>A: Get adapter for provider
    A->>P: Extract tool call data
    P-->>A: Provider-specific tool call
    A-->>A: Convert to canonical format
    A-->>C: Normalized tool call
```

## Error Handling Flow

### SDK Error Types

```typescript
type MCPErrorCode =
  | -32700 // Parse error
  | -32600 // Invalid request
  | -32601 // Method not found
  | -32602 // Invalid params
  | -32603 // Internal error
  | -32000 // Server error
  | -32001 // Connection error
  | -32002; // Protocol error;

interface MCPError {
  code: MCPErrorCode;
  message: string;
  data?: unknown;
}

// Error handling in discovery
try {
  const client = await createMCPClient(transport);
} catch (error) {
  if (error.code === -32001) {
    // Handle connection errors
  } else if (error.code === -32002) {
    // Handle protocol errors
  }
}
```

### Error Recovery Flow

```mermaid
stateDiagram-v2
    [*] --> Connecting: Create Client
    Connecting --> Connected: Protocol Handshake
    Connected --> Error: Connection Lost
    Error --> Retry: Attempt Reconnect
    Retry --> Connected: Success
    Retry --> Failed: Max Retries
    Failed --> [*]: Report Error
```

## Provider Compatibility

```mermaid
sequenceDiagram
    participant C as Client
    participant CC as Compatibility Checker
    participant PS as Current Provider Session
    participant PT as Target Provider

    C->>CC: checkCompatibility(sourceProvider, targetProvider)
    CC->>CC: Run compatibility checks
    CC->>CC: Calculate compatibility score
    CC-->>C: Compatibility result

    C->>CC: getMigrationPlan(sourceProvider, targetProvider)
    CC->>CC: Analyze context impact
    CC->>CC: Generate required actions
    CC->>CC: List potential data loss
    CC-->>C: Migration plan

    C->>PS: Get current session state
    PS-->>C: Session messages and context
    C->>C: Apply migration plan
    C->>PT: Create new session with adapted context
    PT-->>C: New provider session
```

## Implementation Notes

### Multi-Provider Configuration

```typescript
// Multi-provider configuration
const config = {
  providers: {
    anthropic: {
      api_key: 'sk-ant-...',
      default_model: 'claude-3-opus-20240229',
      system_prompt: 'You are a helpful assistant...',
    },
    openai: {
      api_key: 'sk-...',
      default_model: 'gpt-4-turbo',
      system_prompt: 'You are a helpful assistant...',
    },
  },
  default_provider: 'anthropic',
  servers: {
    calculator: {
      command: 'node',
      args: ['calculator-server.js'],
    },
  },
};

// Create session with specific provider
const session = await createSession({
  provider: 'anthropic',
  model: 'claude-3-sonnet-20240229',
});

// Switch provider mid-conversation
await switchSessionProvider(sessionId, 'openai', 'gpt-4o');
```

### Tool Adaptation

```typescript
// Using the tool adapter
import { ToolAdapter } from '@rinardnick/client_mcp';

const toolAdapter = new ToolAdapter();

// Convert tools to provider-specific format
const anthropicTools = toolAdapter.adaptToolsForProvider(tools, 'anthropic');
const openaiTools = toolAdapter.adaptToolsForProvider(tools, 'openai');

// Parse tool calls from different providers
const toolCall = toolAdapter.parseToolCallFromProvider(response, providerName);
```

### Provider Compatibility

```typescript
// Check compatibility between providers
import { ProviderCompatibilityChecker } from '@rinardnick/client_mcp';

const checker = new ProviderCompatibilityChecker();

// Check if providers are compatible
const compatibility = checker.checkCompatibility(
  'anthropic',
  'claude-3-opus-20240229',
  'openai',
  'gpt-4o'
);

// Get migration plan when switching providers
const plan = checker.getMigrationPlan(
  'anthropic',
  'claude-3-opus-20240229',
  'openai',
  'gpt-4o',
  { currentContextSize: 15000 }
);
```

### Performance Considerations

1. **Provider Selection**

   - Choose providers based on capability requirements
   - Consider cost differences between providers
   - Use compatibility checker when switching providers

2. **Tool Adaptation**

   - Use the tool adapter for cross-provider compatibility
   - Implement provider-specific fallbacks for unsupported features
   - Cache adapted tools to improve performance

3. **Context Management**
   - Implement smart truncation when switching to models with smaller context windows
   - Use conversation summarization for longer conversations
   - Track token usage across different providers

```

```
