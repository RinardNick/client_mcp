import { describe, it, expect } from 'vitest';
import { ConversationMessage } from './types';
import {
  generateToolId,
  createToolUseMessage,
  createToolResultMessage,
} from './utils';

describe('ConversationMessage', () => {
  it('should support basic message properties', () => {
    const message: ConversationMessage = {
      role: 'user',
      content: 'Hello, world!',
      timestamp: new Date(),
    };

    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello, world!');
    expect(message.timestamp).toBeInstanceOf(Date);
  });

  it('should support tool call properties', () => {
    const toolId = 'tool_12345';
    const message: ConversationMessage = {
      role: 'assistant',
      content: 'I will help you with that.',
      timestamp: new Date(),
      hasTool: true,
      toolId,
      toolName: 'search',
      toolParameters: { query: 'test' },
    };

    expect(message.hasTool).toBe(true);
    expect(message.toolId).toBe(toolId);
    expect(message.toolName).toBe('search');
    expect(message.toolParameters).toEqual({ query: 'test' });
  });

  it('should support tool result properties', () => {
    const toolId = 'tool_12345';
    const message: ConversationMessage = {
      role: 'tool',
      content: '{"results": ["item1", "item2"]}',
      timestamp: new Date(),
      isToolResult: true,
      toolId,
    };

    expect(message.isToolResult).toBe(true);
    expect(message.toolId).toBe(toolId);
  });
});

describe('Tool Message Utilities', () => {
  it('generateToolId should create unique IDs', () => {
    const id1 = generateToolId();
    const id2 = generateToolId();

    expect(id1).toMatch(/^tool_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^tool_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it('createToolUseMessage should create properly formatted tool use message', () => {
    const message = createToolUseMessage('Using a tool', 'search', {
      query: 'test query',
    });

    expect(message.role).toBe('assistant');
    expect(message.content).toBe('Using a tool');
    expect(message.hasTool).toBe(true);
    expect(message.toolName).toBe('search');
    expect(message.toolParameters).toEqual({ query: 'test query' });
    expect(message.toolId).toMatch(/^tool_\d+_[a-z0-9]+$/);
  });

  it('createToolResultMessage should create properly formatted tool result message', () => {
    const toolId = 'tool_12345';
    const message = createToolResultMessage(
      '{"results": ["result1", "result2"]}',
      toolId
    );

    expect(message.role).toBe('tool');
    expect(message.content).toBe('{"results": ["result1", "result2"]}');
    expect(message.isToolResult).toBe(true);
    expect(message.toolId).toBe(toolId);
  });
});
