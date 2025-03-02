/**
 * Mock Filesystem MCP Server for Testing
 *
 * This script mocks a filesystem MCP server for testing purposes.
 * It implements basic file operations using fs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get workspace directory from args or use current directory
const WORKSPACE_DIR = process.argv[2] || process.cwd();

// Signal that the server is ready
console.error(`Server mock-filesystem-server is running on stdio`);
console.error(`Allowed directories: ${WORKSPACE_DIR}`);

// Keep the process alive
setInterval(() => {}, 1000);

// Handle JSONRPC messages from stdin
process.stdin.on('data', data => {
  try {
    const message = JSON.parse(data.toString());

    // Handle JSON-RPC request
    if (message.method === 'listTools') {
      // Return filesystem tools
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'listFiles',
              description: 'List files in a directory',
              parameters: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'The directory path to list',
                  },
                },
                required: ['path'],
              },
            },
            {
              name: 'readFile',
              description: 'Read a file',
              parameters: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'The file path to read',
                  },
                },
                required: ['path'],
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

      if (toolName === 'listFiles') {
        const dirPath = path.resolve(WORKSPACE_DIR, parameters.path);

        // Security check - ensure path is within workspace
        if (!dirPath.startsWith(WORKSPACE_DIR)) {
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: 'Path is outside allowed directory',
            },
          };
          process.stdout.write(JSON.stringify(response) + '\n');
          return;
        }

        try {
          const files = fs.readdirSync(dirPath);

          const response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              files,
            },
          };

          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (error) {
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: error.message,
            },
          };

          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } else if (toolName === 'readFile') {
        const filePath = path.resolve(WORKSPACE_DIR, parameters.path);

        // Security check - ensure path is within workspace
        if (!filePath.startsWith(WORKSPACE_DIR)) {
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: 'Path is outside allowed directory',
            },
          };
          process.stdout.write(JSON.stringify(response) + '\n');
          return;
        }

        try {
          const content = fs.readFileSync(filePath, 'utf8');

          const response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content,
            },
          };

          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (error) {
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: error.message,
            },
          };

          process.stdout.write(JSON.stringify(response) + '\n');
        }
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
