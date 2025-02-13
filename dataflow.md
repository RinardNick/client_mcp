# MCP Client Data Flow

## Component Responsibilities

### User

- Initiates conversations through the chat interface
- Views real-time progress of tool executions and LLM responses
- Receives and interprets different types of messages (thinking, tool execution, results)

### Host (MCP Host)

- Manages user interface and web API endpoints
- Handles user authentication and session management
- Maintains UI state and streaming connections
- Formats and renders messages for display
- Provides error feedback and reconnection UI
- Routes messages to/from client
- Manages user preferences and settings
- Handles session persistence across page reloads
- Provides debugging and monitoring interfaces

### Client (TS-MCP-Client)

- Manages chat sessions and conversation history
- Handles all LLM interactions and API calls
- Coordinates MCP server lifecycle (launch, health checks, shutdown)
- Implements tool detection, validation, and execution
- Manages conversation state and tool limits
- Provides streaming updates of operations
- Handles error recovery and retries
- Maintains server capabilities registry
- Implements MCP protocol for tool interactions
- Manages configuration validation and loading

### MCP Servers

- Expose tool capabilities through standard endpoints
- Execute tool requests according to MCP protocol
- Provide health status and capability discovery
- Return tool results or errors
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
    participant M as MCP Servers
    participant L as LLM (Anthropic)

    H->>C: Initialize(config.json)
    C->>C: Load Config
    C->>M: Launch Servers
    C->>M: Health Check
    M-->>C: Health Status
    C->>M: Get Capabilities
    M-->>C: Tool List
    C->>L: Initialize Session
    L-->>C: Session Created
    C-->>H: Ready

    U->>H: Message
    H->>C: Send Message
    C->>L: Send w/Tools
    L-->>C: Response w/Tool Call

    Note over H,C: Begin Streaming
    C-->>H: Stream: Thinking

    C->>M: Execute Tool
    M-->>C: Tool Result
    C-->>H: Stream: Tool Result

    C->>L: Send Tool Result
    L-->>C: Final Response
    C-->>H: Stream: Content
    H-->>U: Display
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

#### 1.2 Client: Load & Validate Config

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

#### 1.3 Client → MCP Servers: Launch & Health Check

**Health Check Request:**

```http
GET http://localhost:3001/health
```

**Health Check Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

#### 1.4 Client → MCP Servers: Get Capabilities

**Capability Request:**

```http
GET http://localhost:3001/tools/list
```

**Capability Response:**

```json
{
  "tools": [
    {
      "name": "readFile",
      "description": "Reads the content of a file on the filesystem",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

#### 1.5 Client → LLM: Initialize Session

**Session Request:**

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "You are a helpful assistant."
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "readFile",
        "description": "Reads the content of a file on the filesystem",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        }
      }
    }
  ]
}
```

**Session Response:**

```json
{
  "sessionId": "sess_abc123",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "assistant",
      "content": "Hello! How may I assist you today?"
    }
  ]
}
```

### 2. Message Flow

#### 2.1 User → Host: Send Message

**Chat Interface Input:**

```json
{
  "message": "What files are in /tmp?"
}
```

#### 2.2 Host → Client: Forward Message

**API Request:**

```http
POST /api/chat/session/sess_abc123/message
Content-Type: application/json

{
  "message": "What files are in /tmp?"
}
```

#### 2.3 Client → LLM: Send Message with Tools

**LLM API Request:**

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "What files are in /tmp?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "readFile",
        "description": "Reads the content of a file on the filesystem",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        }
      }
    }
  ]
}
```

**LLM Response with Tool Call:**

```json
{
  "role": "assistant",
  "content": "I'll check the files in /tmp for you.",
  "tool_calls": [
    {
      "function": {
        "name": "readFile",
        "arguments": { "path": "/tmp" }
      }
    }
  ]
}
```

#### 2.4 Client → MCP Server: Execute Tool

**Tool Request:**

```http
POST http://localhost:3001/tools/invoke
Content-Type: application/json

{
  "tool": "readFile",
  "arguments": { "path": "/tmp" }
}
```

**Tool Response:**

```json
{
  "files": ["file1.txt", "file2.txt", "log.txt"]
}
```

#### 2.5 Client → LLM: Continue with Tool Result

**LLM API Request:**

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    // Previous messages...
    {
      "role": "assistant",
      "content": "I'll check the files in /tmp for you."
    },
    {
      "role": "assistant",
      "content": "{\"files\": [\"file1.txt\", \"file2.txt\", \"log.txt\"]}",
      "isToolResult": true
    }
  ],
  "tools": [
    /* ... same tools as before ... */
  ]
}
```

**LLM Final Response:**

```json
{
  "role": "assistant",
  "content": "I found the following files in /tmp:\n- file1.txt\n- file2.txt\n- log.txt"
}
```

#### 2.6 Client → Host: Stream Response

**Server-Sent Events Stream with Inner Dialogue:**

```http
Content-Type: text/event-stream

data: {"type": "thinking", "content": "I'll check the files in /tmp for you."}
data: {"type": "tool_start", "content": "Executing readFile tool with path: /tmp"}
data: {"type": "tool_result", "content": "Found files: file1.txt, file2.txt, log.txt"}
data: {"type": "thinking", "content": "Let me format these results for you."}
data: {"type": "content", "content": "I found the following files in /tmp:"}
data: {"type": "content", "content": "\n- file1.txt\n- file2.txt\n- log.txt"}
data: {"type": "done"}
```

The stream types are:

- `thinking`: LLM's intermediate thoughts/planning
- `tool_start`: When a tool is about to be executed
- `tool_result`: The result from a tool execution
- `content`: The final formatted response
- `error`: Any error messages
- `done`: Stream completion marker

### 3. Error Flow with Inner Dialogue

#### 3.2 Client → Host: Error Stream with Context

**Error Event Stream:**

```http
Content-Type: text/event-stream

data: {"type": "thinking", "content": "I'll check the files in /tmp for you."}
data: {"type": "tool_start", "content": "Executing readFile tool with path: /tmp"}
data: {"type": "error", "error": "Failed to execute tool readFile: File not found"}
data: {"type": "thinking", "content": "I encountered an error. Let me explain what happened."}
data: {"type": "content", "content": "I apologize, but I couldn't access the /tmp directory. The system reported that the path was not found."}
data: {"type": "done"}
```

```

```
