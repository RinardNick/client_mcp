# Session State Management Implementation

This document provides a detailed implementation plan for the Session State Management components, which will be responsible for managing session data in a centralized, controlled manner.

## Overview

The Session State Management consists of:

1. **Session Entity Models** - Core domain models for sessions and messages
2. **Session State Repository** - Interface and implementation for storing and retrieving session data
3. **Session Events** - Event definitions for session state changes
4. **Session Commands** - Command definitions for session operations

## Implementation Steps

### Step 1: Define Session Entity Models

**File: `src/llm/session/models/types.ts`**

```typescript
/**
 * Chat message role types
 */
export enum ChatMessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
  FUNCTION = 'function',
  SUMMARY = 'summary',
}

/**
 * Message content types
 */
export enum MessageContentType {
  TEXT = 'text',
  IMAGE = 'image',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
}

/**
 * Base interface for all message content
 */
export interface MessageContent {
  type: MessageContentType;
}

/**
 * Text content in a message
 */
export interface TextContent extends MessageContent {
  type: MessageContentType.TEXT;
  text: string;
}

/**
 * Image content in a message
 */
export interface ImageContent extends MessageContent {
  type: MessageContentType.IMAGE;
  url: string;
  detail?: 'low' | 'high' | 'auto';
  alt_text?: string;
}

/**
 * Tool call content in a message
 */
export interface ToolCallContent extends MessageContent {
  type: MessageContentType.TOOL_CALL;
  tool_call_id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool result content in a message
 */
export interface ToolResultContent extends MessageContent {
  type: MessageContentType.TOOL_RESULT;
  tool_call_id: string;
  content: string;
}

/**
 * Union type for all message content types
 */
export type MessageContentUnion =
  | TextContent
  | ImageContent
  | ToolCallContent
  | ToolResultContent;

/**
 * Chat message structure
 */
export interface ChatMessage {
  /**
   * Unique identifier for the message
   */
  id: string;

  /**
   * Role of the message sender
   */
  role: ChatMessageRole;

  /**
   * Message content (can be multiple content parts)
   */
  content: MessageContentUnion[];

  /**
   * When the message was created
   */
  createdAt: Date;

  /**
   * For tool messages, the ID of the message containing the tool call
   */
  toolCallId?: string;

  /**
   * For assistant messages, any tool calls made by the assistant
   */
  toolCalls?: ToolCallContent[];

  /**
   * Metadata about the message
   */
  metadata?: Record<string, unknown>;
}

/**
 * Session configuration options
 */
export interface SessionConfig {
  /**
   * Provider to use for this session (e.g., 'openai', 'anthropic')
   */
  provider: string;

  /**
   * Model to use for this session (e.g., 'gpt-4', 'claude-3-opus')
   */
  model: string;

  /**
   * System prompt for the session
   */
  systemPrompt?: string;

  /**
   * Temperature for generation (0.0 - 1.0)
   */
  temperature?: number;

  /**
   * Maximum tokens to generate in responses
   */
  maxTokens?: number;

  /**
   * Context window management strategy
   */
  contextStrategy?: 'summarize' | 'truncate' | 'relevance' | 'adaptive';

  /**
   * Tools available in this session
   */
  tools?: string[];

  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, unknown>;
}

/**
 * Token usage metrics
 */
export interface TokenMetrics {
  /**
   * Total prompt tokens used so far
   */
  promptTokens: number;

  /**
   * Total completion tokens used so far
   */
  completionTokens: number;

  /**
   * Total tokens used so far
   */
  totalTokens: number;

  /**
   * Estimated cost in USD
   */
  estimatedCost: number;

  /**
   * Context window utilization (0.0 - 1.0)
   */
  contextUtilization: number;

  /**
   * Maximum context window size for the model
   */
  maxContextWindow: number;
}

/**
 * Session state structure
 */
export interface Session {
  /**
   * Unique identifier for the session
   */
  id: string;

  /**
   * Configuration for this session
   */
  config: SessionConfig;

  /**
   * Messages in this session
   */
  messages: ChatMessage[];

  /**
   * Token usage metrics
   */
  metrics: TokenMetrics;

  /**
   * When the session was created
   */
  createdAt: Date;

  /**
   * When the session was last updated
   */
  updatedAt: Date;

  /**
   * Whether the session is active
   */
  isActive: boolean;

  /**
   * Additional session metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Session summary information (for listing sessions)
 */
export interface SessionInfo {
  /**
   * Unique identifier for the session
   */
  id: string;

  /**
   * Provider and model used
   */
  provider: string;
  model: string;

  /**
   * When the session was created
   */
  createdAt: Date;

  /**
   * When the session was last updated
   */
  updatedAt: Date;

  /**
   * Number of messages in the session
   */
  messageCount: number;

  /**
   * Whether the session is active
   */
  isActive: boolean;
}
```

**File: `src/llm/session/models/session-factory.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  Session,
  SessionConfig,
  ChatMessage,
  ChatMessageRole,
  TokenMetrics,
  MessageContentType,
  TextContent,
} from './types';

/**
 * Factory class for creating session and message objects
 */
export class SessionFactory {
  /**
   * Create a new session with the given configuration
   * @param config Session configuration
   * @returns A new session object
   */
  static createSession(config: SessionConfig): Session {
    const now = new Date();

    // Initialize token metrics
    const metrics: TokenMetrics = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      contextUtilization: 0,
      maxContextWindow: getContextWindowSize(config.model),
    };

    // Create the session object
    const session: Session = {
      id: uuidv4(),
      config,
      messages: [],
      metrics,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    // Add system message if provided
    if (config.systemPrompt) {
      const systemMessage = this.createSystemMessage(config.systemPrompt);
      session.messages.push(systemMessage);
    }

    return session;
  }

  /**
   * Create a system message
   * @param content Message content
   * @returns A new system message
   */
  static createSystemMessage(content: string): ChatMessage {
    return {
      id: uuidv4(),
      role: ChatMessageRole.SYSTEM,
      content: [
        {
          type: MessageContentType.TEXT,
          text: content,
        } as TextContent,
      ],
      createdAt: new Date(),
    };
  }

  /**
   * Create a user message
   * @param content Message content (text or structured content)
   * @returns A new user message
   */
  static createUserMessage(content: string | TextContent[]): ChatMessage {
    const messageContent =
      typeof content === 'string'
        ? [{ type: MessageContentType.TEXT, text: content } as TextContent]
        : content;

    return {
      id: uuidv4(),
      role: ChatMessageRole.USER,
      content: messageContent,
      createdAt: new Date(),
    };
  }

  /**
   * Create an assistant message
   * @param content Message content (text or structured content)
   * @returns A new assistant message
   */
  static createAssistantMessage(content: string | TextContent[]): ChatMessage {
    const messageContent =
      typeof content === 'string'
        ? [{ type: MessageContentType.TEXT, text: content } as TextContent]
        : content;

    return {
      id: uuidv4(),
      role: ChatMessageRole.ASSISTANT,
      content: messageContent,
      createdAt: new Date(),
    };
  }

  /**
   * Create a tool message (result of a tool call)
   * @param toolCallId ID of the tool call this is responding to
   * @param content Tool result content
   * @returns A new tool message
   */
  static createToolMessage(toolCallId: string, content: string): ChatMessage {
    return {
      id: uuidv4(),
      role: ChatMessageRole.TOOL,
      content: [
        {
          type: MessageContentType.TEXT,
          text: content,
        } as TextContent,
      ],
      createdAt: new Date(),
      toolCallId,
    };
  }

  /**
   * Create a summary message
   * @param content Summary content
   * @returns A new summary message
   */
  static createSummaryMessage(content: string): ChatMessage {
    return {
      id: uuidv4(),
      role: ChatMessageRole.SUMMARY,
      content: [
        {
          type: MessageContentType.TEXT,
          text: content,
        } as TextContent,
      ],
      createdAt: new Date(),
      metadata: {
        isSummary: true,
        summarizedMessages: [],
      },
    };
  }
}

/**
 * Get the context window size for a model
 * @param model Model identifier
 * @returns Context window size in tokens
 */
function getContextWindowSize(model: string): number {
  // This is a simplified version - in reality, this would come from a model registry
  if (model.includes('gpt-4-turbo') || model.includes('gpt-4-32k')) {
    return 128000;
  } else if (model.includes('gpt-4')) {
    return 8192;
  } else if (model.includes('gpt-3.5-turbo-16k')) {
    return 16384;
  } else if (model.includes('gpt-3.5')) {
    return 4096;
  } else if (model.includes('claude-3-opus')) {
    return 200000;
  } else if (model.includes('claude-3-sonnet')) {
    return 180000;
  } else if (model.includes('claude-3-haiku')) {
    return 150000;
  } else if (model.includes('claude-2')) {
    return 100000;
  } else if (model.includes('claude-instant')) {
    return 100000;
  } else if (model.includes('gemini-1.5-pro')) {
    return 1000000;
  } else if (model.includes('gemini-1.0-pro')) {
    return 32768;
  } else if (model.includes('llama')) {
    return 4096; // Depends on specific model
  }

  // Default fallback
  return 4096;
}

// Export the helper function for use in tests
export { getContextWindowSize };
```

