declare module '@modelcontextprotocol/sdk/client' {
  import type { StdioTransport } from '@modelcontextprotocol/sdk/transport';

  export interface MCPClient {
    tools: any[];
    resources: any[];
  }

  export function createMCPClient(
    transport: StdioTransport
  ): Promise<MCPClient>;
}

declare module '@modelcontextprotocol/sdk/transport' {
  import type { ChildProcess } from 'child_process';

  export class StdioTransport {
    constructor(process: ChildProcess);
  }
}

declare module '@modelcontextprotocol/sdk/dist/esm/client' {
  export * from '@modelcontextprotocol/sdk/client';
}

declare module '@modelcontextprotocol/sdk/dist/esm/transport' {
  export * from '@modelcontextprotocol/sdk/transport';
}
