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
    console.log(
      `[DISCOVERY] Starting capability discovery for server: ${serverName}`
    );
    console.log(`[DISCOVERY] Base URL: ${baseUrl}`);

    try {
      console.log(`[DISCOVERY] Fetching tools from ${baseUrl}/tools/list`);
      const toolsResponse = await fetch(`${baseUrl}/tools/list`);
      console.log(`[DISCOVERY] Tools response status: ${toolsResponse.status}`);

      console.log(
        `[DISCOVERY] Fetching resources from ${baseUrl}/resources/list`
      );
      const resourcesResponse = await fetch(`${baseUrl}/resources/list`);
      console.log(
        `[DISCOVERY] Resources response status: ${resourcesResponse.status}`
      );

      const toolsData = await toolsResponse.json();
      const resourcesData = await resourcesResponse.json();

      console.log(`[DISCOVERY] Received tools data:`, toolsData);
      console.log(`[DISCOVERY] Received resources data:`, resourcesData);

      if (!toolsData.tools || !resourcesData.resources) {
        console.error(
          `[DISCOVERY] Invalid response format from server ${serverName}`
        );
        throw new Error(`Invalid response from server ${serverName}`);
      }

      const capabilities = {
        tools: toolsData.tools,
        resources: resourcesData.resources,
      };

      console.log(
        `[DISCOVERY] Successfully discovered capabilities for ${serverName}:`,
        capabilities
      );
      return capabilities;
    } catch (error) {
      console.error(
        `[DISCOVERY] Error discovering capabilities for ${serverName}:`,
        error
      );
      throw new Error(
        `Failed to discover capabilities for server ${serverName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
