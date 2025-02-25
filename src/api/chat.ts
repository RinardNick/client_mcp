/**
 * Mock implementation of the chat API for testing purposes
 * This file is referenced by several integration tests but was missing
 */

import { vi } from 'vitest';

interface MessageOptions {
  messages?: Array<{ role: string; content: string }>;
  [key: string]: any;
}

/**
 * Send a message to the LLM
 */
export const sendMessage = vi
  .fn()
  .mockImplementation(
    (sessionId: string, message: string, options?: MessageOptions) => {
      return Promise.resolve({
        role: 'assistant',
        content: 'Mock response for testing',
        hasToolCall: false,
      });
    }
  );

/**
 * Send a message to the LLM with streaming response
 */
export const sendMessageStream = vi
  .fn()
  .mockImplementation(function* (
    sessionId: string,
    message: string,
    options?: MessageOptions
  ) {
    yield {
      type: 'content',
      content: 'Mock streaming response for testing',
    };
    yield {
      type: 'done',
    };
  });
