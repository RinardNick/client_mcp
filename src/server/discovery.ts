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
  private readonly startupTimeout = 30000; // 30 seconds
  private readonly discoveryTimeout = 30000; // 30 seconds
  private readonly commandRetryInterval = 2000; // 2 seconds
  private readonly maxCommandRetries = 3;

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
      let isRejected = false;

      const cleanup = () => {
        clearTimeout(startupTimeout);
        clearTimeout(discoveryTimeout);
        process.stdout?.removeAllListeners('data');
        process.stdout?.removeAllListeners('error');
        process.stderr?.removeAllListeners('data');
        process.removeAllListeners('error');
        process.removeAllListeners('exit');
      };

      const safeReject = (error: Error) => {
        if (!isRejected) {
          isRejected = true;
          cleanup();
          reject(error);
        }
      };

      if (!process.stdout) {
        safeReject(new Error(`Server ${serverName} has no stdout`));
        return;
      }

      if (!process.stdin) {
        safeReject(new Error(`Server ${serverName} has no stdin`));
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
        safeReject(error);
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
            message.includes('Allowed directories:') ||
            message.includes('Server started') ||
            message.includes('Ready for commands') ||
            message.includes('MCP server initialized')
          ) {
            this.logStateTransition(
              serverName,
              serverState,
              ServerState.Ready,
              message.trim()
            );
            serverState = ServerState.Ready;
            clearTimeout(startupTimeout);

            // Add delay before sending commands to ensure server is fully ready
            setTimeout(() => {
              // Send discovery requests once server is ready
              this.logStateTransition(
                serverName,
                serverState,
                ServerState.Discovering,
                'sending capability discovery commands'
              );
              serverState = ServerState.Discovering;

              let retryCount = 0;
              const sendCommands = () => {
                // Send tools/list command
                console.log(
                  `[DISCOVERY] Sending tools/list command to ${serverName}
                   - Time since start: ${Date.now() - startTime}ms
                   - Retry count: ${retryCount}
                   - Current state: ${serverState}`
                );
                const toolsCommand =
                  JSON.stringify({ command: 'tools/list' }) + '\n';
                const toolsSuccess = stdin.write(toolsCommand);
                commandsSent.tools = toolsSuccess;
                console.log(
                  `[DISCOVERY] tools/list command sent successfully: ${toolsSuccess}`
                );

                // Send resources/list command
                console.log(
                  `[DISCOVERY] Sending resources/list command to ${serverName}
                   - Time since start: ${Date.now() - startTime}ms
                   - Retry count: ${retryCount}
                   - Current state: ${serverState}`
                );
                const resourcesCommand =
                  JSON.stringify({ command: 'resources/list' }) + '\n';
                const resourcesSuccess = stdin.write(resourcesCommand);
                commandsSent.resources = resourcesSuccess;
                console.log(
                  `[DISCOVERY] resources/list command sent successfully: ${resourcesSuccess}`
                );

                // Retry if either command failed
                if (
                  (!toolsSuccess || !resourcesSuccess) &&
                  retryCount < this.maxCommandRetries
                ) {
                  retryCount++;
                  console.log(
                    `[DISCOVERY] Retrying commands for ${serverName}
                     - Time since start: ${Date.now() - startTime}ms
                     - Next retry count: ${retryCount}
                     - Current state: ${serverState}`
                  );
                  setTimeout(sendCommands, this.commandRetryInterval);
                }
              };

              sendCommands();

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
                safeReject(
                  new Error(
                    `Capability discovery timeout for server ${serverName}`
                  )
                );
              }, this.discoveryTimeout);
            }, 1000); // Wait 1 second before sending commands
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
        safeReject(error);
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
        safeReject(
          new Error(
            `Server ${serverName} exited with code ${code} and signal ${signal}`
          )
        );
      });

      // Handle stdout data with buffering for partial messages
      process.stdout.on('data', data => {
        const message = data.toString();
        console.log(
          `[DISCOVERY] Server ${serverName} stdout:
           - Message: ${message.trim()}
           - Current state: ${serverState}
           - Time since start: ${Date.now() - startTime}ms`
        );

        buffer += message;

        try {
          // Try to parse each line as JSON
          const lines = buffer.split('\n');
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
              const response = JSON.parse(line);
              console.log(
                `[DISCOVERY] Parsed response from ${serverName}:
                 - Type: ${response.type}
                 - Data: ${JSON.stringify(response.data)}`
              );

              if (response.type === 'tools') {
                toolsData = response.data.tools;
              } else if (response.type === 'resources') {
                resourcesData = response.data.resources;
              }

              // If we have both tools and resources, we're done
              if (toolsData && resourcesData) {
                this.logStateTransition(
                  serverName,
                  serverState,
                  ServerState.Active,
                  'discovery complete'
                );
                serverState = ServerState.Active;
                clearTimeout(discoveryTimeout);
                resolve({ tools: toolsData, resources: resourcesData });
              }
            } catch (e: unknown) {
              const error = e instanceof Error ? e : new Error(String(e));
              console.log(
                `[DISCOVERY] Failed to parse line from ${serverName}:
                 - Line: ${line}
                 - Error: ${error.message}`
              );
            }
          }
          // Keep the last partial line in the buffer
          buffer = lines[lines.length - 1];
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error(
            `[DISCOVERY] Error processing stdout for ${serverName}:
             - Error: ${error.message}
             - Buffer: ${buffer}`
          );
        }
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
        safeReject(new Error(`Server ${serverName} startup timeout`));
      }, this.startupTimeout);
    });
  }

  // Adding new discover method to support integration tests
  public discover(
    childProc: ChildProcess
  ): Promise<{ tools: any[]; resources: any[] }> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let toolsData: any = null;
      let resourcesData: any = null;
      const startTime = Date.now();
      const discoveryTimeout = setTimeout(() => {
        reject(
          new Error(`Discovery timeout reached for process ${childProc.pid}`)
        );
      }, 30000);

      const cleanup = () => {
        clearTimeout(discoveryTimeout);
        childProc.stdout?.removeAllListeners('data');
        childProc.stderr?.removeAllListeners('data');
      };

      childProc.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          try {
            const response = JSON.parse(line);
            console.log(
              `[DISCOVERY] Parsed response from process ${childProc.pid}:
               - Response: ${JSON.stringify(response)}`
            );

            // Handle JSON-RPC response
            if (response.jsonrpc === '2.0' && response.result) {
              if (response.id === 1) {
                toolsData = response.result;
                // For servers that only have tools, resolve immediately
                cleanup();
                resolve({
                  tools: toolsData.tools || [],
                  resources: [],
                });
              }
            }
          } catch (error) {
            // Ignore parsing errors and wait for more data
            console.log(
              `[DISCOVERY] Failed to parse line from process ${childProc.pid}:
               - Line: ${line}
               - Error: ${
                 error instanceof Error ? error.message : String(error)
               }`
            );
          }
        }
        // Fallback: if buffer seems like a complete JSON object without newline
        const trimmed = buffer.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const response = JSON.parse(trimmed);
            console.log(
              `[DISCOVERY] Parsed fallback response from process ${
                childProc.pid
              }:
               - Response: ${JSON.stringify(response)}`
            );

            // Handle JSON-RPC response
            if (response.jsonrpc === '2.0' && response.result) {
              if (response.id === 1) {
                toolsData = response.result;
                // For servers that only have tools, resolve immediately
                cleanup();
                resolve({
                  tools: toolsData.tools || [],
                  resources: [],
                });
              }
            }

            buffer = '';
          } catch (err) {
            // Do nothing; wait for more data
          }
        }
      });

      childProc.stderr?.on('data', (data: Buffer) => {
        console.error(
          `Discovery error from process ${childProc.pid}: ${data.toString()}`
        );
      });

      childProc.on('error', err => {
        cleanup();
        reject(err);
      });

      childProc.on('exit', code => {
        if (!(toolsData && resourcesData)) {
          cleanup();
          reject(
            new Error(
              `Child process exited with code ${code} before discovery complete`
            )
          );
        }
      });
    });
  }
}
