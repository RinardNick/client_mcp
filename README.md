# TypeScript MCP Client

A TypeScript implementation of a Model Context Protocol (MCP) client that manages LLM chat interactions, server lifecycle, and tool invocations through MCP servers.

## Overview

The TS-MCP-Client serves as the core orchestration layer in the Model Context Protocol architecture, managing all session state, server lifecycle, and LLM interactions. It acts as the bridge between a host application (like a web interface) and the underlying MCP servers that provide tool capabilities.

### System Architecture

```mermaid
graph TD
    H[Host Application] --> |Sends Messages| C[TS-MCP-Client]
    C --> |Manages Sessions| S[Session Store]
    C --> |Launches & Monitors| M[MCP Servers]
    C --> |Coordinates| L[LLM/Anthropic]
    M --> |Provides Tools| C
    L --> |Tool Decisions| C
    C --> |Streaming Updates| H

    subgraph Client Responsibilities
        S --> |State Management| SM[Session Manager]
        SM --> |Tool Execution| TE[Tool Engine]
        TE --> |Server Communication| SC[Server Controller]
        SC --> |Health Monitoring| HM[Health Monitor]
    end

    style H fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#bbf,stroke:#333,stroke-width:4px
    style M fill:#bfb,stroke:#333,stroke-width:2px
    style L fill:#fbf,stroke:#333,stroke-width:2px
```

## Component Responsibilities

### Host Application

The host application (your application) is responsible for:

- Providing the user interface (UI)
- Rendering chat messages and tool outputs
- Displaying real-time streaming updates
- Showing loading and error states
- Handling user input and interaction
- Forwarding messages to the client
- Maintaining minimal UI state (loading flags, display preferences)
- Providing debugging interface (optional)
- Showing available tools in the UI (optional)

### TS-MCP-Client (This Library)

This client library manages:

- All session state and lifecycle
- Session persistence and recovery
- Session activity tracking and expiry
- All LLM interactions with Anthropic Claude
- Server lifecycle through the MCP SDK (launch, health, shutdown)
- Tool discovery and execution via the SDK
- Tool call limits enforcement
- Conversation history maintenance
- Streaming updates of operations
- Error recovery and retries
- Server capabilities registry
- MCP protocol communication
- Configuration validation and loading
- Tool capabilities caching

### MCP Servers

External MCP servers are responsible for:

- Exposing tool capabilities through standard JSON-RPC 2.0 endpoints
- Executing tool requests according to MCP protocol
- Providing health status through protocol handshake
- Returning tool results or errors in compliant format
- Maintaining their own state and cleanup
- Handling resource management and access control
- Implementing server-specific security measures

### LLM (Anthropic Claude)

The LLM is responsible for:

- Processing messages with context
- Making decisions about tool usage
- Formatting tool call requests
- Interpreting tool results
- Maintaining conversation coherence
- Providing natural language responses
- Adhering to system prompts and constraints

## Quick Start

```bash
npm install @rinardnick/client_mcp
```

### Features

- **Full Structured Tool Call Support**: Works with Claude's latest API format for tool calls
- **Token Usage Monitoring**: Track and report token usage in conversations
- **Claude 3.7 Thinking Support**: Use Claude's thinking parameter for improved reasoning
- **Tool Call Limits**: Control and limit tool usage in conversations
- **Session Management**: Manage chat sessions with persistence and recovery
- **Server Lifecycle Management**: Automatic launch and monitoring of MCP servers
- **Legacy Tool Support**: Maintains backward compatibility with older <tool> tag format

### Basic Usage

```typescript
import { SessionManager, loadConfig } from '@rinardnick/client_mcp';

// 1. Load configuration
const config = {
  type: 'claude',
  api_key: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
  system_prompt: 'You are a helpful assistant with access to tools.',
  
  // Configure tool call limits
  max_tool_calls: 5,  // Limit tool calls per conversation
  
  // Configure thinking for Claude 3.7+ models
  thinking: {
    enabled: true,  // Enable thinking (automatically detects compatible models)
    budget_tokens: 6000  // Optional: customize thinking token budget
  },
  
  // Server configurations
  servers: {
    // Example file system server configuration
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
      env: {},
    },
  },
};

// 2. Initialize session
const sessionManager = new SessionManager();
const session = await sessionManager.initializeSession(config);

// 3. Send a message
const response = await sessionManager.sendMessage(
  session.id,
  'What files are in the current directory?'
);

console.log(response.content);

// 4. Monitor token usage
const tokenUsage = sessionManager.getSessionTokenUsage(session.id);
console.log(`Token usage: ${tokenUsage.totalTokens}/${tokenUsage.maxContextTokens} (${tokenUsage.percentUsed}%)`);
```

