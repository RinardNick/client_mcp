import { describe, it, expect } from 'vitest';
import { OpenAIFormatter } from './openai-formatter';
import { ConversationMessage } from '../../types';
import { generateToolId } from '../../utils';

describe('OpenAIFormatter', () => {
  const formatter = new OpenAIFormatter();

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

  it('should correctly format tool use messages', () => {
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
    ];

    const formatted = formatter.formatMessages(messages);

    expect(formatted).toHaveLength(2);

    // Check user message
    expect(formatted[0]).toEqual({
      role: 'user',
      content: 'What files are in my current directory?',
    });

    // Check tool use message
    expect(formatted[1]).toEqual({
      role: 'assistant',
      content: "I'll help you list the files.",
      tool_calls: [
        {
          id: toolId,
          type: 'function',
          function: {
            name: 'list_files',
            arguments: JSON.stringify({ path: './' }),
          },
        },
      ],
    });
  });

  it('should correctly format tool result messages', () => {
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

    // Check tool result message
    expect(formatted[2]).toEqual({
      role: 'tool',
      content: '{"files": ["file1.txt", "file2.txt"]}',
      tool_call_id: toolId,
    });
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
      content: "I'll help you with that.",
      tool_calls: [
        {
          id: toolId,
          type: 'function',
          function: {
            name: 'search',
            arguments: JSON.stringify({ query: 'test query' }),
          },
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
      role: 'tool',
      content: '{"results": ["result1", "result2"]}',
      tool_call_id: toolId,
    });
  });
});
