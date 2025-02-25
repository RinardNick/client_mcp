import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerLauncher } from '../../src/server/launcher';
import { ServerDiscovery } from '../../src/server/discovery';
import { ServerConfig } from '../../src/config/types';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Define interfaces for terminal tool responses
interface ExecuteCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

describe('Terminal Server Integration', () => {
  let serverLauncher: ServerLauncher;
  let serverDiscovery: ServerDiscovery;
  let serverConfig: ServerConfig;

  // Set up before tests
  beforeEach(async () => {
    // Initialize server components
    serverLauncher = new ServerLauncher();
    serverDiscovery = new ServerDiscovery();

    // Configure terminal server with restricted commands for security
    serverConfig = {
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-terminal',
        '--allowed-commands',
        // Only allow safe commands
        'ls,pwd,echo,cat',
      ],
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
  });

  it('should successfully launch terminal server', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Verify the server is running
    expect(serverProcess).toBeDefined();
    expect(serverProcess.killed).toBe(false);
  });

  it('should discover terminal server tools', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Discover server capabilities
    const { client, capabilities } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );
    expect(client).toBeDefined();
    expect(capabilities).toBeDefined();

    // List tools
    const tools = await client.listTools({});

    // Verify expected terminal tools are present
    expect(tools.tools).toContainEqual(
      expect.objectContaining({
        name: 'executeCommand',
        description: expect.any(String),
      })
    );
  });

  it('should execute a simple command', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    // Call the executeCommand tool
    const result = await client.callTool({
      name: 'executeCommand',
      parameters: { command: 'echo "Hello, world!"' },
    });

    // Verify the command output
    const execResult = result.result as ExecuteCommandResult;
    expect(execResult).toHaveProperty('stdout');
    expect(execResult.stdout.trim()).toBe('Hello, world!');
    expect(execResult.exitCode).toBe(0);
  });

  it('should handle command errors properly', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    // Call the executeCommand tool with a command that will fail
    const result = await client.callTool({
      name: 'executeCommand',
      parameters: { command: 'ls /nonexistent_directory' },
    });

    // Verify error handling
    const execResult = result.result as ExecuteCommandResult;
    expect(execResult.exitCode).not.toBe(0);
    expect(execResult.stderr).toContain('No such file or directory');
  });

  it('should reject disallowed commands', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    // Try to execute a disallowed command
    try {
      await client.callTool({
        name: 'executeCommand',
        parameters: { command: 'rm -rf /' }, // Dangerous command not in allowlist
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Verify command was rejected
      expect(error).toBeDefined();
      expect(error.message).toContain('Command not allowed');
    }
  });

  it('should execute multi-line command output', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Discover server capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    // Call a command with multi-line output
    const result = await client.callTool({
      name: 'executeCommand',
      parameters: { command: 'ls -la' },
    });

    // Verify multi-line output handling
    const execResult = result.result as ExecuteCommandResult;
    expect(execResult.stdout).toContain('\n'); // Should have multiple lines
    expect(execResult.exitCode).toBe(0);
  });
});
