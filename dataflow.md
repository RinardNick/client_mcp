# MCP Client Data Flow

## Component Responsibilities

### User

- Initiates conversations through the chat interface
- Views real-time progress of tool executions and LLM responses
- Receives and interprets different types of messages (thinking, tool execution, results)

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

### Client (TS-MCP-Client)

- Manages all session state and lifecycle
- Handles session persistence and recovery
- Tracks session activity and expiry
- Coordinates all LLM interactions
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

### MCP Servers

- Expose tool capabilities through standard JSON-RPC 2.0 endpoints
- Execute tool requests according to MCP protocol
- Provide health status through SDK protocol handshake
- Return tool results or errors in SDK-compliant format
- Maintain their own state and cleanup
- Handle resource management and access control
- Implement server-specific security measures

### LLM (Anthropic)

- Processes messages with context
- Makes decisions about tool usage
- Formats tool call requests
- Interprets tool results
- Maintains conversation coherence
- Provides natural language responses
- Adheres to system prompts and constraints
- Manages token limits and response formatting

## System Components Flow Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant H as Host
    participant C as Client
    participant S as SDK
    participant M as MCP Servers
    participant L as LLM (Anthropic)

    %% Initialization Flow
    U->>H: Open Chat Interface
    H->>C: Initialize Client
    C->>C: Load Config
    C->>S: Create MCP Client
    S->>M: Launch Servers
    S->>M: Protocol Handshake
    M-->>S: Protocol Version
    S->>M: Get Capabilities (JSON-RPC)
    M-->>S: Tool List (JSON-RPC)
    C->>L: Initialize Session with Tools
    L-->>C: Session Created
    C->>C: Store Session State
    C-->>H: Session Ready + Tools List
    H-->>U: Display Interface

    %% Message Flow
    U->>H: Send Message
    H->>C: Forward Message
    C->>C: Update Session Activity
    C->>L: Send w/Tools Context
    L-->>C: Response w/Tool Call

    Note over H,C: Begin Streaming
    C-->>H: Stream: Thinking
    H-->>U: Display Thinking

    C->>S: Execute Tool via SDK
    S->>M: JSON-RPC Tool Call
    M-->>S: JSON-RPC Response
    S-->>C: Tool Result
    C-->>H: Stream: Tool Result
    H-->>U: Display Tool Result

    C->>L: Send Tool Result
    L-->>C: Final Response
    C->>C: Update Session State
    C-->>H: Stream: Content
    H-->>U: Display Content
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

## Implementation Notes

### SDK Best Practices

1. **Server Health Management**

   ```typescript
   // Health checks are built into SDK client initialization
   const transport = new StdioTransport(process);
   const client = await createMCPClient(transport);
   // If client creation succeeds, server is healthy
   ```

2. **Error Handling**

   ```typescript
   try {
     const client = await createMCPClient(transport);
   } catch (error) {
     if (error instanceof MCPConnectionError) {
       // Handle connection issues
     } else if (error instanceof MCPProtocolError) {
       // Handle protocol issues
     }
   }
   ```

3. **Resource Management**
   ```typescript
   // SDK handles connection lifecycle
   const client = await createMCPClient(transport);
   try {
     // Use client
   } finally {
     await client.disconnect();
   }
   ```

### Performance Considerations

1. **Connection Management**

   - SDK manages connection pooling
   - Handles reconnection attempts
   - Maintains connection health

2. **Protocol Efficiency**

   - Built-in protocol validation
   - Automatic capability caching
   - Optimized message handling

3. **Resource Cleanup**
   - Automatic resource cleanup
   - Connection pooling
   - Memory management

### Security Notes

1. **Protocol Security**

   - SDK validates all messages
   - Enforces protocol version
   - Handles secure handshake

2. **Resource Protection**
   - Automatic cleanup on errors
   - Proper error propagation
   - Safe resource handling

```

```
