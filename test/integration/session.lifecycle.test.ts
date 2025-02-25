import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/llm/session';
import { ServerLauncher } from '../../src/server/launcher';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// IMPORTANT NOTE: There's a version mismatch between the SDK packages:
// - The main project is using @modelcontextprotocol/sdk@1.6.0
// - The filesystem server is using @modelcontextprotocol/sdk@0.5.0
// This may cause compatibility issues, but we'll try to work with the real servers.

// Mock Anthropic (we keep this mock to avoid incurring costs)
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockImplementation(({ messages, tools }) => {
    const lastMessage = messages[messages.length - 1].content;

    // Handle tool result follow-up
    if (lastMessage.includes('"content":"Hello, world!"')) {
      return {
        content: [
          {
            type: 'text',
            text: 'I have read the file and can see that it contains "Hello, world!"',
          },
        ],
        role: 'assistant',
      };
    }

    if (lastMessage.includes('"files":["hello.txt"]')) {
      return {
        content: [
          {
            type: 'text',
            text: 'I can see that there is a file named hello.txt in the directory.',
          },
        ],
        role: 'assistant',
      };
    }

    if (lastMessage.includes('"stdout":"Testing\\n"')) {
      return {
        content: [
          {
            type: 'text',
            text: 'The command has been executed and output "Testing".',
          },
        ],
        role: 'assistant',
      };
    }

    // Handle file reading request
    if (lastMessage.includes('hello.txt')) {
      return {
        content: [
          {
            type: 'text',
            text: 'Let me read that file for you. <tool>readFile {"path": "hello.txt"}</tool>',
          },
        ],
        role: 'assistant',
      };
    }

    // Handle file listing request
    if (lastMessage.includes('list files')) {
      return {
        content: [
          {
            type: 'text',
            text: 'I will list the files for you. <tool>listFiles {"path": "."}</tool>',
          },
        ],
        role: 'assistant',
      };
    }

    // Handle echo command
    if (lastMessage.includes('echo')) {
      return {
        content: [
          {
            type: 'text',
            text: 'I will echo that for you. <tool>executeCommand {"command": "echo Testing"}</tool>',
          },
        ],
        role: 'assistant',
      };
    }

    // Handle conversation context
    if (lastMessage.includes("What's the weather")) {
      return {
        content: [
          {
            type: 'text',
            text: 'I remember you introduced yourself earlier. However, I cannot tell you the weather as I do not have access to real-time weather data.',
          },
        ],
        role: 'assistant',
      };
    }

    // Default response
    return {
      content: [
        {
          type: 'text',
          text: 'Nice to meet you! How can I help you today?',
        },
      ],
      role: 'assistant',
    };
  });

  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Create a real test workspace for integration tests
const TEST_WORKSPACE = path.join(
  process.cwd(),
  'test/fixtures/session-workspace'
);

