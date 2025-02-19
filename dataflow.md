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
- Provide health status and capability discovery
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
    S->>M: Health Check
    M-->>S: Health Status
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

## Detailed Component Interactions

### Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Initializing: Create Session
    Initializing --> ConfigLoading: Load Config
    ConfigLoading --> SDKInitializing: Create SDK Client
    SDKInitializing --> ServerLaunching: Launch Servers
    ServerLaunching --> CapabilityDiscovery: Get Tools
    CapabilityDiscovery --> Ready: Initialize LLM
    Ready --> Active: User Interaction
    Active --> Ready: Await Input
    Active --> Error: Handle Errors
    Error --> Ready: Recover
    Ready --> [*]: Cleanup
```

### Tool Execution Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as SDK Client
    participant M as MCP Server

    C->>S: invokeTool(name, params)
    activate S
    S->>M: JSON-RPC invoke
    activate M
    M-->>S: JSON-RPC response
    deactivate M
    S-->>C: Validated Result
    deactivate S

    Note over C,M: Error Handling
    C->>S: invokeTool(name, params)
    activate S
    S->>M: JSON-RPC invoke
    activate M
    M-->>S: Error Response
    deactivate M
    S-->>C: MCPError
    deactivate S
```

## Detailed Data Flow

### 1. Initialization Flow

#### 1.1 Host → Client: Initialize

**Request:**

```json
{
  "configPath": "/path/to/config.json"
}
```

#### 1.2 Client: Load & Initialize

**Config File (config.json):**

```json
{
  "llm": {
    "type": "claude",
    "api_key": "YOUR_API_KEY_HERE",
    "system_prompt": "You are a helpful assistant.",
    "model": "claude-3-5-sonnet-20241022"
  },
  "max_tool_calls": 3,
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {}
    },
    "terminal": {
      "command": "npx",
      "args": [
        "@rinardnick/mcp-terminal",
        "--allowed-commands",
        "[go,python3,uv,npm,npx,git,ls,cd,touch,mv,pwd,mkdir]"
      ],
      "env": {}
    }
  }
}
```

**Session Initialization with Tools:**

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "capabilities": {
      "tools": true,
      "resources": true
    }
  },
  "id": 1
}
```

### 2. Message Flow

#### 2.1 Tool Invocation (JSON-RPC 2.0)

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "invoke",
  "params": {
    "tool": "readFile",
    "arguments": {
      "path": "/tmp/test.txt"
    }
  },
  "id": 2
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": "File contents here..."
  },
  "id": 2
}
```

### 3. Session Management Flow

#### 3.1 Session State Management

**Session Interface:**

```typescript
interface Session {
  id: string;
  config: LLMConfig;
  createdAt: Date;
  lastActivityAt: Date;
  messages: Message[];
  mcpClient: MCPClient; // SDK client instance
  toolCallCount: number;
  maxToolCalls: number;
  capabilities: MCPCapabilities;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}
```

**Session Lifecycle Management:**

```typescript
class SessionManager {
  async initializeSession(config: LLMConfig): Promise<Session> {
    // 1. Create SDK Client
    const transport = new StdioServerTransport();
    const mcpClient = await createMCPClient(transport);

    // 2. Initialize Servers
    await this.initializeServers(config.servers);

    // 3. Discover Capabilities
    const capabilities = await mcpClient.listCapabilities();

    // 4. Create Session
    return this.createSession(config, mcpClient, capabilities);
  }
}
```

#### 3.2 Message Processing Flow

```mermaid
flowchart TD
    A[Receive Message] --> B{Has Tool Calls?}
    B -- Yes --> C[Process Tool Calls]
    C --> D[Execute via SDK]
    D --> E[Collect Results]
    E --> F[Send to LLM]
    B -- No --> F
    F --> G[Generate Response]
    G --> H[Stream Updates]
```

### 4. Tool Execution Flow

#### 4.1 SDK Tool Invocation

```typescript
// High-level SDK usage
const result = await mcpClient.invokeTool('readFile', { path: '/tmp/test.txt' });

// Underlying JSON-RPC messages
-> {
  "jsonrpc": "2.0",
  "method": "invoke",
  "params": {
    "tool": "readFile",
    "arguments": { "path": "/tmp/test.txt" }
  },
  "id": 1
}
<- {
  "jsonrpc": "2.0",
  "result": {
    "content": "File contents..."
  },
  "id": 1
}
```

