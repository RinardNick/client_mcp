import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/llm/session';
import { ServerLauncher } from '../../src/server/launcher';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Mock LLM API
vi.mock('../../src/api/chat', () => ({
  sendMessage: vi.fn(),
  sendMessageStream: vi.fn(),
}));

// Create a real test workspace for integration tests
const TEST_WORKSPACE = path.join(
  process.cwd(),
  'test/fixtures/session-workspace'
);

describe('Session Lifecycle Tests', () => {
  let sessionManager: SessionManager;
  let mockLLM: any;

  // Set up test environment
  beforeEach(async () => {
    // Create test workspace directory
    if (!existsSync(TEST_WORKSPACE)) {
      await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    }

    // Create test files
    await fs.writeFile(path.join(TEST_WORKSPACE, 'hello.txt'), 'Hello, world!');

    // Set up mockLLM
    mockLLM = require('../../src/api/chat');

    // Initialize session manager
    sessionManager = new SessionManager();
  });

  // Clean up after tests
  afterEach(async () => {
    // Clean up any active sessions
    await sessionManager.cleanup();

    // Clean up test workspace
    if (existsSync(TEST_WORKSPACE)) {
      await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    }
  });

  it('should handle a complete conversation with tool usage', async () => {
    // Mock LLM response with tool call
    mockLLM.sendMessage.mockResolvedValueOnce({
      role: 'assistant',
      content:
        'Let me check that file for you.\n<tool>readFile {"path": "hello.txt"}</tool>',
      hasToolCall: true,
      toolCall: {
        name: 'readFile',
        parameters: { path: 'hello.txt' },
      },
    });

    // Mock LLM second response after tool execution
    mockLLM.sendMessage.mockResolvedValueOnce({
      role: 'assistant',
      content: 'The file contains: "Hello, world!"',
      hasToolCall: false,
    });

    // Initialize session with filesystem server
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
      servers: {
        filesystem: {
          command: 'npx',
          args: [
            '-y',
            '@modelcontextprotocol/server-filesystem',
            TEST_WORKSPACE,
          ],
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
    expect(updatedSession.messages.length).toBeGreaterThan(2); // Should have user, assistant, and tool result messages

    // Verify both servers are launched
    expect(updatedSession.servers.filesystem).toBeDefined();
  });

  it('should handle multi-server interactions', async () => {
    // Mock LLM responses
    mockLLM.sendMessage.mockImplementation((sessionId, message, options) => {
      if (message.includes('list files')) {
        return Promise.resolve({
          role: 'assistant',
          content:
            'Let me check what files are available.\n<tool>listFiles {"path": "."}</tool>',
          hasToolCall: true,
          toolCall: {
            name: 'listFiles',
            parameters: { path: '.' },
          },
        });
      } else if (message.includes('echo')) {
        return Promise.resolve({
          role: 'assistant',
          content:
            'Let me run that command for you.\n<tool>executeCommand {"command": "echo \'Testing\'"}</tool>',
          hasToolCall: true,
          toolCall: {
            name: 'executeCommand',
            parameters: { command: "echo 'Testing'" },
          },
        });
      } else {
        return Promise.resolve({
          role: 'assistant',
          content: 'I have completed both operations successfully.',
          hasToolCall: false,
        });
      }
    });

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
          args: [
            '-y',
            '@modelcontextprotocol/server-filesystem',
            TEST_WORKSPACE,
          ],
          env: {},
        },
        terminal: {
          command: 'npx',
          args: [
            '-y',
            '@modelcontextprotocol/server-terminal',
            '--allowed-commands',
            'echo,ls,pwd',
          ],
          env: {},
        },
      },
    });

    // First message - use filesystem server
    const response1 = await sessionManager.sendMessage(
      session.id,
      'Please list files in the current directory'
    );
    expect(response1.content).toContain('listFiles');

    // Second message - use terminal server
    const response2 = await sessionManager.sendMessage(
      session.id,
      'Can you echo "Testing" in the terminal?'
    );
    expect(response2.content).toContain('executeCommand');

    // Verify conversation history shows both tool usages
    const updatedSession = sessionManager.getSession(session.id);
    expect(updatedSession.messages.length).toBeGreaterThan(4); // Should have user and assistant messages for both interactions
  });

  it('should handle server failure recovery', async () => {
    // Mock LLM responses
    mockLLM.sendMessage.mockResolvedValueOnce({
      role: 'assistant',
      content:
        'Let me try to run that command.\n<tool>executeCommand {"command": "echo test"}</tool>',
      hasToolCall: true,
      toolCall: {
        name: 'executeCommand',
        parameters: { command: 'echo test' },
      },
    });

    // Initialize session
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
      servers: {
        terminal: {
          command: 'npx',
          args: [
            '-y',
            '@modelcontextprotocol/server-terminal',
            '--allowed-commands',
            'echo,ls',
          ],
          env: {},
        },
      },
    });

    // Force server failure by stopping it directly
    const serverLauncher = new ServerLauncher();
    vi.spyOn(serverLauncher, 'launchServer');

    // Apply server launcher as a property of sessionManager (this might need adjusting based on actual implementation)
    Object.defineProperty(sessionManager, 'serverLauncher', {
      value: serverLauncher,
      writable: true,
    });

    // Force restart of server
    const sessionId = session.id;
    // @ts-ignore - accessing private method for testing
    await sessionManager._restartServer(sessionId, 'terminal');

    // Verify server was restarted
    expect(serverLauncher.launchServer).toHaveBeenCalledWith(
      'terminal',
      expect.objectContaining({
        command: 'npx',
      })
    );
  });

  it('should maintain conversation context across multiple messages', async () => {
    // Mock LLM responses for a continuing conversation
    mockLLM.sendMessage.mockImplementation((sessionId, message, options) => {
      // Check if context is maintained by looking at message history
      const messageHistory = options.messages || [];
      const userMessages = messageHistory.filter(m => m.role === 'user');

      if (userMessages.length === 1) {
        return Promise.resolve({
          role: 'assistant',
          content: 'Nice to meet you! How can I help you today?',
          hasToolCall: false,
        });
      } else if (userMessages.length === 2) {
        // This message should reference the previous exchange
        return Promise.resolve({
          role: 'assistant',
          content:
            "I remember you introduced yourself already. Now you're asking about the weather.",
          hasToolCall: false,
        });
      }

      return Promise.resolve({
        role: 'assistant',
        content: 'Default response',
        hasToolCall: false,
      });
    });

    // Initialize session
    const session = await sessionManager.initializeSession({
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-test',
      system_prompt: 'You are a helpful assistant.',
    });

    // First message
    await sessionManager.sendMessage(session.id, 'Hello, I am a user.');

    // Second message - should maintain context
    const response = await sessionManager.sendMessage(
      session.id,
      "What's the weather like?"
    );

    // Verify context was maintained
    expect(response.content).toContain('remember you introduced yourself');

    // Verify context in session
    const updatedSession = sessionManager.getSession(session.id);
    expect(updatedSession.messages.length).toBe(4); // 2 user messages + 2 assistant responses
  });
});
