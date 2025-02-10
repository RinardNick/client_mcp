import { vi, beforeEach, afterEach } from 'vitest';

// Reset all mocks before each test
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

// Clear any remaining timeouts/intervals after each test
afterEach(() => {
  vi.clearAllTimers();
});

// Global mock for console methods to reduce noise in tests
const originalConsole = { ...console };
beforeEach(() => {
  global.console.log = vi.fn();
  global.console.error = vi.fn();
  global.console.warn = vi.fn();
  global.console.info = vi.fn();
});

// Restore console after tests
afterEach(() => {
  global.console.log = originalConsole.log;
  global.console.error = originalConsole.error;
  global.console.warn = originalConsole.warn;
  global.console.info = originalConsole.info;
});
