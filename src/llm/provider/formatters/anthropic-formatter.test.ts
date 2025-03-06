import { describe, it, expect } from 'vitest';
import { AnthropicFormatter } from './anthropic-formatter';
import { ConversationMessage } from '../../types';
import { generateToolId } from '../../utils';

describe('AnthropicFormatter', () => {
  const formatter = new AnthropicFormatter();

  it('should format basic messages correctly', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'Hello, how are you?',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: 'I am doing well, thank you for asking!',
        timestamp: new Date(),
      },
    ];

    const formatted = formatter.formatMessages(messages);

    // Expect object with messages and system properties
    expect(formatted).toHaveProperty('messages');
    expect(formatted).toHaveProperty('system');

    // Check system message
    expect(formatted.system).toBe('You are a helpful assistant.');

    // Check regular messages
    expect(formatted.messages).toHaveLength(2);
    expect(formatted.messages[0]).toEqual({
      role: 'user',
      content: 'Hello, how are you?',
    });
    expect(formatted.messages[1]).toEqual({
      role: 'assistant',
      content: 'I am doing well, thank you for asking!',
    });
  });

  it('should correctly format tool use and tool result pairs', () => {
    const toolId = generateToolId();
    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: 'What files are in my current directory?',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: "I'll help you list the files.",
        timestamp: new Date(),
        hasTool: true,
        toolId,
        toolName: 'list_files',
        toolParameters: { path: './' },
      },
      {
        role: 'tool',
        content: '{"files": ["file1.txt", "file2.txt"]}',
        timestamp: new Date(),
        isToolResult: true,
        toolId,
      },
      {
        role: 'assistant',
        content: 'I found 2 files: file1.txt and file2.txt',
        timestamp: new Date(),
      },
    ];

    const formatted = formatter.formatMessages(messages);

    // Expect object with messages property
    expect(formatted).toHaveProperty('messages');

    // Check messages
    expect(formatted.messages).toHaveLength(4); // User, tool use + result, assistant response

    // Check user message
    expect(formatted.messages[0]).toEqual({
      role: 'user',
      content: 'What files are in my current directory?',
    });

    // Check tool use message
    expect(formatted.messages[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: "I'll help you list the files.",
        },
        {
          type: 'tool_use',
          id: toolId,
          name: 'list_files',
          input: { path: './' },
        },
      ],
    });

    // Check tool result
    expect(formatted.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolId,
          content: '{"files": ["file1.txt", "file2.txt"]}',
        },
      ],
    });

    // Check final assistant response
    expect(formatted.messages[3]).toEqual({
      role: 'assistant',
      content: 'I found 2 files: file1.txt and file2.txt',
    });
  });

  it('should handle multiple tool calls in sequence', () => {
    const toolId1 = 'tool_123';
    const toolId2 = 'tool_456';

    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: 'List files and then tell me the weather',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: "I'll list the files first.",
        timestamp: new Date(),
        hasTool: true,
        toolId: toolId1,
        toolName: 'list_files',
        toolParameters: { path: './' },
      },
      {
        role: 'tool',
        content: '{"files": ["file1.txt", "file2.txt"]}',
        timestamp: new Date(),
        isToolResult: true,
        toolId: toolId1,
      },
      {
        role: 'assistant',
        content: "Now I'll check the weather.",
        timestamp: new Date(),
        hasTool: true,
        toolId: toolId2,
        toolName: 'get_weather',
        toolParameters: { location: 'New York' },
      },
      {
        role: 'tool',
        content: '{"temperature": 72, "condition": "sunny"}',
        timestamp: new Date(),
        isToolResult: true,
        toolId: toolId2,
      },
    ];

    const formatted = formatter.formatMessages(messages);

    // Expect object with messages property
    expect(formatted).toHaveProperty('messages');
    expect(formatted.messages).toHaveLength(5);

    // First tool call pair
    expect(formatted.messages[1].content[1].id).toBe(toolId1);
    expect(formatted.messages[1].content[1].name).toBe('list_files');
    expect(formatted.messages[2].content[0].tool_use_id).toBe(toolId1);

    // Second tool call pair
    expect(formatted.messages[3].content[1].id).toBe(toolId2);
    expect(formatted.messages[3].content[1].name).toBe('get_weather');
    expect(formatted.messages[4].content[0].tool_use_id).toBe(toolId2);
  });

  it('should format individual tool call message correctly', () => {
    const toolId = 'tool_789';
    const message: ConversationMessage = {
      role: 'assistant',
      content: "I'll help you with that.",
      timestamp: new Date(),
      hasTool: true,
      toolId,
      toolName: 'search',
      toolParameters: { query: 'test query' },
    };

    const formatted = formatter.formatToolCallMessage(message);

    expect(formatted).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: "I'll help you with that.",
        },
        {
          type: 'tool_use',
          id: toolId,
          name: 'search',
          input: { query: 'test query' },
        },
      ],
    });
  });

  it('should format individual tool result message correctly', () => {
    const toolId = 'tool_789';
    const message: ConversationMessage = {
      role: 'tool',
      content: '{"results": ["result1", "result2"]}',
      timestamp: new Date(),
      isToolResult: true,
      toolId,
    };

    const formatted = formatter.formatToolResultMessage(message);

    expect(formatted).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolId,
          content: '{"results": ["result1", "result2"]}',
        },
      ],
    });
  });
});
