import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager } from './session';
import { ServerPool } from '../server/pool';
import { ChatSession } from './types';
import { globalSessions } from './store';
import { ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ServerCapabilities } from '../server/discovery';

// Mock the dynamic import
vi.mock('../server/pool', () => {
  const mockServerPool = {
    getInstance: vi.fn().mockReturnValue({
      getOrCreateServer: vi.fn().mockResolvedValue({
        client: {} as Client,
        capabilities: {
          tools: [{ name: 'test-tool', description: 'Test tool' }],
          resources: [],
        } as ServerCapabilities,
      }),
      registerSessionServer: vi.fn(),
      releaseSessionServers: vi.fn(),
    }),
  };

  return {
    ServerPool: mockServerPool,
  };
});

// Mock the ServerLauncher and ServerDiscovery
vi.mock('../server/launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue({} as ChildProcess),
    getServerProcess: vi.fn().mockReturnValue({} as ChildProcess),
    cleanup: vi.fn(),
    stopAll: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../server/discovery', () => ({
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

// Mock the dependencies
vi.mock('./store', () => ({
  globalSessions: new Map(),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-session-id',
}));

vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Test response' }],
      }),
    },
  })),
}));

describe('SessionManager with shared servers', () => {
  let sessionManager: SessionManager;
  let serverPool: ReturnType<typeof ServerPool.getInstance>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalSessions.clear();

    // Get the mock ServerPool instance
    serverPool = ServerPool.getInstance();

    // Create a new SessionManager with shared servers
    sessionManager = new SessionManager({ useSharedServers: true });
  });

  it('should use ServerPool for server management when shared servers enabled', async () => {
    // Arrange
    const config = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
      servers: {
        'test-server': {
          command: 'node',
          args: ['./server.js'],
        },
      },
    };

    // Act
    const session = await sessionManager.initializeSession(config);

    // Assert
    expect(ServerPool.getInstance).toHaveBeenCalled();
    expect(serverPool.getOrCreateServer).toHaveBeenCalledWith(
      'test-server',
      config.servers['test-server']
    );
    expect(serverPool.registerSessionServer).toHaveBeenCalledWith(
      'test-session-id',
      'test-server'
    );
    expect(session.serverClients.size).toBe(1);
  });

  it('should release servers through ServerPool on cleanup', async () => {
    // Arrange
    const config = {
      type: 'anthropic',
      api_key: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      system_prompt: 'You are a helpful assistant',
      servers: {
        'test-server': {
          command: 'node',
          args: ['./server.js'],
        },
      },
    };

    // Create a session
    await sessionManager.initializeSession(config);

    // Act
    await sessionManager.cleanup();

    // Assert
    expect(serverPool.releaseSessionServers).toHaveBeenCalledWith(
      'test-session-id'
    );
    expect(globalSessions.size).toBe(0);
  });
});
