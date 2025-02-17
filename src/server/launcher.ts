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
          await this.waitForHealthCheck();
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
    retries = 5,
    interval = 1000
  ): Promise<void> {
    console.log(
      `[LAUNCHER] Starting health check with ${retries} retries at ${interval}ms intervals`
    );

    for (let i = 0; i < retries; i++) {
      console.log(`[LAUNCHER] Health check attempt ${i + 1}/${retries}`);
      try {
        const response = await fetch('http://localhost:3000/health', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log(
          `[LAUNCHER] Health check response status: ${response.status}`
        );

        if (response.ok) {
          const data = await response.json();
          console.log(`[LAUNCHER] Health check response data:`, data);
          if (data.status === 'ok') {
            console.log('[LAUNCHER] Health check succeeded');
            return;
          }
        }
      } catch (error) {
        console.log(`[LAUNCHER] Health check attempt ${i + 1} failed:`, error);
      }

      console.log(`[LAUNCHER] Waiting ${interval}ms before next retry`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.error('[LAUNCHER] Health check failed after all retries');
    throw new Error('Server health check failed');
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
}
