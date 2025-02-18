import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { ServerLauncher } from './server/launcher';
import { ServerDiscovery } from './server/discovery';
import { SessionManager } from './llm/session';
import { LLMConfig } from './config/types';
import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { Readable, Writable } from 'stream';
import { Anthropic } from '@anthropic-ai/sdk';

// Create a proper mock stream class that implements Readable/Writable
class MockStream
  extends EventEmitter
  implements NodeJS.ReadableStream, NodeJS.WritableStream
{
  private buffer: string = '';
  readable = true;
  writable = true;

  // Required ReadableStream properties
  readableHighWaterMark = 16384;
  readableLength = 0;
  readableObjectMode = false;
  readableEncoding: BufferEncoding | null = null;
  readableEnded = false;
  readableFlowing: boolean | null = true;
  readableAborted = false;
  readableDidRead = false;
  closed = false;
  errored: Error | null = null;
  destroyed = false;

  // Required WritableStream properties
  writableHighWaterMark = 16384;
  writableLength = 0;
  writableObjectMode = false;
  writableEnded = false;
  writableFinished = false;
  writableCorked = 0;
  writableNeedDrain = false;

  write(
    chunk: any,
    encoding?: BufferEncoding | ((error?: Error) => void),
    callback?: (error?: Error) => void
  ): boolean {
    if (Buffer.isBuffer(chunk)) {
      this.buffer += chunk.toString();
    } else {
      this.buffer += chunk;
    }
    this.emit('data', Buffer.from(chunk));
    if (typeof encoding === 'function') callback = encoding;
    if (callback) callback();
    return true;
  }

  read(size?: number): string | Buffer {
    const data = this.buffer;
    this.buffer = '';
    this.readableDidRead = true;
    return data ? Buffer.from(data) : '';
  }

  pipe<T extends NodeJS.WritableStream>(destination: T): T {
    return destination;
  }

  destroy(error?: Error): this {
    this.destroyed = true;
    if (error) this.emit('error', error);
    this.emit('close');
    return this;
  }

  end(
    chunk?: any,
    encoding?: BufferEncoding | (() => void),
    callback?: () => void
  ): this {
    if (chunk) this.write(chunk, encoding as BufferEncoding);
    if (typeof encoding === 'function') callback = encoding;
    if (callback) callback();
    this.writableEnded = true;
    this.emit('end');
    return this;
  }

  pause(): this {
    this.readableFlowing = false;
    return this;
  }

  resume(): this {
    this.readableFlowing = true;
    return this;
  }

  isPaused(): boolean {
    return !this.readableFlowing;
  }

  setEncoding(encoding: BufferEncoding): this {
    this.readableEncoding = encoding;
    return this;
  }

  unpipe(destination?: NodeJS.WritableStream): this {
    return this;
  }

  unshift(chunk: any, encoding?: BufferEncoding): void {}
  wrap(oldStream: NodeJS.ReadableStream): this {
    return this;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<any> {
    return {
      next: async () => ({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}

// Create a proper mock process class that implements necessary ChildProcess methods
class MockProcess extends EventEmitter {
  public pid: number;
  public stdin: MockStream;
  public stdout: MockStream;
  public stderr: MockStream;
  public killed: boolean;
  public connected: boolean;
  public stdio: [MockStream, MockStream, MockStream];
  public exitCode: number | null = null;
  public signalCode: string | null = null;
  public spawnargs: string[] = [];
  public spawnfile: string = '';
  private isRunning: boolean = true;
  private isReady: boolean = false;

  constructor() {
    super();
    this.pid = 123;
    this.stdin = new MockStream();
    this.stdout = new MockStream();
    this.stderr = new MockStream();
    this.killed = false;
    this.connected = true;
    this.stdio = [this.stdin, this.stdout, this.stderr];

    // Set up event forwarding
    this.stdin.on('error', err => this.emit('error', err));
    this.stdout.on('error', err => this.emit('error', err));
    this.stderr.on('error', err => this.emit('error', err));
  }

  kill(signal?: number | NodeJS.Signals): boolean {
    if (signal === 0) {
      // Health check - if process has exited, emit exit event again
      if (this.exitCode !== null) {
        process.nextTick(() => {
          this.emit('exit', this.exitCode, null);
        });
        return false;
      }
      // Return true if process is running and ready
      return this.isRunning && this.isReady;
    }
    this.killed = true;
    this.isRunning = false;
    this.emit('exit', signal || 0, null);
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  ref(): void {}
  unref(): void {}

  // Helper method to simulate server ready state
  signalReady(): void {
    this.isReady = true;
    this.stderr.emit(
      'data',
      Buffer.from('Secure MCP Filesystem Server running on stdio\n')
    );
  }

  // Helper method to emit tool discovery responses
  emitToolDiscovery(): void {
    if (!this.isReady) {
      throw new Error('Cannot discover tools before server is ready');
    }

    this.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'tools',
          data: {
            tools: [
              {
                name: 'list-files',
                description: 'List files in a directory',
                parameters: { properties: {} },
              },
            ],
          },
        }) + '\n'
      )
    );

    this.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'resources',
          data: {
            resources: [{ name: 'filesystem', type: 'fs' }],
          },
        }) + '\n'
      )
    );
  }

  // Helper method to simulate process failure
  fail(code: number): void {
    this.exitCode = code;
    this.isRunning = false;
    this.isReady = false;
    this.killed = true;
    this.emit('exit', code, null);
  }

  // Helper method to simulate process error
  error(error: Error): void {
    this.isRunning = false;
    this.isReady = false;
    this.emit('error', error);
  }
}

