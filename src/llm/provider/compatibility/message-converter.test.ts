import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderMessageConverter } from './message-converter';
import { ChatMessage } from '../../types';

// Extended version of ChatMessage with metadata for our tests
interface ExtendedChatMessage extends ChatMessage {
  metadata?: {
    convertedFrom?: string;
    convertedTo?: string;
    conversionTime?: string | Date;
    customConverted?: boolean;
    provider?: string;
    [key: string]: any;
  };
}

// Extended ToolCall type to match our test expectations
interface ExtendedToolCall {
  name: string;
  parameters: Record<string, unknown>;
  function?: {
    name: string;
    arguments: string;
  };
}

describe('ProviderMessageConverter', () => {
  let converter: ProviderMessageConverter;

  beforeEach(() => {
    converter = new ProviderMessageConverter();
  });

  it('should return a copy when source and target providers are the same', () => {
    const message: ChatMessage = {
      role: 'user',
      content: 'Test message',
      timestamp: new Date(),
    };

    const converted = converter.convertMessage(
      message,
      'anthropic',
      'anthropic'
    );

    expect(converted).toEqual(message);
    expect(converted).not.toBe(message); // Should be a new object (copy)
  });

  it('should apply default conversion when no specific handler exists', () => {
    const message: ChatMessage = {
      role: 'user',
      content: 'Test message',
      timestamp: new Date(),
    };

    const converted = converter.convertMessage(
      message,
      'anthropic',
      'openai'
    ) as ExtendedChatMessage;

    expect(converted.role).toBe('user');
    expect(converted.content).toBe('Test message');
    expect(converted.metadata).toBeDefined();
    expect(converted.metadata?.convertedFrom).toBe('anthropic');
    expect(converted.metadata?.convertedTo).toBe('openai');
    expect(converted.metadata?.conversionTime).toBeDefined();
  });

  it('should use registered conversion handlers when available', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: 'Original response',
      timestamp: new Date(),
    };

    // Register a custom conversion handler
    converter.registerConversionHandler(
      'anthropic',
      'openai',
      (msg: ChatMessage): ExtendedChatMessage => ({
        ...msg,
        content: `Converted: ${msg.content}`,
        metadata: {
          customConverted: true,
        },
      })
    );

    const converted = converter.convertMessage(
      message,
      'anthropic',
      'openai'
    ) as ExtendedChatMessage;

    expect(converted.content).toBe('Converted: Original response');
    expect(converted.metadata?.customConverted).toBe(true);
  });

  it('should convert an entire conversation history', () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant',
        timestamp: new Date(),
      },
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      },
      {
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date(),
      },
    ];

    // Register a custom handler to test with
    converter.registerConversionHandler(
      'anthropic',
      'grok',
      (msg: ChatMessage): ExtendedChatMessage => ({
        ...msg,
        metadata: { provider: 'grok' },
      })
    );

    const converted = converter.convertHistory(
      messages,
      'anthropic',
      'grok'
    ) as ExtendedChatMessage[];

    expect(converted).toHaveLength(3);
    expect(converted[0].metadata?.provider).toBe('grok');
    expect(converted[1].metadata?.provider).toBe('grok');
    expect(converted[2].metadata?.provider).toBe('grok');
  });

  it('should handle special message types in conversion', () => {
    const toolCallMessage: ChatMessage = {
      role: 'assistant',
      content: 'I will search for that',
      hasToolCall: true,
      toolCall: {
        name: 'search',
        parameters: { query: 'test query' },
      } as any,
      timestamp: new Date(),
    };

    converter.registerConversionHandler(
      'anthropic',
      'openai',
      (msg: ChatMessage): ChatMessage => {
        if (msg.hasToolCall && msg.toolCall) {
          return {
            ...msg,
            toolCall: {
              ...msg.toolCall,
              // Modify the format to match OpenAI's expected structure
              function: {
                name: msg.toolCall.name,
                arguments: JSON.stringify(msg.toolCall.parameters),
              },
            } as ExtendedToolCall,
          };
        }
        return msg;
      }
    );

    const converted = converter.convertMessage(
      toolCallMessage,
      'anthropic',
      'openai'
    );
    const toolCall = converted.toolCall as ExtendedToolCall;

    expect(converted.hasToolCall).toBe(true);
    expect(toolCall.function).toBeDefined();
    expect(toolCall.function?.name).toBe('search');
    expect(toolCall.function?.arguments).toBe('{"query":"test query"}');
  });
});
