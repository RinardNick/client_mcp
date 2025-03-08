import { describe, it, expect } from 'vitest';
import {
  initializeProviderConverters,
  convertAnthropicToOpenAI,
  convertOpenAIToAnthropic,
  convertAnthropicToGrok,
  convertOpenAIToGrok,
} from '../provider-converters';
import { ChatMessage } from '../../types';

// Define the extended interfaces to help with testing
interface ExtendedChatMessage extends ChatMessage {
  metadata?: {
    convertedFrom?: string;
    convertedTo?: string;
    conversionTime?: string;
    truncated?: boolean;
    originalLength?: number;
    [key: string]: any;
  };
  toolCall?: any;
}

describe('Provider Converters', () => {
  it('should initialize with all conversion handlers', () => {
    const converter = initializeProviderConverters();

    // Test by converting between different providers
    const testMessage: ChatMessage = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };

    // These would throw errors if handlers weren't registered properly
    const toOpenAI = converter.convertMessage(
      testMessage,
      'anthropic',
      'openai'
    );
    const toAnthropic = converter.convertMessage(
      testMessage,
      'openai',
      'anthropic'
    );
    const toGrokFromA = converter.convertMessage(
      testMessage,
      'anthropic',
      'grok'
    );
    const toGrokFromO = converter.convertMessage(testMessage, 'openai', 'grok');

    expect(toOpenAI).toBeDefined();
    expect(toAnthropic).toBeDefined();
    expect(toGrokFromA).toBeDefined();
    expect(toGrokFromO).toBeDefined();
  });

  it('should convert Anthropic to OpenAI format', () => {
    const anthroMessage: ChatMessage = {
      role: 'assistant',
      content: 'I can help with that',
      hasToolCall: true,
      toolCall: {
        name: 'search',
        parameters: { query: 'weather in San Francisco' },
      },
      timestamp: new Date(),
    };

    const converted = convertAnthropicToOpenAI(
      anthroMessage
    ) as ExtendedChatMessage;

    expect(converted.metadata?.convertedFrom).toBe('anthropic');
    expect(converted.metadata?.convertedTo).toBe('openai');
    expect(converted.metadata?.conversionTime).toBeDefined();
    expect(converted.hasToolCall).toBe(true);
    expect(converted.toolCall?.function).toBeDefined();
    expect(converted.toolCall?.function.name).toBe('search');
    expect(converted.toolCall?.function.arguments).toBe(
      '{"query":"weather in San Francisco"}'
    );
  });

  it('should convert OpenAI to Anthropic format', () => {
    const openaiMessage: ExtendedChatMessage = {
      role: 'assistant',
      content: 'I can help with that',
      hasToolCall: true,
      toolCall: {
        name: 'original_name', // Will be overwritten
        parameters: {}, // Will be overwritten
        function: {
          name: 'search',
          arguments: '{"query":"weather in New York"}',
        },
      },
      timestamp: new Date(),
    };

    const converted = convertOpenAIToAnthropic(
      openaiMessage
    ) as ExtendedChatMessage;

    expect(converted.metadata?.convertedFrom).toBe('openai');
    expect(converted.metadata?.convertedTo).toBe('anthropic');
    expect(converted.metadata?.conversionTime).toBeDefined();
    expect(converted.hasToolCall).toBe(true);
    expect(converted.toolCall?.name).toBe('search');
    expect(converted.toolCall?.parameters).toEqual({
      query: 'weather in New York',
    });
    expect(converted.toolCall?.function).toBeUndefined();
  });

  it('should convert Anthropic to Grok format and handle content truncation', () => {
    // Create a very long message that exceeds Grok's limit
    const longContent = 'a'.repeat(40000);
    const anthroMessage: ChatMessage = {
      role: 'user',
      content: longContent,
      timestamp: new Date(),
    };

    const converted = convertAnthropicToGrok(
      anthroMessage
    ) as ExtendedChatMessage;

    expect(converted.metadata?.convertedFrom).toBe('anthropic');
    expect(converted.metadata?.convertedTo).toBe('grok');
    expect(converted.metadata?.truncated).toBe(true);
    expect(converted.metadata?.originalLength).toBe(40000);
    expect(converted.content.length).toBeLessThan(longContent.length);
    expect(converted.content.includes('truncated for Grok compatibility')).toBe(
      true
    );
  });

  it('should handle conversion from OpenAI to Grok by chaining converters', () => {
    const openaiMessage: ExtendedChatMessage = {
      role: 'assistant',
      content: 'I can help with that',
      hasToolCall: true,
      toolCall: {
        function: {
          name: 'search',
          arguments: '{"query":"weather"}',
        },
      },
      timestamp: new Date(),
    };

    const converted = convertOpenAIToGrok(openaiMessage) as ExtendedChatMessage;

    // Should have gone through both converters
    expect(converted.metadata?.convertedFrom).toBe('anthropic');
    expect(converted.metadata?.convertedTo).toBe('grok');

    // Should have preserved the tool call data through both conversions
    expect(converted.hasToolCall).toBe(true);
    expect(converted.toolCall?.name).toBe('search');
    expect(converted.toolCall?.parameters).toEqual({ query: 'weather' });
  });
});
