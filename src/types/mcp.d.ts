declare module '@modelcontextprotocol/sdk' {
  export interface MCPClient {
    invokeTool(
      name: string,
      parameters: Record<string, unknown>
    ): Promise<unknown>;
  }

  export interface MCPTool {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
    };
  }

  export interface MCPResource {
    name: string;
    type: string;
    description: string;
  }
}

declare module '@modelcontextprotocol/sdk/client' {
  import { Transport } from '@modelcontextprotocol/sdk/shared/transport';
  import { Implementation } from '@modelcontextprotocol/sdk/types';

  export interface ClientOptions {
    capabilities?: Record<string, unknown>;
  }

  export class Client {
    constructor(clientInfo: Implementation, options?: ClientOptions);
    connect(transport: Transport): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/client/stdio' {
  import { Transport } from '@modelcontextprotocol/sdk/shared/transport';

  export interface StdioServerParameters {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }

  export class StdioClientTransport implements Transport {
    constructor(server: StdioServerParameters);
    start(): Promise<void>;
    close(): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/shared/transport' {
  export interface Transport {
    start(): Promise<void>;
    close(): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/types' {
  export interface Implementation {
    name: string;
    version: string;
  }
}
