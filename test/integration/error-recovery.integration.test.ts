import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerLauncher } from '../../src/server/launcher';
import { ServerDiscovery } from '../../src/server/discovery';
import { ServerConfig } from '../../src/config/types';
import { SessionManager } from '../../src/llm/session';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Mock LLM API
vi.mock('../../src/api/chat', () => ({
  sendMessage: vi.fn(),
  sendMessageStream: vi.fn(),
}));

// Create test workspace
const TEST_WORKSPACE = path.join(
  process.cwd(),
  'test/fixtures/error-recovery-workspace'
);

describe('Error Recovery Tests', () => {
  let serverLauncher: ServerLauncher;
  let serverDiscovery: ServerDiscovery;
  let sessionManager: SessionManager;
  let mockLLM: any;
  let serverConfig: ServerConfig;

  // Set up test environment
  beforeEach(async () => {
    // Create test workspace directory
    if (!existsSync(TEST_WORKSPACE)) {
      await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    }

    // Create a test file
    await fs.writeFile(
      path.join(TEST_WORKSPACE, 'test-file.txt'),
      'This is test content'
    );

    // Initialize components
    serverLauncher = new ServerLauncher();
    serverDiscovery = new ServerDiscovery();
    sessionManager = new SessionManager();
    mockLLM = require('../../src/api/chat');

    // Configure server
    serverConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', TEST_WORKSPACE],
      env: { NODE_ENV: 'test' },
    };
  });

  // Clean up after tests
  afterEach(async () => {
    // Stop any servers
    try {
      await serverLauncher.stopAll();
    } catch (error) {
      console.error('Error stopping servers:', error);
    }

    // Clean up test workspace
    if (existsSync(TEST_WORKSPACE)) {
      await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    }
  });

  it('should recover from server crashes', async () => {
    // Launch server
    const serverProcess = await serverLauncher.launchServer(
      'filesystem',
      serverConfig
    );

    // Discover capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'filesystem',
      serverProcess
    );

    // Verify initial server state
    expect(serverProcess.killed).toBe(false);

    // Mock server crash by emitting 'exit' event
    const mockProcess = serverProcess as unknown as EventEmitter;

    // Set up a spy to monitor relaunch attempts
    const launchSpy = vi.spyOn(serverLauncher, 'launchServer');

    // Create a promise to wait for error and recovery
    const errorPromise = new Promise<void>(resolve => {
      // Listen for server error
      mockProcess.once('error', async error => {
        // Allow time for recovery logic
        setTimeout(() => {
          resolve();
        }, 100);
      });

      // Simulate server crash
      mockProcess.emit('exit', 1, null);
      mockProcess.emit('error', new Error('Server crashed'));
    });

    // Wait for error handling to complete
    await errorPromise;

    // Verify attempt to relaunch
    expect(launchSpy).toHaveBeenCalledWith('filesystem', expect.anything());
  });

  it('should handle network interruptions during tool execution', async () => {
    // Mock network error in client
    const mockClient = {
      callTool: vi.fn().mockImplementation(() => {
        // First call fails with network error
        if (mockClient.callTool.mock.calls.length === 1) {
          return Promise.reject(new Error('Network connection interrupted'));
        }

        // Second call succeeds
        return Promise.resolve({
          result: {
            content: 'This is test content',
          },
        });
      }),
      close: vi.fn(),
    };

    // Mock discovery to return our mock client
    vi.spyOn(serverDiscovery, 'discoverCapabilities').mockResolvedValue({
      client: mockClient,
      capabilities: {
        tools: [{ name: 'readFile', description: 'Read a file' }],
        resources: [],
      },
    });

    // Set up session with retry logic
    mockLLM.sendMessage.mockResolvedValueOnce({
      role: 'assistant',
      content:
        'Let me read that file.\n<tool>readFile {"path": "test-file.txt"}</tool>',
      hasToolCall: true,
      toolCall: {
        name: 'readFile',
        parameters: { path: 'test-file.txt' },
      },
    });

    // Initialize session
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
      servers: {
        filesystem: serverConfig,
      },
    });

    // Send message that will trigger tool usage with retry
    const response = await sessionManager.sendMessage(
      session.id,
      'Read the contents of test-file.txt'
    );

    // Verify that the tool was called twice (once for failure, once for success)
    expect(mockClient.callTool).toHaveBeenCalledTimes(2);

    // Verify that the client eventually succeeded
    expect(response).toBeDefined();
  });

  it('should handle API rate limits and implement backoff', async () => {
    // Mock rate limit error response
    const rateLimitError = new Error('Rate limit exceeded');
    rateLimitError.name = 'RateLimitError';

    // Set up retry counter
    let retryCount = 0;

    // Mock API with rate limiting that succeeds after retries
    mockLLM.sendMessage.mockImplementation(() => {
      retryCount++;

      // First two calls fail with rate limit
      if (retryCount <= 2) {
        return Promise.reject(rateLimitError);
      }

      // Third call succeeds
      return Promise.resolve({
        role: 'assistant',
        content: 'Success after retry',
        hasToolCall: false,
      });
    });

    // Capture time before making call
    const startTime = Date.now();

    // Initialize session
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
    });

    // Send message that should trigger retries with backoff
    const response = await sessionManager.sendMessage(
      session.id,
      'Tell me a joke'
    );

    // Calculate total time elapsed
    const timeElapsed = Date.now() - startTime;

    // Verify retry count
    expect(retryCount).toBeGreaterThan(1);

    // Verify successful response
    expect(response.content).toBe('Success after retry');

    // Verify some backoff occurred (implementation dependent)
    // Assuming exponential backoff, there should be some minimum delay
    // This is a loose test since exact timing is implementation-dependent
    expect(timeElapsed).toBeGreaterThan(100); // Minimal backoff time
  });

  it('should handle partial results during interruptions', async () => {
    // Mock a streaming response that gets interrupted
    const streamGenerator = async function* () {
      // Yield first chunk
      yield {
        type: 'content',
        content: 'First part of response',
      };

      // Simulate network interruption
      throw new Error('Network error during streaming');
    };

    // Second attempt succeeds with complete response
    const completeStreamGenerator = async function* () {
      yield {
        type: 'content',
        content: 'Complete response after retry',
      };

      yield {
        type: 'done',
      };
    };

    // Mock streaming API
    mockLLM.sendMessageStream.mockImplementation(
      (sessionId, message, options) => {
        // First call returns interrupted stream
        if (mockLLM.sendMessageStream.mock.calls.length === 1) {
          return streamGenerator();
        }

        // Second call returns complete stream
        return completeStreamGenerator();
      }
    );

    // Initialize session
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
    });

    // Create array to capture streaming chunks
    const chunks: any[] = [];

    // Send message with streaming, catching and recovering from error
    try {
      const stream = sessionManager.sendMessageStream(
        session.id,
        'Tell me a story'
      );

      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    } catch (error) {
      // Error should be caught by session manager's retry logic
      console.error('Streaming error:', error);
    }

    // Verify we got content despite interruption
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some(chunk => chunk.type === 'done')).toBe(true);

    // Verify at least one content chunk with recovery message
    const contentChunks = chunks.filter(chunk => chunk.type === 'content');
    expect(contentChunks.length).toBeGreaterThan(0);

    // One of the content chunks should have the complete response
    expect(
      contentChunks.some(chunk =>
        chunk.content.includes('Complete response after retry')
      )
    ).toBe(true);
  });
});
