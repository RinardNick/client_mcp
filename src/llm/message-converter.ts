import { ChatMessage } from './types';

/**
 * Interface for message format conversion between different providers
 */
export interface MessageConverter {
  /**
   * Convert a single message from one provider format to another
   * @param message The message to convert
   * @param fromProvider Source provider type
   * @param toProvider Target provider type
   */
  convertMessage(
    message: ChatMessage,
    fromProvider: string,
    toProvider: string
  ): ChatMessage;

  /**
   * Convert an entire conversation history from one provider format to another
   * @param messages Conversation history to convert
   * @param fromProvider Source provider type
   * @param toProvider Target provider type
   */
  convertHistory(
    messages: ChatMessage[],
    fromProvider: string,
    toProvider: string
  ): ChatMessage[];
}

/**
 * Class for converting message formats between different providers
 */
export class ProviderMessageConverter implements MessageConverter {
  /**
   * Registry of format conversion handlers
   * Key format: `${fromProvider}->${toProvider}`
   */
  private conversionHandlers: Record<
    string,
    (message: ChatMessage) => ChatMessage
  > = {};

  /**
   * Register a conversion handler for a specific provider pair
   * @param fromProvider Source provider type
   * @param toProvider Target provider type
   * @param handler Conversion function
   */
  registerConversionHandler(
    fromProvider: string,
    toProvider: string,
    handler: (message: ChatMessage) => ChatMessage
  ): void {
    const key = `${fromProvider}->${toProvider}`;
    this.conversionHandlers[key] = handler;
  }

  /**
   * Convert a single message from one provider format to another
   * @param message The message to convert
   * @param fromProvider Source provider type
   * @param toProvider Target provider type
   */
  convertMessage(
    message: ChatMessage,
    fromProvider: string,
    toProvider: string
  ): ChatMessage {
    // If providers are the same, no conversion needed
    if (fromProvider === toProvider) {
      return { ...message };
    }

    // Try to find a direct conversion handler
    const key = `${fromProvider}->${toProvider}`;
    const handler = this.conversionHandlers[key];

    if (handler) {
      return handler(message);
    }

    // If no specific handler, use default conversion
    return this.defaultConversion(message, fromProvider, toProvider);
  }

  /**
   * Convert an entire conversation history from one provider format to another
   * @param messages Conversation history to convert
   * @param fromProvider Source provider type
   * @param toProvider Target provider type
   */
  convertHistory(
    messages: ChatMessage[],
    fromProvider: string,
    toProvider: string
  ): ChatMessage[] {
    return messages.map(message =>
      this.convertMessage(message, fromProvider, toProvider)
    );
  }

  /**
   * Default message conversion when no specific handler is registered
   * @param message The message to convert
   * @param fromProvider Source provider type
   * @param toProvider Target provider type
   */
  private defaultConversion(
    message: ChatMessage,
    fromProvider: string,
    toProvider: string
  ): ChatMessage {
    // Create a deep copy to avoid mutating the original
    const convertedMessage = JSON.parse(JSON.stringify(message));

    // Add conversion metadata if not present
    if (!convertedMessage.metadata) {
      convertedMessage.metadata = {};
    }

    // Record the conversion in metadata
    convertedMessage.metadata.convertedFrom = fromProvider;
    convertedMessage.metadata.convertedTo = toProvider;
    convertedMessage.metadata.conversionTime = new Date().toISOString();

    return convertedMessage;
  }
}
