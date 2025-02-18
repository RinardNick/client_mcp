import { MCPTool, MCPResource } from '@modelcontextprotocol/sdk';
import { ChildProcess } from 'child_process';

export interface ServerCapabilities {
  tools: MCPTool[];
  resources: MCPResource[];
}

// Server health states
enum ServerState {
  NotStarted = 'NotStarted',
  Starting = 'Starting',
  Ready = 'Ready',
  Discovering = 'Discovering',
  Active = 'Active',
  Error = 'Error',
}

export class ServerDiscovery {
  private readonly startupTimeout = 15000; // 15 seconds
  private readonly discoveryTimeout = 20000; // 20 seconds

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

  private logBuffer(serverName: string, buffer: string) {
    if (buffer.length > 0) {
      console.log(
        `[DISCOVERY] Current buffer for ${serverName} (${buffer.length} bytes):`,
        buffer.length > 100 ? buffer.slice(0, 100) + '...' : buffer
      );
    }
  }

  async discoverCapabilities(
    serverName: string,
    process: ChildProcess
  ): Promise<ServerCapabilities> {
    const startTime = Date.now();
    console.log(
      `[DISCOVERY] Starting capability discovery for server: ${serverName}
       - Start time: ${new Date().toISOString()}
       - Startup timeout: ${this.startupTimeout}ms
       - Discovery timeout: ${this.discoveryTimeout}ms
       - Process PID: ${process.pid}`
    );

    return new Promise((resolve, reject) => {
      let toolsData: any;
      let resourcesData: any;
      let serverState = ServerState.Starting;
      let buffer = '';
      let startupTimeout: NodeJS.Timeout;
      let discoveryTimeout: NodeJS.Timeout;
      let commandsSent = { tools: false, resources: false };

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
        console.error(
          `[DISCOVERY] Stdout error for ${serverName}:
           - Error: ${error.message}
           - Stack: ${error.stack}
           - Current state: ${serverState}
           - Time since start: ${Date.now() - startTime}ms`
        );
        this.logStateTransition(
          serverName,
          serverState,
          ServerState.Error,
          `stdout error: ${error.message}`
        );
        serverState = ServerState.Error;
        reject(error);
      });

      if (process.stderr) {
        process.stderr.on('data', data => {
          const message = data.toString();
          console.log(
            `[DISCOVERY] Server ${serverName} stderr:
             - Message: ${message.trim()}
             - Current state: ${serverState}
             - Time since start: ${Date.now() - startTime}ms`
          );

          // Check for server ready message - support both formats
          if (
            message.includes('running on stdio') ||
            message.includes('Allowed directories:')
          ) {
            this.logStateTransition(
              serverName,
              serverState,
              ServerState.Ready,
              message.trim()
            );
            serverState = ServerState.Ready;
            clearTimeout(startupTimeout);

            // Send discovery requests once server is ready
            this.logStateTransition(
              serverName,
              serverState,
              ServerState.Discovering,
              'sending capability discovery commands'
            );
            serverState = ServerState.Discovering;

            // Send list_tools command
            console.log(
              `[DISCOVERY] Sending list_tools command to ${serverName}
               - Time since start: ${Date.now() - startTime}ms`
            );
            const toolsCommand =
              JSON.stringify({ command: 'list_tools' }) + '\n';
            const toolsSuccess = stdin.write(toolsCommand);
            commandsSent.tools = toolsSuccess;
            console.log(
              `[DISCOVERY] list_tools command ${
                toolsSuccess ? 'sent' : 'failed'
              } to ${serverName}
               - Raw command: ${toolsCommand.trim()}`
            );

            // Send list_resources command
            console.log(
              `[DISCOVERY] Sending list_resources command to ${serverName}
               - Time since start: ${Date.now() - startTime}ms`
            );
            const resourcesCommand =
              JSON.stringify({ command: 'list_resources' }) + '\n';
            const resourcesSuccess = stdin.write(resourcesCommand);
            commandsSent.resources = resourcesSuccess;
            console.log(
              `[DISCOVERY] list_resources command ${
                resourcesSuccess ? 'sent' : 'failed'
              } to ${serverName}
               - Raw command: ${resourcesCommand.trim()}`
            );

            // Start discovery timeout after sending commands
            discoveryTimeout = setTimeout(() => {
              console.error(
                `[DISCOVERY] Discovery timeout reached for ${serverName}:
                 - Time since start: ${Date.now() - startTime}ms
                 - Current state: ${serverState}
                 - Commands sent: ${JSON.stringify(commandsSent)}
                 - Tools data: ${JSON.stringify(toolsData)}
                 - Resources data: ${JSON.stringify(resourcesData)}`
              );
              this.logBuffer(serverName, buffer);
              this.logStateTransition(
                serverName,
                serverState,
                ServerState.Error,
                'discovery timeout'
              );
              serverState = ServerState.Error;
              reject(
                new Error(
                  `Capability discovery timeout for server ${serverName}`
                )
              );
            }, this.discoveryTimeout);
          }
        });
      }

      process.on('error', error => {
        console.error(
          `[DISCOVERY] Process error for ${serverName}:
           - Error: ${error.message}
           - Stack: ${error.stack}
           - Current state: ${serverState}
           - Time since start: ${Date.now() - startTime}ms
           - Commands sent: ${JSON.stringify(commandsSent)}`
        );
        this.logStateTransition(
          serverName,
          serverState,
          ServerState.Error,
          `process error: ${error.message}`
        );
        serverState = ServerState.Error;
        reject(error);
      });

      process.on('exit', (code, signal) => {
        console.error(
          `[DISCOVERY] Server ${serverName} exited:
           - Exit code: ${code}
           - Signal: ${signal}
           - Current state: ${serverState}
           - Time since start: ${Date.now() - startTime}ms
           - Commands sent: ${JSON.stringify(commandsSent)}`
        );
        this.logStateTransition(
          serverName,
          serverState,
          ServerState.Error,
          `process exit: code=${code}, signal=${signal}`
        );
        serverState = ServerState.Error;
        reject(
          new Error(
            `Server ${serverName} exited with code ${code} and signal ${signal}`
          )
        );
      });

      // Handle stdout data with buffering for partial messages
      process.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();
        console.log(
          `[DISCOVERY] Received data from ${serverName}:
           - Data length: ${data.length} bytes
           - Current buffer length: ${buffer.length} bytes
           - Time since start: ${Date.now() - startTime}ms`
        );

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          console.log(
            `[DISCOVERY] Processing line from ${serverName}:
             - Line length: ${line.length} bytes
             - Remaining buffer: ${buffer.length} bytes`
          );

          try {
            const message = JSON.parse(line);
            console.log(
              `[DISCOVERY] Parsed message from ${serverName}:
               - Type: ${message.type}
               - Time since start: ${Date.now() - startTime}ms`
            );

            if (message.type === 'tools') {
              toolsData = message.data;
              console.log(
                `[DISCOVERY] Received tools from ${serverName}:
                 - Tool count: ${toolsData.tools?.length || 0}
                 - Tools: ${JSON.stringify(toolsData.tools)}`
              );
            } else if (message.type === 'resources') {
              resourcesData = message.data;
              console.log(
                `[DISCOVERY] Received resources from ${serverName}:
                 - Resource count: ${resourcesData.resources?.length || 0}
                 - Resources: ${JSON.stringify(resourcesData.resources)}`
              );
            }

            // If we have both tools and resources, resolve
            if (toolsData && resourcesData) {
              this.logStateTransition(
                serverName,
                serverState,
                ServerState.Active,
                `discovery complete after ${Date.now() - startTime}ms`
              );
              serverState = ServerState.Active;
              clearTimeout(discoveryTimeout);
              resolve({
                tools: toolsData.tools || [],
                resources: resourcesData.resources || [],
              });
            }
          } catch (error) {
            console.error(
              `[DISCOVERY] Error parsing message from ${serverName}:
               - Error: ${
                 error instanceof Error ? error.message : 'Unknown error'
               }
               - Raw line: ${line}
               - Time since start: ${Date.now() - startTime}ms`
            );
          }
        }

        // Log remaining buffer if any
        this.logBuffer(serverName, buffer);
      });

      // Set startup timeout
      startupTimeout = setTimeout(() => {
        console.error(
          `[DISCOVERY] Server ${serverName} startup timeout:
           - Time since start: ${Date.now() - startTime}ms
           - Current state: ${serverState}
           - Commands sent: ${JSON.stringify(commandsSent)}`
        );
        this.logBuffer(serverName, buffer);
        this.logStateTransition(
          serverName,
          serverState,
          ServerState.Error,
          'startup timeout'
        );
        serverState = ServerState.Error;
        reject(new Error(`Server ${serverName} startup timeout`));
      }, this.startupTimeout);
    });
  }
}
