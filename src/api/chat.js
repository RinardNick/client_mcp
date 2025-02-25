/**
 * Mock implementation of the chat API for testing purposes
 * This file is referenced by several integration tests but was missing
 */

// Import Vitest's mocking functionality
const { vi } = require('vitest');

// Mock functions for testing
const sendMessage = vi
  .fn()
  .mockImplementation((sessionId, message, options) => {
    return Promise.resolve({
      role: 'assistant',
      content: 'Mock response for testing',
      hasToolCall: false,
    });
  });

const sendMessageStream = vi
  .fn()
  .mockImplementation(function* (sessionId, message, options) {
    yield {
      type: 'content',
      content: 'Mock streaming response for testing',
    };
    yield {
      type: 'done',
    };
  });

// Export the mock functions
module.exports = {
  sendMessage,
  sendMessageStream,
};