### Streaming Responses with Thinking and Tool Calls

```typescript
// Stream responses for real-time updates
// This will automatically handle tool calls and thinking in Claude 3.7+
const stream = sessionManager.sendMessageStream(
  session.id,
  'What files are in the current directory?'
);

for await (const chunk of stream) {
  switch (chunk.type) {
    case 'thinking':
      // Claude 3.7+ thinking process output - only if using a supported model
      console.log('Thinking:', chunk.content);
      updateUI('thinking', chunk.content); // Show thinking process to user
      break;
      
    case 'tool_start':
      // Indicates a tool is about to be executed
      console.log('Tool starting:', chunk.content);
      updateUI('tool', `Starting tool: ${chunk.content}`);
      break;
      
    case 'tool_result':
      // Results from the tool execution
      console.log('Tool result:', chunk.content);
      updateUI('tool-result', chunk.content);
      break;
      
    case 'content':
      // Regular message content from Claude
      console.log('Content:', chunk.content);
      appendToUI('content', chunk.content); // Build message incrementally
      break;
      
    case 'error':
      // Error during processing
      console.error('Error:', chunk.error);
      updateUI('error', chunk.error);
      break;
      
    case 'done':
      // Stream is complete
      console.log('Stream complete');
      finalizeUI(); // Complete the message rendering
      break;
  }
}

// After streaming completes, check token usage:
const tokenMetrics = sessionManager.getSessionTokenUsage(session.id);
console.log(`Used ${tokenMetrics.totalTokens} of ${tokenMetrics.maxContextTokens} tokens (${tokenMetrics.percentUsed}%)`);
```

### Express Integration

The client includes built-in Express router support:

```typescript
import express from 'express';
import { createChatRouter } from '@rinardnick/client_mcp';

const app = express();
const router = createChatRouter(); // Creates and configures a router

app.use('/api/chat', router); // Mount the router at /api/chat

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## API Reference

### Session Management

<details>
<summary>Initialize Session</summary>

```typescript
const sessionManager = new SessionManager();
const session = await sessionManager.initializeSession(config: LLMConfig);
```

The `LLMConfig` interface:

```typescript
interface LLMConfig {
  type: string; // LLM type (e.g., 'claude')
  api_key: string; // API key for the LLM
  model: string; // Model identifier
  system_prompt: string; // System prompt for the session
  
  // New options
  max_tool_calls?: number; // Maximum number of tool calls allowed per session
  thinking?: {
    enabled?: boolean; // Enable/disable thinking for Claude 3.7+ models
    budget_tokens?: number; // Token budget for thinking (default: 1/3 of context window)
  };
  
  servers?: {
    // Optional server configurations
    [key: string]: {
      command: string; // Server launch command
      args: string[]; // Command arguments
      env?: Record<string, string>; // Environment variables (optional)
    };
  };
}
```

</details>

<details>
<summary>Send Messages</summary>

```typescript
// Regular message sending
const response = await sessionManager.sendMessage(
  sessionId: string,
  message: string
): Promise<ChatMessage>;

// Streaming message sending
const stream = sessionManager.sendMessageStream(
  sessionId: string,
  message: string
): AsyncGenerator<{
  type: string; // 'thinking', 'tool_start', 'tool_result', 'content', 'error', or 'done'
  content?: string;
  error?: string;
}>;
```

The `ChatMessage` interface:

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  hasToolCall?: boolean;
  toolCall?: {
    name: string;
    parameters: Record<string, unknown>;
  };
  isToolResult?: boolean;
}
```

</details>

<details>
<summary>Retrieve Session</summary>

```typescript
// Get an existing session by ID
const session = sessionManager.getSession(sessionId: string): ChatSession;

// Update session activity timestamp
sessionManager.updateSessionActivity(sessionId: string): void;

// Get token usage information
const tokenMetrics = sessionManager.getSessionTokenUsage(sessionId: string): TokenMetrics;
```

The `TokenMetrics` interface:

```typescript
interface TokenMetrics {
  userTokens: number;    // Tokens used by user messages
  assistantTokens: number;  // Tokens used by assistant messages
  systemTokens: number;  // Tokens used by system messages
  totalTokens: number;   // Total tokens used
  maxContextTokens: number;  // Maximum context window size
  percentUsed: number;   // Percentage of context window used
}
```

</details>

### Configuration

<details>
<summary>Configuration File Structure</summary>

```json
{
  "llm": {
    "type": "claude",
    "api_key": "YOUR_API_KEY_HERE",
    "model": "claude-3-5-sonnet-20241022",
    "system_prompt": "You are a helpful assistant.",
    
    // New options
    "max_tool_calls": 5,
    "thinking": {
      "enabled": true,
      "budget_tokens": 6000
    }
  },
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

Loading a configuration file:

```typescript
import { loadConfig } from '@rinardnick/client_mcp';

const config = await loadConfig('config.json');
```

</details>

## Tool Calls, Thinking, and Token Usage Guide

### Working with Structured Tool Calls

The client automatically handles both modern structured tool calls from Claude as well as legacy `<tool>` tag format. When Claude decides to use a tool, the client will:

1. Detect the tool call in the structured response format
2. Execute the tool with the appropriate server
3. Return the result to Claude for further processing
4. Stream tool execution events to the host application

Here's an example of how structured tool calls work:

```typescript
// Claude will return structured tool calls in the format:
{
  content: [
    {
      type: 'tool_use',
      id: 'tool_1',
      name: 'list_files',
      input: {
        path: '/home/user'
      }
    },
    {
      type: 'text',
      text: 'I need to check what files are in your directory.'
    }
  ]
}

// The client will automatically detect and execute these tool calls
// No special handling needed in your host application!
```

### Using Claude 3.7 Thinking Feature

Claude 3.7+ models support the "thinking" parameter, which enables the model to perform more thorough reasoning about complex tasks. The client automatically enables this feature when using a compatible model:

```typescript
// Configure thinking in your config:
const config = {
  type: 'claude',
  api_key: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-7-sonnet-20250219', // Must be Claude 3.7 or higher
  system_prompt: 'You are a helpful assistant with access to tools.',
  
  // Optional thinking configuration
  thinking: {
    enabled: true, // Default is true for 3.7+ models
    budget_tokens: 8000 // Optional: specify token budget for thinking
  }
};

// The client will automatically send thinking content in the stream
// Your application can display this to show the model's reasoning process
```

### Token Usage Monitoring

Track and manage token usage with the built-in token monitoring features:

```typescript
// After sending messages, check token usage:
const tokenMetrics = sessionManager.getSessionTokenUsage(session.id);

console.log(`Token usage stats:
- User tokens: ${tokenMetrics.userTokens}
- Assistant tokens: ${tokenMetrics.assistantTokens}
- System tokens: ${tokenMetrics.systemTokens}
- Total tokens: ${tokenMetrics.totalTokens}
- Max context size: ${tokenMetrics.maxContextTokens}
- Context used: ${tokenMetrics.percentUsed}%`);

// Use this information to:
// 1. Display token usage to users
// 2. Implement budgeting features
// 3. Proactively manage long conversations
```

### Limiting Tool Call Usage

You can control how many tool calls the assistant can make to prevent excessive resource usage:

```typescript
// Configure tool call limits in your config:
const config = {
  type: 'claude',
  api_key: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
  system_prompt: 'You are a helpful assistant with access to tools.',
  
  // Set max tool calls
  max_tool_calls: 5, // Simple way to limit tool calls per session
  
  // Or use more granular control:
  max_tool_calls: {
    per_message: 3,  // Limit calls within a single response
    per_session: 20  // Limit total calls across the session
  }
};

// The client automatically enforces these limits
// If the LLM tries to make more calls than allowed, it will receive a message
// explaining that the limit has been reached
```

## Implementation Guide for Host Applications

### How to Integrate with Host Applications

<details>
<summary>Basic Integration Pattern</summary>

```typescript
// 1. Initialize session when the user starts a chat
const sessionManager = new SessionManager();
const session = await sessionManager.initializeSession(config);
const sessionId = session.id;

// 2. Store sessionId on the client side (localStorage, sessionStorage, etc.)
// ...