#### Test Files

**File: `src/llm/session/models/types.test.ts`**

```typescript
import {
  ChatMessageRole,
  MessageContentType,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent,
} from './types';

describe('Session Models - Types', () => {
  test('ChatMessageRole enum should have expected values', () => {
    expect(ChatMessageRole.SYSTEM).toBe('system');
    expect(ChatMessageRole.USER).toBe('user');
    expect(ChatMessageRole.ASSISTANT).toBe('assistant');
    expect(ChatMessageRole.TOOL).toBe('tool');
    expect(ChatMessageRole.FUNCTION).toBe('function');
    expect(ChatMessageRole.SUMMARY).toBe('summary');
  });

  test('MessageContentType enum should have expected values', () => {
    expect(MessageContentType.TEXT).toBe('text');
    expect(MessageContentType.IMAGE).toBe('image');
    expect(MessageContentType.TOOL_CALL).toBe('tool_call');
    expect(MessageContentType.TOOL_RESULT).toBe('tool_result');
  });

  test('TextContent interface can be implemented', () => {
    const content: TextContent = {
      type: MessageContentType.TEXT,
      text: 'Hello world',
    };

    expect(content.type).toBe('text');
    expect(content.text).toBe('Hello world');
  });

  test('ImageContent interface can be implemented', () => {
    const content: ImageContent = {
      type: MessageContentType.IMAGE,
      url: 'https://example.com/image.jpg',
      detail: 'high',
      alt_text: 'Example image',
    };

    expect(content.type).toBe('image');
    expect(content.url).toBe('https://example.com/image.jpg');
    expect(content.detail).toBe('high');
    expect(content.alt_text).toBe('Example image');
  });

  test('ToolCallContent interface can be implemented', () => {
    const content: ToolCallContent = {
      type: MessageContentType.TOOL_CALL,
      tool_call_id: '123',
      name: 'search',
      args: { query: 'example search' },
    };

    expect(content.type).toBe('tool_call');
    expect(content.tool_call_id).toBe('123');
    expect(content.name).toBe('search');
    expect(content.args.query).toBe('example search');
  });

  test('ToolResultContent interface can be implemented', () => {
    const content: ToolResultContent = {
      type: MessageContentType.TOOL_RESULT,
      tool_call_id: '123',
      content: 'Search results for query',
    };

    expect(content.type).toBe('tool_result');
    expect(content.tool_call_id).toBe('123');
    expect(content.content).toBe('Search results for query');
  });
});
```

**File: `src/llm/session/models/session-factory.test.ts`**

```typescript
import { SessionFactory, getContextWindowSize } from './session-factory';
import { ChatMessageRole, MessageContentType } from './types';

describe('SessionFactory', () => {
  test('createSession should create a valid session', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant',
      temperature: 0.7,
    };

    const session = SessionFactory.createSession(config);

    expect(session.id).toBeDefined();
    expect(session.config).toEqual(config);
    expect(session.messages).toHaveLength(1); // System message
    expect(session.isActive).toBe(true);
    expect(session.metrics).toBeDefined();
    expect(session.metrics.maxContextWindow).toBe(8192); // GPT-4 context window
  });

  test('createSession should not add system message if not provided', () => {
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);

    expect(session.messages).toHaveLength(0);
  });

  test('createSystemMessage should create a valid system message', () => {
    const message = SessionFactory.createSystemMessage(
      'You are a helpful assistant'
    );

    expect(message.id).toBeDefined();
    expect(message.role).toBe(ChatMessageRole.SYSTEM);
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe(MessageContentType.TEXT);
    expect((message.content[0] as any).text).toBe(
      'You are a helpful assistant'
    );
    expect(message.createdAt).toBeInstanceOf(Date);
  });

  test('createUserMessage should create a valid user message from string', () => {
    const message = SessionFactory.createUserMessage('Hello, assistant!');

    expect(message.id).toBeDefined();
    expect(message.role).toBe(ChatMessageRole.USER);
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe(MessageContentType.TEXT);
    expect((message.content[0] as any).text).toBe('Hello, assistant!');
  });

  test('createUserMessage should create a valid user message from content array', () => {
    const content = [
      {
        type: MessageContentType.TEXT,
        text: 'Hello, assistant!',
      },
    ];

    const message = SessionFactory.createUserMessage(content as any);

    expect(message.role).toBe(ChatMessageRole.USER);
    expect(message.content).toBe(content);
  });

  test('createAssistantMessage should create a valid assistant message', () => {
    const message = SessionFactory.createAssistantMessage('Hello, user!');

    expect(message.id).toBeDefined();
    expect(message.role).toBe(ChatMessageRole.ASSISTANT);
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe(MessageContentType.TEXT);
    expect((message.content[0] as any).text).toBe('Hello, user!');
  });

  test('createToolMessage should create a valid tool message', () => {
    const message = SessionFactory.createToolMessage(
      'tool-123',
      'Search results'
    );

    expect(message.id).toBeDefined();
    expect(message.role).toBe(ChatMessageRole.TOOL);
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe(MessageContentType.TEXT);
    expect((message.content[0] as any).text).toBe('Search results');
    expect(message.toolCallId).toBe('tool-123');
  });

  test('createSummaryMessage should create a valid summary message', () => {
    const message = SessionFactory.createSummaryMessage('Conversation summary');

    expect(message.id).toBeDefined();
    expect(message.role).toBe(ChatMessageRole.SUMMARY);
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe(MessageContentType.TEXT);
    expect((message.content[0] as any).text).toBe('Conversation summary');
    expect(message.metadata).toBeDefined();
    expect(message.metadata!.isSummary).toBe(true);
  });

  test('getContextWindowSize should return correct window sizes', () => {
    expect(getContextWindowSize('gpt-4')).toBe(8192);
    expect(getContextWindowSize('gpt-4-32k')).toBe(128000);
    expect(getContextWindowSize('gpt-3.5-turbo')).toBe(4096);
    expect(getContextWindowSize('gpt-3.5-turbo-16k')).toBe(16384);
    expect(getContextWindowSize('claude-3-opus')).toBe(200000);
    expect(getContextWindowSize('claude-3-sonnet')).toBe(180000);
    expect(getContextWindowSize('gemini-1.5-pro')).toBe(1000000);
    expect(getContextWindowSize('unknown-model')).toBe(4096); // Default
  });
});
```

