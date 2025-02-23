import { MCPTool, MCPResource } from '@modelcontextprotocol/sdk';
import { createMCPClient } from '@modelcontextprotocol/sdk/dist/esm/client';
import { StdioTransport } from '@modelcontextprotocol/sdk/dist/esm/transport';
import { ChildProcess } from 'child_process';

export interface ServerCapabilities {
  tools: MCPTool[];
  resources: MCPResource[];
}

// Server health states
export enum ServerState {
  NotStarted = 'NotStarted',
  Starting = 'Starting',
  Ready = 'Ready',
  Discovering = 'Discovering',
  Active = 'Active',
  Error = 'Error',
}

export class DiscoveryError extends Error {
  constructor(message: string, public readonly errors: Error[]) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

// SDK error codes
export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000,
  ConnectionError = -32001,
  ProtocolError = -32002,
}

export class ServerDiscovery {
  private logStateTransition(
    serverName: string,
    from: ServerState,
    to: ServerState,
    details?: string
  ) {
    console.log(
      `[DISCOVERY] Server ${serverName} state transition: ${from} -> ${to}${
        details ? ` (${details})` : ''
      } at ${new Date().toISOString()}`
    );
  }

  /**
   * Discovers capabilities of an MCP server using the SDK.
   * This method is used after the server has been launched by ServerLauncher.
   * The SDK's createMCPClient handles server health verification through protocol handshake.
   *
   * @param serverName - Name of the server for logging
   * @param process - ChildProcess instance from ServerLauncher
   * @returns Promise<ServerCapabilities> - Discovered tools and resources
   * @throws DiscoveryError - When server health check or capability discovery fails
   */
  async discoverCapabilities(
    serverName: string,
    process: ChildProcess
  ): Promise<ServerCapabilities> {
    let currentState = ServerState.NotStarted;
    const updateState = (newState: ServerState, details?: string) => {
      this.logStateTransition(serverName, currentState, newState, details);
      currentState = newState;
    };

    try {
      updateState(ServerState.Starting);

      // Create SDK transport
      const transport = new StdioTransport(process);
      updateState(ServerState.Ready, 'SDK transport initialized');

      // Initialize MCP client and discover capabilities
      // This includes protocol handshake and health verification
      updateState(ServerState.Discovering, 'Creating MCP client');
      const client = await createMCPClient(transport);

      // Validate discovered capabilities
      const capabilities: ServerCapabilities = {
        tools: client.tools || [],
        resources: client.resources || [],
      };

      if (!capabilities.tools.length && !capabilities.resources.length) {
        throw new Error('No capabilities discovered');
      }

      updateState(
        ServerState.Active,
        `Discovered ${capabilities.tools.length} tools and ${capabilities.resources.length} resources`
      );

      return capabilities;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code;

      let details = errorMessage;
      if (errorCode === MCPErrorCode.ConnectionError) {
        details = `Server connection failed: ${errorMessage}`;
      } else if (errorCode === MCPErrorCode.ProtocolError) {
        details = `Protocol handshake failed: ${errorMessage}`;
      }

      updateState(ServerState.Error, details);
      throw new DiscoveryError(details, [error as Error]);
    }
  }

  /**
   * Discovers capabilities of multiple MCP servers.
   * The SDK handles health verification during client initialization.
   *
   * @param servers - Map of server names to their processes
   * @returns Promise<Map<string, ServerCapabilities>> - Map of server names to their capabilities
   * @throws DiscoveryError - When any server fails capability discovery
   */
  async discoverAllCapabilities(
    servers: Map<string, ChildProcess>
  ): Promise<Map<string, ServerCapabilities>> {
    const capabilities = new Map<string, ServerCapabilities>();
    const errors: Error[] = [];

    // Discover capabilities for all servers concurrently
    const discoveries = Array.from(servers.entries()).map(
      async ([name, process]) => {
        try {
          const serverCapabilities = await this.discoverCapabilities(
            name,
            process
          );
          capabilities.set(name, serverCapabilities);
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error
              : new Error(`Failed to discover capabilities for ${name}`)
          );
        }
      }
    );

    await Promise.all(discoveries);

    if (errors.length > 0) {
      throw new DiscoveryError(
        'One or more servers failed capability discovery',
        errors
      );
    }

    return capabilities;
  }
}