// 3. Send user messages
async function sendUserMessage(message: string) {
  // Show loading state in UI
  ui.setLoading(true);

  try {
    // For non-streaming responses:
    const response = await sessionManager.sendMessage(sessionId, message);
    ui.displayMessage(response);

    // OR for streaming responses:
    const stream = sessionManager.sendMessageStream(sessionId, message);

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'thinking':
          ui.displayThinking(chunk.content);
          break;
        case 'tool_start':
          ui.displayToolStart(chunk.content);
          break;
        case 'tool_result':
          ui.displayToolResult(chunk.content);
          break;
        case 'content':
          ui.displayContent(chunk.content);
          break;
        case 'error':
          ui.displayError(chunk.error);
          break;
        case 'done':
          ui.completeMessage();
          break;
      }
    }
  } catch (error) {
    ui.displayError(error.message);
  } finally {
    ui.setLoading(false);
  }
}
```

</details>

<details>
<summary>Sequence Diagram for Message Flow</summary>

```mermaid
sequenceDiagram
    participant U as User
    participant H as Host
    participant C as Client
    participant S as MCP Servers
    participant L as LLM (Anthropic)

    U->>H: Send Message
    H->>C: Forward Message
    C->>C: Update Session Activity
    C->>L: Send w/Tools Context
    L-->>C: Response w/Tool Call

    Note over H,C: Begin Streaming
    C-->>H: Stream: Thinking
    H-->>U: Display Thinking

    C->>S: Execute Tool
    S-->>C: Tool Result
    C-->>H: Stream: Tool Result
    H-->>U: Display Tool Result

    C->>L: Send Tool Result
    L-->>C: Final Response
    C->>C: Update Session State
    C-->>H: Stream: Content
    H-->>U: Display Content
```

This sequence shows:

1. User sends a message through the host interface
2. Host forwards message to the client
3. Client updates session activity and sends to LLM
4. LLM decides to use a tool and returns a tool call
5. Client executes the tool on the appropriate server
6. Client sends tool result back to LLM for final response
7. Client streams updates to host throughout process
8. Host displays updates in real-time to user

</details>

### Error Handling Recommendations

<details>
<summary>Common Error Types and Handling</summary>

```typescript
try {
  const session = await sessionManager.initializeSession(config);
} catch (error) {
  if (error instanceof LLMError) {
    // Handle LLM-specific errors (API key, rate limits, etc.)
    ui.displayError('LLM Error: ' + error.message);
  } else if (error instanceof ConfigurationError) {
    // Handle configuration issues
    ui.displayError('Configuration Error: ' + error.message);
  } else {
    // Handle general errors
    ui.displayError('Unexpected Error: ' + error.message);
  }
}

