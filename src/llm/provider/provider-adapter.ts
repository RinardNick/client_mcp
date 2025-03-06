import { ConversationMessage } from '../types';
import { AnthropicFormatter } from './formatters/anthropic-formatter';
import { OpenAIFormatter } from './formatters/openai-formatter';
import { GrokFormatter } from './formatters/grok-formatter';

/**
 * Interface for provider-specific message formatters
 */
export interface ProviderMessageFormatter {
  /**
   * Format a list of messages for a specific provider
   * @param messages The messages to format
   * @returns Formatted messages according to provider requirements
   */
  formatMessages(messages: ConversationMessage[]): any[];

  /**
   * Format a tool call message for a specific provider
   * @param message The message to format
   * @returns Formatted tool call message according to provider requirements
   */
  formatToolCallMessage(message: ConversationMessage): any;

  /**
   * Format a tool result message for a specific provider
   * @param message The message to format
   * @returns Formatted tool result message according to provider requirements
   */
  formatToolResultMessage(message: ConversationMessage): any;
}

/**
 * Adapter class for handling provider-specific message formatting
 */
export class ProviderAdapter {
  private formatters: Record<string, ProviderMessageFormatter> = {};

  constructor() {
    this.registerDefaultFormatters();
  }

  /**
   * Register a message formatter for a specific provider
   * @param provider The provider name
   * @param formatter The formatter implementation
   */
  registerFormatter(
    provider: string,
    formatter: ProviderMessageFormatter
  ): void {
    this.formatters[provider] = formatter;
  }

  /**
   * Format messages according to the requirements of a specific provider
   * @param messages The messages to format
   * @param provider The provider name
   * @returns Formatted messages ready for the provider's API
   */
  formatMessagesForProvider(
    messages: ConversationMessage[],
    provider: string
  ): any[] {
    const formatter = this.formatters[provider];
    if (!formatter) {
      throw new Error(`No message formatter found for provider: ${provider}`);
    }
    return formatter.formatMessages(messages);
  }

  /**
   * Register the default formatters for supported providers
   * Will be expanded with actual implementations in subsequent steps
   */
  private registerDefaultFormatters(): void {
    this.registerFormatter('anthropic', new AnthropicFormatter());
    this.registerFormatter('openai', new OpenAIFormatter());
    this.registerFormatter('grok', new GrokFormatter());
  }
}