### Step 2: Implement Session State Repository

**File: `src/llm/session/repository/session-repository.ts`**

```typescript
import { Session, ChatMessage, SessionInfo } from '../models/types';

/**
 * Interface for the session state repository
 */
export interface SessionRepository {
  /**
   * Get a session by ID
   * @param sessionId Unique session identifier
   * @returns The session if found, or null if not found
   */
  getSession(sessionId: string): Promise<Session | null>;

  /**
   * Create a new session
   * @param session Session to create
   * @returns The created session
   */
  createSession(session: Session): Promise<Session>;

  /**
   * Update an existing session
   * @param sessionId Session ID
   * @param updates Partial session updates
   * @returns The updated session
   */
  updateSession(sessionId: string, updates: Partial<Session>): Promise<Session>;

  /**
   * Delete a session
   * @param sessionId Session ID
   * @returns Whether the session was successfully deleted
   */
  deleteSession(sessionId: string): Promise<boolean>;

  /**
   * Get all messages for a session
   * @param sessionId Session ID
   * @returns Array of messages
   */
  getMessages(sessionId: string): Promise<ChatMessage[]>;

  /**
   * Add a message to a session
   * @param sessionId Session ID
   * @param message Message to add
   * @returns The updated session
   */
  addMessage(sessionId: string, message: ChatMessage): Promise<Session>;

  /**
   * Update a message in a session
   * @param sessionId Session ID
   * @param messageId Message ID
   * @param updates Partial message updates
   * @returns The updated session
   */
  updateMessage(
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>
  ): Promise<Session>;

  /**
   * Get a summary of all sessions
   * @returns Array of session summaries
   */
  listSessions(): Promise<SessionInfo[]>;

  /**
   * Check if a session exists
   * @param sessionId Session ID
   * @returns Whether the session exists
   */
  sessionExists(sessionId: string): Promise<boolean>;
}

/**
 * In-memory implementation of the session repository
 */
export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();

  /**
   * Get a session by ID
   * @param sessionId Unique session identifier
   * @returns The session if found, or null if not found
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  /**
   * Create a new session
   * @param session Session to create
   * @returns The created session
   */
  async createSession(session: Session): Promise<Session> {
    if (this.sessions.has(session.id)) {
      throw new Error(`Session already exists with ID: ${session.id}`);
    }

    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  /**
   * Update an existing session
   * @param sessionId Session ID
   * @param updates Partial session updates
   * @returns The updated session
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Session>
  ): Promise<Session> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found with ID: ${sessionId}`);
    }

    // Apply updates
    const updatedSession = {
      ...session,
      ...updates,
      // Ensure these fields are properly updated
      updatedAt: new Date(),
    };

    // Special handling for nested updates
    if (updates.messages) {
      updatedSession.messages = [...updates.messages];
    }

    if (updates.config) {
      updatedSession.config = {
        ...session.config,
        ...updates.config,
      };
    }

    if (updates.metrics) {
      updatedSession.metrics = {
        ...session.metrics,
        ...updates.metrics,
      };
    }

    this.sessions.set(sessionId, updatedSession);
    return structuredClone(updatedSession);
  }

  /**
   * Delete a session
   * @param sessionId Session ID
   * @returns Whether the session was successfully deleted
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all messages for a session
   * @param sessionId Session ID
   * @returns Array of messages
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found with ID: ${sessionId}`);
    }

    return structuredClone(session.messages);
  }

  /**
   * Add a message to a session
   * @param sessionId Session ID
   * @param message Message to add
   * @returns The updated session
   */
  async addMessage(sessionId: string, message: ChatMessage): Promise<Session> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found with ID: ${sessionId}`);
    }

    const updatedSession = {
      ...session,
      messages: [...session.messages, message],
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, updatedSession);
    return structuredClone(updatedSession);
  }

  /**
   * Update a message in a session
   * @param sessionId Session ID
   * @param messageId Message ID
   * @param updates Partial message updates
   * @returns The updated session
   */
  async updateMessage(
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>
  ): Promise<Session> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found with ID: ${sessionId}`);
    }

    const messageIndex = session.messages.findIndex(
      msg => msg.id === messageId
    );

    if (messageIndex === -1) {
      throw new Error(`Message not found with ID: ${messageId}`);
    }

    // Update the message
    const updatedMessage = {
      ...session.messages[messageIndex],
      ...updates,
    };

    // Create a new messages array with the updated message
    const updatedMessages = [...session.messages];
    updatedMessages[messageIndex] = updatedMessage;

    // Update the session
    const updatedSession = {
      ...session,
      messages: updatedMessages,
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, updatedSession);
    return structuredClone(updatedSession);
  }

  /**
   * Get a summary of all sessions
   * @returns Array of session summaries
   */
  async listSessions(): Promise<SessionInfo[]> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      provider: session.config.provider,
      model: session.config.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      isActive: session.isActive,
    }));
  }

  /**
   * Check if a session exists
   * @param sessionId Session ID
   * @returns Whether the session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  /**
   * For testing - clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * For testing - get the count of sessions
   */
  get size(): number {
    return this.sessions.size;
  }
}
```

#### Test File

**File: `src/llm/session/repository/session-repository.test.ts`**

```typescript
import { InMemorySessionRepository } from './session-repository';
import { SessionFactory } from '../models/session-factory';
import { ChatMessageRole, ChatMessage } from '../models/types';

