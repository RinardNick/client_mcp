import { vi, describe, it, expect, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import {
  ServerLauncher,
  ServerError,
  ServerLaunchError,
  ServerHealthError,
  ServerExitError,
} from './launcher';
import { ServerConfig } from '../config/types';
import { EventEmitter } from 'events';
import { Readable, Writable, PassThrough } from 'stream';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Create mock process for testing
function createMockProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const mockProcess = new EventEmitter();

  let isKilled = false;
  let hasError = false;
  let isReady = false;

  // Create a properly typed mock object
  const mock: Partial<ChildProcess> & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
    killed: boolean;
    connected: boolean;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: (signal?: number | NodeJS.Signals) => boolean;
  } = {
    pid: 123,
    stdin,
    stdout,
    stderr,
    killed: false,
    connected: true,
    exitCode: null,
    signalCode: null,
    kill: vi.fn().mockImplementation((signal?: number | NodeJS.Signals) => {
      if (hasError) {
        return false;
      }
      if (signal === 0) {
        // Health check - return true if not killed and ready
        return !isKilled && isReady;
      }
      isKilled = true;
      mock.killed = true;
      mockProcess.emit('exit', signal || 0, null);
      return true;
    }),
    on(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): ChildProcess {
      mockProcess.on(event, listener);
      return this as ChildProcess;
    },
    once(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): ChildProcess {
      mockProcess.once(event, listener);
      return this as ChildProcess;
    },
    emit(event: string | symbol, ...args: any[]): boolean {
      return mockProcess.emit(event, ...args);
    },
    addListener(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): ChildProcess {
      mockProcess.addListener(event, listener);
      return this as ChildProcess;
    },
    removeListener(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): ChildProcess {
      mockProcess.removeListener(event, listener);
      return this as ChildProcess;
    },
    off(
      event: string | symbol,
      listener: (...args: any[]) => void
    ): ChildProcess {
      mockProcess.off(event, listener);
      return this as ChildProcess;
    },
  };

  // Override stderr emit to track ready state
  stderr.on('data', (data: Buffer) => {
    if (data.toString().includes('running on stdio')) {
      isReady = true;
    }
  });

  // Override emit to handle error and exit events
  const originalEmit = mockProcess.emit;
  mockProcess.emit = function (event: string | symbol, ...args: any[]) {
    if (event === 'error') {
      hasError = true;
      isKilled = true;
      mock.killed = true;
      mock.exitCode = 1;
      // Emit error event before ready state is set
      const result = originalEmit.call(this, event, ...args);
      isReady = false; // Server is no longer ready after error
      return result;
    } else if (event === 'exit') {
      isKilled = true;
      mock.killed = true;
      mock.exitCode = (args[0] as number | null) ?? null;
      mock.signalCode = (args[1] as NodeJS.Signals | null) ?? null;
      // Emit exit event before ready state is set
      const result = originalEmit.call(this, event, ...args);
      isReady = false; // Server is no longer ready after exit
      return result;
    }
    return originalEmit.call(this, event, ...args);
  };

  return mock as unknown as ChildProcess;
}

