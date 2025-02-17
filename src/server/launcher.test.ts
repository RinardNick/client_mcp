import { vi, describe, it, expect, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { ServerLauncher } from './launcher';
import { ServerConfig } from '../config/types';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('ServerLauncher', () => {
  let launcher: ServerLauncher;
  const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    launcher = new ServerLauncher();
  });

  it('should launch a server with valid configuration', async () => {
    const serverConfig: ServerConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      env: {},
    };

    // Mock successful server launch
    const mockChildProcess = {
      pid: 123,
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          callback();
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn().mockReturnValue(true),
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    await launcher.launchServer('filesystem', serverConfig);

    expect(mockSpawn).toHaveBeenCalledWith(
      'npx',
      ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      { env: expect.any(Object) }
    );

    // Verify kill was called with 0 signal for health check
    expect(mockChildProcess.kill).toHaveBeenCalledWith(0);
  });

  it('should throw error if server fails to launch', async () => {
    const serverConfig: ServerConfig = {
      command: 'invalid-command',
      args: [],
      env: {},
    };

    // Mock failed server launch
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          callback(new Error('Failed to launch server'));
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    await expect(launcher.launchServer('test', serverConfig)).rejects.toThrow(
      'Failed to launch server'
    );
  });

  it('should perform basic health check after launch', async () => {
    const serverConfig: ServerConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      env: {},
    };

    // Mock successful server launch with health check
    const mockChildProcess = {
      pid: 123,
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          callback();
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn().mockReturnValue(true),
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    await launcher.launchServer('filesystem', serverConfig);

    // Verify kill was called with 0 signal for health check
    expect(mockChildProcess.kill).toHaveBeenCalledWith(0);
  });

  it('should handle health check failures', async () => {
    const serverConfig: ServerConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      env: {},
    };

    // Mock successful launch but failed health check
    const mockChildProcess = {
      pid: 123,
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          callback();
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn().mockReturnValue(false), // Health check fails
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    await expect(
      launcher.launchServer('filesystem', serverConfig)
    ).rejects.toThrow('Server health check failed');
  });

  it('should get server process by name', async () => {
    const serverConfig: ServerConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      env: {},
    };

    const mockChildProcess = {
      pid: 123,
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          callback();
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn().mockReturnValue(true),
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    await launcher.launchServer('filesystem', serverConfig);
    const process = launcher.getServerProcess('filesystem');

    expect(process).toBeDefined();
    expect(process?.pid).toBe(123);
  });

  it('should return null for non-existent server process', () => {
    const process = launcher.getServerProcess('non-existent');
    expect(process).toBeNull();
  });
});
