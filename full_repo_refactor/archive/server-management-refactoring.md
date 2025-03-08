# Server Management Refactoring

## Current Implementation

Based on the code analysis, the current SessionManager has server management responsibilities mixed with session management:

```typescript
// From session.ts
export class SessionManager {
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;
  private useSharedServers: boolean;

  // Server-related methods
  async _restartServer(sessionId: string, serverName: string): Promise<void> {
    // Server restart logic
  }

  // Server initialization during session creation
  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    // ...
    // Launch MCP servers if configured
    if (config.servers) {
      console.log('[SESSION] Launching MCP servers');
      // Server launching logic
      // ...
    }
    // ...
  }

  // Server cleanup
  async cleanup() {
    // ...
    if (this.useSharedServers) {
      // If using shared servers, release from pool
      // ...
    } else {
      // Close all connections and stop servers
      // ...
    }
    // ...
  }
}
```

## Issues with Current Implementation

1. **Mixed Responsibilities**: The SessionManager manages both session lifecycles and server processes.

2. **Tight Coupling**: Server management logic is tightly coupled with session management.

3. **Limited Scalability**: The current design makes it difficult to scale server management independently of sessions.

4. **Testing Complexity**: Mixed concerns make it harder to test each concern in isolation.

## Proposed Server Management Component

### 1. Interface Definition

```typescript
// src/server/server-manager.ts
import { ServerConfig } from '../config/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface ServerManager {
  /**
   * Start a server with the given configuration
   * @param serverName Identifier for the server
   * @param config Server configuration
   * @returns Client connected to the server
   */
  startServer(serverName: string, config: ServerConfig): Promise<Client>;

  /**
   * Get a client for an existing server
   * @param serverName Identifier for the server
   * @returns Client connected to the server or null if not found
   */
  getServerClient(serverName: string): Promise<Client | null>;

  /**
   * Restart a server
   * @param serverName Identifier for the server
   * @returns New client connected to the restarted server
   */
  restartServer(serverName: string): Promise<Client>;

  /**
   * Stop a specific server
   * @param serverName Identifier for the server
   */
  stopServer(serverName: string): Promise<void>;

  /**
   * Stop all servers managed by this instance
   */
  stopAllServers(): Promise<void>;

  /**
   * Register a session with servers
   * @param sessionId Identifier for the session
   * @param serverNames List of server names associated with the session
   */
  registerSessionServers(sessionId: string, serverNames: string[]): void;

  /**
   * Release servers associated with a session
   * @param sessionId Identifier for the session
   */
  releaseSessionServers(sessionId: string): Promise<void>;
}
```

### 2. Implementation

```typescript
// src/server/default-server-manager.ts
import { ServerManager } from './server-manager';
import { ServerLauncher } from './launcher';
import { ServerDiscovery } from './discovery';
import { ServerConfig } from '../config/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export class DefaultServerManager implements ServerManager {
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;
  private activeServers: Map<string, { process: any; client: Client }>;
  private sessionServers: Map<string, Set<string>>;

  constructor() {
    this.serverLauncher = new ServerLauncher();
    this.serverDiscovery = new ServerDiscovery();
    this.activeServers = new Map();
    this.sessionServers = new Map();
  }

  async startServer(serverName: string, config: ServerConfig): Promise<Client> {
    console.log(`[SERVER] Starting server ${serverName}`);

    // Check if server is already running
    const existingServer = this.activeServers.get(serverName);
    if (existingServer) {
      console.log(`[SERVER] Server ${serverName} is already running`);
      return existingServer.client;
    }

    // Launch server process
    const serverProcess = await this.serverLauncher.launchServer(
      serverName,
      config
    );

    // Connect to the server
    const endpoint = await this.serverDiscovery.waitForServer(serverName);
    const client = new Client(endpoint);
    await client.connect();

    // Store server information
    this.activeServers.set(serverName, { process: serverProcess, client });

    return client;
  }

  // Implementations of other methods...
}
```

### 3. Shared Server Pool