// Helper function to create mock processes
function createMockProcess(): MockProcess {
  return new MockProcess();
}

// Mock Anthropic SDK for integration tests
vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockImplementation(options => {
          const messages = options.messages || [];
          const hasToolResult = messages.some(m => m.isToolResult);
          const isListFilesRequest = messages.some(
            m =>
              m.content.toLowerCase().includes('list') &&
              m.content.toLowerCase().includes('file')
          );

          if (options.stream) {
            return {
              [Symbol.asyncIterator]: async function* () {
                yield {
                  type: 'content_block_start',
                  index: 0,
                  content_block: { type: 'text', text: '' },
                };

                if (hasToolResult) {
                  yield {
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: 'I found these files: test.txt' },
                  };
                } else if (isListFilesRequest) {
                  yield {
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: 'Let me check the files.' },
                  };

                  yield {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                      type: 'text_delta',
                      text: '\n<tool>list-files {"path": "/tmp"}</tool>',
                    },
                  };

                  // Add tool result in the same stream
                  yield {
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: '\nI found these files: test.txt' },
                  };
                }

                yield {
                  type: 'content_block_stop',
                  index: 0,
                };

                yield {
                  type: 'message_stop',
                };
              },
            };
          }

          if (hasToolResult) {
            return {
              id: 'msg_123',
              model: 'claude-3-sonnet-20240229',
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'I found these files: test.txt',
                },
              ],
            };
          } else if (isListFilesRequest) {
            return {
              id: 'msg_123',
              model: 'claude-3-sonnet-20240229',
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Let me check the files.\n<tool>list-files {"path": "/tmp"}</tool>\nI found these files: test.txt',
                },
              ],
            };
          }

          return {
            id: 'msg_123',
            model: 'claude-3-sonnet-20240229',
            role: 'assistant',
            content: [{ type: 'text', text: 'I found these files: test.txt' }],
          };
        }),
      },
    })),
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn().mockImplementation((command, args, options) => {
    const mockProcess = createMockProcess();

    // Handle invalid command
    if (command === 'invalid-command') {
      process.nextTick(() => {
        mockProcess.error(new Error('Failed to launch server'));
      });
      return mockProcess;
    }

    // Handle invalid path
    if (args.includes('/invalid/path')) {
      process.nextTick(() => {
        mockProcess.signalReady();
        mockProcess.fail(1);
      });
      return mockProcess;
    }

    // Normal case - successful launch
    process.nextTick(() => {
      mockProcess.signalReady();
      // Add a small delay before emitting tool discovery to ensure ready state is processed
      setTimeout(() => {
        mockProcess.emitToolDiscovery();
      }, 10);
    });

    return mockProcess;
  }),
}));

