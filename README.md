# TypeScript MCP Client

A TypeScript implementation of a Model Context Protocol (MCP) client that manages LLM chat interactions, server lifecycle, and tool invocations through MCP servers.

## Features

- Complete configuration management and validation
- LLM session initialization and management
- Server lifecycle management (launch, health checks, shutdown)
- Tool capability discovery and invocation
- Tool call limit enforcement
- Streaming conversation responses
- Error handling and recovery
- Express middleware for easy integration

## Core Responsibilities

The MCP client handles several key responsibilities in the MCP architecture:

1. **Configuration Management**

   - Loads and validates configuration files
   - Enforces required fields (llm, max_tool_calls, servers)
   - Validates server configurations
   - Example:

   ```typescript
   interface MCPConfig {
     llm: LLMConfig;
     max_tool_calls: number; // Required: Maximum number of tool calls per session
     servers: Record<string, ServerConfig>; // Required: Server configurations
   }
   ```

2. **Server Management**

   - Launches MCP servers based on configuration
   - Performs health checks
   - Manages server lifecycle
   - Discovers and caches tool capabilities
   - Example:

   ```typescript
   interface ServerConfig {
     command: string; // Required: Command to launch the server
     args?: string[]; // Optional: Command line arguments
     env?: Record<string, string>; // Optional: Environment variables
   }
   ```

3. **Tool Invocation**

   - Detects tool calls in LLM responses
   - Routes tool calls to appropriate servers
   - Enforces tool call limits
   - Handles tool execution errors
   - Integrates tool results back into conversations

4. **Session Management**
   - Initializes and maintains chat sessions
   - Tracks conversation history
   - Manages tool call limits per session
   - Handles session cleanup

## Installation

```bash
npm install @rinardnick/ts-mcp-client
```

## Usage in Next.js

### 1. Configuration Setup

Create a `config.json` file in your project root:

```json
{
  "llm": {
    "type": "claude",
    "model": "claude-3-5-sonnet-20241022",
    "apiKey": "YOUR_API_KEY_HERE",
    "systemPrompt": "You are a helpful assistant."
  },
  "max_tool_calls": 10,
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

### 2. API Route Setup

Create a new API route in your Next.js project (e.g., `pages/api/chat/[[...params]].ts`):

```typescript
import { SessionManager, LLMConfig } from '@rinardnick/ts-mcp-client';
import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@rinardnick/ts-mcp-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let sessionManager: SessionManager;

async function initializeIfNeeded() {
  if (!sessionManager) {
    try {
      // Load and validate configuration
      const config = await loadConfig('config.json');

      // Create session manager
      sessionManager = new SessionManager();

      // Initialize session with LLM config and server setup
      const session = await sessionManager.initializeSession(
        config.llm,
        config.servers,
        config.max_tool_calls
      );

      console.log('[INIT] Session manager initialized successfully');
      if (session.mcpClient) {
        console.log('[INIT] Available tools:', session.mcpClient.tools);
      }
    } catch (error) {
      console.error('[INIT] Failed to initialize:', error);
      throw error;
    }
  }
}

export async function POST(request: NextRequest) {
  await initializeIfNeeded();
  // ... rest of your route handler
}
```

### 3. Frontend Implementation

Create a chat component (e.g., `components/Chat.tsx`):

```typescript
import { useState, useEffect } from 'react';
import { LLMConfig } from '@rinardnick/ts-mcp-client';

export function Chat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string }>
  >([]);
  const [input, setInput] = useState('');

  // Initialize chat session
  useEffect(() => {
    const config: LLMConfig = {
      type: 'claude',
      api_key: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY!,
      system_prompt: 'You are a helpful assistant.',
      model: 'claude-3-5-sonnet-20241022',
    };

    fetch('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
      .then(res => res.json())
      .then(({ sessionId }) => setSessionId(sessionId));
  }, []);

  // Send message and handle streaming response
  const sendMessage = async (message: string) => {
    if (!sessionId) return;

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setInput('');

    // Set up SSE connection
    const eventSource = new EventSource(
      `/api/chat/session/${sessionId}/stream?message=${encodeURIComponent(
        message
      )}`
    );
    let assistantMessage = '';

    eventSource.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.type === 'content') {
        assistantMessage += data.content;
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];

          if (lastMessage?.role === 'assistant') {
            lastMessage.content = assistantMessage;
          } else {
            newMessages.push({ role: 'assistant', content: assistantMessage });
          }

          return newMessages;
        });
      } else if (data.type === 'done') {
        eventSource.close();
      } else if (data.type === 'error') {
        console.error('Error:', data.error);
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="Type your message..."
        />
        <button onClick={() => sendMessage(input)}>Send</button>
      </div>
    </div>
  );
}
```

## Client Architecture

The client follows a clear separation of responsibilities:

1. **Configuration Layer**

   - Validates all configuration before use
   - Ensures required fields are present
   - Type-checks all values
   - Provides helpful error messages

2. **Server Management Layer**

   - Handles server lifecycle
   - Performs health checks
   - Discovers tool capabilities
   - Manages server errors and recovery

3. **Session Management Layer**

   - Tracks active sessions
   - Manages conversation history
   - Enforces tool call limits
   - Handles cleanup

4. **Tool Invocation Layer**
   - Detects tool calls in LLM responses
   - Routes calls to appropriate servers
   - Handles tool execution
   - Integrates results into conversations

## Best Practices

1. **Configuration Management**

   - Always use `loadConfig` to load and validate configuration
   - Include all required fields (llm, max_tool_calls, servers)
   - Provide clear server configurations

2. **Server Management**

   - Let the client handle server lifecycle
   - Don't interact with servers directly
   - Use the client's API for all tool interactions

3. **Session Management**

   - Initialize sessions through the SessionManager
   - Let the client track tool call limits
   - Use the streaming API for real-time updates

4. **Error Handling**
   - Handle configuration errors during startup
   - Implement proper error recovery in UI
   - Use the client's error types for specific handling

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build
```

## API Reference

### Configuration Types

```typescript
interface LLMConfig {
  type: string;
  api_key: string;
  system_prompt: string;
  model: string;
}

interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  llm: LLMConfig;
  max_tool_calls: number;
  servers: Record<string, ServerConfig>;
}
```

### Session Management

```typescript
class SessionManager {
  async initializeSession(
    config: LLMConfig,
    servers?: Record<string, ServerConfig>,
    maxToolCalls?: number
  ): Promise<ChatSession>;

  async sendMessage(sessionId: string, message: string): Promise<any>;

  async *sendMessageStream(sessionId: string, message: string): AsyncGenerator;
}
```

### Error Types

```typescript
class ConfigurationError extends Error {}
class LLMError extends Error {}
```

## License

ISC