// For streaming messages, handle errors in the stream:
try {
  const stream = sessionManager.sendMessageStream(sessionId, message);
  for await (const chunk of stream) {
    // Process chunks...
    if (chunk.type === 'error') {
      ui.displayError(chunk.error);
      break;
    }
  }
} catch (error) {
  // Handle stream initialization errors
  ui.displayError('Stream Error: ' + error.message);
}
```

Common errors to handle:

- Invalid API keys
- Configuration errors
- Server launch failures
- Tool execution errors
- Connection issues
- Session not found
- Rate limiting

</details>

### Best Practices for Host Applications

<details>
<summary>UI/UX Recommendations</summary>

1. **Real-time Feedback**

   - Display "thinking" state when LLM is processing
   - Show tool execution status
   - Indicate when tools are running

2. **Error Handling**

   - Provide clear error messages
   - Offer retry options
   - Show recovery suggestions

3. **Message Flow**

   - Keep conversation context clear
   - Distinguish between user and assistant messages
   - Highlight tool usage and results

4. **Tool Visualization**

   - Show which tools are available
   - Indicate when tools are being used
   - Display tool results in a structured way

5. **Session Management**
   - Store session ID securely
   - Handle session expiry gracefully
   - Provide session reset options
   </details>

<details>
<summary>Performance Considerations</summary>

1. **Streaming Updates**

   - Use streaming for better user experience
   - Process chunks efficiently
   - Handle connection drops

2. **Caching**

   - Cache session information
   - Store recent message history
   - Reuse session for continued conversations

3. **Error Recovery**
   - Implement retry mechanisms
   - Handle reconnection scenarios
   - Provide fallback options
   </details>

## Security Considerations

<details>
<summary>Security Best Practices</summary>

1. **API Key Management**

   - Never expose API keys in client-side code
   - Use environment variables server-side
   - Implement proper key rotation

2. **Session Security**

   - Validate session ownership
   - Implement session timeouts
   - Use proper authentication

3. **Server Security**

   - Restrict server capabilities
   - Use allowlists for commands
   - Implement resource limits

4. **Data Handling**
   - Avoid storing sensitive information in sessions
   - Implement proper data sanitization
   - Handle user data according to privacy regulations
   </details>

## Example Host Implementation

<details>
<summary>React Component Example</summary>

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, loadConfig } from '@rinardnick/client_mcp';

// Create a singleton instance
const sessionManager = new SessionManager();

const Chat = () => {
  const [config, setConfig] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingData, setStreamingData] = useState({
    thinking: '',
    toolStart: '',
    toolResult: '',
    content: '',
    error: '',
  });

  // Initialize on component mount
  useEffect(() => {
    const initSession = async () => {
      try {
        // Load config (implement your method)
        const cfg = await fetchConfig();
        setConfig(cfg);

        // Create a new session
        const session = await sessionManager.initializeSession(cfg);
        setSessionId(session.id);
      } catch (error) {
        console.error('Failed to initialize session:', error);
      }
    };

    initSession();
  }, []);

  const sendMessage = async e => {
    e.preventDefault();

    if (!input.trim() || !sessionId) return;

    const userMessage = input;
    setInput('');

    // Add user message to UI
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Reset streaming data
    setStreamingData({
      thinking: '',
      toolStart: '',
      toolResult: '',
      content: '',
      error: '',
    });

    setLoading(true);

    try {
      // Start streaming response
      const stream = sessionManager.sendMessageStream(sessionId, userMessage);

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'thinking':
            setStreamingData(prev => ({ ...prev, thinking: chunk.content }));
            break;
          case 'tool_start':
            setStreamingData(prev => ({ ...prev, toolStart: chunk.content }));
            break;
          case 'tool_result':
            setStreamingData(prev => ({ ...prev, toolResult: chunk.content }));
            break;
          case 'content':
            setStreamingData(prev => ({ ...prev, content: chunk.content }));
            break;
          case 'error':
            setStreamingData(prev => ({ ...prev, error: chunk.error }));
            break;
          case 'done':
            // Add final message to UI
            if (streamingData.content) {
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: streamingData.content,
                },
              ]);
            }
            break;
        }
      }
    } catch (error) {
      console.error('Error streaming message:', error);
      setStreamingData(prev => ({
        ...prev,
        error: `Error: ${error.message}`,
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}

        {/* Show streaming content */}
        {streamingData.thinking && (
          <div className="thinking">Thinking: {streamingData.thinking}</div>
        )}

        {streamingData.toolStart && (
          <div className="tool-start">
            Running tool: {streamingData.toolStart}
          </div>
        )}

        {streamingData.toolResult && (
          <div className="tool-result">
            Tool result: {streamingData.toolResult}
          </div>
        )}

        {streamingData.content && loading && (
          <div className="assistant streaming">{streamingData.content}</div>
        )}

        {streamingData.error && (
          <div className="error">Error: {streamingData.error}</div>
        )}
      </div>

      <form onSubmit={sendMessage}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Send a message..."
          disabled={loading || !sessionId}
        />
        <button type="submit" disabled={loading || !sessionId}>
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
```

</details>

## License

This project is licensed under the ISC License.

## Support

For issues and feature requests, please use the GitHub issue tracker.

## Appendix: Understanding Client Flow and Architecture

This appendix provides a detailed explanation of how the TS-MCP-Client works internally, to help you understand the underlying architecture when integrating it into your applications.

### Data Flow Architecture

The MCP Client follows a structured data flow between components:

```mermaid
sequenceDiagram
    participant User
    participant Host as Host Application
    participant Client as TS-MCP-Client
    participant Server as MCP Servers
    participant LLM as LLM (Anthropic)

    %% Initialization Flow
    User->>Host: Open Chat Interface
    Host->>Client: Initialize Client
    Client->>Client: Load Config
    Client->>Server: Launch & Discover Servers
    Server-->>Client: Tool Capabilities
    Client->>LLM: Initialize Session with Tools
    LLM-->>Client: Session Created
    Client-->>Host: Session Ready + Tools List
    Host-->>User: Display Interface

    %% Message Flow
    User->>Host: Send Message
    Host->>Client: Forward Message
    Client->>Client: Update Session Activity
    Client->>LLM: Send w/Tools Context
    LLM-->>Client: Response w/Tool Call

    %% Start Streaming Updates
    Client-->>Host: Stream: Thinking
    Host-->>User: Display Thinking

    Client->>Server: Execute Tool
    Server-->>Client: Tool Result
    Client-->>Host: Stream: Tool Result
    Host-->>User: Display Tool Result

    Client->>LLM: Send Tool Result
    LLM-->>Client: Final Response
    Client->>Client: Update Session State
    Client-->>Host: Stream: Content
    Host-->>User: Display Content
```

