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
      let toolsData: any;
      let resourcesData: any;
      let isServerReady = false;
      let buffer = '';
      let startupTimeout: NodeJS.Timeout;
      let discoveryTimeout: NodeJS.Timeout;

      if (!process.stdout) {
        reject(new Error(`Server ${serverName} has no stdout`));
        return;
      }

      if (!process.stdin) {
        reject(new Error(`Server ${serverName} has no stdin`));
        return;
      }

      const stdin = process.stdin;

      // Add error handlers
      process.stdout.on('error', error => {
        console.error(`[DISCOVERY] Stdout error for ${serverName}:`, error);
        reject(error);
      });

      if (process.stderr) {
        process.stderr.on('data', data => {
          const message = data.toString();
          console.error(`[DISCOVERY] Stderr from ${serverName}:`, message);

          // Check for server ready message
          if (message.includes('running on stdio')) {
            console.log(`[DISCOVERY] Server ${serverName} is ready`);
            isServerReady = true;
            clearTimeout(startupTimeout);

            // Send discovery requests once server is ready
            console.log(
              `[DISCOVERY] Sending list_tools command to ${serverName}`
            );
            const toolsCommand =
              JSON.stringify({ command: 'list_tools' }) + '\n';
            console.log(`[DISCOVERY] Raw tools command:`, toolsCommand);
            stdin.write(toolsCommand);

            console.log(
              `[DISCOVERY] Sending list_resources command to ${serverName}`
            );
            const resourcesCommand =
              JSON.stringify({ command: 'list_resources' }) + '\n';
            console.log(`[DISCOVERY] Raw resources command:`, resourcesCommand);
            stdin.write(resourcesCommand);

            // Start discovery timeout after sending commands
            discoveryTimeout = setTimeout(() => {
              console.error(
                `[DISCOVERY] Discovery timeout reached for ${serverName}`
              );
              console.error(`[DISCOVERY] Tools data received:`, toolsData);
              console.error(
                `[DISCOVERY] Resources data received:`,
                resourcesData
              );
              console.error(`[DISCOVERY] Remaining buffer:`, buffer);
              reject(
                new Error(
                  `Capability discovery timeout for server ${serverName}`
                )
              );
            }, 10000);
          }
        });
      }

      process.on('error', error => {
        console.error(`[DISCOVERY] Process error for ${serverName}:`, error);
        reject(error);
      });

      process.on('exit', (code, signal) => {
        console.error(
          `[DISCOVERY] Server ${serverName} exited with code ${code} and signal ${signal}`
        );
        reject(
          new Error(
            `Server ${serverName} exited with code ${code} and signal ${signal}`
          )
        );
      });

      // Handle stdout data with buffering for partial messages
      process.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          console.log(`[DISCOVERY] Raw stdout from ${serverName}:`, line);

          try {
            const message = JSON.parse(line);
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
              console.log(
                `[DISCOVERY] Resolving capabilities for ${serverName}`
              );
              clearTimeout(discoveryTimeout);
              resolve({
                tools: toolsData.tools || [],
                resources: resourcesData.resources || [],
              });
            }
          } catch (error) {
            console.error(
              `[DISCOVERY] Error parsing message from ${serverName}:`,
              error,
              'Raw line:',
              line
            );
          }
        }
      });

      // Set startup timeout
      startupTimeout = setTimeout(() => {
        console.error(`[DISCOVERY] Server ${serverName} startup timeout`);
        reject(new Error(`Server ${serverName} startup timeout`));
      }, 5000);
    });
  }
}
