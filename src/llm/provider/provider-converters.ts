import { ChatMessage, ToolCall } from '../types';
import { ProviderMessageConverter } from './compatibility/message-converter';

// Extended ToolCall type for OpenAI format
interface OpenAIToolCall extends ToolCall {
  function?: {
    name: string;
    arguments: string;
  };
}

// Extended ChatMessage type with metadata support
interface ExtendedChatMessage extends ChatMessage {
  metadata?: {
    convertedFrom?: string;
    convertedTo?: string;
    conversionTime?: string;
    truncated?: boolean;
    originalLength?: number;
    [key: string]: any;
  };
  toolCall?: ToolCall | OpenAIToolCall;
}

/**
 * Initializes and configures all provider-specific message converters
 * @returns Configured ProviderMessageConverter instance
 */
export function initializeProviderConverters(): ProviderMessageConverter {
  const converter = new ProviderMessageConverter();

  // Register Anthropic to OpenAI conversions
  converter.registerConversionHandler(
    'anthropic',
    'openai',
    convertAnthropicToOpenAI
  );

  // Register OpenAI to Anthropic conversions
  converter.registerConversionHandler(
    'openai',
    'anthropic',
    convertOpenAIToAnthropic
  );

  // Register Anthropic to Grok conversions
  converter.registerConversionHandler(
    'anthropic',
    'grok',
    convertAnthropicToGrok
  );

  // Register OpenAI to Grok conversions
  converter.registerConversionHandler('openai', 'grok', convertOpenAIToGrok);

  return converter;
}

/**
 * Converts a message from Anthropic format to OpenAI format
 * @param message Message in Anthropic format
 * @returns Message in OpenAI format
 */
export function convertAnthropicToOpenAI(message: ChatMessage): ChatMessage {
  const convertedMessage = { ...message } as ExtendedChatMessage;

  // Add metadata
  if (!convertedMessage.metadata) {
    convertedMessage.metadata = {};
  }
  convertedMessage.metadata.convertedFrom = 'anthropic';
  convertedMessage.metadata.convertedTo = 'openai';
  convertedMessage.metadata.conversionTime = new Date().toISOString();

  // Convert tool calls if present
  if (message.hasToolCall && message.toolCall) {
    convertedMessage.toolCall = {
      ...message.toolCall,
      // OpenAI uses a different tool call format with 'function'
      function: {
        name: message.toolCall.name,
        arguments: JSON.stringify(message.toolCall.parameters),
      },
    } as OpenAIToolCall;
  }

  return convertedMessage;
}

/**
 * Converts a message from OpenAI format to Anthropic format
 * @param message Message in OpenAI format
 * @returns Message in Anthropic format
 */
export function convertOpenAIToAnthropic(message: ChatMessage): ChatMessage {
  const convertedMessage = { ...message } as ExtendedChatMessage;

  // Add metadata
  if (!convertedMessage.metadata) {
    convertedMessage.metadata = {};
  }
  convertedMessage.metadata.convertedFrom = 'openai';
  convertedMessage.metadata.convertedTo = 'anthropic';
  convertedMessage.metadata.conversionTime = new Date().toISOString();

  // Convert tool calls if present
  if (message.hasToolCall && message.toolCall) {
    const openAIToolCall = message.toolCall as OpenAIToolCall;
    if (openAIToolCall.function) {
      convertedMessage.toolCall = {
        name: openAIToolCall.function.name,
        parameters: JSON.parse(openAIToolCall.function.arguments),
      };
    }
  }

  return convertedMessage;
}

/**
 * Converts a message from Anthropic format to Grok format
 * @param message Message in Anthropic format
 * @returns Message in Grok format
 */
export function convertAnthropicToGrok(message: ChatMessage): ChatMessage {
  const convertedMessage = { ...message } as ExtendedChatMessage;

  // Add metadata
  if (!convertedMessage.metadata) {
    convertedMessage.metadata = {};
  }
  convertedMessage.metadata.convertedFrom = 'anthropic';
  convertedMessage.metadata.convertedTo = 'grok';
  convertedMessage.metadata.conversionTime = new Date().toISOString();

  // Special handling for Grok-specific requirements
  // Grok has limits on content length
  if (message.content && message.content.length > 32000) {
    convertedMessage.content =
      message.content.substring(0, 32000) +
      '... [truncated for Grok compatibility]';
    convertedMessage.metadata.truncated = true;
    convertedMessage.metadata.originalLength = message.content.length;
  }

  return convertedMessage;
}

/**
 * Converts a message from OpenAI format to Grok format
 * @param message Message in OpenAI format
 * @returns Message in Grok format
 */
export function convertOpenAIToGrok(message: ChatMessage): ChatMessage {
  // First convert from OpenAI to Anthropic
  const anthropicFormat = convertOpenAIToAnthropic(message);
  // Then convert from Anthropic to Grok
  return convertAnthropicToGrok(anthropicFormat);
}
