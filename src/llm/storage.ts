import { ChatSession } from './types';

/**
 * Interface for session storage implementations
 */
export interface SessionStorage {
  /**
   * Store a session
   * @param session Chat session to store
   */
  storeSession(session: ChatSession): Promise<void>;

  /**
   * Retrieve a session by ID
   * @param sessionId Session ID to retrieve
   */
  getSession(sessionId: string): Promise<ChatSession | null>;

  /**
   * Delete a session by ID
   * @param sessionId Session ID to delete
   */
  deleteSession(sessionId: string): Promise<boolean>;

  /**
   * List all session IDs
   */
  listSessions(): Promise<string[]>;
}

/**
 * In-memory implementation of session storage
 * Used primarily for testing
 */
export class InMemorySessionStorage implements SessionStorage {
  private sessions: Map<string, ChatSession> = new Map();

  /**
   * Store a session
   * @param session Chat session to store
   */
  async storeSession(session: ChatSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  /**
   * Retrieve a session by ID
   * @param sessionId Session ID to retrieve
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Delete a session by ID
   * @param sessionId Session ID to delete
   * @returns True if session was deleted, false if it didn't exist
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  /**
   * List all session IDs
   */
  async listSessions(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get a count of stored sessions
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
  }
}