describe('ServerLauncher', () => {
  let launcher: ServerLauncher;
  const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    launcher = new ServerLauncher();
  });

  describe('Server Launch', () => {
    it('should launch a server with valid configuration', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal server ready
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
      }, 0);

      const serverProcess = await launchPromise;
      expect(serverProcess).toBeDefined();
      expect(serverProcess.pid).toBe(123);
    });

    it('should prevent duplicate server launches', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['test'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      // Launch first instance
      const firstLaunch = launcher.launchServer('test', serverConfig);

      // Signal ready for first launch
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
      }, 0);

      await firstLaunch;

      // Attempt second launch
      await expect(launcher.launchServer('test', serverConfig)).rejects.toThrow(
        ServerLaunchError
      );
    });

    it('should handle missing process ID', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['test'],
        env: {},
      };

      const mockProcess = createMockProcess();
      Object.defineProperty(mockProcess, 'pid', { value: undefined });
      mockSpawn.mockReturnValue(mockProcess);

      await expect(launcher.launchServer('test', serverConfig)).rejects.toThrow(
        ServerLaunchError
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle server launch failures with proper error type', async () => {
      const serverConfig: ServerConfig = {
        command: 'invalid-command',
        args: [],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Emit error before ready
      setTimeout(() => {
        mockProcess.emit('error', new Error('Failed to launch server'));
      }, 0);

      await expect(launchPromise).rejects.toThrow(ServerLaunchError);
      await expect(launchPromise).rejects.toMatchObject({
        name: 'ServerLaunchError',
        serverName: 'test',
      });
    });

    it('should handle server exit during health check with proper error type', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
        env: {},
      };

      const mockProcess = createMockProcess();
      // Override kill to simulate a process that exits during health check
      mockProcess.kill = vi
        .fn()
        .mockImplementation((signal?: number | NodeJS.Signals) => {
          if (signal === 0) {
            // Simulate process exiting during health check
            mockProcess.emit('exit', 1, null);
            return false;
          }
          return true;
        });
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal ready to start health check
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
      }, 0);

      await expect(launchPromise).rejects.toThrow(ServerExitError);
      await expect(launchPromise).rejects.toMatchObject({
        name: 'ServerExitError',
        serverName: 'test',
        code: 1,
      });
    });

    it('should handle health check failures with proper error type', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
        env: {},
      };

      const mockProcess = createMockProcess();
      // Force health check to fail
      mockProcess.kill = vi.fn().mockReturnValue(false);
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal ready but health check will fail
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
      }, 0);

      await expect(launchPromise).rejects.toThrow(ServerHealthError);
      await expect(launchPromise).rejects.toMatchObject({
        name: 'ServerHealthError',
        serverName: 'test',
      });
    });

    it('should handle server startup timeout with proper error type', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Don't signal ready, let timeout occur
      await expect(launchPromise).rejects.toThrow(ServerLaunchError);
      await expect(launchPromise).rejects.toMatchObject({
        name: 'ServerLaunchError',
        serverName: 'test',
        message: expect.stringContaining('timeout'),
      });
    });

    it('should handle health check timeout with proper error type', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
        env: {},
      };

      const mockProcess = createMockProcess();
      // Mock a health check that hangs
      let mockKilled = false;
      mockProcess.kill = vi
        .fn()
        .mockImplementation((signal?: number | NodeJS.Signals) => {
          if (signal === 0) {
            // Never respond to health check
            return false;
          }
          mockKilled = true;
          mockProcess.emit('exit', signal || 0, null);
          return true;
        });
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal ready but health check will fail
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
      }, 0);

      await expect(launchPromise).rejects.toThrow(ServerHealthError);
      await expect(launchPromise).rejects.toMatchObject({
        name: 'ServerHealthError',
        serverName: 'test',
        message: expect.stringContaining('not responding'),
      });
    });
  });

  describe('Server Cleanup', () => {
    it('should properly clean up on server error', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['test'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal ready then error
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
        mockProcess.emit('error', new Error('Server crashed'));
      }, 0);

      await expect(launchPromise).rejects.toThrow(ServerError);

      // Verify cleanup
      expect(mockProcess.kill).toHaveBeenCalled();
      expect(launcher.getServerProcess('test')).toBeNull();
    });

    it('should handle stopAll with timeouts', async () => {
      const serverConfig: ServerConfig = {
        command: 'npx',
        args: ['test'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      // Launch and signal ready
      const launchPromise = launcher.launchServer('test', serverConfig);
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Secure MCP Filesystem Server running on stdio\n')
        );
      }, 0);

      await launchPromise;

      // Mock process not responding to kill
      mockProcess.kill = vi.fn().mockReturnValue(true);
      const stopPromise = launcher.stopAll();

      // Verify force kill after timeout
      await stopPromise;
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(launcher.getServerProcess('test')).toBeNull();
    });
  });
});
