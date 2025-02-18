import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ServerDiscovery } from './discovery';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

describe('ServerDiscovery', () => {
  let discovery: ServerDiscovery;
  let mockProcess: ChildProcess;
  let stdoutEmitter: EventEmitter;
  let stderrEmitter: EventEmitter;
  let stdinBuffer: string[];

  beforeEach(() => {
    discovery = new ServerDiscovery();
    stdoutEmitter = new EventEmitter();
    stderrEmitter = new EventEmitter();
    stdinBuffer = [];

    // Create mock process
    mockProcess = {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      stdin: {
        write: (data: string) => {
          stdinBuffer.push(data);
          return true;
        },
      },
      on: vi.fn(),
    } as unknown as ChildProcess;
  });

  it('should discover tools and resources after server is ready', async () => {
    const mockTools = {
      type: 'tools',
      data: {
        tools: [
          {
            name: 'readFile',
            description: 'Reads a file',
            parameters: { properties: {} },
          },
        ],
      },
    };

    const mockResources = {
      type: 'resources',
      data: {
        resources: [{ name: 'filesystem', type: 'fs' }],
      },
    };

    // Set up promise to resolve after emitting responses
    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit server ready message
    setTimeout(() => {
      stderrEmitter.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );
    }, 10);

    // Emit mock responses after server ready
    setTimeout(() => {
      stdoutEmitter.emit('data', Buffer.from(JSON.stringify(mockTools) + '\n'));
      stdoutEmitter.emit(
        'data',
        Buffer.from(JSON.stringify(mockResources) + '\n')
      );
    }, 20);

    const result = await discoveryPromise;

    // Verify commands were sent after server ready
    expect(stdinBuffer).toContain(
      JSON.stringify({ command: 'list_tools' }) + '\n'
    );
    expect(stdinBuffer).toContain(
      JSON.stringify({ command: 'list_resources' }) + '\n'
    );

    // Verify the discovered capabilities
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('readFile');
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('filesystem');
  });

  it('should handle partial JSON messages', async () => {
    const mockTools = {
      type: 'tools',
      data: {
        tools: [
          {
            name: 'readFile',
            description: 'Reads a file',
            parameters: { properties: {} },
          },
        ],
      },
    };

    const mockResources = {
      type: 'resources',
      data: {
        resources: [{ name: 'filesystem', type: 'fs' }],
      },
    };

    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit server ready
    setTimeout(() => {
      stderrEmitter.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );
    }, 10);

    // Emit split JSON messages
    setTimeout(() => {
      const toolsStr = JSON.stringify(mockTools);
      stdoutEmitter.emit('data', Buffer.from(toolsStr.slice(0, 10)));
      stdoutEmitter.emit('data', Buffer.from(toolsStr.slice(10) + '\n'));

      const resourcesStr = JSON.stringify(mockResources);
      stdoutEmitter.emit('data', Buffer.from(resourcesStr.slice(0, 10)));
      stdoutEmitter.emit('data', Buffer.from(resourcesStr.slice(10) + '\n'));
    }, 20);

    const result = await discoveryPromise;

    // Verify the capabilities were properly reconstructed
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('readFile');
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('filesystem');
  });

  it('should handle server errors gracefully', async () => {
    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit server error
    setTimeout(() => {
      stderrEmitter.emit(
        'data',
        Buffer.from('Error: Failed to initialize server\n')
      );
    }, 10);

    await expect(discoveryPromise).rejects.toThrow(
      'Server test startup timeout'
    );
  });

  it('should handle invalid response data', async () => {
    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit server ready
    setTimeout(() => {
      stderrEmitter.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );
    }, 10);

    // Emit invalid response structure
    setTimeout(() => {
      stdoutEmitter.emit(
        'data',
        Buffer.from(JSON.stringify({ type: 'unknown' }) + '\n')
      );
    }, 20);

    await expect(discoveryPromise).rejects.toThrow(
      'Capability discovery timeout'
    );
  });
});
