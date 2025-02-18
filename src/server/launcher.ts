import { spawn, ChildProcess } from 'child_process';
import { ServerConfig } from '../config/types';

export class ServerError extends Error {
  constructor(
    message: string,
    public readonly serverName: string,
    public readonly code?: number,
    public readonly signal?: string | null
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

export class ServerLaunchError extends ServerError {
  constructor(serverName: string, message: string) {
    super(`Failed to launch server ${serverName}: ${message}`, serverName);
    this.name = 'ServerLaunchError';
  }
}

export class ServerHealthError extends ServerError {
  constructor(serverName: string, message: string) {
    super(`Server ${serverName} health check failed: ${message}`, serverName);
    this.name = 'ServerHealthError';
  }
}

export class ServerExitError extends ServerError {
  constructor(serverName: string, code: number | null, signal: string | null) {
    super(
      `Server ${serverName} exited${code !== null ? ` with code ${code}` : ''}${
        signal ? ` (signal: ${signal})` : ''
      }`,
      serverName,
      code ?? undefined,
      signal
    );
    this.name = 'ServerExitError';
  }
}

export class ServerLauncher {
  private servers: Map<string, ChildProcess> = new Map();
  private readonly launchTimeout = 15000; // 15 seconds
  private readonly healthCheckTimeout = 10000; // 10 seconds
  private readonly healthCheckRetries = 3;
  private readonly healthCheckInterval = 2000; // 2 seconds

  async launchServer(
    serverName: string,
    config: ServerConfig
  ): Promise<ChildProcess> {
    console.log('[LAUNCHER] Launching server:', serverName);

    // Ensure server isn't already running
    if (this.servers.has(serverName)) {
      throw new ServerLaunchError(serverName, 'Server is already running');
    }

    let serverProcess: ChildProcess | null = null;

    try {
      // Launch server process
      serverProcess = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
      });

      if (!serverProcess.pid) {
        throw new ServerLaunchError(serverName, 'Failed to get process ID');
      }

      // Track server process
      this.servers.set(serverName, serverProcess);

      // Wait for server to be ready
      await this.waitForServerReady(serverName, serverProcess);

      // Perform health check
      await this.waitForHealthCheck(serverName);

      // Set up persistent error handling
      this.setupErrorHandlers(serverName, serverProcess);

      return serverProcess;
    } catch (error) {
      // Clean up on any error
      if (serverProcess) {
        this.cleanup(serverName);
      }

      // Convert or wrap error
      if (error instanceof ServerError) {
        throw error;
      }
      throw new ServerLaunchError(
        serverName,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private async waitForServerReady(
    serverName: string,
    serverProcess: ChildProcess
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let hasError = false;
      let isReady = false;
      let timeoutId: NodeJS.Timeout;

      console.log(
        `[LAUNCHER] Waiting for server ${serverName} to be ready (timeout: ${this.launchTimeout}ms)`
      );

      // Handle server ready message
      serverProcess.stderr?.on('data', (data: Buffer) => {
        const message = data.toString();
        console.log(`[LAUNCHER] Server ${serverName} stderr:`, message);
        if (
          message.includes('running on stdio') ||
          message.includes('Allowed directories:')
        ) {
          console.log(`[LAUNCHER] Server ${serverName} is ready`);
          isReady = true;
          clearTimeout(timeoutId);
          resolve();
        }
      });

      // Handle server errors
      serverProcess.on('error', (error: Error) => {
        hasError = true;
        clearTimeout(timeoutId);
        reject(new ServerLaunchError(serverName, error.message));
      });

      // Handle server exit
      serverProcess.on(
        'exit',
        (code: number | null, signal: NodeJS.Signals | null) => {
          if (!isReady && !hasError) {
            clearTimeout(timeoutId);
            reject(new ServerExitError(serverName, code, signal));
          }
        }
      );

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!isReady && !hasError) {
          reject(
            new ServerLaunchError(serverName, 'Server startup timeout reached')
          );
        }
      }, this.launchTimeout);
    });
  }

  private async waitForHealthCheck(
    serverName: string,
    retries = this.healthCheckRetries,
    interval = this.healthCheckInterval
  ): Promise<void> {
    console.log(
      `[LAUNCHER] Starting health check with ${retries} retries at ${interval}ms intervals`
    );

    // For stdio servers, we just need to verify the process is running and responsive
    return new Promise((resolve, reject) => {
      const server = this.servers.get(serverName);

      if (!server || !server.pid) {
        reject(new ServerHealthError(serverName, 'Server process not found'));
        return;
      }

      let attempts = 0;
      const maxAttempts = retries;
      let timeoutId: NodeJS.Timeout;
      let exitHandler: (
        code: number | null,
        signal: NodeJS.Signals | null
      ) => void;

      const cleanup = () => {
        clearTimeout(timeoutId);
        server.removeListener('exit', exitHandler);
      };

      // Handle server exit during health check
      exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(new ServerExitError(serverName, code, signal));
      };
      server.on('exit', exitHandler);

      const checkHealth = () => {
        attempts++;
        try {
          if (!server.pid || server.killed) {
            cleanup();
            reject(
              new ServerExitError(
                serverName,
                server.exitCode,
                server.signalCode
              )
            );
            return;
          }
          const isRunning = server.kill(0); // This just tests if we can send signals to the process
          if (!isRunning) {
            cleanup();
            reject(
              new ServerHealthError(
                serverName,
                'Process is not responding to signals'
              )
            );
            return;
          }
          console.log('[LAUNCHER] Server process is running');
          cleanup();
          resolve();
        } catch (error) {
          if (attempts < maxAttempts) {
            setTimeout(checkHealth, interval);
          } else {
            cleanup();
            reject(
              new ServerHealthError(
                serverName,
                'Maximum health check attempts reached'
              )
            );
          }
        }
      };

      // Start health checks
      checkHealth();

      // Set overall timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new ServerHealthError(serverName, 'Health check timeout reached')
        );
      }, this.healthCheckTimeout);
    });
  }

  private setupErrorHandlers(serverName: string, serverProcess: ChildProcess) {
    serverProcess.on('error', (error: Error) => {
      console.error(`[LAUNCHER] Server ${serverName} error:`, error);
      this.cleanup(serverName);
      serverProcess.emit('error', new ServerError(error.message, serverName));
    });

    serverProcess.on(
      'exit',
      (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(
          `[LAUNCHER] Server ${serverName} exited with code ${code} and signal ${signal}`
        );
        this.cleanup(serverName);
        if (code !== 0) {
          serverProcess.emit(
            'error',
            new ServerExitError(serverName, code, signal)
          );
        }
      }
    );
  }

  async stopAll(): Promise<void> {
    console.log('[LAUNCHER] Stopping all servers');
    const stopPromises = Array.from(this.servers.entries()).map(
      async ([name, server]) => {
        try {
          console.log(`[LAUNCHER] Stopping server: ${name}`);
          server.kill();
          await new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(
                new ServerError(
                  'Server stop timeout reached',
                  name,
                  undefined,
                  'SIGKILL'
                )
              );
            }, 5000);

            server.once('exit', () => {
              clearTimeout(timeoutId);
              resolve();
            });
          });
        } catch (error) {
          console.error(`[LAUNCHER] Error stopping server ${name}:`, error);
          // Force kill if graceful shutdown fails
          try {
            server.kill('SIGKILL');
          } catch (killError) {
            console.error(
              `[LAUNCHER] Error force killing server ${name}:`,
              killError
            );
          }
        }
      }
    );

    await Promise.all(stopPromises);
    this.servers.clear();
    console.log('[LAUNCHER] All servers stopped');
  }

  getServerProcess(name: string): ChildProcess | null {
    return this.servers.get(name) || null;
  }

  private cleanup(serverName: string): void {
    const server = this.servers.get(serverName);
    if (server) {
      try {
        server.kill();
      } catch (error) {
        console.error(`[LAUNCHER] Error killing server ${serverName}:`, error);
      }
      this.servers.delete(serverName);
    }
  }
}
