import { MCPTool, MCPResource } from '../llm/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
   * The SDK's Client class handles server health verification through protocol handshake.
   *
   * @param serverName - Name of the server for logging
   * @param process - ChildProcess instance from ServerLauncher
   * @returns Promise<{ client: Client, capabilities: ServerCapabilities }> - Client and discovered capabilities
   * @throws DiscoveryError - When server health check or capability discovery fails
   */
  async discoverCapabilities(
    serverName: string,
    process: ChildProcess
  ): Promise<{ client: Client; capabilities: ServerCapabilities }> {
    let currentState = ServerState.NotStarted;
    const updateState = (newState: ServerState, details?: string) => {
      this.logStateTransition(serverName, currentState, newState, details);
      currentState = newState;
    };

    try {
      updateState(ServerState.Starting);

      // Create SDK transport
      console.log(
        `[DISCOVERY] Creating transport for server ${serverName} with command: ${
          process.spawnfile
        } ${process.spawnargs.slice(1).join(' ')}`
      );

      // Log the process stdout and stderr for debugging
      process.stdout?.on('data', data => {
        console.log(`[SERVER:${serverName}:stdout] ${data.toString().trim()}`);
      });

      process.stderr?.on('data', data => {
        console.log(`[SERVER:${serverName}:stderr] ${data.toString().trim()}`);
      });

      const transport = new StdioClientTransport({
        command: process.spawnfile,
        args: process.spawnargs.slice(1), // Remove first arg which is the command
      });
      updateState(ServerState.Ready, 'SDK transport initialized');

      // Initialize MCP client
      updateState(ServerState.Discovering, 'Creating MCP client');

      // Create client with app info
      console.log(`[DISCOVERY] Creating MCP client for server ${serverName}`);
      const client = new Client(
        {
          name: 'mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
          },
        }
      );

      // Connect to the server (handles protocol handshake)
      console.log(`[DISCOVERY] Connecting to server ${serverName}`);
      try {
        await client.connect(transport);
        console.log(
          `[DISCOVERY] Successfully connected to server ${serverName}`
        );
      } catch (error) {
        console.error(
          `[DISCOVERY] Error connecting to server ${serverName}:`,
          error
        );
        throw error;
      }

      // Discover server capabilities
      console.log(`[DISCOVERY] Listing tools for server ${serverName}`);
      let toolsResult;
      try {
        toolsResult = await client.listTools({});
        console.log(
          `[DISCOVERY] Tools result for server ${serverName}:`,
          JSON.stringify(toolsResult, null, 2)
        );
      } catch (error) {
        console.error(
          `[DISCOVERY] Error listing tools for server ${serverName}:`,
          error
        );
        throw error;
      }

      let resources: MCPResource[] = [];

      // Try to get resources, but don't fail if not supported
      try {
        console.log(`[DISCOVERY] Listing resources for server ${serverName}`);
        const resourcesResult = await client.listResources({});
        console.log(
          `[DISCOVERY] Resources result for server ${serverName}:`,
          JSON.stringify(resourcesResult, null, 2)
        );
        resources = (resourcesResult.resources || []).map(resource => {
          const resourceObj: MCPResource = {
            name: resource.name,
            type: typeof resource.type === 'string' ? resource.type : 'unknown',
            description: resource.description,
          };

          if (resource.uri) {
            resourceObj.uri = resource.uri;
          }

          if (resource.mimeType) {
            resourceObj.mimeType = resource.mimeType;
          }

          return resourceObj;
        });
      } catch (resourceError: unknown) {
        const errorMessage =
          resourceError instanceof Error
            ? resourceError.message
            : String(resourceError);
        console.log(
          `Server ${serverName} does not support resources: ${errorMessage}`
        );
        // Continue without resources
      }

      // Convert the SDK's response to our types with proper type handling
      const tools = (toolsResult.tools || []).map(tool => {
        console.log(
          `[DISCOVERY] Processing tool ${tool.name} for server ${serverName}`
        );
        const toolObj: MCPTool = {
          name: tool.name,
          description: tool.description,
        };

        if (tool.inputSchema) {
          toolObj.inputSchema = {
            type: 'object',
            properties: tool.inputSchema.properties
              ? (tool.inputSchema.properties as Record<string, any>)
              : {},
            required: Array.isArray(tool.inputSchema.required)
              ? (tool.inputSchema.required as string[])
              : undefined,
          };
        }

        return toolObj;
      });

      // Create the capabilities object
      const capabilities: ServerCapabilities = {
        tools,
        resources,
      };

      if (!capabilities.tools.length) {
        throw new Error('No tools discovered');
      }

      updateState(
        ServerState.Active,
        `Discovered ${capabilities.tools.length} tools and ${capabilities.resources.length} resources`
      );

      return { client, capabilities };
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
   * @returns Promise<Map<string, { client: Client, capabilities: ServerCapabilities }>> - Map of server names to clients and capabilities
   * @throws DiscoveryError - When any server fails capability discovery
   */
  async discoverAllCapabilities(
    servers: Map<string, ChildProcess>
  ): Promise<
    Map<string, { client: Client; capabilities: ServerCapabilities }>
  > {
    const results = new Map<
      string,
      { client: Client; capabilities: ServerCapabilities }
    >();
    const errors: Error[] = [];

    // Discover capabilities for all servers concurrently
    const discoveries = Array.from(servers.entries()).map(
      async ([name, process]) => {
        try {
          const result = await this.discoverCapabilities(name, process);
          results.set(name, result);
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

    return results;
  }
}
