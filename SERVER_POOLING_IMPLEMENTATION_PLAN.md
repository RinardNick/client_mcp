SERVER_POOLING_IMPLEMENTATION_PLAN.md

# Implementation Plan: Server Pooling for client_mcp Package

## 1. Problem Statement

### Current State

The `client_mcp` package currently manages server instances at the session level, where each chat session launches its own dedicated server instances. This approach results in:

- **Resource inefficiency**: Multiple sessions running the same server type consume unnecessary system resources
- **Startup latency**: Each new session must wait for server initialization
- **Duplicate configurations**: The same server configurations are defined and initialized multiple times
- **Isolated tools**: Tools and resources aren't shared between sessions even when they're identical

### Desired State

Implement a centralized server pool management system that allows:

- Multiple sessions to share the same running server instances
- Centralized server lifecycle management
- More efficient resource utilization
- Faster session initialization by using already-running servers

## 2. Requirements Specification

### Functional Requirements

1. **Server Pool Creation and Management**

   - Initialize server instances only once regardless of how many sessions use them
   - Maintain a registry of running servers with their capabilities
   - Track server usage across sessions

2. **Session Integration**

   - Allow sessions to request access to existing servers from the pool
   - Connect sessions to appropriate servers based on their configuration needs
   - Maintain backward compatibility with the current per-session server model

3. **Server Lifecycle Management**
   - Automatically start servers when first needed
   - Keep servers running as long as sessions are using them
   - Provide option to keep idle servers running or automatically shut them down
   - Support server restart/recovery when failures occur

### Non-Functional Requirements

1. **Performance**

   - Reduce session initialization time by reusing existing server connections
   - Minimize memory and CPU usage through server sharing

2. **Reliability**

   - Handle server failures without disrupting all connected sessions
   - Provide graceful degradation when a shared server fails

3. **Compatibility**
   - Maintain backward compatibility with existing client_mcp API
   - Allow gradual migration path for existing applications

## 3. Implementation Approach

The implementation will build on the existing `ServerLauncher` and `ServerDiscovery` classes by creating a new `ServerPool` singleton that manages shared server instances.

### Core Components

1. **ServerPool Class (New)**

   - Singleton pattern for global server management
   - Maintains registry of running servers and their capabilities
   - Tracks which sessions are using which servers
   - Provides methods for requesting server access

2. **SessionManager Updates**

   - Modified to use ServerPool instead of directly using ServerLauncher
   - New option for sharing servers or using session-specific servers

3. **Global Store Integration**
   - Updated to maintain references between sessions and servers

## 4. API Design

```typescript
/**
 * Main singleton class for server pool management
 */
export class ServerPool {
  private static instance: ServerPool;
  private servers: Map<string, ChildProcess>;
  private serverClients: Map<string, Client>;
  private serverCapabilities: Map<string, ServerCapabilities>;
  private sessionServerMap: Map<string, Set<string>>;
  private serverSessionMap: Map<string, Set<string>>;
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;

  /**
   * Get the singleton instance
   */
  public static getInstance(): ServerPool {
    if (!ServerPool.instance) {
      ServerPool.instance = new ServerPool();
    }
    return ServerPool.instance;
  }

  /**
   * Initialize a server if it doesn't already exist in the pool
   */
  public async getOrCreateServer(
    serverName: string,
    config: ServerConfig
  ): Promise<{
    client: Client;
    capabilities: ServerCapabilities;
  }> {
    // Implementation details
  }

  /**
   * Associate a session with a server for tracking
   */
  public registerSessionServer(sessionId: string, serverName: string): void {
    // Implementation details
  }

  /**
   * Get all servers a session is using
   */
  public getSessionServers(sessionId: string): string[] {
    // Implementation details
  }

  /**
   * Get all sessions using a server
   */
  public getServerSessions(serverName: string): string[] {
    // Implementation details
  }

  /**
   * Check if a server is already running
   */
  public hasServer(serverName: string): boolean {
    // Implementation details
  }

  /**
   * Clean up servers when sessions end
   */
  public releaseSessionServers(sessionId: string): void {
    // Implementation details
  }

  /**
   * Clean up a server if no sessions are using it
   */
  public cleanupUnusedServer(serverName: string): void {
    // Implementation details
  }

  /**
   * Restart a server and reconnect all affected sessions
   */
  public async restartServer(serverName: string): Promise<void> {
    // Implementation details
  }
}
```

### SessionManager Integration

