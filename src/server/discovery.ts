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
      // Fetch tools
      const toolsResponse = await fetch(`${baseUrl}/tools/list`);
      if (!toolsResponse.ok) {
        throw new Error(`Failed to fetch tools from server ${serverName}`);
      }
      const toolsData = await toolsResponse.json();

      // Fetch resources
      const resourcesResponse = await fetch(`${baseUrl}/resources/list`);
      if (!resourcesResponse.ok) {
        throw new Error(`Failed to fetch resources from server ${serverName}`);
      }
      const resourcesData = await resourcesResponse.json();

      // Validate response data
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