describe('InMemorySessionRepository', () => {
  let repository: InMemorySessionRepository;

  beforeEach(() => {
    repository = new InMemorySessionRepository();
    repository.clear();
  });

  test('should create and retrieve a session', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Retrieve the session
    const retrievedSession = await repository.getSession(session.id);

    expect(retrievedSession).not.toBeNull();
    expect(retrievedSession!.id).toBe(session.id);
    expect(retrievedSession!.config).toEqual(session.config);
    expect(retrievedSession!.messages).toHaveLength(1); // System message
  });

  test('should return null for non-existent session', async () => {
    const session = await repository.getSession('non-existent-id');
    expect(session).toBeNull();
  });

  test('should update a session', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Update the session
    const updates = {
      config: {
        temperature: 0.8,
      },
      isActive: false,
    };

    const updatedSession = await repository.updateSession(session.id, updates);

    expect(updatedSession.config.temperature).toBe(0.8);
    expect(updatedSession.isActive).toBe(false);
    expect(updatedSession.config.provider).toBe('openai'); // Original value preserved
    expect(updatedSession.config.model).toBe('gpt-4'); // Original value preserved
  });

  test('should throw when updating non-existent session', async () => {
    await expect(
      repository.updateSession('non-existent-id', { isActive: false })
    ).rejects.toThrow('Session not found');
  });

  test('should delete a session', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Delete the session
    const result = await repository.deleteSession(session.id);
    expect(result).toBe(true);

    // Verify it's gone
    const retrievedSession = await repository.getSession(session.id);
    expect(retrievedSession).toBeNull();
  });

  test('should handle deleting non-existent session', async () => {
    const result = await repository.deleteSession('non-existent-id');
    expect(result).toBe(false);
  });

  test('should add a message to a session', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Add a message
    const message = SessionFactory.createUserMessage('Hello, assistant!');
    const updatedSession = await repository.addMessage(session.id, message);

    expect(updatedSession.messages).toHaveLength(1);
    expect(updatedSession.messages[0].role).toBe(ChatMessageRole.USER);
  });

  test('should update a message in a session', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Add a user message
    const message = SessionFactory.createUserMessage('Hello, assistant!');
    await repository.addMessage(session.id, message);

    // Update the message
    const updates = {
      metadata: { edited: true },
    };

    const updatedSession = await repository.updateMessage(
      session.id,
      message.id,
      updates
    );

    // Get the updated message
    const updatedMessage = updatedSession.messages.find(
      msg => msg.id === message.id
    );

    expect(updatedMessage).toBeDefined();
    expect(updatedMessage!.metadata).toBeDefined();
    expect(updatedMessage!.metadata!.edited).toBe(true);
  });

  test('should throw when updating a message in a non-existent session', async () => {
    await expect(
      repository.updateMessage('non-existent-id', 'message-id', {})
    ).rejects.toThrow('Session not found');
  });

  test('should throw when updating a non-existent message', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    await expect(
      repository.updateMessage(session.id, 'non-existent-message', {})
    ).rejects.toThrow('Message not found');
  });

  test('should list all sessions', async () => {
    // Create multiple sessions
    const config1 = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const config2 = {
      provider: 'anthropic',
      model: 'claude-3-opus',
    };

    const session1 = SessionFactory.createSession(config1);
    const session2 = SessionFactory.createSession(config2);

    await repository.createSession(session1);
    await repository.createSession(session2);

    // List sessions
    const sessions = await repository.listSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe(session1.id);
    expect(sessions[0].provider).toBe('openai');
    expect(sessions[0].model).toBe('gpt-4');
    expect(sessions[1].id).toBe(session2.id);
    expect(sessions[1].provider).toBe('anthropic');
    expect(sessions[1].model).toBe('claude-3-opus');
  });

  test('should check if a session exists', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Check if it exists
    const exists = await repository.sessionExists(session.id);
    expect(exists).toBe(true);

    // Check non-existent session
    const notExists = await repository.sessionExists('non-existent-id');
    expect(notExists).toBe(false);
  });

  test('should throw error when creating a session with an existing ID', async () => {
    // Create a session
    const config = {
      provider: 'openai',
      model: 'gpt-4',
    };

    const session = SessionFactory.createSession(config);
    await repository.createSession(session);

    // Try to create another session with the same ID
    await expect(repository.createSession(session)).rejects.toThrow(
      'Session already exists'
    );
  });
});
```

### Step 3: Define Session Events

**File: `src/llm/session/events/session-events.ts`**

```typescript
import { Event } from '../../infrastructure/types';
import {
  Session,
  ChatMessage,
  SessionConfig,
  TokenMetrics,
} from '../models/types';

/**
 * Base class for all session-related events
 */
export abstract class SessionEvent implements Event {
  /**
   * Event type
   */
  abstract type: string;

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * When the event occurred
   */
  timestamp: Date;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.timestamp = new Date();
  }
}

/**
 * Event for when a session is created
 */
export class SessionCreatedEvent extends SessionEvent {
  type = 'session-created';

  /**
   * The created session
   */
  session: Session;

  constructor(session: Session) {
    super(session.id);
    this.session = session;
  }
}

/**
 * Event for when a session is updated
 */
export class SessionUpdatedEvent extends SessionEvent {
  type = 'session-updated';

  /**
   * Fields that were updated
   */
  updates: Partial<Session>;

  constructor(sessionId: string, updates: Partial<Session>) {
    super(sessionId);
    this.updates = updates;
  }
}

/**
 * Event for when a session is deleted
 */
export class SessionDeletedEvent extends SessionEvent {
  type = 'session-deleted';

  constructor(sessionId: string) {
    super(sessionId);
  }
}

/**
 * Event for when a message is added to a session
 */
export class MessageAddedEvent extends SessionEvent {
  type = 'message-added';

  /**
   * The added message
   */
  message: ChatMessage;

  constructor(sessionId: string, message: ChatMessage) {
    super(sessionId);
    this.message = message;
  }
}

/**
 * Event for when a message is updated
 */
export class MessageUpdatedEvent extends SessionEvent {
  type = 'message-updated';

  /**
   * ID of the updated message
   */
  messageId: string;

  /**
   * Fields that were updated
   */
  updates: Partial<ChatMessage>;

  constructor(
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>
  ) {
    super(sessionId);
    this.messageId = messageId;
    this.updates = updates;
  }
}

/**
 * Event for when token metrics are updated
 */
export class TokenMetricsUpdatedEvent extends SessionEvent {
  type = 'token-metrics-updated';

  /**
   * Updated token metrics
   */
  metrics: TokenMetrics;

  constructor(sessionId: string, metrics: TokenMetrics) {
    super(sessionId);
    this.metrics = metrics;
  }
}

/**
 * Event for when the session configuration is updated
 */
export class SessionConfigUpdatedEvent extends SessionEvent {
  type = 'session-config-updated';

  /**
   * Updated configuration fields
   */
  config: Partial<SessionConfig>;

  constructor(sessionId: string, config: Partial<SessionConfig>) {
    super(sessionId);
    this.config = config;
  }
}

/**
 * Event for when context window utilization is critical
 */
export class ContextWindowCriticalEvent extends SessionEvent {
  type = 'context-window-critical';

  /**
   * Current utilization percentage
   */
  utilization: number;

  /**
   * Maximum context window size
   */
  maxContextWindow: number;

