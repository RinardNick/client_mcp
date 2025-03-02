/**
 * Mock Terminal MCP Server for Testing
 *
 * This script mocks a terminal MCP server for testing purposes.
 * It implements basic terminal command execution via child_process.
 */

import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Signal that the server is ready
console.error('Server mock-terminal-server is running on stdio');

// Keep the process alive
setInterval(() => {}, 1000);

// List of allowed commands for security
const ALLOWED_COMMANDS = ['ls', 'pwd', 'echo', 'cat'];

// Handle JSONRPC messages from stdin
process.stdin.on('data', data => {
  try {
    const message = JSON.parse(data.toString());

    // Handle JSON-RPC request
    if (message.method === 'listTools') {
      // Return terminal tools
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'executeCommand',
              description: 'Execute a terminal command',
              parameters: {
                type: 'object',
                properties: {
                  command: {
                    type: 'string',
                    description: 'The command to execute',
                  },
                },
                required: ['command'],
              },
            },
          ],
        },
      };

      process.stdout.write(JSON.stringify(response) + '\n');
    }
    // Handle listResources method
    else if (message.method === 'listResources') {
      // Return empty resources list
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          resources: [],
        },
      };

      process.stdout.write(JSON.stringify(response) + '\n');
    }
    // Handle tool invocation
    else if (message.method === 'invokeTool') {
      const toolName = message.params.name;
      const parameters = message.params.parameters;

      if (toolName === 'executeCommand') {
        const command = parameters.command;

        // Check if command is allowed
        const commandBase = command.split(' ')[0];
        if (!ALLOWED_COMMANDS.includes(commandBase)) {
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: 'Command not allowed',
            },
          };
          process.stdout.write(JSON.stringify(response) + '\n');
          return;
        }

        // Execute command
        exec(command, (error, stdout, stderr) => {
          const result = {
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error ? error.code : 0,
          };

          // Send response
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            result,
          };

          process.stdout.write(JSON.stringify(response) + '\n');
        });
      } else {
        // Unknown tool
        const response = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: 'Tool not found',
          },
        };

        process.stdout.write(JSON.stringify(response) + '\n');
      }
    }
    // Unknown method
    else {
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      };

      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (error) {
    // Error parsing message
    const response = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    };

    process.stdout.write(JSON.stringify(response) + '\n');
  }
});
