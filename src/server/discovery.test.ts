import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ServerDiscovery } from './discovery';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

describe('ServerDiscovery', () => {
  let discovery: ServerDiscovery;
  let mockProcess: ChildProcess;
  let stdoutEmitter: EventEmitter;
  let stdinBuffer: string[];

  beforeEach(() => {
    discovery = new ServerDiscovery();
    stdoutEmitter = new EventEmitter();
    stdinBuffer = [];

    // Create mock process
    mockProcess = {
      stdout: stdoutEmitter,
      stdin: {
        write: (data: string) => {
          stdinBuffer.push(data);
          return true;
        },
      },
    } as unknown as ChildProcess;
  });

  it('should discover tools and resources from a server', async () => {
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

    // Set up promise to resolve after emitting both responses
    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit mock responses after a short delay
    setTimeout(() => {
      stdoutEmitter.emit('data', Buffer.from(JSON.stringify(mockTools)));
      stdoutEmitter.emit('data', Buffer.from(JSON.stringify(mockResources)));
    }, 100);

    const result = await discoveryPromise;

    // Verify the discovery requests were sent
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

  it('should handle server errors gracefully', async () => {
    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit invalid data
    setTimeout(() => {
      stdoutEmitter.emit('data', Buffer.from('invalid json'));
    }, 100);

    await expect(discoveryPromise).rejects.toThrow(
      'Capability discovery timeout'
    );
  });

  it('should handle invalid response data', async () => {
    const discoveryPromise = discovery.discoverCapabilities(
      'test',
      mockProcess
    );

    // Emit invalid response structure
    setTimeout(() => {
      stdoutEmitter.emit(
        'data',
        Buffer.from(JSON.stringify({ type: 'unknown' }))
      );
    }, 100);

    await expect(discoveryPromise).rejects.toThrow(
      'Capability discovery timeout'
    );
  });
});