  constructor(
    sessionId: string,
    utilization: number,
    maxContextWindow: number
  ) {
    super(sessionId);
    this.utilization = utilization;
    this.maxContextWindow = maxContextWindow;
  }
}
```

#### Test: `src/llm/session/events/session-events.test.ts`

```typescript
import {
  SessionCreatedEvent,
  SessionUpdatedEvent,
  SessionDeletedEvent,
  MessageAddedEvent,
  MessageUpdatedEvent,
  TokenMetricsUpdatedEvent,
  SessionConfigUpdatedEvent,
  ContextWindowCriticalEvent,
} from './session-events';
import { SessionFactory } from '../models/session-factory';

describe('Session Events', () => {
  test('SessionCreatedEvent should have correct type and properties', () => {
    const config = { provider: 'openai', model: 'gpt-4' };
    const session = SessionFactory.createSession(config);

    const event = new SessionCreatedEvent(session);

    expect(event.type).toBe('session-created');
    expect(event.sessionId).toBe(session.id);
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.session).toBe(session);
  });

  test('SessionUpdatedEvent should have correct type and properties', () => {
    const updates = {
      isActive: false,
      config: { temperature: 0.7 },
    };

    const event = new SessionUpdatedEvent('session-id', updates);

    expect(event.type).toBe('session-updated');
    expect(event.sessionId).toBe('session-id');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.updates).toBe(updates);
  });

  test('SessionDeletedEvent should have correct type and properties', () => {
    const event = new SessionDeletedEvent('session-id');

    expect(event.type).toBe('session-deleted');
    expect(event.sessionId).toBe('session-id');
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  test('MessageAddedEvent should have correct type and properties', () => {
    const message = SessionFactory.createUserMessage('Hello');
    const event = new MessageAddedEvent('session-id', message);

    expect(event.type).toBe('message-added');
    expect(event.sessionId).toBe('session-id');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.message).toBe(message);
  });

  test('MessageUpdatedEvent should have correct type and properties', () => {
    const updates = {
      metadata: { edited: true },
    };

    const event = new MessageUpdatedEvent('session-id', 'message-id', updates);

    expect(event.type).toBe('message-updated');
    expect(event.sessionId).toBe('session-id');
    expect(event.messageId).toBe('message-id');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.updates).toBe(updates);
  });

  test('TokenMetricsUpdatedEvent should have correct type and properties', () => {
    const metrics = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.002,
      contextUtilization: 0.5,
      maxContextWindow: 8192,
    };

    const event = new TokenMetricsUpdatedEvent('session-id', metrics);

    expect(event.type).toBe('token-metrics-updated');
    expect(event.sessionId).toBe('session-id');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.metrics).toBe(metrics);
  });

  test('SessionConfigUpdatedEvent should have correct type and properties', () => {
    const config = {
      temperature: 0.8,
      maxTokens: 1000,
    };

    const event = new SessionConfigUpdatedEvent('session-id', config);

    expect(event.type).toBe('session-config-updated');
    expect(event.sessionId).toBe('session-id');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.config).toBe(config);
  });

  test('ContextWindowCriticalEvent should have correct type and properties', () => {
    const event = new ContextWindowCriticalEvent('session-id', 0.9, 8192);

    expect(event.type).toBe('context-window-critical');
    expect(event.sessionId).toBe('session-id');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.utilization).toBe(0.9);
    expect(event.maxContextWindow).toBe(8192);
  });
});
```

### Step 4: Define Session Commands

**File: `src/llm/session/commands/session-commands.ts`**

```typescript
import { Command } from '../../infrastructure/types';
import { SessionConfig, ChatMessage } from '../models/types';

/**
 * Command to create a new session
 */
export class CreateSessionCommand implements Command {
  type = 'create-session';

  /**
   * Session configuration
   */
  config: SessionConfig;

  constructor(config: SessionConfig) {
    this.config = config;
  }
}

/**
 * Command to get a session by ID
 */
export class GetSessionCommand implements Command {
  type = 'get-session';

  /**
   * Session ID
   */
  sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }
}

/**
 * Command to update a session
 */
export class UpdateSessionCommand implements Command {
  type = 'update-session';

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Fields to update
   */
  updates: Partial<Session>;

  constructor(sessionId: string, updates: Partial<Session>) {
    this.sessionId = sessionId;
    this.updates = updates;
  }
}

/**
 * Command to delete a session
 */
export class DeleteSessionCommand implements Command {
  type = 'delete-session';

  /**
   * Session ID
   */
  sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }
}

/**
 * Command to add a message to a session
 */
export class AddMessageCommand implements Command {
  type = 'add-message';

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Message to add
   */
  message: ChatMessage;

  constructor(sessionId: string, message: ChatMessage) {
    this.sessionId = sessionId;
    this.message = message;
  }
}

/**
 * Command to update a message in a session
 */
export class UpdateMessageCommand implements Command {
  type = 'update-message';

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Message ID
   */
  messageId: string;

  /**
   * Fields to update
   */
  updates: Partial<ChatMessage>;

  constructor(
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>
  ) {
    this.sessionId = sessionId;
    this.messageId = messageId;
    this.updates = updates;
  }
}

/**
 * Command to list all sessions
 */
export class ListSessionsCommand implements Command {
  type = 'list-sessions';
}

/**
 * Command to update session token metrics
 */
export class UpdateTokenMetricsCommand implements Command {
  type = 'update-token-metrics';

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Prompt tokens to add
   */
  promptTokens?: number;

  /**
   * Completion tokens to add
   */
  completionTokens?: number;

  constructor(
    sessionId: string,
    promptTokens?: number,
    completionTokens?: number
  ) {
    this.sessionId = sessionId;
    this.promptTokens = promptTokens;
    this.completionTokens = completionTokens;
  }
}
```

#### Test: `src/llm/session/commands/session-commands.test.ts`

```typescript
import {
  CreateSessionCommand,
  GetSessionCommand,
  UpdateSessionCommand,
  DeleteSessionCommand,
  AddMessageCommand,
  UpdateMessageCommand,
  ListSessionsCommand,
  UpdateTokenMetricsCommand,
} from './session-commands';
import { SessionFactory } from '../models/session-factory';

