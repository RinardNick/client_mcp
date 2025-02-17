import { spawn, ChildProcess } from 'child_process';
import { ServerConfig } from '../config/types';

export class ServerLauncher {
  private servers: Map<string, ChildProcess> = new Map();

  async launchServer(name: string, config: ServerConfig): Promise<void> {
    console.log(`[LAUNCHER] Starting server launch for: ${name}`);
    console.log(`[LAUNCHER] Server config:`, {
      command: config.command,
      args: config.args,
      envKeys: Object.keys(config.env || {}),
    });

    return new Promise((resolve, reject) => {
      console.log(`[LAUNCHER] Spawning process for ${name}`);
      const childProcess = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
      });

      childProcess.on('error', error => {
        console.error(`[LAUNCHER] Error launching ${name}:`, error);
        reject(error);
      });

      childProcess.on('spawn', async () => {
        console.log(`[LAUNCHER] Process spawned successfully for ${name}`);
        try {
          // Store the server process
          this.servers.set(name, childProcess);
          console.log(`[LAUNCHER] Server ${name} registered in server map`);

          // Perform basic health check
          console.log(`[LAUNCHER] Starting health check for ${name}`);
          await this.waitForHealthCheck(name);
          console.log(`[LAUNCHER] Health check passed for ${name}`);
          resolve();
        } catch (error) {
          console.error(`[LAUNCHER] Health check failed for ${name}:`, error);
          reject(error);
        }
      });

      // Log server output for debugging
      childProcess.stdout.on('data', data => {
        console.log(`[${name}] stdout: ${data}`);
      });

      childProcess.stderr.on('data', data => {
        console.error(`[${name}] stderr: ${data}`);
      });

      childProcess.on('exit', (code, signal) => {
        console.log(
          `[LAUNCHER] Server ${name} exited with code ${code} and signal ${signal}`
        );
      });
    });
  }

  private async waitForHealthCheck(
    serverName: string,
    retries = 5,
    interval = 1000
  ): Promise<void> {
    console.log(
      `[LAUNCHER] Starting health check with ${retries} retries at ${interval}ms intervals`
    );

    // For stdio servers, we just need to verify the process is running and responsive
    return new Promise((resolve, reject) => {
      const server = this.servers.get(serverName);

      if (!server || !server.pid) {
        reject(new Error('Server process not found'));
        return;
      }

      // Check if process is running
      try {
        const isRunning = server.kill(0); // This just tests if we can send signals to the process
        if (!isRunning) {
          reject(new Error('Server health check failed'));
          return;
        }
        console.log('[LAUNCHER] Server process is running');
        resolve();
      } catch (error) {
        reject(new Error('Server health check failed'));
      }
    });
  }

  async stopAll(): Promise<void> {
    console.log('[LAUNCHER] Stopping all servers');
    for (const [name, server] of this.servers) {
      console.log(`[LAUNCHER] Stopping server: ${name}`);
      server.kill();
    }
    this.servers.clear();
    console.log('[LAUNCHER] All servers stopped');
  }

  getServerProcess(name: string): ChildProcess | null {
    return this.servers.get(name) || null;
  }
}
