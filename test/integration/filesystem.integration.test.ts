import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerLauncher } from '../../src/server/launcher';
import { ServerDiscovery } from '../../src/server/discovery';
import { ServerConfig } from '../../src/config/types';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Create a real test workspace for integration tests
const TEST_WORKSPACE = path.join(
  process.cwd(),
  'test/fixtures/integration-workspace'
);

// Define interface for file tool responses
interface ReadFileResult {
  content: string;
}

interface ListFilesResult {
  files: string[];
}

describe('Filesystem Server Integration', () => {
  let serverLauncher: ServerLauncher;
  let serverDiscovery: ServerDiscovery;
  let serverConfig: ServerConfig;

  // Create test workspace directory and files before tests
  beforeEach(async () => {
    // Create test directory if it doesn't exist
    if (!existsSync(TEST_WORKSPACE)) {
      await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    }

    // Create a test file for reading tests
    await fs.writeFile(
      path.join(TEST_WORKSPACE, 'test-file.txt'),
      'This is a test file content'
    );

    // Initialize server components
    serverLauncher = new ServerLauncher();
    serverDiscovery = new ServerDiscovery();

    // Configure filesystem server
    serverConfig = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', TEST_WORKSPACE],
      env: { NODE_ENV: 'test' },
    };
  });

  // Clean up test files after tests
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

  it('should successfully launch filesystem server', async () => {
    // Launch the server
    await serverLauncher.launchServer('filesystem', serverConfig);

    // Verify the server is running
    const process = serverLauncher.getServerProcess('filesystem');
    expect(process).toBeDefined();
    expect(process?.killed).toBe(false);
  });

  it('should discover filesystem server tools', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'filesystem',
      serverConfig
    );

    // Discover server capabilities
    const { client, capabilities } = await serverDiscovery.discoverCapabilities(
      'filesystem',
      serverProcess
    );
    expect(client).toBeDefined();
    expect(capabilities).toBeDefined();

    // List tools
    const tools = await client.listTools({});

    // Verify expected filesystem tools are present
    // Filesystem server should have tools like listFiles, readFile, etc.
    expect(tools.tools).toContainEqual(
      expect.objectContaining({
        name: 'listFiles',
        description: expect.any(String),
      })
    );

    expect(tools.tools).toContainEqual(
      expect.objectContaining({
        name: 'readFile',
        description: expect.any(String),
      })
    );
  });

  it('should execute readFile tool', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'filesystem',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'filesystem',
      serverProcess
    );

    // Call the readFile tool
    const result = await client.callTool({
      name: 'readFile',
      parameters: { path: 'test-file.txt' },
    });

    // Verify the file content
    const readResult = result.result as ReadFileResult;
    expect(readResult).toHaveProperty('content');
    expect(readResult.content).toBe('This is a test file content');
  });

  it('should execute listFiles tool', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'filesystem',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'filesystem',
      serverProcess
    );

    // Call the listFiles tool
    const result = await client.callTool({
      name: 'listFiles',
      parameters: { path: '.' },
    });

    // Verify we get a list of files
    const listResult = result.result as ListFilesResult;
    expect(listResult).toHaveProperty('files');
    expect(Array.isArray(listResult.files)).toBe(true);
    expect(listResult.files).toContain('test-file.txt');
  });

  // Additional test for error handling
  it('should handle errors when reading a non-existent file', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'filesystem',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'filesystem',
      serverProcess
    );

    // Call the readFile tool with a non-existent file
    try {
      await client.callTool({
        name: 'readFile',
        parameters: { path: 'non-existent-file.txt' },
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Verify error handling
      expect(error).toBeDefined();
      expect(error.message).toContain('ENOENT');
    }
  });
});