#### 4.2 Tool Result Processing

```mermaid
flowchart TD
    A[Tool Result] --> B{Validate Result}
    B -- Valid --> C[Process Result]
    B -- Invalid --> D[Handle Error]
    C --> E[Update Session]
    C --> F[Stream Update]
    D --> G[Retry/Recover]
    G --> H{Retry Limit?}
    H -- Yes --> I[Fail]
    H -- No --> A
```

### 5. Error Handling Flow

#### 5.1 Error Types and Handling

```typescript
// SDK Error Types
type MCPErrorCode =
  | -32700 // Parse error
  | -32600 // Invalid request
  | -32601 // Method not found
  | -32602 // Invalid params
  | -32603 // Internal error
  | -32000 // Server error
  | -32001 // Timeout error
  | -32002; // Validation error;

interface MCPError {
  code: MCPErrorCode;
  message: string;
  data?: unknown;
}

// Error Handling Example
try {
  const result = await mcpClient.invokeTool('readFile', { path });
} catch (error) {
  if (error instanceof MCPError) {
    switch (error.code) {
      case -32700:
        // Handle parse error
        break;
      case -32600:
        // Handle invalid request
        break;
      // ... handle other cases
    }
  }
}
```

#### 5.2 Error Recovery Flow

```mermaid
stateDiagram-v2
    [*] --> Normal: Operation Start
    Normal --> Error: Error Occurs
    Error --> Retrying: Attempt Retry
    Retrying --> Normal: Success
    Retrying --> Error: Failure
    Error --> Failed: Max Retries
    Failed --> [*]: Report Error
```

### 6. Streaming Updates Flow

#### 6.1 Stream Event Types

```typescript
type StreamEventType =
  | 'thinking' // LLM processing
  | 'tool_start' // Tool execution starting
  | 'tool_result' // Tool execution complete
  | 'content' // Content update
  | 'error' // Error occurred
  | 'done'; // Stream complete

interface StreamEvent {
  type: StreamEventType;
  content?: string;
  error?: MCPError;
  metadata?: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    duration?: number;
  };
}
```

#### 6.2 Stream Processing Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Host
    participant U as User Interface

    C->>H: Stream: Thinking
    H->>U: Update UI (Thinking)
    C->>H: Stream: Tool Start
    H->>U: Update UI (Tool Running)
    C->>H: Stream: Tool Result
    H->>U: Update UI (Result)
    C->>H: Stream: Content
    H->>U: Update UI (Content)
    C->>H: Stream: Done
    H->>U: Update UI (Complete)
```

### 7. Security Considerations

#### 7.1 SDK Security Features

- Automatic input validation
- Secure transport handling
- Resource isolation
- Error sanitization

#### 7.2 Security Flow

```mermaid
flowchart TD
    A[Tool Request] --> B{Validate Input}
    B -- Valid --> C[Check Permissions]
    C -- Allowed --> D[Execute Tool]
    C -- Denied --> E[Security Error]
    B -- Invalid --> F[Validation Error]
    D --> G{Sanitize Output}
    G --> H[Return Result]
    E --> I[Log Security Event]
    F --> I
```

## Implementation Notes

### SDK Best Practices

1. **Initialization**

   ```typescript
   // Always use SDK's built-in validation
   const client = await createMCPClient(transport, {
     validateInput: true,
     validateOutput: true,
   });
   ```

2. **Error Handling**

   ```typescript
   // Use SDK's error types for consistent handling
   try {
     await client.invokeTool(name, params);
   } catch (error) {
     if (error instanceof MCPTimeoutError) {
       // Handle timeout
     } else if (error instanceof MCPValidationError) {
       // Handle validation error
     }
   }
   ```

3. **Resource Management**
   ```typescript
   // Proper cleanup
   async function cleanup() {
     await client.disconnect();
     await transport.close();
   }
   ```

### Performance Considerations

1. **Caching**

   - SDK handles capability caching
   - Implement result caching where appropriate
   - Cache session state efficiently

2. **Concurrency**

   - SDK manages concurrent tool calls
   - Implement request queuing if needed
   - Monitor resource usage

3. **Memory Management**
   - Clean up SDK resources
   - Monitor session size
   - Implement session pruning

```

```
