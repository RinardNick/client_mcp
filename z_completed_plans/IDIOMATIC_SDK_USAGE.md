# Idiomatic MCP SDK Usage

This guide outlines the recommended patterns for using the Model Context Protocol TypeScript SDK to implement the architecture described in `dataflow.md`.

## SDK Core Components

The MCP TypeScript SDK provides several key components that directly map to the Python SDK equivalents:

| Python SDK | TypeScript SDK | Purpose |
|------------|---------------|---------|
| `ClientSession` | `Client` | High-level client interface for server interaction |
| `stdio_client` | `StdioClientTransport` | Transport layer for communicating with servers |
| `session.list_tools()` | `client.listTools({})` | Get available tools from server |
| `session.call_tool()` | `client.callTool()` | Execute a tool with parameters |

## Server Lifecycle Implementation

### 1. Server Initialization

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function launchServer(
  serverName: string,
  config: ServerConfig
): Promise<{ client: Client, capabilities: ServerCapabilities }> {
  // Launch the server process
  const serverProcess = spawn(config.command, config.args, {
    env: { ...process.env, ...config.env },
  });

  // Create and initialize the transport
  const transport = new StdioClientTransport({
    command: serverProcess.spawnfile,
    args: serverProcess.spawnargs.slice(1),
  });

  // Create the MCP client
  const client = new Client(
    {
      name: "mcp-client",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {}
      }
    }
  );

  try {
    // Connect to the server (handles protocol handshake)
    await client.connect(transport);
    
    // Discover server capabilities
    const toolsResult = await client.listTools({});
    const resourcesResult = await client.listResources({});
    
    const capabilities = {
      tools: toolsResult.tools || [],
      resources: resourcesResult.resources || []
    };
    
    return { client, capabilities };
  } catch (error) {
    // Clean up on error
    await transport.close();
    throw error;
  }
}
```

### 2. Tool Execution

```typescript
export async function executeTool(
  client: Client,
  toolName: string,
  parameters: Record<string, unknown>
) {
  try {
    // Call the tool using the high-level client interface
    const result = await client.callTool({
      name: toolName,
      parameters
    });
    
    return result;
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    throw error;
  }
}
```

## Session Management with Anthropic

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Anthropic } from "@anthropic-ai/sdk";

export class SessionManager {
  private anthropic: Anthropic;
  private serverClients: Map<string, Client> = new Map();
  private sessionMessages: Map<string, any[]> = new Map();
  
  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }
  
  async registerServer(serverName: string, client: Client, capabilities: ServerCapabilities) {
    this.serverClients.set(serverName, client);
  }
  
  async processMessage(sessionId: string, message: string) {
    // Get or initialize session messages
    if (!this.sessionMessages.has(sessionId)) {
      this.sessionMessages.set(sessionId, []);
    }
    const messages = this.sessionMessages.get(sessionId)!;
    
    // Add user message
    messages.push({
      role: "user",
      content: message
    });
    
    // Format tools for Anthropic
    const availableTools = await this.getAvailableTools();
    
    // Send message to Anthropic with tools
    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages,
      tools: availableTools
    });
    
    // Process response and handle tool calls
    for (const content of response.content) {
      if (content.type === 'text') {
        // Handle text response
        messages.push({
          role: "assistant",
          content: [content]
        });
      } else if (content.type === 'tool_use') {
        // Execute tool
        const toolName = content.name;
        const parameters = content.input;
        const client = this.findClientForTool(toolName);
        
        if (client) {
          const result = await client.callTool({
            name: toolName,
            parameters
          });
          
          // Add assistant message with tool call
          messages.push({
            role: "assistant",
            content: [content]
          });
          
          // Add tool result
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: JSON.stringify(result)
              }
            ]
          });
        }
      }
    }
    
    return response;
  }
  
  private async getAvailableTools() {
    const tools = [];
    
    for (const [serverName, client] of this.serverClients.entries()) {
      try {
        const toolsResult = await client.listTools({});
        
        // Format tools for Anthropic
        for (const tool of toolsResult.tools) {
          tools.push({
            name: tool.name,
            description: tool.description || '',
            input_schema: tool.inputSchema
          });
        }
      } catch (error) {
        console.error(`Error getting tools from ${serverName}:`, error);
      }
    }
    
    return tools;
  }
  
  private findClientForTool(toolName: string): Client | undefined {
    for (const [serverName, client] of this.serverClients.entries()) {
      try {
        // Check if this server has the requested tool
        const toolsResult = client.getServerCapabilities()?.tools;
        if (toolsResult?.some(tool => tool.name === toolName)) {
          return client;
        }
      } catch (error) {
        console.error(`Error checking tools in ${serverName}:`, error);
      }
    }
    
    return undefined;
  }
}
```

## Streaming Implementation

The SDK allows for streaming responses. Here's how to implement streaming:

```typescript
export async function* streamMessage(
  sessionManager: SessionManager,
  sessionId: string,
  message: string
) {
  // Yield 'thinking' state
  yield { type: 'thinking' };
  
  // Process the message and get response
  const response = await sessionManager.processMessage(sessionId, message);
  
  // Get all tool calls and results
  const toolEvents = [];
  
  for (const content of response.content) {
    if (content.type === 'tool_use') {
      // Yield tool start
      yield {
        type: 'tool_start',
        content: {
          name: content.name,
          parameters: content.input
        }
      };
      
      // Find matching tool result
      const toolResult = response.messages
        .find(msg => 
          msg.content?.some?.(c => 
            c.type === 'tool_result' && c.tool_use_id === content.id
          )
        );
      
      if (toolResult) {
        // Yield tool result
        yield {
          type: 'tool_result',
          content: toolResult.content
        };
      }
    }
  }
  
  // Yield final content
  const textContent = response.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
  
  yield {
    type: 'content',
    content: textContent
  };
  
  // Yield done
  yield { type: 'done' };
}
```

## Error Handling and Recovery

Proper error handling is essential when working with the MCP SDK:

```typescript
async function withRetry<T>(
  operation: () => Promise<T>, 
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        // Exponential backoff
        delay *= 2;
      }
    }
  }
  
  throw lastError;
}

// Example usage:
try {
  const result = await withRetry(() => client.callTool({
    name: 'list-files',
    parameters: { path: '/tmp' }
  }));
} catch (error) {
  // Handle final failure after all retries
}
```

## Best Practices

1. **Server Management**
   - Always clean up server resources with `transport.close()`
   - Use a registry to track server capabilities for efficient tool routing
   - Implement health checks using the SDK's built-in protocol handshake

2. **Tool Execution**
   - Cache tool capabilities to avoid repeated discovery
   - Validate parameters before calling tools
   - Handle tool results correctly in the LLM context

3. **Error Handling**
   - Implement proper retries for network-related failures
   - Provide detailed error messages for debugging
   - Use structured error types for better error handling

4. **Performance**
   - Reuse client connections when possible
   - Implement connection pooling for multi-user scenarios
   - Use the SDK's built-in capabilities caching

This guide demonstrates how to idiomatically use the MCP TypeScript SDK to implement the architecture described in dataflow.md, following patterns similar to the Python SDK example.