```typescript
// src/server/server-pool.ts
import { ServerManager } from './server-manager';
import { DefaultServerManager } from './default-server-manager';
import { ServerConfig } from '../config/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Singleton pool for managing shared servers across sessions
 */
export class ServerPool {
  private static instance: ServerPool;
  private serverManager: ServerManager;
  private refCounts: Map<string, number>;

  private constructor() {
    this.serverManager = new DefaultServerManager();
    this.refCounts = new Map();
  }

  public static getInstance(): ServerPool {
    if (!ServerPool.instance) {
      ServerPool.instance = new ServerPool();
    }
    return ServerPool.instance;
  }

  /**
   * Get or start a server for a session
   * @param sessionId Session identifier
   * @param serverName Server identifier
   * @param config Server configuration
   * @returns Client connected to the server
   */
  async getOrStartServer(
    sessionId: string,
    serverName: string,
    config: ServerConfig
  ): Promise<Client> {
    // Register session with server
    this.registerSessionServer(sessionId, serverName);

    // Start or get existing server
    return this.serverManager.startServer(serverName, config);
  }

  /**
   * Register a session's use of a server
   * @param sessionId Session identifier
   * @param serverName Server identifier
   */
  registerSessionServer(sessionId: string, serverName: string): void {
    // Track session-server relationship
    const servers =
      this.serverManager.getSessionServers(sessionId) || new Set();
    servers.add(serverName);
    this.serverManager.registerSessionServers(sessionId, Array.from(servers));

    // Update reference count
    const refCount = this.refCounts.get(serverName) || 0;
    this.refCounts.set(serverName, refCount + 1);
    console.log(
      `[SERVER_POOL] Server ${serverName} ref count: ${refCount + 1}`
    );
  }

  /**
   * Release all servers used by a session
   * @param sessionId Session identifier
   */
  async releaseSessionServers(sessionId: string): Promise<void> {
    const servers = this.serverManager.getSessionServers(sessionId);
    if (!servers) return;

    for (const serverName of servers) {
      // Decrement reference count
      const refCount = this.refCounts.get(serverName) || 1;
      this.refCounts.set(serverName, refCount - 1);
      console.log(
        `[SERVER_POOL] Server ${serverName} ref count: ${refCount - 1}`
      );

      // Stop server if no more references
      if (refCount - 1 <= 0) {
        console.log(`[SERVER_POOL] Stopping unused server ${serverName}`);
        await this.serverManager.stopServer(serverName);
        this.refCounts.delete(serverName);
      }
    }

    // Clear session-server relationship
    this.serverManager.releaseSessionServers(sessionId);
  }

  // Other methods...
}
```

## Integration with SessionManager

After refactoring, the SessionManager would interact with server management like this:

```typescript
// Refactored session.ts
export class SessionManager {
  private serverManager: ServerManager;
  private useSharedServers: boolean;

  constructor(
    // ...other dependencies
    serverManager?: ServerManager,
    options?: { useSharedServers?: boolean }
  ) {
    // ...
    this.serverManager = serverManager || new DefaultServerManager();
    this.useSharedServers = options?.useSharedServers ?? false;
  }

  async initializeSession(config: LLMConfig): Promise<ChatSession> {
    // ...
    // Launch MCP servers if configured
    if (config.servers) {
      console.log('[SESSION] Initializing MCP servers');

      const serverClients = new Map<string, Client>();

      if (this.useSharedServers) {
        // Use shared server pool
        console.log('[SESSION] Using shared server pool');
        const serverPool = ServerPool.getInstance();

        for (const [serverName, serverConfig] of Object.entries(
          config.servers
        )) {
          const client = await serverPool.getOrStartServer(
            sessionId,
            serverName,
            serverConfig
          );
          serverClients.set(serverName, client);
        }
      } else {
        // Use dedicated servers
        for (const [serverName, serverConfig] of Object.entries(
          config.servers
        )) {
          const client = await this.serverManager.startServer(
            serverName,
            serverConfig
          );
          serverClients.set(serverName, client);
        }

        // Register session with servers
        this.serverManager.registerSessionServers(
          sessionId,
          Array.from(serverClients.keys())
        );
      }

      // Add server clients to session
      session.serverClients = serverClients;
    }
    // ...
  }

  async cleanup() {
    console.log('[SESSION] Starting cleanup...');

    if (this.useSharedServers) {
      // Release session servers from pool
      const serverPool = ServerPool.getInstance();
      for (const sessionId of this.sessions.keys()) {
        await serverPool.releaseSessionServers(sessionId);
      }
    } else {
      // Stop all session servers
      await this.serverManager.stopAllServers();
    }

    // Clear all sessions
    this.sessions.clear();
  }

  // ... other methods
}
```

## Refactoring Steps

1. **Extract Server Manager Interface**

   - Define a clear interface for server management operations
   - Document all methods with JSDoc

2. **Implement Default Server Manager**

   - Move server-related methods from SessionManager to DefaultServerManager
   - Create unit tests for the new component

3. **Implement Server Pool**

   - Create a singleton pool for shared servers
   - Implement reference counting for server lifecycle management

4. **Update SessionManager**

   - Modify SessionManager to use the new ServerManager
   - Update session initialization and cleanup logic
   - Add tests for server interaction

5. **Update Tests**
   - Create mocks for ServerManager for testing SessionManager
   - Add integration tests for server management

## Benefits of Refactoring

1. **Clearer Separation of Concerns**

   - SessionManager focuses on session management
   - ServerManager handles server lifecycle

2. **Improved Testability**

   - Each component can be tested in isolation
   - Server management can be mocked for session tests

3. **Better Resource Management**

   - Centralized server management
   - Proper reference counting for shared servers

4. **Enhanced Scalability**
   - Server management can evolve independently
   - Different server management strategies can be implemented
