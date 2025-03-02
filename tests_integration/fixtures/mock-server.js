/**
 * Mock MCP Server for Testing
 *
 * This simple script mocks a basic MCP server for testing purposes.
 * It listens on stdio as per the MCP protocol.
 */

import { fileURLToPath } from 'url';
import path from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Signal that the server is ready
console.error('Server mock-server is running on stdio');

// Keep the process alive
setInterval(() => {}, 1000);

// Handle JSONRPC messages from stdin
process.stdin.on('data', data => {
  try {
    const message = JSON.parse(data.toString());

    // Handle JSON-RPC request
    if (message.method === 'listTools') {
      // Return mock tools
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'mockTool',
              description: 'A mock tool for testing',
              parameters: {
                type: 'object',
                properties: {
                  param1: {
                    type: 'string',
                    description: 'A test parameter',
                  },
                },
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

      // Mock response based on tool name
      let result;

      if (toolName === 'mockTool') {
        result = {
          success: true,
          value: parameters.param1 || 'default value',
        };
      } else {
        result = {
          error: 'Unknown tool',
        };
      }

      // Send response
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result,
      };

      process.stdout.write(JSON.stringify(response) + '\n');
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
