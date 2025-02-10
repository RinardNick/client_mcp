import { MCPTool, MCPResource } from '@modelcontextprotocol/sdk';

export interface ServerCapabilities {
  tools: MCPTool[];
  resources: MCPResource[];
}

export class ServerDiscovery {
  async discoverCapabilities(
    serverName: string,
    baseUrl: string
  ): Promise<ServerCapabilities> {
    try {
      const toolsResponse = await fetch(`${baseUrl}/tools/list`);
      const resourcesResponse = await fetch(`${baseUrl}/resources/list`);

      const toolsData = await toolsResponse.json();
      const resourcesData = await resourcesResponse.json();

      if (!toolsData.tools || !resourcesData.resources) {
        throw new Error(`Invalid response from server ${serverName}`);
      }

      return {
        tools: toolsData.tools,
        resources: resourcesData.resources,
      };
    } catch (error) {
      throw new Error(
        `Failed to discover capabilities for server ${serverName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
