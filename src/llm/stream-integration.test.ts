/**
 * Stream integration tests for thinking and tool calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session';
import { LLMConfig } from '../config/types';

// Create AsyncIterator for mock streaming
function createAsyncIterator(chunks: any[]) {
  let index = 0;
  
  return {
    next: async () => {
      if (index < chunks.length) {
        return { value: chunks[index++], done: false };
      } else {
        return { value: undefined, done: true };
      }
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: class {
      constructor() {}
      
      messages = {
        create: mockCreate
      }
    }
  };
});

// Mock Server Launcher and Discovery
vi.mock('../server/launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue({}),
    getServerProcess: vi.fn().mockReturnValue({}),
    stopAll: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn()
  }))
}));

vi.mock('../server/discovery', () => ({
  ServerDiscovery: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue({
      client: {
        callTool: vi.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
        close: vi.fn()
      },
      capabilities: {
        tools: [{
          name: 'list_files',
          description: 'List files in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to directory'
              }
            },
            required: ['path']
          }
        }],
        resources: []
      }
    })
  }))
}));

// Mock the global sessions store
vi.mock('./store', () => ({
  globalSessions: new Map()
}));

describe('Stream Integration Tests', () => {
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    mockCreate.mockReset();
    sessionManager = new SessionManager();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  it('should stream thinking content from Claude 3.7+', async () => {
    // Create stream chunks with thinking
    const streamChunks = [
      { type: 'thinking', thinking: 'I need to analyze the file structure...' },
      { type: 'thinking', thinking: 'Looking for files in the directory...' },
      { type: 'content_block_start', content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Here are the ' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'files I found in your directory.' } },
      { type: 'message_delta', usage: { input_tokens: 100, output_tokens: 150 } }
    ];
    
    // Mock the stream response
    mockCreate.mockResolvedValueOnce(createAsyncIterator(streamChunks));
    
    // Create test config
    const config: LLMConfig = {
      type: 'claude',
      api_key: 'test-api-key',
      model: 'claude-3-7-sonnet-20250219', // Claude 3.7 model that supports thinking
      system_prompt: 'You are a helpful assistant with access to tools.',
      thinking: {
        enabled: true,
        budget_tokens: 1000
      },
      servers: {
        test_server: {
          command: 'test',
          args: ['--flag'],
          env: {}
        }
      }
    };
    
    // Initialize session
    const session = await sessionManager.initializeSession(config);
    
    // Create array to collect stream chunks
    const collectedChunks: any[] = [];
    
    // Send message and collect stream chunks
    const stream = sessionManager.sendMessageStream(session.id, 'List files in my directory');
    for await (const chunk of stream) {
      collectedChunks.push(chunk);
    }
    
    // Verify thinking chunks were received
    const thinkingChunks = collectedChunks.filter(chunk => chunk.type === 'thinking');
    expect(thinkingChunks.length).toBe(2);
    expect(thinkingChunks[0].content).toBe('I need to analyze the file structure...');
    
    // Verify content chunks were received
    const contentChunks = collectedChunks.filter(chunk => chunk.type === 'content');
    expect(contentChunks.length).toBe(2);
    expect(contentChunks.map(c => c.content).join('')).toBe('Here are the files I found in your directory.');
    
    // Verify done message is sent
    expect(collectedChunks[collectedChunks.length-1].type).toBe('done');
  });
  
  it('should stream tool call events', async () => {
    // Create stream chunks with tool calls
    const streamChunks = [
      { type: 'content_block_start', content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Let me check ' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'what files are in your directory.' } },
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_1', name: 'list_files', input: { path: '/home/user' } } },
      { type: 'content_block_delta', delta: { type: 'tool_use_delta', id: 'tool_1', input: { path: '/home/user' } } },
      { type: 'message_delta', usage: { input_tokens: 100, output_tokens: 150 } }
    ];
    
    // Mock the stream response
    mockCreate.mockResolvedValueOnce(createAsyncIterator(streamChunks));
    
    // Create test config
    const config: LLMConfig = {
      type: 'claude',
      api_key: 'test-api-key',
      model: 'claude-3-5-sonnet-20250219',
      system_prompt: 'You are a helpful assistant with access to tools.',
      servers: {
        test_server: {
          command: 'test',
          args: ['--flag'],
          env: {}
        }
      }
    };
    
    // Initialize session
    const session = await sessionManager.initializeSession(config);
    
    // Create array to collect stream chunks
    const collectedChunks: any[] = [];
    
    // Send message and collect stream chunks
    const stream = sessionManager.sendMessageStream(session.id, 'List files in my directory');
    for await (const chunk of stream) {
      collectedChunks.push(chunk);
    }
    
    // Verify content chunks were received
    const contentChunks = collectedChunks.filter(chunk => chunk.type === 'content');
    expect(contentChunks.length).toBe(2);
    
    // Verify tool start event was received
    const toolChunks = collectedChunks.filter(chunk => chunk.type === 'tool_start');
    expect(toolChunks.length).toBe(1);
    expect(toolChunks[0].content).toContain('list_files');
    
    // Verify done message is sent
    expect(collectedChunks[collectedChunks.length-1].type).toBe('done');
  });
});