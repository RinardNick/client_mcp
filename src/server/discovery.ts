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
      if (!process.stdout) {
        reject(new Error(`Server ${serverName} has no stdout`));
        return;
      }

      if (!process.stdin) {
        reject(new Error(`Server ${serverName} has no stdin`));
        return;
      }

      const stdin = process.stdin;

      // Log raw stdout for debugging
      process.stdout.on('data', (data: Buffer) => {
        console.log(
          `[DISCOVERY] Raw stdout from ${serverName}:`,
          data.toString()
        );
        try {
          const message = JSON.parse(data.toString());
          console.log(
            `[DISCOVERY] Parsed message from ${serverName}:`,
            message
          );

          if (message.type === 'tools') {
            toolsData = message.data;
            console.log(
              `[DISCOVERY] Received tools from ${serverName}:`,
              toolsData
            );
          } else if (message.type === 'resources') {
            resourcesData = message.data;
            console.log(
              `[DISCOVERY] Received resources from ${serverName}:`,
              resourcesData
            );
          }

          // If we have both tools and resources, resolve
          if (toolsData && resourcesData) {
            console.log(`[DISCOVERY] Resolving capabilities for ${serverName}`);
            resolve({
              tools: toolsData.tools || [],
              resources: resourcesData.resources || [],
            });
          }
        } catch (error) {
          console.error(
            `[DISCOVERY] Error parsing message from ${serverName}:`,
            error,
            'Raw data:',
            data.toString()
          );
        }
      });

      // Send discovery requests with a small delay to ensure handlers are set up
      setTimeout(() => {
        console.log(`[DISCOVERY] Sending list_tools command to ${serverName}`);
        stdin.write(JSON.stringify({ command: 'list_tools' }) + '\n');

        console.log(
          `[DISCOVERY] Sending list_resources command to ${serverName}`
        );
        stdin.write(JSON.stringify({ command: 'list_resources' }) + '\n');
      }, 100);

      // Set timeout
      setTimeout(() => {
        reject(
          new Error(`Capability discovery timeout for server ${serverName}`)
        );
      }, 5000);
    });
  }
}
