# TypeScript MCP Client

A TypeScript implementation of a Model Context Protocol (MCP) client that enables LLM chat interactions and tool invocations through MCP servers.

## Features

- Load and validate configuration from JSON files
- Initialize LLM chat sessions using the Anthropic SDK
- Stream conversation responses back to the host
- Handle errors and provide detailed logging
- Express middleware for easy integration

## Installation

```bash
npm install @rinardnick/ts-mcp-client
```

## Usage in Next.js

### 1. API Route Setup

Create a new API route in your Next.js project (e.g., `pages/api/chat/[[...params]].ts`):

```typescript
import { createChatRouter } from '@rinardnick/ts-mcp-client';
import express from 'express';
import { createServer } from 'http';

const app = express();
const chatRouter = createChatRouter();
app.use('/api/chat', chatRouter);

export default function handler(req, res) {
  app(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
```

### 2. Frontend Implementation

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

### 3. Add Styling

Add some basic styles (e.g., `styles/Chat.css`):

```css
.chat-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.messages {
  height: 500px;
  overflow-y: auto;
  border: 1px solid #ccc;
  padding: 10px;
  margin-bottom: 20px;
}

.message {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 5px;
}

.message.user {
  background-color: #e3f2fd;
  margin-left: 20%;
}

.message.assistant {
  background-color: #f5f5f5;
  margin-right: 20%;
}

.input-container {
  display: flex;
  gap: 10px;
}

input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
}

button {
  padding: 10px 20px;
  background-color: #0070f3;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

button:hover {
  background-color: #0051cc;
}
```

## Configuration

The client requires a configuration object with the following structure:

```typescript
interface LLMConfig {
  type: string;
  api_key: string;
  system_prompt: string;
  model: string;
}
```

## API Endpoints

The package provides the following endpoints through the Express router:

- `POST /session` - Create a new chat session
- `POST /session/:sessionId/message` - Send a message and receive a response
- `POST /session/:sessionId/stream` - Send a message and receive a streaming response

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build
```

## License

ISC
