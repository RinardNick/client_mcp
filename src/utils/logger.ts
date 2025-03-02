/**
 * Simple logger utility for consistent logging across the application
 */

/**
 * Logger interface for consistent logging functionality
 */
export const logger = {
  /**
   * Log a debug message
   * @param message - Message to log
   */
  debug: (message: string) => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`);
    }
  },

  /**
   * Log an informational message
   * @param message - Message to log
   */
  info: (message: string) => {
    console.log(`[INFO] ${message}`);
  },

  /**
   * Log a warning message
   * @param message - Message to log
   */
  warn: (message: string) => {
    console.warn(`[WARN] ${message}`);
  },

  /**
   * Log an error message
   * @param message - Message to log
   * @param error - Optional error object
   */
  error: (message: string, error?: Error) => {
    console.error(`[ERROR] ${message}`);
    if (error) {
      console.error(error);
    }
  },
};
