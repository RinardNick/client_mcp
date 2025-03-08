import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderAdapter, ProviderMessageFormatter } from './provider-adapter';
import { ConversationMessage } from '../../types';

// Mock formatter implementation for testing
class MockFormatter implements ProviderMessageFormatter {
  formatMessages(messages: ConversationMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      mockFormatted: true,
    }));
  }

  formatToolCallMessage(message: ConversationMessage): any {
    return {
      role: 'assistant',
      content: message.content,
      mockToolCall: true,
      toolName: message.toolName,
    };
  }

  formatToolResultMessage(message: ConversationMessage): any {
    return {
      role: 'function',
      content: message.content,
      mockToolResult: true,
      toolId: message.toolId,
    };
  }
}

describe('ProviderAdapter', () => {
  let adapter: ProviderAdapter;

  beforeEach(() => {
    adapter = new ProviderAdapter();
  });

  it('should register and retrieve formatters', () => {
    const mockFormatter = new MockFormatter();
    adapter.registerFormatter('mockProvider', mockFormatter);

    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      },
    ];

    const formatted = adapter.formatMessagesForProvider(
      messages,
      'mockProvider'
    );

    expect(formatted).toHaveLength(1);
    expect(formatted[0].mockFormatted).toBe(true);
  });

  it('should throw error for unknown provider', () => {
    const messages: ConversationMessage[] = [
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      },
    ];

    expect(() => {
      adapter.formatMessagesForProvider(messages, 'unknownProvider');
    }).toThrow('No message formatter found for provider: unknownProvider');
  });

  it('should register default formatters', () => {
    // This test will fail until we implement the default formatters
    expect(adapter['formatters']).toHaveProperty('anthropic');
    expect(adapter['formatters']).toHaveProperty('openai');
    expect(adapter['formatters']).toHaveProperty('grok');
  });
});