describe('MCP Client Integration', () => {
  let launcher: ServerLauncher;
  let discovery: ServerDiscovery;
  let sessionManager: SessionManager;
  let testDir: string;

  beforeAll(async () => {
    launcher = new ServerLauncher();
    discovery = new ServerDiscovery();
    sessionManager = new SessionManager();

    // Create test directory
    testDir = path.join(__dirname, 'test-files');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'test.txt'), 'test content');
  });

  afterAll(async () => {
    // Stop all servers
    console.log('[LAUNCHER] Stopping all servers');
    await launcher.stopAll();
    console.log('[LAUNCHER] All servers stopped');

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Create fresh instances for each test
    launcher = new ServerLauncher();
    discovery = new ServerDiscovery();
    sessionManager = new SessionManager();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    await launcher.stopAll();
  });

  describe('Server Lifecycle', () => {
    it('should launch filesystem server, discover capabilities, and execute tools', async () => {
      // 1. Launch Server
      const serverName = 'filesystem';
      const serverConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', testDir],
        env: {},
      };

      await launcher.launchServer(serverName, serverConfig);
      const process = launcher.getServerProcess(serverName);
      expect(process).toBeDefined();
      expect(process?.pid).toBeDefined();

      // 2. Discover Capabilities
      const capabilities = await discovery.discoverCapabilities(
        serverName,
        process!
      );
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.length).toBeGreaterThan(0);
      expect(capabilities.resources).toBeDefined();

      // Verify specific tools are available
      const readFileTool = capabilities.tools.find(
        t => t.name === 'list-files'
      );
      expect(readFileTool).toBeDefined();
      expect(readFileTool?.parameters).toBeDefined();
    });

    it('should handle multiple servers and tool invocations', async () => {
      // 1. Initialize Session
      const config: LLMConfig = {
        type: 'claude',
        api_key: 'test-key',
        model: 'claude-3-sonnet-20240229',
        system_prompt: 'You are a helpful assistant.',
        servers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', testDir],
            env: {},
          },
          terminal: {
            command: 'npx',
            args: [
              '@rinardnick/mcp-terminal',
              '--allowed-commands',
              '[ls,pwd]',
            ],
            env: {},
          },
        },
      };

      const session = await sessionManager.initializeSession(config);
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();

      // Wait for servers to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Verify Tools Available
      expect(session.tools).toBeDefined();
      expect(session.tools?.length).toBeGreaterThan(0);

      // 3. Test Tool Invocation
      const message = 'What files are in the current directory?';
      const response = await sessionManager.sendMessage(session.id, message);
      expect(response).toBeDefined();
      expect(response.content).toContain('test.txt');
    });
  });

  describe('Error Handling', () => {
    it('should handle server launch failures gracefully', async () => {
      const serverName = 'invalid';
      const serverConfig = {
        command: 'invalid-command',
        args: [],
        env: {},
      };

      // Mock spawn to fail
      const spawn = vi.spyOn(require('child_process'), 'spawn');
      spawn.mockImplementationOnce(() => {
        const mockProcess = createMockProcess();

        // Emit error
        setTimeout(() => {
          mockProcess.emit('error', new Error('Failed to launch server'));
        }, 10);

        return mockProcess;
      });

      await expect(
        launcher.launchServer(serverName, serverConfig)
      ).rejects.toThrow('Failed to launch server');
    });

    it('should handle discovery failures gracefully', async () => {
      const serverName = 'filesystem';
      const serverConfig = {
        command: 'npx',
        args: [
          '-y',
          '@modelcontextprotocol/server-filesystem',
          '/invalid/path',
        ],
        env: {},
      };

      // Mock spawn to fail after startup
      const spawn = vi.spyOn(require('child_process'), 'spawn');
      spawn.mockImplementationOnce(() => {
        const mockProcess = createMockProcess();

        // Emit ready message then exit with error
        process.nextTick(() => {
          mockProcess.signalReady();
          mockProcess.fail(1);
        });

        return mockProcess;
      });

      await expect(
        launcher.launchServer(serverName, serverConfig)
      ).rejects.toThrow('Server filesystem exited with code 1');
    }, 60000); // Increase timeout to 60 seconds

    it('should handle tool invocation failures gracefully', async () => {
      const config: LLMConfig = {
        type: 'claude',
        api_key: 'test-key',
        model: 'claude-3-sonnet-20240229',
        system_prompt: 'You are a helpful assistant.',
        servers: {
          filesystem: {
            command: 'npx',
            args: [
              '-y',
              '@modelcontextprotocol/server-filesystem',
              '/invalid/path',
            ],
            env: {},
          },
        },
      };

      // Mock spawn to fail after startup
      const spawn = vi.spyOn(require('child_process'), 'spawn');
      spawn.mockImplementationOnce(() => {
        const mockProcess = createMockProcess();

        // Emit ready message then exit with error
        process.nextTick(() => {
          mockProcess.signalReady();
          mockProcess.fail(1);
        });

        return mockProcess;
      });

      await expect(sessionManager.initializeSession(config)).rejects.toThrow(
        'Server filesystem exited with code 1'
      );
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid tool invocations', async () => {
      const config: LLMConfig = {
        type: 'claude',
        api_key: 'test-key',
        model: 'claude-3-sonnet-20240229',
        system_prompt: 'You are a helpful assistant.',
        servers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', testDir],
            env: {},
          },
        },
      };

      const session = await sessionManager.initializeSession(config);

      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const messages = [
        'List files in the current directory',
        'What files are in /tmp?',
        'Show me the contents of test.txt',
      ];

      // Send messages in rapid succession
      const responses = await Promise.all(
        messages.map(msg => sessionManager.sendMessage(session.id, msg))
      );

      expect(responses).toHaveLength(messages.length);
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(response.content).toBeDefined();
      });
    });

    it('should maintain tool functionality over time', async () => {
      const config: LLMConfig = {
        type: 'claude',
        api_key: 'test-key',
        model: 'claude-3-sonnet-20240229',
        system_prompt: 'You are a helpful assistant.',
        servers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', testDir],
            env: {},
          },
        },
      };

      const session = await sessionManager.initializeSession(config);

      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test tool invocation at intervals
      for (let i = 0; i < 3; i++) {
        const response = await sessionManager.sendMessage(
          session.id,
          'List files in the current directory'
        );
        expect(response).toBeDefined();
        expect(response.content).toContain('test.txt');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });
  });
});
