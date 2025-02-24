import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { ServerDiscovery, ServerState } from './discovery';
import { ChildProcess } from 'child_process';
import { MCPTool } from '@modelcontextprotocol/sdk';
import { createMCPClient } from '@modelcontextprotocol/sdk/dist/esm/client';
import { StdioTransport } from '@modelcontextprotocol/sdk/dist/esm/transport';

// Mock SDK
vi.mock('@modelcontextprotocol/sdk/dist/esm/client', () => ({
  createMCPClient: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/dist/esm/transport', () => ({
  StdioTransport: vi.fn(),
}));

describe('ServerDiscovery', () => {
  let discovery: ServerDiscovery;
  let mockProcess: ChildProcess;
  let mockClient: { tools: any[]; resources: any[] };

  beforeEach(() => {
    discovery = new ServerDiscovery();
    mockProcess = {
      stdout: vi.fn(),
      stderr: vi.fn(),
      stdin: vi.fn(),
    } as unknown as ChildProcess;

    mockClient = {
      tools: [{ name: 'test-tool', description: 'A test tool' }],
      resources: [{ name: 'test-resource', type: 'test' }],
    };

    (StdioTransport as Mock).mockImplementation(() => ({}));
    (createMCPClient as Mock).mockResolvedValue(mockClient);
  });

  describe('Server Capability Discovery', () => {
    it('should discover server capabilities using SDK', async () => {
      const capabilities = await discovery.discoverCapabilities(
        'test',
        mockProcess
      );

      expect(StdioTransport).toHaveBeenCalledWith(mockProcess);
      expect(createMCPClient).toHaveBeenCalled();
      expect(capabilities).toEqual({
        tools: mockClient.tools,
        resources: mockClient.resources,
      });
    });

    it('should handle SDK initialization errors', async () => {
      const error = new Error('SDK initialization failed');
      (createMCPClient as Mock).mockRejectedValue(error);

      await expect(
        discovery.discoverCapabilities('test', mockProcess)
      ).rejects.toThrow(error);
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
      (createMCPClient as Mock).mockRejectedValue(error);

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
      ).rejects.toThrow(error);

      expect(stateTransitions).toContain(ServerState.Error);
    });

    it('should throw error when no capabilities are discovered', async () => {
      (createMCPClient as Mock).mockResolvedValue({
        tools: [],
        resources: [],
      });

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

      const capabilities = await discovery.discoverAllCapabilities(servers);

      expect(capabilities.size).toBe(2);
      expect(capabilities.get('server1')).toEqual({
        tools: mockClient.tools,
        resources: mockClient.resources,
      });
      expect(capabilities.get('server2')).toEqual({
        tools: mockClient.tools,
        resources: mockClient.resources,
      });
    });

    it('should handle failures in multiple server discovery', async () => {
      const servers = new Map<string, ChildProcess>([
        ['server1', mockProcess],
        ['server2', mockProcess],
      ]);

      const error = new Error('SDK error');
      (createMCPClient as Mock)
        .mockResolvedValueOnce(mockClient)
        .mockRejectedValueOnce(error);

      await expect(discovery.discoverAllCapabilities(servers)).rejects.toThrow(
        'One or more servers failed capability discovery'
      );
    });
  });
});
