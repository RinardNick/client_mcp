import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServerPool } from './pool';
import { ServerLauncher } from './launcher';
import { ServerDiscovery } from './discovery';
import { ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock the dependencies
vi.mock('./launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue({} as ChildProcess),
    getServerProcess: vi.fn().mockReturnValue({} as ChildProcess),
    cleanup: vi.fn(),
    stopAll: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./discovery', () => ({
  ServerDiscovery: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue({
      client: {} as Client,
      capabilities: {
        tools: [{ name: 'test-tool', description: 'Test tool' }],
        resources: [],
      },
    }),
  })),
}));

describe('ServerPool', () => {
  let serverPool: ServerPool;

  beforeEach(() => {
    // Reset singleton for tests
    (ServerPool as any).instance = undefined;

    // Reset mocks
    vi.clearAllMocks();

    serverPool = ServerPool.getInstance();
  });

  it('should be a singleton', () => {
    const instance1 = ServerPool.getInstance();
    const instance2 = ServerPool.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should create a server if it does not exist', async () => {
    const serverConfig = {
      command: 'node',
      args: ['./server.js'],
    };

    const result = await serverPool.getOrCreateServer(
      'test-server',
      serverConfig
    );

    // Verify it called the launcher
    expect(serverPool['serverLauncher'].launchServer).toHaveBeenCalledWith(
      'test-server',
      serverConfig
    );

    // Verify it called the discovery
    expect(
      serverPool['serverDiscovery'].discoverCapabilities
    ).toHaveBeenCalled();

    // Verify it stored the server
    expect(serverPool.hasServer('test-server')).toBe(true);

    // Verify it returns the client and capabilities
    expect(result).toEqual({
      client: expect.any(Object),
      capabilities: {
        tools: [{ name: 'test-tool', description: 'Test tool' }],
        resources: [],
      },
    });
  });

  it('should reuse an existing server', async () => {
    const serverConfig = {
      command: 'node',
      args: ['./server.js'],
    };

    // First call should create
    await serverPool.getOrCreateServer('test-server', serverConfig);

    // Reset mocks to verify they aren't called again
    vi.clearAllMocks();

    // Second call should reuse
    const result = await serverPool.getOrCreateServer(
      'test-server',
      serverConfig
    );

    // Verify launcher wasn't called again
    expect(serverPool['serverLauncher'].launchServer).not.toHaveBeenCalled();

    // Verify discovery wasn't called again
    expect(
      serverPool['serverDiscovery'].discoverCapabilities
    ).not.toHaveBeenCalled();

    // Verify it returns the client and capabilities
    expect(result).toEqual({
      client: expect.any(Object),
      capabilities: {
        tools: [{ name: 'test-tool', description: 'Test tool' }],
        resources: [],
      },
    });
  });

  it('should track session-server associations', () => {
    // Register servers for sessions
    serverPool.registerSessionServer('session1', 'server1');
    serverPool.registerSessionServer('session1', 'server2');
    serverPool.registerSessionServer('session2', 'server1');

    // Get servers for session1
    const session1Servers = serverPool.getSessionServers('session1');
    expect(session1Servers).toContain('server1');
    expect(session1Servers).toContain('server2');

    // Get sessions for server1
    const server1Sessions = serverPool.getServerSessions('server1');
    expect(server1Sessions).toContain('session1');
    expect(server1Sessions).toContain('session2');
  });

  it('should release session servers', () => {
    // Setup
    serverPool.registerSessionServer('session1', 'server1');
    serverPool.registerSessionServer('session1', 'server2');
    serverPool.registerSessionServer('session2', 'server1');

    // Store mock servers
    serverPool['servers'].set('server1', {} as ChildProcess);
    serverPool['servers'].set('server2', {} as ChildProcess);

    // Act: release session1 servers
    serverPool.releaseSessionServers('session1');

    // Assert: session1 is removed from tracking
    expect(serverPool.getSessionServers('session1')).toEqual([]);

    // Assert: server1 still has session2
    expect(serverPool.getServerSessions('server1')).toContain('session2');

    // Assert: server2 has no sessions and should be cleaned up
    expect(serverPool.getServerSessions('server2')).toEqual([]);
    expect(serverPool['serverLauncher'].cleanup).toHaveBeenCalledWith(
      'server2'
    );
    expect(serverPool.hasServer('server2')).toBe(false);
  });
});
