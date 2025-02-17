import { MCPTool, MCPResource } from '@modelcontextprotocol/sdk';
import { ChildProcess } from 'child_process';

export interface ServerCapabilities {
  tools: MCPTool[];
  resources: MCPResource[];
}

export class ServerDiscovery {
  async discoverCapabilities(
    serverName: string,
    process: ChildProcess
  ): Promise<ServerCapabilities> {
    console.log(
      `[DISCOVERY] Starting capability discovery for server: ${serverName}`
    );

    return new Promise((resolve, reject) => {
      // Set up message handlers
      let toolsData: any;
      let resourcesData: any;

      // Listen for tool and resource data on stdout
      process.stdout?.on('data', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(
            `[DISCOVERY] Received message from ${serverName}:`,
            message
          );

          if (message.type === 'tools') {
            toolsData = message.data;
          } else if (message.type === 'resources') {
            resourcesData = message.data;
          }

          // If we have both tools and resources, resolve
          if (toolsData && resourcesData) {
            resolve({
              tools: toolsData.tools || [],
              resources: resourcesData.resources || [],
            });
          }
        } catch (error) {
          console.error(
            `[DISCOVERY] Error parsing message from ${serverName}:`,
            error
          );
        }
      });

      // Send discovery requests
      process.stdin?.write(JSON.stringify({ command: 'list_tools' }) + '\n');
      process.stdin?.write(
        JSON.stringify({ command: 'list_resources' }) + '\n'
      );

      // Set timeout
      setTimeout(() => {
        reject(
          new Error(`Capability discovery timeout for server ${serverName}`)
        );
      }, 5000);
    });
  }
}