describe('Session Lifecycle Tests', () => {
  let sessionManager: SessionManager;

  // Set up test environment
  beforeEach(async () => {
    console.log('Setting up test environment...');

    // Create test workspace directory
    if (!existsSync(TEST_WORKSPACE)) {
      await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    }

    // Create test files
    await fs.writeFile(path.join(TEST_WORKSPACE, 'hello.txt'), 'Hello, world!');

    // Initialize session manager
    sessionManager = new SessionManager();
  });

  // Clean up after tests
  afterEach(async () => {
    console.log('Cleaning up test environment...');

    // Clean up any active sessions
    await sessionManager.cleanup();

    // Clean up test workspace
    if (existsSync(TEST_WORKSPACE)) {
      await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    }
  });

  it('should handle a complete conversation with tool usage', async () => {
    console.log(
      'Starting test: should handle a complete conversation with tool usage'
    );

    // Initialize session with filesystem server
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
      servers: {
        filesystem: {
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', TEST_WORKSPACE],
          env: {},
        },
      },
    });

    // Verify session was created
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();

    // Send message
    const response = await sessionManager.sendMessage(
      session.id,
      'What is in the hello.txt file?'
    );

    // Verify response includes tool results
    expect(response.content).toContain('Hello, world!');

    // Verify conversation history is updated
    const updatedSession = sessionManager.getSession(session.id);
    expect(updatedSession.messages.length).toBeGreaterThan(2);

    // Verify tools are available
    expect(updatedSession.tools).toContainEqual(
      expect.objectContaining({
        name: 'readFile',
      })
    );

    console.log(
      'Test completed: should handle a complete conversation with tool usage'
    );
  });

  it('should handle multi-server interactions', async () => {
    console.log('Starting test: should handle multi-server interactions');

    // Check if terminal server is available
    let terminalServerAvailable = false;
    try {
      const { execSync } = require('child_process');
      execSync('npx @rinardnick/mcp-terminal --version', { stdio: 'ignore' });
      terminalServerAvailable = true;
    } catch (error) {
      console.warn('Terminal server not available, skipping multi-server test');
      return;
    }

    // Initialize session with both filesystem and terminal servers
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt:
        'You are a helpful assistant with access to files and terminal.',
      servers: {
        filesystem: {
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', TEST_WORKSPACE],
          env: {},
        },
        terminal: {
          command: 'npx',
          args: ['@rinardnick/mcp-terminal'],
          env: {},
        },
      },
    });

    // Increase the tool call limit
    session.maxToolCalls = 5;

    // First message - use filesystem server
    const response1 = await sessionManager.sendMessage(
      session.id,
      'Please list files in the current directory'
    );
    expect(response1.content).toContain(
      'I can see that there is a file named hello.txt'
    );

    // Second message - use terminal server
    const response2 = await sessionManager.sendMessage(
      session.id,
      'Can you echo "Testing" in the terminal?'
    );
    expect(response2.content).toContain(
      'The command has been executed and output "Testing"'
    );

    // Verify conversation history shows both tool usages
    const updatedSession = sessionManager.getSession(session.id);
    expect(updatedSession.messages.length).toBeGreaterThan(4);

    // Verify both tools are available
    expect(updatedSession.tools).toContainEqual(
      expect.objectContaining({
        name: 'listFiles',
      })
    );
    expect(updatedSession.tools).toContainEqual(
      expect.objectContaining({
        name: 'executeCommand',
      })
    );

    console.log('Test completed: should handle multi-server interactions');
  });

  it('should handle server failure recovery', async () => {
    console.log('Starting test: should handle server failure recovery');

    // Check if terminal server is available
    let terminalServerAvailable = false;
    try {
      const { execSync } = require('child_process');
      execSync('npx @rinardnick/mcp-terminal --version', { stdio: 'ignore' });
      terminalServerAvailable = true;
    } catch (error) {
      console.warn(
        'Terminal server not available, skipping server recovery test'
      );
      return;
    }

    // Initialize session with terminal server
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
      servers: {
        terminal: {
          command: 'npx',
          args: ['@rinardnick/mcp-terminal'],
          env: {},
        },
      },
    });

    // Get the initial server tools
    const initialTools = [...session.tools];
    expect(initialTools.length).toBeGreaterThan(0);

    // Find a tool that should be available
    const terminalTool = initialTools.find(
      tool => tool.name === 'executeCommand'
    );
    expect(terminalTool).toBeDefined();

    // Access the private _restartServer method for testing
    // @ts-ignore - accessing private method for testing
    const restartServerMethod = sessionManager._restartServer;
    expect(typeof restartServerMethod).toBe('function');

    // Force restart of server
    // @ts-ignore - accessing private method for testing
    await sessionManager._restartServer(session.id, 'terminal');

    // Verify tools are still available after restart
    const updatedSession = sessionManager.getSession(session.id);
    const terminalToolName = terminalTool?.name || 'executeCommand';

    expect(updatedSession.tools).toContainEqual(
      expect.objectContaining({
        name: terminalToolName,
      })
    );

    console.log('Test completed: should handle server failure recovery');
  });

  it('should maintain conversation context across multiple messages', async () => {
    console.log(
      'Starting test: should maintain conversation context across multiple messages'
    );

    // Initialize session
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
    });

    // First message
    const response1 = await sessionManager.sendMessage(
      session.id,
      'Hello, I am a user.'
    );
    expect(response1.content).toBe(
      'Nice to meet you! How can I help you today?'
    );

    // Second message - should maintain context
    const response2 = await sessionManager.sendMessage(
      session.id,
      "What's the weather like?"
    );
    expect(response2.content).toContain(
      'I remember you introduced yourself earlier'
    );

    // Verify context in session
    const updatedSession = sessionManager.getSession(session.id);
    expect(updatedSession.messages.length).toBe(5); // System prompt + 2 user messages + 2 assistant responses

    console.log(
      'Test completed: should maintain conversation context across multiple messages'
    );
  });
});