describe('Session Commands', () => {
  test('CreateSessionCommand should have correct type and properties', () => {
    const config = { provider: 'openai', model: 'gpt-4' };
    const command = new CreateSessionCommand(config);

    expect(command.type).toBe('create-session');
    expect(command.config).toBe(config);
  });

  test('GetSessionCommand should have correct type and properties', () => {
    const command = new GetSessionCommand('session-id');

    expect(command.type).toBe('get-session');
    expect(command.sessionId).toBe('session-id');
  });

  test('UpdateSessionCommand should have correct type and properties', () => {
    const updates = {
      isActive: false,
      config: { temperature: 0.7 },
    };

    const command = new UpdateSessionCommand('session-id', updates);

    expect(command.type).toBe('update-session');
    expect(command.sessionId).toBe('session-id');
    expect(command.updates).toBe(updates);
  });

  test('DeleteSessionCommand should have correct type and properties', () => {
    const command = new DeleteSessionCommand('session-id');

    expect(command.type).toBe('delete-session');
    expect(command.sessionId).toBe('session-id');
  });

  test('AddMessageCommand should have correct type and properties', () => {
    const message = SessionFactory.createUserMessage('Hello');
    const command = new AddMessageCommand('session-id', message);

    expect(command.type).toBe('add-message');
    expect(command.sessionId).toBe('session-id');
    expect(command.message).toBe(message);
  });

  test('UpdateMessageCommand should have correct type and properties', () => {
    const updates = {
      metadata: { edited: true },
    };

    const command = new UpdateMessageCommand(
      'session-id',
      'message-id',
      updates
    );

    expect(command.type).toBe('update-message');
    expect(command.sessionId).toBe('session-id');
    expect(command.messageId).toBe('message-id');
    expect(command.updates).toBe(updates);
  });

  test('ListSessionsCommand should have correct type', () => {
    const command = new ListSessionsCommand();

    expect(command.type).toBe('list-sessions');
  });

  test('UpdateTokenMetricsCommand should have correct type and properties', () => {
    const command = new UpdateTokenMetricsCommand('session-id', 100, 50);

    expect(command.type).toBe('update-token-metrics');
    expect(command.sessionId).toBe('session-id');
    expect(command.promptTokens).toBe(100);
    expect(command.completionTokens).toBe(50);
  });

  test('UpdateTokenMetricsCommand can be created with partial token metrics', () => {
    const command1 = new UpdateTokenMetricsCommand('session-id', 100);
    const command2 = new UpdateTokenMetricsCommand('session-id', undefined, 50);
    const command3 = new UpdateTokenMetricsCommand('session-id');

    expect(command1.promptTokens).toBe(100);
    expect(command1.completionTokens).toBeUndefined();

    expect(command2.promptTokens).toBeUndefined();
    expect(command2.completionTokens).toBe(50);

    expect(command3.promptTokens).toBeUndefined();
    expect(command3.completionTokens).toBeUndefined();
  });
});
```

### Step 5: Implement Session Command Handlers

**File: `src/llm/session/handlers/session-command-handlers.ts`**

```typescript
import { CommandHandler, CommandResult } from '../../infrastructure/types';
import { SessionRepository } from '../repository/session-repository';
import { EventBus } from '../../infrastructure/event-bus';
import { SessionFactory } from '../models/session-factory';
import {
  CreateSessionCommand,
  GetSessionCommand,
  UpdateSessionCommand,
  DeleteSessionCommand,
  AddMessageCommand,
  UpdateMessageCommand,
  ListSessionsCommand,
  UpdateTokenMetricsCommand,
} from '../commands/session-commands';
import {
  SessionCreatedEvent,
  SessionUpdatedEvent,
  SessionDeletedEvent,
  MessageAddedEvent,
  MessageUpdatedEvent,
  TokenMetricsUpdatedEvent,
  ContextWindowCriticalEvent,
} from '../events/session-events';
import { Session, SessionInfo } from '../models/types';

/**
 * Handler for CreateSessionCommand
 */
