import { describe, it, expect } from 'vitest';
import { GrokFormatter } from './grok-formatter';
import { ConversationMessage } from '../../types';
import { generateToolId } from '../../utils';

describe('GrokFormatter', () => {
  const formatter = new GrokFormatter();

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

    expect(formatted).toHaveLength(3);
    expect(formatted[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(formatted[1]).toEqual({
      role: 'user',
      content: 'Hello, how are you?',
    });
    expect(formatted[2]).toEqual({
      role: 'assistant',
      content: 'I am doing well, thank you for asking!',
    });
  });

  it('should format tool use and result as function calls', () => {
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
    ];

    const formatted = formatter.formatMessages(messages);

    expect(formatted).toHaveLength(3);

    // Check user message
    expect(formatted[0]).toEqual({
      role: 'user',
      content: 'What files are in my current directory?',
    });

    // Check tool use message (as assistant message with function call)
    expect(formatted[1]).toEqual({
      role: 'assistant',
      content: `Please call list_files with ${JSON.stringify({ path: './' })}`,
    });

    // Check tool result message (as user message with result)
    expect(formatted[2]).toEqual({
      role: 'user',
      content: '{"files": ["file1.txt", "file2.txt"]}',
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

    expect(formatted).toHaveLength(5);

    // First tool call
    expect(formatted[1].role).toBe('assistant');
    expect(formatted[1].content).toContain('list_files');

    // First tool result
    expect(formatted[2].role).toBe('user');
    expect(formatted[2].content).toBe('{"files": ["file1.txt", "file2.txt"]}');

    // Second tool call
    expect(formatted[3].role).toBe('assistant');
    expect(formatted[3].content).toContain('get_weather');

    // Second tool result
    expect(formatted[4].role).toBe('user');
    expect(formatted[4].content).toBe(
      '{"temperature": 72, "condition": "sunny"}'
    );
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
      content: `Please call search with ${JSON.stringify({
        query: 'test query',
      })}`,
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
      content: '{"results": ["result1", "result2"]}',
    });
  });
});
