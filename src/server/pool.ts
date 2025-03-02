import { ChildProcess } from 'child_process';
import { ServerLauncher } from './launcher';
import { ServerDiscovery, ServerCapabilities } from './discovery';
import { ServerConfig } from '../config/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Main singleton class for server pool management
 */
export class ServerPool {
  private static instance: ServerPool;
  private servers: Map<string, ChildProcess> = new Map();
  private serverClients: Map<string, Client> = new Map();
  private serverCapabilities: Map<string, ServerCapabilities> = new Map();
  private sessionServerMap: Map<string, Set<string>> = new Map();
  private serverSessionMap: Map<string, Set<string>> = new Map();
  private serverLauncher: ServerLauncher;
  private serverDiscovery: ServerDiscovery;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.serverLauncher = new ServerLauncher();
    this.serverDiscovery = new ServerDiscovery();
  }

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
    // Check if server already exists
    if (this.serverClients.has(serverName)) {
      console.log(`[SERVER_POOL] Reusing existing server: ${serverName}`);
      return {
        client: this.serverClients.get(serverName)!,
        capabilities: this.serverCapabilities.get(serverName)!,
      };
    }

    // Launch new server
    console.log(`[SERVER_POOL] Launching new server: ${serverName}`);
    const serverProcess = await this.serverLauncher.launchServer(
      serverName,
      config
    );
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

  /**
   * Associate a session with a server for tracking
   */
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

    console.log(
      `[SERVER_POOL] Registered session ${sessionId} with server ${serverName}`
    );
  }

  /**
   * Get all servers a session is using
   */
  public getSessionServers(sessionId: string): string[] {
    const servers = this.sessionServerMap.get(sessionId);
    return servers ? Array.from(servers) : [];
  }

  /**
   * Get all sessions using a server
   */
  public getServerSessions(serverName: string): string[] {
    const sessions = this.serverSessionMap.get(serverName);
    return sessions ? Array.from(sessions) : [];
  }

  /**
   * Check if a server is already running
   */
  public hasServer(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  /**
   * Clean up servers when sessions end
   */
  public releaseSessionServers(sessionId: string): void {
    const serverNames = this.getSessionServers(sessionId);

    // Remove session from tracking
    this.sessionServerMap.delete(sessionId);

    // Update server session maps and clean up unused servers
    for (const serverName of serverNames) {
      const sessions = this.serverSessionMap.get(serverName);
      if (sessions) {
        sessions.delete(sessionId);

        // If no sessions are using this server, clean it up
        if (sessions.size === 0) {
          this.cleanupUnusedServer(serverName);
        }
      }
    }

    console.log(`[SERVER_POOL] Released all servers for session ${sessionId}`);
  }

  /**
   * Clean up a server if no sessions are using it
   */
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

  /**
   * Restart a server and reconnect all affected sessions
   */
  public async restartServer(serverName: string): Promise<void> {
    // TODO: Implement server restart logic
    throw new Error('Not implemented yet');
  }
}