export class CreateSessionHandler
  implements CommandHandler<CreateSessionCommand, Session>
{
  constructor(
    private readonly repository: SessionRepository,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: CreateSessionCommand): Promise<CommandResult<Session>> {
    try {
      // Create a new session
      const session = SessionFactory.createSession(command.config);

      // Store in repository
      const createdSession = await this.repository.createSession(session);

      // Publish event
      this.eventBus.publish(new SessionCreatedEvent(createdSession));

      return {
        success: true,
        data: createdSession,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for GetSessionCommand
 */
export class GetSessionHandler
  implements CommandHandler<GetSessionCommand, Session | null>
{
  constructor(private readonly repository: SessionRepository) {}

  async handle(
    command: GetSessionCommand
  ): Promise<CommandResult<Session | null>> {
    try {
      const session = await this.repository.getSession(command.sessionId);

      return {
        success: true,
        data: session,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for UpdateSessionCommand
 */
export class UpdateSessionHandler
  implements CommandHandler<UpdateSessionCommand, Session>
{
  constructor(
    private readonly repository: SessionRepository,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: UpdateSessionCommand): Promise<CommandResult<Session>> {
    try {
      const session = await this.repository.updateSession(
        command.sessionId,
        command.updates
      );

      // Publish event
      this.eventBus.publish(
        new SessionUpdatedEvent(command.sessionId, command.updates)
      );

      return {
        success: true,
        data: session,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for DeleteSessionCommand
 */
export class DeleteSessionHandler
  implements CommandHandler<DeleteSessionCommand, boolean>
{
  constructor(
    private readonly repository: SessionRepository,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: DeleteSessionCommand): Promise<CommandResult<boolean>> {
    try {
      const success = await this.repository.deleteSession(command.sessionId);

      // Only publish event if session was actually deleted
      if (success) {
        this.eventBus.publish(new SessionDeletedEvent(command.sessionId));
      }

      return {
        success: true,
        data: success,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for AddMessageCommand
 */
export class AddMessageHandler
  implements CommandHandler<AddMessageCommand, Session>
{
  constructor(
    private readonly repository: SessionRepository,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: AddMessageCommand): Promise<CommandResult<Session>> {
    try {
      const session = await this.repository.addMessage(
        command.sessionId,
        command.message
      );

      // Publish event
      this.eventBus.publish(
        new MessageAddedEvent(command.sessionId, command.message)
      );

      return {
        success: true,
        data: session,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for UpdateMessageCommand
 */
export class UpdateMessageHandler
  implements CommandHandler<UpdateMessageCommand, Session>
{
  constructor(
    private readonly repository: SessionRepository,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: UpdateMessageCommand): Promise<CommandResult<Session>> {
    try {
      const session = await this.repository.updateMessage(
        command.sessionId,
        command.messageId,
        command.updates
      );

      // Publish event
      this.eventBus.publish(
        new MessageUpdatedEvent(
          command.sessionId,
          command.messageId,
          command.updates
        )
      );

      return {
        success: true,
        data: session,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for ListSessionsCommand
 */
export class ListSessionsHandler
  implements CommandHandler<ListSessionsCommand, SessionInfo[]>
{
  constructor(private readonly repository: SessionRepository) {}

  async handle(): Promise<CommandResult<SessionInfo[]>> {
    try {
      const sessions = await this.repository.listSessions();

      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for UpdateTokenMetricsCommand
 */
export class UpdateTokenMetricsHandler
  implements CommandHandler<UpdateTokenMetricsCommand, Session>
{
  constructor(
    private readonly repository: SessionRepository,
    private readonly eventBus: EventBus
  ) {}

  async handle(
    command: UpdateTokenMetricsCommand
  ): Promise<CommandResult<Session>> {
    try {
      // Get current session
      const session = await this.repository.getSession(command.sessionId);

      if (!session) {
        return {
          success: false,
          error: `Session not found with ID: ${command.sessionId}`,
        };
      }

      // Update token metrics
      const metrics = { ...session.metrics };

      if (command.promptTokens) {
        metrics.promptTokens += command.promptTokens;
        metrics.totalTokens += command.promptTokens;
      }

      if (command.completionTokens) {
        metrics.completionTokens += command.completionTokens;
        metrics.totalTokens += command.completionTokens;
      }

      // Calculate context utilization
      metrics.contextUtilization =
        metrics.totalTokens / metrics.maxContextWindow;

      // Update cost (simplified - in a real implementation this would use a cost calculator)
      metrics.estimatedCost = calculateCost(
        metrics.promptTokens,
        metrics.completionTokens,
        session.config.model
      );

      // Update session
      const updatedSession = await this.repository.updateSession(
        command.sessionId,
        {
          metrics,
        }
      );

      // Publish token metrics updated event
      this.eventBus.publish(
        new TokenMetricsUpdatedEvent(command.sessionId, metrics)
      );

      // Check if context window is critical (> 80% utilized)
      if (metrics.contextUtilization > 0.8) {
        this.eventBus.publish(
          new ContextWindowCriticalEvent(
            command.sessionId,
            metrics.contextUtilization,
            metrics.maxContextWindow
          )
        );
      }

      return {
        success: true,
        data: updatedSession,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Calculate estimated cost in USD
 * This is a simplified implementation that should be replaced with a proper cost calculator
 */
function calculateCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): number {
  let promptRate = 0.0;
  let completionRate = 0.0;

  // Rate per 1000 tokens
  if (model.includes('gpt-4-turbo')) {
    promptRate = 0.01;
    completionRate = 0.03;
  } else if (model.includes('gpt-4')) {
    promptRate = 0.03;
    completionRate = 0.06;
  } else if (model.includes('gpt-3.5-turbo')) {
    promptRate = 0.001;
    completionRate = 0.002;
  } else if (model.includes('claude-3-opus')) {
    promptRate = 0.015;
    completionRate = 0.075;
  } else if (model.includes('claude-3-sonnet')) {
    promptRate = 0.003;
    completionRate = 0.015;
  } else if (model.includes('claude-3-haiku')) {
    promptRate = 0.00025;
    completionRate = 0.00125;
  }

  const promptCost = (promptTokens / 1000) * promptRate;
  const completionCost = (completionTokens / 1000) * completionRate;

  return promptCost + completionCost;
}
```

### Step 6: Register Command Handlers and Repository

**File: `src/llm/session/index.ts`**

```typescript
import { DI_KEYS, InMemoryContainer } from '../infrastructure/container';
import { CommandBus } from '../infrastructure/command-bus';
import { EventBus } from '../infrastructure/event-bus';
import { InMemorySessionRepository } from './repository/session-repository';
import {
  CreateSessionCommand,
  GetSessionCommand,
  UpdateSessionCommand,
  DeleteSessionCommand,
  AddMessageCommand,
  UpdateMessageCommand,
  ListSessionsCommand,
  UpdateTokenMetricsCommand,
} from './commands/session-commands';
import {
  CreateSessionHandler,
  GetSessionHandler,
  UpdateSessionHandler,
  DeleteSessionHandler,
  AddMessageHandler,
  UpdateMessageHandler,
  ListSessionsHandler,
  UpdateTokenMetricsHandler,
} from './handlers/session-command-handlers';

/**
 * Initialize the session state management components and register command handlers
 */
export function initializeSessionState(): void {
  const container = InMemoryContainer.getInstance();

  // Get infrastructure components from container
  const commandBus = container.get<CommandBus>(DI_KEYS.COMMAND_BUS);
  const eventBus = container.get<EventBus>(DI_KEYS.EVENT_BUS);

  // Create and register session repository
  const sessionRepository = new InMemorySessionRepository();
  container.register(DI_KEYS.SESSION_REPOSITORY, sessionRepository);

  // Create and register command handlers
  const createSessionHandler = new CreateSessionHandler(
    sessionRepository,
    eventBus
  );
  const getSessionHandler = new GetSessionHandler(sessionRepository);
  const updateSessionHandler = new UpdateSessionHandler(
    sessionRepository,
    eventBus
  );
  const deleteSessionHandler = new DeleteSessionHandler(
    sessionRepository,
    eventBus
  );
  const addMessageHandler = new AddMessageHandler(sessionRepository, eventBus);
  const updateMessageHandler = new UpdateMessageHandler(
    sessionRepository,
    eventBus
  );
  const listSessionsHandler = new ListSessionsHandler(sessionRepository);
  const updateTokenMetricsHandler = new UpdateTokenMetricsHandler(
    sessionRepository,
    eventBus
  );

  // Register handlers with command bus
  commandBus.registerHandler(CreateSessionCommand, createSessionHandler);
  commandBus.registerHandler(GetSessionCommand, getSessionHandler);
  commandBus.registerHandler(UpdateSessionCommand, updateSessionHandler);
  commandBus.registerHandler(DeleteSessionCommand, deleteSessionHandler);
  commandBus.registerHandler(AddMessageCommand, addMessageHandler);
  commandBus.registerHandler(UpdateMessageCommand, updateMessageHandler);
  commandBus.registerHandler(ListSessionsCommand, listSessionsHandler);
  commandBus.registerHandler(
    UpdateTokenMetricsCommand,
    updateTokenMetricsHandler
  );
}

// Export everything from the session module
export * from './models/types';
export * from './models/session-factory';
export * from './repository/session-repository';
export * from './events/session-events';
export * from './commands/session-commands';
export * from './handlers/session-command-handlers';
```

#### Test: `src/llm/session/index.test.ts`

```typescript
import { initializeSessionState } from './index';
import { InMemoryContainer, DI_KEYS } from '../infrastructure/container';
import { CommandBus } from '../infrastructure/command-bus';
import { initializeInfrastructure } from '../infrastructure';
import {
  CreateSessionCommand,
  GetSessionCommand,
} from './commands/session-commands';
import { SessionRepository } from './repository/session-repository';

describe('Session Module Initialization', () => {
  beforeEach(() => {
    // Reset the container for each test
    (InMemoryContainer as any).instance = undefined;

    // Initialize infrastructure components
    initializeInfrastructure();
  });

  test('initializeSessionState should register all components', () => {
    initializeSessionState();

    const container = InMemoryContainer.getInstance();
    const commandBus = container.get<CommandBus>(DI_KEYS.COMMAND_BUS);

    // Check if repository is registered
    expect(container.has(DI_KEYS.SESSION_REPOSITORY)).toBe(true);
    expect(
      container.get<SessionRepository>(DI_KEYS.SESSION_REPOSITORY)
    ).toBeDefined();

    // Create a dummy command to test if handler is registered
    const createSessionCommand = new CreateSessionCommand({
      provider: 'test',
      model: 'test-model',
    });

    const getSessionCommand = new GetSessionCommand('test-id');

    // If handler is not registered, this would throw an error
    // We don't care about the result, just that it doesn't throw
    expect(async () => {
      await commandBus.dispatch(createSessionCommand);
      await commandBus.dispatch(getSessionCommand);
    }).not.toThrow();
  });
});
```

### Step 7: Create Usage Example

**File: `src/llm/session/demo.ts`**

```typescript
import { initializeInfrastructure } from '../infrastructure';
import { initializeSessionState } from './index';
import { InMemoryContainer, DI_KEYS } from '../infrastructure/container';
import { CommandBus } from '../infrastructure/command-bus';
import { EventBus } from '../infrastructure/event-bus';
import {
  CreateSessionCommand,
  AddMessageCommand,
  UpdateTokenMetricsCommand,
  ListSessionsCommand,
} from './commands/session-commands';
import {
  SessionCreatedEvent,
  MessageAddedEvent,
  TokenMetricsUpdatedEvent,
  ContextWindowCriticalEvent,
} from './events/session-events';
import { SessionFactory } from './models/session-factory';
import { ChatMessageRole } from './models/types';

/**
 * Demo usage of session state management
 */
async function runDemo(): Promise<void> {
  // Initialize infrastructure and session state
  initializeInfrastructure();
  initializeSessionState();

  // Get container and buses
  const container = InMemoryContainer.getInstance();
  const commandBus = container.get<CommandBus>(DI_KEYS.COMMAND_BUS);
  const eventBus = container.get<EventBus>(DI_KEYS.EVENT_BUS);

  // Setup event listeners
  const eventLog: any[] = [];

  const subscriptions = [
    eventBus.subscribe(SessionCreatedEvent, {
      handle: event => {
        console.log(`[Event] Session created: ${event.session.id}`);
        eventLog.push(event);
      },
    }),

    eventBus.subscribe(MessageAddedEvent, {
      handle: event => {
        console.log(`[Event] Message added: ${event.message.role}`);
        eventLog.push(event);
      },
    }),

    eventBus.subscribe(TokenMetricsUpdatedEvent, {
      handle: event => {
        console.log(
          `[Event] Token metrics updated: ${event.metrics.totalTokens} tokens total`
        );
        eventLog.push(event);
      },
    }),

    eventBus.subscribe(ContextWindowCriticalEvent, {
      handle: event => {
        console.log(
          `[Event] Context window critical: ${Math.round(
            event.utilization * 100
          )}% full`
        );
        eventLog.push(event);
      },
    }),
  ];

  try {
    // Create a session
    console.log('Creating session...');
    const createSessionResult = await commandBus.dispatch(
      new CreateSessionCommand({
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: 'You are a helpful assistant.',
      })
    );

    if (!createSessionResult.success || !createSessionResult.data) {
      throw new Error(`Failed to create session: ${createSessionResult.error}`);
    }

    const session = createSessionResult.data;
    console.log(`Session created with ID: ${session.id}`);

    // Add a user message
    console.log('Adding user message...');
    const userMessage = SessionFactory.createUserMessage(
      'Hello, can you help me with a coding question?'
    );

    const addUserMessageResult = await commandBus.dispatch(
      new AddMessageCommand(session.id, userMessage)
    );

    if (!addUserMessageResult.success) {
      throw new Error(
        `Failed to add user message: ${addUserMessageResult.error}`
      );
    }

    // Add an assistant message
    console.log('Adding assistant message...');
    const assistantMessage = SessionFactory.createAssistantMessage(
      "Of course! I'd be happy to help with your coding question. What would you like to know?"
    );

    const addAssistantMessageResult = await commandBus.dispatch(
      new AddMessageCommand(session.id, assistantMessage)
    );

    if (!addAssistantMessageResult.success) {
      throw new Error(
        `Failed to add assistant message: ${addAssistantMessageResult.error}`
      );
    }

    // Update token metrics
    console.log('Updating token metrics...');
    const updateMetricsResult = await commandBus.dispatch(
      new UpdateTokenMetricsCommand(session.id, 50, 80)
    );

    if (!updateMetricsResult.success) {
      throw new Error(
        `Failed to update token metrics: ${updateMetricsResult.error}`
      );
    }

    // Update token metrics again with large numbers to trigger critical event
    console.log('Updating token metrics to trigger critical event...');
    const criticalUpdateResult = await commandBus.dispatch(
      new UpdateTokenMetricsCommand(session.id, 7000, 0)
    );

    if (!criticalUpdateResult.success) {
      throw new Error(
        `Failed to update token metrics: ${criticalUpdateResult.error}`
      );
    }

    // List all sessions
    console.log('Listing sessions...');
    const listSessionsResult = await commandBus.dispatch(
      new ListSessionsCommand()
    );

    if (!listSessionsResult.success || !listSessionsResult.data) {
      throw new Error(`Failed to list sessions: ${listSessionsResult.error}`);
    }

    console.log(`Found ${listSessionsResult.data.length} sessions`);
    console.log(JSON.stringify(listSessionsResult.data, null, 2));

    // Print summary of events received
    console.log('\nEvent Summary:');
    console.log(`Total events: ${eventLog.length}`);
    const eventTypes = eventLog.reduce((acc, event) => {
      const type = event.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('Event counts by type:');
    for (const [type, count] of Object.entries(eventTypes)) {
      console.log(`  ${type}: ${count}`);
    }
  } catch (error) {
    console.error('Error in demo:', error);
  } finally {
    // Unsubscribe from events
    subscriptions.forEach(subscription => subscription.unsubscribe());
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}
```

## Integration with Existing Code

The following steps outline how to integrate the Session State Management with the existing codebase:

### 1. Update or Create Required Directories

```bash
mkdir -p src/llm/session/models
mkdir -p src/llm/session/repository
mkdir -p src/llm/session/events
mkdir -p src/llm/session/commands
mkdir -p src/llm/session/handlers
```

### 2. Copy Implementation Files

Create all the TypeScript files described in this document and their corresponding test files.

### 3. Add Initialization to Application Startup

In the main application startup code, add initialization for infrastructure and session state:

```typescript
import { initializeInfrastructure } from './llm/infrastructure';
import { initializeSessionState } from './llm/session';

// Initialize components
initializeInfrastructure();
initializeSessionState();
```

### 4. Gradual Migration from Existing Session Manager

Gradually update the existing SessionManager to use the new session state management:

1. First, make the SessionManager use the SessionRepository for storing and retrieving sessions
2. Then, update message handling to use commands instead of direct method calls
3. Finally, replace direct token updates with UpdateTokenMetricsCommand

This approach allows for incremental migration without breaking existing functionality.

## Testing Plan

1. **Unit Tests**: Test each component in isolation

   - Session entity models
   - Session repository implementation
   - Command handlers
   - Event definitions

2. **Integration Tests**: Test components working together

   - Commands dispatch and event publication
   - Repository updates and event handling
   - Complete flows (create session -> add messages -> update metrics)

3. **End-to-End Tests**: Test integration with other domains
   - SessionManager using the new components
   - Cross-domain interactions

## Success Criteria

The Session State Management implementation will be considered successful when:

- ✅ All unit tests pass with high coverage
- ✅ Repository correctly stores and retrieves session data
- ✅ Commands execute their intended operations
- ✅ Events are published for state changes
- ✅ The demo application runs successfully
- ✅ Existing functionality is preserved during migration

## Next Steps

After implementing the Session State Management, proceed to the Provider Domain implementation as defined in the master implementation plan. The Session State Repository will be a foundation for the Provider Domain to store and retrieve provider-specific data.

The Provider Domain will use the Command Bus to issue operation requests and the Event Bus to publish state changes, creating a clean separation between domains while maintaining communication channels.