### Key Technical Concepts

1. **Session Lifecycle Management**

   The client manages the entire session lifecycle:
   
   ```typescript
   // 1. Initialize a session
   const sessionManager = new SessionManager();
   const session = await sessionManager.initializeSession(config);
   const sessionId = session.id;
   
   // 2. Send messages using the session ID
   const response = await sessionManager.sendMessage(sessionId, userMessage);
   
   // 3. Use streaming for real-time updates
   const stream = sessionManager.sendMessageStream(sessionId, userMessage);
   for await (const chunk of stream) {
     // Process streaming chunks
   }
   ```

2. **Server Management**

   Servers are automatically launched, monitored, and shut down:
   
   ```typescript
   // Defined in config:
   const config = {
     servers: {
       filesystem: {
         command: 'npx',
         args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
         env: {},
       },
     },
     // Other config...
   };
   
   // The client handles server lifecycle automatically:
   // - Launches servers when session is initialized
   // - Health checks servers during operation
   // - Shuts down servers when session ends/expires
   ```

3. **Tool Execution Flow**

   When the LLM decides to use a tool:
   
   1. Client receives tool call request from LLM
   2. Client identifies which server can handle the tool
   3. Client formats the request according to MCP protocol
   4. Server executes tool and returns results
   5. Client formats results and sends back to LLM
   6. LLM incorporates tool results into final response

### Error Handling Strategy

The client implements comprehensive error handling:

```typescript
try {
  // Initialize session
  const session = await sessionManager.initializeSession(config);
} catch (error) {
  if (error.code === 'server_launch_error') {
    // Handle server launch failures
  } else if (error.code === 'llm_error') {
    // Handle LLM-specific errors
  }
}

// For streaming, errors come through the stream:
const stream = sessionManager.sendMessageStream(sessionId, userMessage);
for await (const chunk of stream) {
  if (chunk.type === 'error') {
    // Handle error during streaming
    console.error('Error during tool execution:', chunk.error);
  }
}
```

### Cross-Version Compatibility

The client handles tool name normalization across different MCP SDK versions:

```typescript
// Internally, the client normalizes tool names between different versions
// For example, in discovery.ts:
function normalizeToolName(name: string): string {
  return name.replace(/^mcp_/, '');
}

// And in session.ts:
function mapToolName(name: string): string {
  return name.startsWith('mcp_') ? name : `mcp_${name}`;
}
```

### Performance Optimizations

1. **Connection Pooling**
   - Reuses connections to servers when possible
   - Avoids unnecessary server restarts

2. **Capability Caching**
   - Stores tool capabilities after discovery
   - Avoids redundant capability queries

3. **Streaming Processing**
   - Provides real-time updates through streaming
   - Reduces perceived latency for users

### Integration Architecture Diagram

```mermaid
graph TD
    Host[Host Application] --> |Renders UI| UI[User Interface]
    Host --> |API Calls| Client[TS-MCP-Client]
    Client --> |Session Management| Store[Session Store]
    Client --> |Server Control| Servers[MCP Servers]
    Client --> |LLM Requests| LLM[Anthropic API]
    Store --> |Persistence| DB[Storage]
    Servers --> |Tool Execution| Resources[External Resources]
    
    subgraph TS-MCP-Client Modules
        Client --> SessionManager
        Client --> ServerManager
        Client --> LLMConnector
        Client --> ConfigValidator
    end
```

This architecture allows for clean separation of concerns, where:

1. **Host Application** focuses on user experience
2. **TS-MCP-Client** manages all the complex orchestration
3. **MCP Servers** handle specific tool functionalities
4. **LLM** provides the intelligence and decision-making

By understanding this flow, you can better integrate the client into your applications and debug any issues that may arise during development.