```typescript
class SessionManager {
  // Add new configuration option
  private useSharedServers: boolean;

  constructor(options?: { useSharedServers?: boolean }) {
    this.useSharedServers = options?.useSharedServers ?? true;
    this.serverLauncher = new ServerLauncher();
    this.serverDiscovery = new ServerDiscovery();
  }

  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    // Create session as usual
    const sessionId = uuidv4();
    const session: ChatSession = {
      /* initialization */
    };

    // Launch MCP servers if configured
    if (config.servers) {
      if (this.useSharedServers) {
        // Use ServerPool for shared servers
        const serverPool = ServerPool.getInstance();

        for (const [serverName, serverConfig] of Object.entries(
          config.servers
        )) {
          try {
            // Get or create server from pool
            const result = await serverPool.getOrCreateServer(
              serverName,
              serverConfig
            );

            // Store client and capabilities
            session.serverClients.set(serverName, result.client);
            session.tools.push(...result.capabilities.tools);
            session.resources.push(...result.capabilities.resources);

            // Register session-server association
            serverPool.registerSessionServer(sessionId, serverName);
          } catch (error) {
            // Error handling
          }
        }
      } else {
        // Use existing direct server initialization logic
        // for backward compatibility
      }
    }

    // Rest of initializeSession implementation
  }

  // Rest of SessionManager implementation
}
```

## 5. Implementation Details

### ServerPool Implementation

```typescript
private constructor() {
  this.servers = new Map();
  this.serverClients = new Map();
  this.serverCapabilities = new Map();
  this.sessionServerMap = new Map();
  this.serverSessionMap = new Map();
  this.serverLauncher = new ServerLauncher();
  this.serverDiscovery = new ServerDiscovery();
}

public async getOrCreateServer(
  serverName: string,
  config: ServerConfig
): Promise<{
  client: Client;
  capabilities: ServerCapabilities;
}> {
  // Check if server already exists
  if (this.serverClients.has(serverName)) {
    console.log(`[SERVER_POOL] Reusing existing server: ${serverName}`);
    return {
      client: this.serverClients.get(serverName)!,
      capabilities: this.serverCapabilities.get(serverName)!
    };
  }

  // Launch new server
  console.log(`[SERVER_POOL] Launching new server: ${serverName}`);
  const serverProcess = await this.serverLauncher.launchServer(serverName, config);
  this.servers.set(serverName, serverProcess);

  // Discover capabilities
  const result = await this.serverDiscovery.discoverCapabilities(
    serverName,
    serverProcess
  );

  // Store in pool
  this.serverClients.set(serverName, result.client);
  this.serverCapabilities.set(serverName, result.capabilities);

  return result;
}

public registerSessionServer(sessionId: string, serverName: string): void {
  // Add server to session's set
  if (!this.sessionServerMap.has(sessionId)) {
    this.sessionServerMap.set(sessionId, new Set());
  }
  this.sessionServerMap.get(sessionId)!.add(serverName);

  // Add session to server's set
  if (!this.serverSessionMap.has(serverName)) {
    this.serverSessionMap.set(serverName, new Set());
  }
  this.serverSessionMap.get(serverName)!.add(sessionId);

  console.log(`[SERVER_POOL] Registered session ${sessionId} with server ${serverName}`);
}

public releaseSessionServers(sessionId: string): void {
  const serverNames = this.getSessionServers(sessionId);

  // Remove session from tracking
  this.sessionServerMap.delete(sessionId);

  // Update server session maps and clean up unused servers
  for (const serverName of serverNames) {
    const sessions = this.serverSessionMap.get(serverName);
    if (sessions) {
      sessions.delete(sessionId);

      // If no sessions are using this server, consider cleaning it up
      if (sessions.size === 0) {
        this.cleanupUnusedServer(serverName);
      }
    }
  }

  console.log(`[SERVER_POOL] Released all servers for session ${sessionId}`);
}

public cleanupUnusedServer(serverName: string): void {
  const sessions = this.serverSessionMap.get(serverName);

  // Only clean up if no sessions are using this server
  if (!sessions || sessions.size === 0) {
    // Clean up server resources
    this.serverLauncher.cleanup(serverName);

    // Remove from pool
    this.servers.delete(serverName);
    this.serverClients.delete(serverName);
    this.serverCapabilities.delete(serverName);
    this.serverSessionMap.delete(serverName);

    console.log(`[SERVER_POOL] Cleaned up unused server: ${serverName}`);
  }
}
```

### SessionManager.cleanup() Updates

```typescript
async cleanup() {
  console.log('[SESSION] Starting cleanup...');

  // If using shared servers, release from pool
  if (this.useSharedServers) {
    const serverPool = ServerPool.getInstance();

    // Release each session's servers
    for (const [sessionId, session] of globalSessions.entries()) {
      serverPool.releaseSessionServers(sessionId);
    }
  } else {
    // Original cleanup code for non-shared servers
    for (const [sessionId, session] of globalSessions.entries()) {
      console.log(`[SESSION] Closing connections for session ${sessionId}`);
      for (const [serverName, client] of session.serverClients.entries()) {
        if (client && typeof client.close === 'function') {
          try {
            client.close();
            console.log(`[SESSION] Closed client for ${serverName}`);
          } catch (error) {
            console.error(
              `[SESSION] Error closing client for ${serverName}:`,
              error
            );
          }
        }
      }
    }

    // Stop all server processes
    console.log('[SESSION] Stopping all server processes');
    await this.serverLauncher.stopAll();
  }

  // Clear all sessions
  console.log('[SESSION] Clearing session store');
  globalSessions.clear();
}
```

