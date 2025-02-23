import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ServerDiscovery, ServerState } from './discovery';
import {
  ChildProcess,
  SendHandle,
  Serializable,
  MessageOptions,
} from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

// Mock process class for testing
class MockProcess
  implements
    Pick<
      ChildProcess,
      | 'stdout'
      | 'stderr'
      | 'stdin'
      | 'stdio'
      | 'killed'
      | 'connected'
      | 'exitCode'
      | 'signalCode'
      | 'pid'
      | 'spawnargs'
      | 'spawnfile'
      | 'kill'
      | 'disconnect'
      | 'ref'
      | 'unref'
    >
{
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  stdio: [
    Writable | null,
    Readable | null,
    Readable | null,
    Writable | Readable | null | undefined,
    Writable | Readable | null | undefined
  ];
  killed: boolean = false;
  connected: boolean = true;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  pid: number = 123;
  spawnargs: string[] = [];
  spawnfile: string = '';
  private eventEmitter = new EventEmitter();

  constructor() {
    this.stdout = new Readable({
      read() {}, // No-op implementation
    });
    this.stderr = new Readable({
      read() {}, // No-op implementation
    });
    this.stdin = new Writable({
      write(chunk, encoding, callback) {
        // Simulate successful write
        callback();
        return true;
      },
    });
    this.stdio = [this.stdin, this.stdout, this.stderr, undefined, undefined];
  }

  // Helper method to emit data on stdout
  emitStdout(data: string) {
    this.stdout.push(data);
  }

  // Helper method to emit data on stderr
  emitStderr(data: string) {
    this.stderr.push(data);
  }

  // Event emitter methods
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  once(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  addListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.eventEmitter.addListener(event, listener);
    return this;
  }

  removeListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.eventEmitter.removeListener(event, listener);
    return this;
  }

  removeAllListeners(event?: string | symbol): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
  }

  prependListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.eventEmitter.prependListener(event, listener);
    return this;
  }

  prependOnceListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.eventEmitter.prependOnceListener(event, listener);
    return this;
  }

  send(
    message: Serializable,
    sendHandle?: SendHandle,
    options?: MessageOptions,
    callback?: (error: Error | null) => void
  ): boolean {
    if (callback) callback(null);
    return true;
  }

  off(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  setMaxListeners(n: number): this {
    this.eventEmitter.setMaxListeners(n);
    return this;
  }

  getMaxListeners(): number {
    return this.eventEmitter.getMaxListeners();
  }

  listeners(event: string | symbol): Function[] {
    return this.eventEmitter.listeners(event);
  }

  rawListeners(event: string | symbol): Function[] {
    return this.eventEmitter.rawListeners(event);
  }

  listenerCount(event: string | symbol): number {
    return this.eventEmitter.listenerCount(event);
  }

  eventNames(): Array<string | symbol> {
    return this.eventEmitter.eventNames();
  }

  [Symbol.dispose](): void {
    this.eventEmitter.removeAllListeners();
  }

  // Required ChildProcess methods
  kill(signal?: number | NodeJS.Signals): boolean {
    this.killed = true;
    this.emit('exit', 0, signal);
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  ref(): void {}
  unref(): void {}
}

describe('ServerDiscovery', () => {
  let discovery: ServerDiscovery;
  let mockProcess: MockProcess;

  beforeEach(() => {
    discovery = new ServerDiscovery();
    mockProcess = new MockProcess();
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
      mockProcess as unknown as ChildProcess
    );

    // Emit server ready message
    setTimeout(() => {
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );
    }, 10);

    // Emit mock responses after server ready
    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(mockTools) + '\n')
      );
      mockProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(mockResources) + '\n')
      );
    }, 20);

    const result = await discoveryPromise;

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
      mockProcess as unknown as ChildProcess
    );

    // Emit server ready
    setTimeout(() => {
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );
    }, 10);

    // Emit split JSON messages
    setTimeout(() => {
      const toolsStr = JSON.stringify(mockTools);
      mockProcess.stdout.emit('data', Buffer.from(toolsStr.slice(0, 10)));
      mockProcess.stdout.emit('data', Buffer.from(toolsStr.slice(10) + '\n'));

      const resourcesStr = JSON.stringify(mockResources);
      mockProcess.stdout.emit('data', Buffer.from(resourcesStr.slice(0, 10)));
      mockProcess.stdout.emit(
        'data',
        Buffer.from(resourcesStr.slice(10) + '\n')
      );
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
      mockProcess as unknown as ChildProcess
    );

    // Emit server error
    setTimeout(() => {
      mockProcess.stderr.emit(
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
      mockProcess as unknown as ChildProcess
    );

    // Emit server ready
    setTimeout(() => {
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );
    }, 10);

    // Emit invalid response structure
    setTimeout(() => {
      mockProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify({ type: 'unknown' }) + '\n')
      );
    }, 20);

    await expect(discoveryPromise).rejects.toThrow(
      'Capability discovery timeout'
    );
  });

  describe('Server Startup Detection', () => {
    it('should detect server startup with filesystem server message format', async () => {
      const discoveryPromise = discovery.discoverCapabilities(
        'test',
        mockProcess as unknown as ChildProcess
      );

      // Simulate filesystem server startup message
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Allowed directories: ["/tmp"]\n')
      );

      // Simulate tool and resource responses
      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'tools',
            data: { tools: [] },
          }) + '\n'
        )
      );

      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'resources',
            data: { resources: [] },
          }) + '\n'
        )
      );

      const capabilities = await discoveryPromise;
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });

    it('should detect server startup with standard MCP message format', async () => {
      const discoveryPromise = discovery.discoverCapabilities(
        'test',
        mockProcess as unknown as ChildProcess
      );

      // Simulate standard MCP startup message
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Secure MCP Server running on stdio\n')
      );

      // Simulate tool and resource responses
      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'tools',
            data: { tools: [] },
          }) + '\n'
        )
      );

      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'resources',
            data: { resources: [] },
          }) + '\n'
        )
      );

      const capabilities = await discoveryPromise;
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });

    it('should timeout if no startup message is received', async () => {
      const promise = discovery.discoverCapabilities(
        'test',
        mockProcess as unknown as ChildProcess
      );
      await expect(promise).rejects.toThrow('Server test startup timeout');
    });
  });

  describe('Server State Transitions', () => {
    it('should track state transitions correctly', async () => {
      const discovery = new ServerDiscovery();
      const mockProcess = new MockProcess() as unknown as ChildProcess;

      if (!mockProcess.stderr || !mockProcess.stdout) {
        throw new Error('Mock process missing stderr or stdout');
      }

      const stateTransitions: ServerState[] = [];
      discovery['logStateTransition'] = (
        _serverName: string,
        from: ServerState,
        to: ServerState
      ) => {
        stateTransitions.push(to);
      };

      const promise = discovery.discoverCapabilities('test', mockProcess);

      // Emit server ready message
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );

      // Emit tool and resource responses
      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'tools',
            data: { tools: [] },
          }) + '\n'
        )
      );

      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'resources',
            data: { resources: [] },
          }) + '\n'
        )
      );

      await promise;

      // Verify state transitions
      expect(stateTransitions).toEqual([
        ServerState.Ready,
        ServerState.Discovering,
        ServerState.Active,
      ]);
    });
  });

  describe('Command Retry Behavior', () => {
    it('should retry failed commands up to max retries', async () => {
      const discovery = new ServerDiscovery();
      const mockProcess = new MockProcess() as unknown as ChildProcess;

      if (!mockProcess.stderr || !mockProcess.stdout || !mockProcess.stdin) {
        throw new Error('Mock process missing required streams');
      }

      // Track write attempts and timing
      let writeAttempts = 0;
      const writeTimestamps: number[] = [];
      const originalWrite = mockProcess.stdin.write;
      mockProcess.stdin.write = (
        chunk: any,
        encoding?: any,
        callback?: any
      ) => {
        writeAttempts++;
        writeTimestamps.push(Date.now());
        // Succeed after 2 failures (on 3rd attempt)
        const success = writeAttempts > 2;
        if (callback) callback();
        return success;
      };

      // Start discovery process
      const promise = discovery.discoverCapabilities('test', mockProcess);

      // Emit server ready message
      mockProcess.stderr.emit(
        'data',
        Buffer.from('Secure MCP Filesystem Server running on stdio\n')
      );

      // Wait for retries to complete
      await promise.catch(() => {}); // Ignore potential timeout

      // Verify number of attempts
      expect(writeAttempts).toBe(3);

      // Verify retry intervals
      for (let i = 1; i < writeTimestamps.length; i++) {
        const interval = writeTimestamps[i] - writeTimestamps[i - 1];
        expect(interval).toBeGreaterThanOrEqual(1900); // Allow 100ms margin
        expect(interval).toBeLessThanOrEqual(2100); // Allow 100ms margin
      }
    });
  });
});
