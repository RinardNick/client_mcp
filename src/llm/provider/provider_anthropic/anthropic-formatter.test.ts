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

  it('correctly pairs tool_use and tool_result messages', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'What files are in the /tmp directory?',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: "I'll check the directory for you.",
        timestamp: new Date(),
      },
      {
        // Tool use message
        role: 'assistant',
        content: "I'll use the list_files tool to check.",
        timestamp: new Date(),
        hasTool: true,
        toolId: 'tool_abc123',
        toolName: 'list_files',
        toolParameters: { path: '/tmp' },
      },
      {
        // Tool result message
        role: 'assistant',
        content: '{"files": ["file1.txt", "file2.txt"]}',
        timestamp: new Date(),
        isToolResult: true,
        toolId: 'tool_abc123',
      },
      {
        role: 'assistant',
        content:
          'Based on the results, I can see there are two files: file1.txt and file2.txt',
        timestamp: new Date(),
      },
    ];

    const formatted = formatter.formatMessages(messages);

    // Debug the full structure
    console.log('Formatted messages:', JSON.stringify(formatted, null, 2));

    // Verify system message is extracted
    expect(formatted.system).toBe('You are a helpful assistant.');

    // Verify the messages array length
    // We expect: 1 user + 1 initial assistant + 1 tool use/result pair (2 messages) + 1 final assistant = 5 messages
    expect(formatted.messages).toHaveLength(5);

    // Check for proper tool use formatting
    const toolUseMessage = formatted.messages.find(
      (msg: any) =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_use')
    );

    expect(toolUseMessage).toBeDefined();
    expect(toolUseMessage.content).toHaveLength(2);
    expect(toolUseMessage.content[0].type).toBe('text');
    expect(toolUseMessage.content[1].type).toBe('tool_use');
    expect(toolUseMessage.content[1].id).toBe('tool_abc123');
    expect(toolUseMessage.content[1].name).toBe('list_files');
    expect(toolUseMessage.content[1].input).toEqual({ path: '/tmp' });

    // Check for proper tool result formatting (should follow tool use)
    const toolResultIndex = formatted.messages.findIndex(
      (msg: any) =>
        msg.role === 'user' &&
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_result')
    );

    expect(toolResultIndex).toBeGreaterThan(0);

    const toolResultMessage = formatted.messages[toolResultIndex];
    expect(toolResultMessage.content).toHaveLength(1);
    expect(toolResultMessage.content[0].type).toBe('tool_result');
    expect(toolResultMessage.content[0].tool_use_id).toBe('tool_abc123');
    expect(toolResultMessage.content[0].content).toBe(
      '{"files": ["file1.txt", "file2.txt"]}'
    );

    // Verify the tool_result immediately follows the tool_use
    const toolUseIndex = formatted.messages.findIndex(
      (msg: any) =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_use')
    );

    expect(toolResultIndex).toBe(toolUseIndex + 1);
  });

  it('handles multiple tool use/result pairs correctly', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'What files are in /tmp and /var?',
        timestamp: new Date(),
      },
      // First tool sequence
      {
        role: 'assistant',
        content: "I'll check /tmp first.",
        timestamp: new Date(),
        hasTool: true,
        toolId: 'tool_123',
        toolName: 'list_files',
        toolParameters: { path: '/tmp' },
      },
      {
        role: 'assistant',
        content: '{"files": ["tmp1.txt", "tmp2.txt"]}',
        timestamp: new Date(),
        isToolResult: true,
        toolId: 'tool_123',
      },
      // Second tool sequence
      {
        role: 'assistant',
        content: "Now I'll check /var.",
        timestamp: new Date(),
        hasTool: true,
        toolId: 'tool_456',
        toolName: 'list_files',
        toolParameters: { path: '/var' },
      },
      {
        role: 'assistant',
        content: '{"files": ["var1.log", "var2.log"]}',
        timestamp: new Date(),
        isToolResult: true,
        toolId: 'tool_456',
      },
      {
        role: 'assistant',
        content: 'I found different files in each directory.',
        timestamp: new Date(),
      },
    ];

    const formatted = formatter.formatMessages(messages);

    // Debug the full structure
    console.log(
      'Formatted messages with multiple tools:',
      JSON.stringify(formatted, null, 2)
    );

    // Verify we get the right number of messages
    // We expect: 1 user + 2 tool sequences (2 messages each) + 1 final assistant = 6 messages
    expect(formatted.messages).toHaveLength(6);

    // Count tool_use and tool_result messages
    const toolUseCount = formatted.messages.filter(
      (msg: any) =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_use')
    ).length;

    const toolResultCount = formatted.messages.filter(
      (msg: any) =>
        msg.role === 'user' &&
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_result')
    ).length;

    // Should have equal numbers of tool use and result messages
    expect(toolUseCount).toBe(2);
    expect(toolResultCount).toBe(2);

    // Verify each tool result follows its corresponding tool use
    // First pair
    const firstToolUseIndex = formatted.messages.findIndex(
      (msg: any) =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some(
          (c: any) => c.type === 'tool_use' && c.id === 'tool_123'
        )
    );
    expect(firstToolUseIndex).toBeGreaterThan(0);
    expect(formatted.messages[firstToolUseIndex + 1].role).toBe('user');
    expect(
      formatted.messages[firstToolUseIndex + 1].content.some(
        (c: any) => c.type === 'tool_result' && c.tool_use_id === 'tool_123'
      )
    ).toBe(true);

    // Second pair
    const secondToolUseIndex = formatted.messages.findIndex(
      (msg: any) =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some(
          (c: any) => c.type === 'tool_use' && c.id === 'tool_456'
        )
    );
    expect(secondToolUseIndex).toBeGreaterThan(firstToolUseIndex);
    expect(formatted.messages[secondToolUseIndex + 1].role).toBe('user');
    expect(
      formatted.messages[secondToolUseIndex + 1].content.some(
        (c: any) => c.type === 'tool_result' && c.tool_use_id === 'tool_456'
      )
    ).toBe(true);
  });
});
