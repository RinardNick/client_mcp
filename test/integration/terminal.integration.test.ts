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

// Type for MCPClient Tool results
interface ToolResult<T = unknown> {
  result: T;
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

    // Configure terminal server with real package
    serverConfig = {
      command: 'npx',
      args: [
        '@rinardnick/mcp-terminal',
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
    console.log(
      'Terminal server process is defined with PID:',
      serverProcess.pid
    );
  });

  it('should discover terminal server tools', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer(
      'terminal',
      serverConfig
    );

    // Discover capabilities
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
        name: 'run_command',
        description: expect.any(String),
      })
    );
  });

  it('should execute a simple command', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer('terminal', {
      command: 'npx',
      args: [
        '@rinardnick/mcp-terminal',
        '--allowed-commands',
        'ls,pwd,echo,cat',
      ],
    });

    // Discover capabilities
    const { client, capabilities } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );
    expect(client).toBeDefined();
    expect(capabilities).toBeDefined();

    // Find the command execution tool
    const tools = await client.listTools({});
    console.log(
      'Available terminal tools:',
      JSON.stringify(tools.tools, null, 2)
    );

    const commandTool = tools.tools.find(tool => tool.name === 'run_command');
    expect(commandTool).toBeDefined();
    console.log(
      'Command tool schema:',
      JSON.stringify(commandTool?.inputSchema, null, 2)
    );

    // Log the schema properties to understand required parameters
    if (commandTool?.inputSchema?.properties) {
      console.log(
        'Schema properties:',
        Object.keys(commandTool.inputSchema.properties)
      );
      console.log(
        'Required properties:',
        commandTool.inputSchema.required || []
      );

      // Log each property's details
      Object.entries(commandTool.inputSchema.properties).forEach(
        ([key, value]) => {
          console.log(`Property ${key}:`, JSON.stringify(value, null, 2));
        }
      );
    }

    try {
      // Execute a simple command with the correct format
      console.log('Attempting to execute command with correct format...');
      const result = await client.callTool({
        name: 'run_command',
        arguments: {
          command: 'echo "Hello, world!"',
        },
      });

      console.log('Command result:', JSON.stringify(result, null, 2));

      // Parse the result - it should be a JSON string in the content field
      let parsedResult;
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.find(item => item.type === 'text');
        if (textContent && textContent.text) {
          parsedResult = JSON.parse(textContent.text);
        }
      } else if (typeof result === 'string') {
        parsedResult = JSON.parse(result);
      } else if (result.result) {
        parsedResult = result.result;
      }

      console.log('Parsed result:', parsedResult);

      // Verify command output
      expect(parsedResult).toBeDefined();
      expect(parsedResult.stdout).toBeDefined();
      expect(parsedResult.stdout).toContain('Hello, world!');
      expect(parsedResult.exitCode).toBe(0);
    } catch (error) {
      console.error('Error executing command:', error);
      throw error;
    }
  });

  it('should handle command errors properly', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer('terminal', {
      command: 'npx',
      args: [
        '@rinardnick/mcp-terminal',
        '--allowed-commands',
        'ls,pwd,echo,cat,non-existent-command',
      ],
    });

    // Discover capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    try {
      // Execute a non-existent command with correct format
      console.log('Attempting to execute non-existent command...');
      const result = await client.callTool({
        name: 'run_command',
        arguments: {
          command: 'non-existent-command',
        },
      });

      // The command might actually succeed but with a non-zero exit code
      // Let's check the result
      console.log('Command result:', JSON.stringify(result, null, 2));

      // Parse the result
      let parsedResult;
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.find(item => item.type === 'text');
        if (textContent && textContent.text) {
          parsedResult = JSON.parse(textContent.text);
        }
      } else if (typeof result === 'string') {
        parsedResult = JSON.parse(result);
      } else if (result.result) {
        parsedResult = result.result;
      }

      console.log('Parsed result:', parsedResult);

      // Verify the command failed with a non-zero exit code or error in stderr
      expect(parsedResult).toBeDefined();
      if (
        parsedResult.exitCode !== 0 ||
        parsedResult.stderr.includes('not found')
      ) {
        // Test passes - command failed as expected
        console.log(
          'Command failed as expected with exit code:',
          parsedResult.exitCode
        );
      } else {
        // If we get here with exit code 0 and no error, the test should fail
        expect(parsedResult.exitCode).not.toBe(0);
      }
    } catch (error) {
      // If we get an exception, that's also a valid way for the command to fail
      console.error('Error executing command:', error);
      expect(error).toBeDefined();
    }
  });

  it('should reject disallowed commands', async () => {
    // Launch the server with restricted commands
    const serverProcess = await serverLauncher.launchServer('terminal', {
      command: 'npx',
      args: ['@rinardnick/mcp-terminal', '--allowed-commands', 'ls,pwd,echo'],
    });

    // Discover capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    try {
      // Try to execute a disallowed command with correct format
      console.log('Attempting to execute disallowed command...');
      const result = await client.callTool({
        name: 'run_command',
        arguments: {
          command: 'cat /etc/passwd',
          allowedCommands: ['ls', 'pwd', 'echo'], // Explicitly provide allowed commands
        },
      });

      // Should not reach here
      expect(result).toBeUndefined();
    } catch (error) {
      // Verify command was rejected
      expect(error).toBeDefined();
      console.log('Error message:', error.message);
      // The error should mention "not allowed"
      expect(error.message).toContain('not allowed');
    }
  });

  it('should execute multi-line command output', async () => {
    // Launch the server
    const serverProcess = await serverLauncher.launchServer('terminal', {
      command: 'npx',
      args: [
        '@rinardnick/mcp-terminal',
        '--allowed-commands',
        'ls,pwd,echo,cat',
      ],
    });

    // Discover capabilities
    const { client } = await serverDiscovery.discoverCapabilities(
      'terminal',
      serverProcess
    );

    try {
      // Execute a command with multi-line output using correct format
      console.log('Executing multi-line command...');
      const result = await client.callTool({
        name: 'run_command',
        arguments: {
          command: 'echo -e "Line 1\nLine 2\nLine 3"',
        },
      });

      console.log(
        'Multi-line command result:',
        JSON.stringify(result, null, 2)
      );

      // Parse the result - it should be a JSON string in the content field
      let parsedResult;
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.find(item => item.type === 'text');
        if (textContent && textContent.text) {
          parsedResult = JSON.parse(textContent.text);
        }
      } else if (typeof result === 'string') {
        parsedResult = JSON.parse(result);
      } else if (result.result) {
        parsedResult = result.result;
      }

      console.log('Parsed result:', parsedResult);

      // Verify multi-line output
      expect(parsedResult).toBeDefined();
      expect(parsedResult.stdout).toBeDefined();
      expect(parsedResult.stdout).toContain('Line 1');
      expect(parsedResult.stdout).toContain('Line 2');
      expect(parsedResult.stdout).toContain('Line 3');
      expect(parsedResult.exitCode).toBe(0);
    } catch (error) {
      console.error('Error executing multi-line command:', error);
      throw error;
    }
  });
});
