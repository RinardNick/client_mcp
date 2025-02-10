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