## 6. Testing Strategy

### Unit Tests

1. **ServerPool Tests**

   - Test singleton behavior
   - Test server creation and reuse
   - Test session-server tracking
   - Test cleanup behavior

2. **SessionManager Integration**
   - Test with shared servers enabled
   - Test with shared servers disabled (backward compatibility)
   - Test server failure handling

### Example Test Cases

```typescript
describe('ServerPool', () => {
  let serverPool: ServerPool;

  beforeEach(() => {
    // Reset singleton for tests
    (ServerPool as any).instance = undefined;
    serverPool = ServerPool.getInstance();
  });

  it('should be a singleton', () => {
    const instance1 = ServerPool.getInstance();
    const instance2 = ServerPool.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should reuse existing servers', async () => {
    const serverConfig = {
      command: 'node',
      args: ['./server.js'],
    };

    // First call should create server
    const result1 = await serverPool.getOrCreateServer(
      'test-server',
      serverConfig
    );

    // Second call should reuse
    const result2 = await serverPool.getOrCreateServer(
      'test-server',
      serverConfig
    );

    expect(result1.client).toBe(result2.client);
    expect(serverPool.hasServer('test-server')).toBe(true);
  });

  it('should track session-server associations', () => {
    serverPool.registerSessionServer('session1', 'server1');
    serverPool.registerSessionServer('session1', 'server2');
    serverPool.registerSessionServer('session2', 'server1');

    expect(serverPool.getSessionServers('session1')).toContain('server1');
    expect(serverPool.getSessionServers('session1')).toContain('server2');
    expect(serverPool.getServerSessions('server1')).toContain('session1');
    expect(serverPool.getServerSessions('server1')).toContain('session2');
  });

  it('should clean up unused servers', () => {
    // Setup
    serverPool.registerSessionServer('session1', 'server1');

    // Release
    serverPool.releaseSessionServers('session1');

    // Server should be cleaned up
    expect(serverPool.hasServer('server1')).toBe(false);
  });
});
```

## 7. Migration Path for Existing Applications

### Backward Compatibility

The implementation maintains backward compatibility in multiple ways:

1. **Opt-in Behavior**: Applications must explicitly enable shared servers
2. **Same Public API**: The `SessionManager.initializeSession` API remains unchanged
3. **Automatic Fallback**: If a server pool doesn't have the right server, it creates one

### For Current client_mcp Users

1. **Minimal Changes Required**:

```typescript
// Old code (still works)
const sessionManager = new SessionManager();
const session = await sessionManager.initializeSession(config);

// New code with shared servers
const sessionManager = new SessionManager({ useSharedServers: true });
const session = await sessionManager.initializeSession(config);
```

2. **Server Naming Considerations**:
   - Use consistent server names across sessions to maximize sharing
   - Server names should be based on their function rather than session IDs

## 8. Implementation Phases

### Phase 1: Core ServerPool Implementation

1. Create ServerPool class
2. Implement server tracking and reuse
3. Add session-server association tracking
4. Implement cleanup logic

### Phase 2: SessionManager Integration

1. Add useSharedServers option
2. Modify initializeSession to use ServerPool
3. Update cleanup method

### Phase 3: Advanced Features

1. Add server health monitoring
2. Implement automatic recovery
3. Add configuration for server lifetime policies

## 9. Example Usage

```typescript
// Application startup
import { SessionManager } from '@rinardnick/client_mcp';

// Create session manager with shared servers
const sessionManager = new SessionManager({
  useSharedServers: true,
});

// When creating a new session
const session1 = await sessionManager.initializeSession({
  type: 'anthropic',
  api_key: 'your-api-key',
  model: 'claude-3-sonnet-20240229',
  system_prompt: 'You are a helpful assistant',
  servers: {
    'fs-server': {
      command: 'python',
      args: ['-m', 'client_mcp.server'],
      env: {
        /* environment variables */
      },
    },
  },
});

// Later, create another session
// This will reuse the same 'fs-server' instance
const session2 = await sessionManager.initializeSession({
  type: 'anthropic',
  api_key: 'another-api-key',
  model: 'claude-3-opus-20240229',
  system_prompt: 'You are a helpful assistant',
  servers: {
    'fs-server': {
      command: 'python',
      args: ['-m', 'client_mcp.server'],
      env: {
        /* environment variables */
      },
    },
  },
});

// Both sessions now share the same server instance
```

## 10. Conclusion

The proposed server pooling implementation for client_mcp offers significant benefits in terms of resource efficiency and initialization performance while maintaining backward compatibility. By centralizing server management, applications can create multiple chat sessions that share the same underlying servers, reducing system resource usage and improving startup times.

This design builds on the existing architecture and minimizes changes to the public API, allowing for gradual adoption by current users. The implementation focuses on practical concerns like proper resource cleanup and failure handling to ensure reliable operation in production environments.
