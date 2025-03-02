import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import path from 'path';

// This time we'll mock only what we need for basic functionality testing
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock the client and transport modules completely
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        listTools: vi
          .fn()
          .mockResolvedValue({ tools: [{ name: 'test_tool' }] }),
        callTool: vi.fn(),
        close: vi.fn(),
      };
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: vi.fn().mockImplementation(() => {
      return {
        close: vi.fn().mockResolvedValue(undefined),
        isConnected: true,
      };
    }),
  };
});

// Import the mocked modules
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Create a simple mock process
function createMockProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const mockProcess = new EventEmitter();

  let isKilled = false;

  const mock: Partial<ChildProcess> & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
    killed: boolean;
    connected: boolean;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    spawnfile: string;
    spawnargs: string[];
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
    spawnfile: 'node',
    spawnargs: ['node', 'test-server.js'],
    kill: vi.fn().mockImplementation((signal?: number | NodeJS.Signals) => {
      if (signal === 0) {
        // This is a health check - return true if process is alive
        return !isKilled;
      }

      // Actual kill signal
      if (!isKilled) {
        isKilled = true;
        mock.killed = true;
        mock.exitCode = 0;
        mock.signalCode = null;

        setTimeout(() => {
          mockProcess.emit('exit', mock.exitCode, mock.signalCode);
        }, 0);
      }
      return true;
    }),
  };

  // Set up event forwarding
  ['exit', 'error', 'close'].forEach(event => {
    mockProcess.on(event, (...args) => {
      if (event === 'exit') {
        isKilled = true;
        mock.killed = true;
        mock.exitCode = args[0] as number | null;
        mock.signalCode = args[1] as NodeJS.Signals | null;
      }
    });
  });

  // Forward event listeners
  Object.defineProperty(mock, 'on', {
    value: (event: string, listener: (...args: any[]) => void) => {
      mockProcess.on(event, listener);
      return mock;
    },
  });

  Object.defineProperty(mock, 'once', {
    value: (event: string, listener: (...args: any[]) => void) => {
      mockProcess.once(event, listener);
      return mock;
    },
  });

  Object.defineProperty(mock, 'emit', {
    value: (event: string, ...args: any[]) => {
      return mockProcess.emit(event, ...args);
    },
  });

  Object.defineProperty(mock, 'removeListener', {
    value: (event: string, listener: (...args: any[]) => void) => {
      mockProcess.removeListener(event, listener);
      return mock;
    },
  });

  return mock as unknown as ChildProcess;
}

describe('ServerLauncher', () => {
  let launcher: ServerLauncher;
  const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    launcher = new ServerLauncher();
  });

  afterEach(async () => {
    await launcher.stopAll().catch(e => console.error('Cleanup error:', e));
  });

  describe('Basic Functionality', () => {
    it('should launch and stop a server', async () => {
      const serverConfig: ServerConfig = {
        command: 'node',
        args: ['test-server.js'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      // Simulate successful connection and server ready
      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal server is running to pass the ready check
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Server is running on stdio\n')
        );
      }, 10);

      const process = await launchPromise;

      // Check that server was launched
      expect(process).toBeDefined();
      expect(process.pid).toBe(123);
      expect(launcher.getServerProcess('test')).toBe(process);

      // Stop the server
      await launcher.stopAll();

      // Check server was stopped
      expect(mockProcess.kill).toHaveBeenCalled();
      expect(launcher.getServerProcess('test')).toBeNull();
    });

    it('should prevent duplicate server launches', async () => {
      const serverConfig: ServerConfig = {
        command: 'node',
        args: ['test-server.js'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      // Launch first instance
      const firstLaunch = launcher.launchServer('test', serverConfig);

      // Signal server is running
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Server is running on stdio\n')
        );
      }, 10);

      await firstLaunch;

      // Attempt second launch with same name
      await expect(launcher.launchServer('test', serverConfig)).rejects.toThrow(
        ServerLaunchError
      );
    });

    it('should handle missing process ID', async () => {
      const serverConfig: ServerConfig = {
        command: 'node',
        args: ['test-server.js'],
        env: {},
      };

      const mockProcess = createMockProcess();
      // Remove pid
      Object.defineProperty(mockProcess, 'pid', { value: undefined });
      mockSpawn.mockReturnValue(mockProcess);

      await expect(launcher.launchServer('test', serverConfig)).rejects.toThrow(
        ServerLaunchError
      );
    });

    it('should handle spawn errors', async () => {
      const serverConfig: ServerConfig = {
        command: 'invalid-command',
        args: [],
        env: {},
      };

      // Simulate spawn throwing an error
      mockSpawn.mockImplementationOnce(() => {
        throw new Error('Failed to spawn process');
      });

      await expect(launcher.launchServer('test', serverConfig)).rejects.toThrow(
        ServerLaunchError
      );
    });

    it('should clean up on server error', async () => {
      const serverConfig: ServerConfig = {
        command: 'node',
        args: ['test-server.js'],
        env: {},
      };

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      // Launch server
      const launchPromise = launcher.launchServer('test', serverConfig);

      // Signal server is running
      setTimeout(() => {
        (mockProcess.stderr as PassThrough).write(
          Buffer.from('Server is running on stdio\n')
        );
      }, 10);

      await launchPromise;

      // Verify server is registered
      expect(launcher.getServerProcess('test')).toBe(mockProcess);

      // Emit error to trigger cleanup
      mockProcess.emit('error', new Error('Server crashed'));

      // Wait for cleanup to occur
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify server was cleaned up
      expect(launcher.getServerProcess('test')).toBeNull();
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });
});
