import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ServerDiscovery, ServerState } from './discovery';
import { ChildProcess } from 'child_process';
import { MCPTool } from '../llm/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Mock transport and client
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined)
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    listResources: vi.fn().mockResolvedValue({ resources: [] })
  })),
}));

describe('ServerDiscovery', () => {
  let discovery: ServerDiscovery;
  let mockProcess: ChildProcess;
  let mockTools: MCPTool[];
  let mockResources: any[];
  let mockClient: any;

  beforeEach(() => {
    discovery = new ServerDiscovery();
    mockProcess = {
      stdout: vi.fn(),
      stderr: vi.fn(),
      stdin: vi.fn(),
      spawnfile: '/test/path',
      spawnargs: ['/test/path', 'arg1', 'arg2']
    } as unknown as ChildProcess;

    // Setup mock tool and resource responses
    mockTools = [{ 
      name: 'test-tool', 
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' }
        }
      } 
    }];
    
    mockResources = [{ 
      name: 'test-resource', 
      type: 'test',
      description: 'A test resource'
    }];

    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({ tools: mockTools }),
      listResources: vi.fn().mockResolvedValue({ resources: mockResources })
    };

    (StdioClientTransport as Mock).mockImplementation(() => ({}));
    (Client as Mock).mockImplementation(() => mockClient);
  });

  describe('Server Capability Discovery', () => {
    it('should discover server capabilities using SDK', async () => {
      const result = await discovery.discoverCapabilities(
        'test',
        mockProcess
      );

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: mockProcess.spawnfile,
        args: mockProcess.spawnargs?.slice(1) || []
      });

      expect(Client).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.listTools).toHaveBeenCalled();
      expect(mockClient.listResources).toHaveBeenCalled();

      expect(result.client).toBe(mockClient);
      expect(result.capabilities).toEqual({
        tools: mockTools,
        resources: mockResources,
      });
    });

    it('should handle SDK initialization errors', async () => {
      const error = new Error('SDK initialization failed');
      mockClient.connect.mockRejectedValue(error);

      await expect(
        discovery.discoverCapabilities('test', mockProcess)
      ).rejects.toThrow('SDK initialization failed');
    });

    it('should track state transitions correctly', async () => {
      const stateTransitions: ServerState[] = [];
      const originalLogTransition = discovery['logStateTransition'];
      discovery['logStateTransition'] = (
        _serverName: string,
        _from: ServerState,
        to: ServerState
      ) => {
        stateTransitions.push(to);
        originalLogTransition.call(discovery, _serverName, _from, to);
      };

      await discovery.discoverCapabilities('test', mockProcess);

      expect(stateTransitions).toEqual([
        ServerState.Starting,
        ServerState.Ready,
        ServerState.Discovering,
        ServerState.Active,
      ]);
    });

    it('should track error state on failure', async () => {
      const error = new Error('SDK error');
      mockClient.connect.mockRejectedValue(error);

      const stateTransitions: ServerState[] = [];
      const originalLogTransition = discovery['logStateTransition'];
      discovery['logStateTransition'] = (
        _serverName: string,
        _from: ServerState,
        to: ServerState
      ) => {
        stateTransitions.push(to);
        originalLogTransition.call(discovery, _serverName, _from, to);
      };

      await expect(
        discovery.discoverCapabilities('test', mockProcess)
      ).rejects.toThrow('SDK error');

      expect(stateTransitions).toContain(ServerState.Error);
    });

    it('should throw error when no capabilities are discovered', async () => {
      mockClient.listTools.mockResolvedValue({ tools: [] });
      mockClient.listResources.mockResolvedValue({ resources: [] });

      await expect(
        discovery.discoverCapabilities('test', mockProcess)
      ).rejects.toThrow('No capabilities discovered');
    });
  });

  describe('Multiple Server Discovery', () => {
    it('should discover capabilities for multiple servers', async () => {
      const servers = new Map<string, ChildProcess>([
        ['server1', mockProcess],
        ['server2', mockProcess],
      ]);

      const results = await discovery.discoverAllCapabilities(servers);

      expect(results.size).toBe(2);
      expect(results.get('server1')?.capabilities).toEqual({
        tools: mockTools,
        resources: mockResources,
      });
      expect(results.get('server2')?.capabilities).toEqual({
        tools: mockTools,
        resources: mockResources,
      });
    });

    it('should handle failures in multiple server discovery', async () => {
      const servers = new Map<string, ChildProcess>([
        ['server1', mockProcess],
        ['server2', mockProcess],
      ]);

      const error = new Error('SDK error');
      let callCount = 0;
      
      // Reset the mock to have one success and one failure
      const originalDiscoverCapabilities = discovery.discoverCapabilities.bind(discovery);
      discovery.discoverCapabilities = vi.fn().mockImplementation(async (serverName, process) => {
        callCount++;
        if (callCount === 1) {
          return {
            client: mockClient,
            capabilities: {
              tools: mockTools,
              resources: mockResources
            }
          };
        } else {
          throw error;
        }
      });

      await expect(discovery.discoverAllCapabilities(servers)).rejects.toThrow(
        'One or more servers failed capability discovery'
      );
    });
  });
});