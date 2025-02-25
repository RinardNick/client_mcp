import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerLauncher } from '../../src/server/launcher';
import { ServerDiscovery } from '../../src/server/discovery';
import { ServerConfig } from '../../src/config/types';
import { SessionManager } from '../../src/llm/session';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Set long timeout for performance tests
vi.setConfig({ testTimeout: 30000 });

// Mock LLM API
vi.mock('../../src/api/chat', () => ({
  sendMessage: vi.fn(),
  sendMessageStream: vi.fn(),
}));

// Create test workspace
const TEST_WORKSPACE = path.join(
  process.cwd(),
  'test/fixtures/performance-workspace'
);

describe('Performance Tests', () => {
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

    // Create some test files to work with
    for (let i = 0; i < 50; i++) {
      await fs.writeFile(
        path.join(TEST_WORKSPACE, `file-${i}.txt`),
        `This is test content for file ${i}`
      );
    }

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

  // This test requires a performance threshold to be defined
  // in a way that makes sense for the specific environment
  it('should maintain acceptable server launch times', async () => {
    const startTime = Date.now();

    // Launch the server
    await serverLauncher.launchServer('filesystem', serverConfig);

    const launchTime = Date.now() - startTime;

    // Log performance metric
    console.log(`Server launch time: ${launchTime}ms`);

    // Example threshold (adjust based on reasonable values for your environment)
    const LAUNCH_TIME_THRESHOLD = 5000; // 5 seconds

    expect(launchTime).toBeLessThan(LAUNCH_TIME_THRESHOLD);
  });

  it('should handle concurrent tool executions efficiently', async () => {
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

    const startTime = Date.now();

    // Prepare concurrent file read operations
    const fileReadPromises = [];
    for (let i = 0; i < 10; i++) {
      fileReadPromises.push(
        client.callTool({
          name: 'readFile',
          parameters: { path: `file-${i}.txt` },
        })
      );
    }

    // Execute all reads concurrently
    await Promise.all(fileReadPromises);

    const concurrentTime = Date.now() - startTime;

    // Log performance metric
    console.log(
      `Time to execute 10 concurrent file reads: ${concurrentTime}ms`
    );

    // Now do 10 sequential reads for comparison
    const sequentialStartTime = Date.now();

    for (let i = 0; i < 10; i++) {
      await client.callTool({
        name: 'readFile',
        parameters: { path: `file-${i}.txt` },
      });
    }

    const sequentialTime = Date.now() - sequentialStartTime;

    // Log performance comparison
    console.log(
      `Time to execute 10 sequential file reads: ${sequentialTime}ms`
    );
    console.log(
      `Performance improvement factor: ${sequentialTime / concurrentTime}x`
    );

    // Verify concurrent execution is more efficient
    // This is a basic test, but would be more relevant with actual network requests
    // Threshold is set low because mocked calls might not show much difference
    expect(concurrentTime).toBeLessThan(sequentialTime * 0.9);
  });

  // This test should be marked with 'skip' for CI pipelines
  // as memory usage is environment-dependent
  it.skip('should monitor memory usage during long-running sessions', async () => {
    // Mock responses that don't use much memory
    mockLLM.sendMessage.mockImplementation(() => {
      return Promise.resolve({
        role: 'assistant',
        content: 'Short response',
        hasToolCall: false,
      });
    });

    // Track initial memory usage
    const initialMemory = process.memoryUsage();

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

    // Send multiple messages to build up session state
    for (let i = 0; i < 50; i++) {
      await sessionManager.sendMessage(
        session.id,
        `This is message number ${i} in a long conversation.`
      );
    }

    // Check memory usage after operations
    const finalMemory = process.memoryUsage();

    // Log memory metrics
    console.log('Memory usage:');
    console.log(
      'Initial RSS (MB):',
      Math.round(initialMemory.rss / 1024 / 1024)
    );
    console.log('Final RSS (MB):', Math.round(finalMemory.rss / 1024 / 1024));
    console.log(
      'Increase (MB):',
      Math.round((finalMemory.rss - initialMemory.rss) / 1024 / 1024)
    );

    // Check for memory leak (specific thresholds would depend on expected behavior)
    // This is a simple test and real memory leak detection would be more sophisticated
    const MB = 1024 * 1024;
    const ACCEPTABLE_INCREASE_MB = 50; // Adjust based on expected memory usage

    expect(finalMemory.rss - initialMemory.rss).toBeLessThan(
      ACCEPTABLE_INCREASE_MB * MB
    );
  });

  it('should handle high-frequency tool calls', async () => {
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

    const startTime = Date.now();
    const TOTAL_CALLS = 100;

    // Prepare high-frequency tool calls
    for (let i = 0; i < TOTAL_CALLS; i++) {
      await client.callTool({
        name: 'listFiles',
        parameters: { path: '.' },
      });
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const callsPerSecond = (TOTAL_CALLS / totalTime) * 1000;

    // Log performance metrics
    console.log(`Executed ${TOTAL_CALLS} tool calls in ${totalTime}ms`);
    console.log(`Rate: ${callsPerSecond.toFixed(2)} calls per second`);

    // Verify minimum throughput
    // Threshold is environment-dependent, adjust as needed
    const MIN_CALLS_PER_SECOND = 10;
    expect(callsPerSecond).toBeGreaterThan(MIN_CALLS_PER_SECOND);
  });

  it('should maintain stable response times under load', async () => {
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

    // Measure response times for a series of calls
    const responseTimes: number[] = [];

    // Warm-up calls
    for (let i = 0; i < 5; i++) {
      await client.callTool({
        name: 'listFiles',
        parameters: { path: '.' },
      });
    }

    // Measured calls
    for (let i = 0; i < 20; i++) {
      const startTime = Date.now();

      await client.callTool({
        name: 'listFiles',
        parameters: { path: '.' },
      });

      responseTimes.push(Date.now() - startTime);
    }

    // Calculate statistics
    const average =
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const max = Math.max(...responseTimes);
    const min = Math.min(...responseTimes);
    const variance =
      responseTimes.reduce(
        (sum, time) => sum + Math.pow(time - average, 2),
        0
      ) / responseTimes.length;
    const stdDev = Math.sqrt(variance);

    // Log performance metrics
    console.log('Response Time Statistics (ms):');
    console.log('  Average:', average.toFixed(2));
    console.log('  Min:', min);
    console.log('  Max:', max);
    console.log('  StdDev:', stdDev.toFixed(2));
    console.log('  Coefficient of Variation:', (stdDev / average).toFixed(2));

    // Verify stable response times
    // A coefficient of variation below 0.3 indicates relatively stable performance
    expect(stdDev / average).toBeLessThan(0.3);
  });
});
