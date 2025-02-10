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
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {},
    };

    // Mock successful server launch
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          callback();
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    // Mock fetch for health check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    await launcher.launchServer('filesystem', serverConfig);

    expect(mockSpawn).toHaveBeenCalledWith(
      'npx',
      ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      { env: expect.any(Object) }
    );

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {},
    };

    // Mock successful server launch with health check
    const mockChildProcess = {
      on: vi.fn((event, callback) => {
        if (event === 'spawn') {
          callback();
        }
        return mockChildProcess;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    // Mock fetch for health check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    await launcher.launchServer('filesystem', serverConfig);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.any(Object)
    );
  });
});
