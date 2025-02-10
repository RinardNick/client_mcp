import { spawn, ChildProcess } from 'child_process';
import { ServerConfig } from '../config/types';

export class ServerLauncher {
  private servers: Map<string, ChildProcess> = new Map();

  async launchServer(name: string, config: ServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
      });

      childProcess.on('error', error => {
        reject(error);
      });

      childProcess.on('spawn', async () => {
        try {
          // Store the server process
          this.servers.set(name, childProcess);

          // Perform basic health check
          await this.waitForHealthCheck();
          resolve();
        } catch (error) {
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
    });
  }

  private async waitForHealthCheck(
    retries = 5,
    interval = 1000
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('http://localhost:3000/health', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok') {
            return;
          }
        }
      } catch (error) {
        // Ignore error and retry
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Server health check failed');
  }

  async stopAll(): Promise<void> {
    for (const [name, server] of this.servers) {
      console.log(`Stopping server: ${name}`);
      server.kill();
    }
    this.servers.clear();
  }
}
