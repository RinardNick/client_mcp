# Message Routing Domain Implementation

This document provides a detailed implementation plan for the Message Routing Domain components, which will be responsible for managing the flow of messages between users, LLM providers, and tools within the system.

## Overview

The Message Routing Domain handles the flow of messages within the LLM application. It orchestrates conversations by routing messages from users to appropriate providers, handling tool calls from providers, and returning responses back to users. It serves as a central coordinator that connects the User Interface, Provider Domain, Tool Domain, and Session Domain.

### Components

The Message Routing Domain consists of the following core components:

1. **Message Router**: The central component that orchestrates message flow
2. **Message Processor**: Processes messages based on their type and content
3. **Tool Call Router**: Routes tool calls to the Tool Domain for execution
4. **Response Assembler**: Assembles responses from providers and tool results
5. **Message Queue**: Manages asynchronous processing of messages
6. **Commands and Events**: Domain-specific commands and events for message operations

### Key Responsibilities

- **Message Orchestration**: Route messages to appropriate destinations
- **Tool Call Management**: Detect, route, and handle tool calls from providers
- **Streaming Support**: Handle streaming responses from providers
- **Response Assembly**: Combine results from tools and providers into cohesive responses
- **Error Handling**: Manage provider errors and tool execution failures
- **Message Persistence**: Coordinate with Session Domain to store messages
- **Context Management**: Provide appropriate context to providers for each message

## Architecture

The Message Routing Domain follows a mediator pattern, acting as a central coordinator between the various domains:

```
┌─────────────────┐     Messages     ┌─────────────────┐
│   User/Client   │◄───────────────►│  Message Router  │
└─────────────────┘                  └───────┬─────────┘
                                            │
                                            ▼
                     ┌─────────────────────┬─────────────────────┐
                     │                     │                     │
              ┌──────▼──────┐      ┌──────▼──────┐      ┌───────▼─────┐
              │   Provider   │      │     Tool    │      │   Session   │
              │    Domain    │      │    Domain   │      │    Domain   │
              └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
                     │                     │                    │
                     └─────────────────────┼────────────────────┘
                                          ┌▼┐
                                          └─┘ Event Bus
```

The Message Router orchestrates conversations by:

1. Receiving messages from users
2. Retrieving conversation history from the Session Domain
3. Sending messages to appropriate LLM providers via the Provider Domain
4. Detecting and routing tool calls to the Tool Domain
5. Assembling final responses from providers and tool results
6. Storing messages and results in the Session Domain

## Implementation Approach

The implementation will follow these principles:

1. **Event-Driven Communication**: Use events to communicate between domains
2. **Command-Query Responsibility Segregation (CQRS)**: Separate read and write operations
3. **Asynchronous Processing**: Handle message flows asynchronously
4. **Streaming Support**: Provide first-class support for streaming responses
5. **Error Resilience**: Gracefully handle failures in any part of the message flow

We'll implement the domain gradually, starting with core components and then adding more sophisticated features:

1. Define core interfaces and models
2. Implement the message router for basic message handling
3. Add tool call detection and routing
4. Implement streaming response handling
5. Add advanced features like message queue for asynchronous processing
6. Implement the response assembler for combining results

## Integration with Other Domains

The Message Routing Domain will integrate closely with:

- **Provider Domain**: To send messages to LLM providers and receive responses
- **Tool Domain**: To execute tool calls and receive tool results
- **Session Domain**: To store and retrieve conversation history
- **Context Domain**: To manage context for messages

Now, let's outline the implementation details for each component.

## Implementation Steps

### Step 1: Define Core Interfaces and Models

First, we'll define the core interfaces and models that will be used throughout the Message Routing Domain.

**File: `src/llm/message-routing/models/routing-types.ts`**

```typescript
/**
 * Types of message routing operations
 */
export enum RoutingOperationType {
  SEND_MESSAGE = 'send-message',
  STREAM_MESSAGE = 'stream-message',
  EXECUTE_TOOL = 'execute-tool',
  ABORT_OPERATION = 'abort-operation',
}

/**
 * Status of a message routing operation
 */
export enum RoutingOperationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

/**
 * Type of message stream status
 */
export enum MessageStreamStatus {
  STARTING = 'starting',
  STREAMING = 'streaming',
  TOOL_EXECUTING = 'tool-executing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

/**
 * Priority levels for message operations
 */
export enum OperationPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Message routing operation options
 */
export interface RoutingOptions {
  priority?: OperationPriority;
  timeout?: number;
  abortSignal?: AbortSignal;
  streamHandlers?: MessageStreamHandlers;
  retryStrategy?: RetryStrategy;
  contextOptions?: ContextOptions;
}

/**
 * Context options for message routing
 */
export interface ContextOptions {
  includeHistory?: boolean;
  historyLimit?: number;
  includeTools?: boolean;
  systemPrompt?: string;
  retrievalOptions?: {
    retrievalType: 'semantic' | 'keyword' | 'hybrid';
    maxChunks?: number;
    similarityThreshold?: number;
    retrievalDepth?: 'shallow' | 'medium' | 'deep';
  };
}

/**
 * Handlers for message streaming
 */
export interface MessageStreamHandlers {
  onStart?: () => void;
  onMessage?: (chunk: any) => void;
  onToolCall?: (toolCall: any) => void;
  onToolResult?: (toolResult: any) => void;
  onComplete?: (result: any) => void;
  onError?: (error: any) => void;
}

/**
 * Retry strategy for failed operations
 */
export interface RetryStrategy {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryableErrors?: string[];
}

/**
 * Represents a message routing operation
 */
export interface RoutingOperation {
  id: string;
  sessionId: string;
  type: RoutingOperationType;
  status: RoutingOperationStatus;
  payload: any;
  result?: any;
  error?: any;
  options?: RoutingOptions;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  priority: OperationPriority;
}

/**
 * Message routing operation observer
 */
export interface RoutingOperationObserver {
  onOperationStatusChanged(operation: RoutingOperation): void;
  onOperationCompleted(operation: RoutingOperation): void;
  onOperationFailed(operation: RoutingOperation, error: any): void;
}
```

**File: `src/llm/message-routing/models/router-interfaces.ts`**

```typescript
import {
  RoutingOperation,
  RoutingOptions,
  MessageStreamHandlers,
} from './routing-types';
import { SessionMessage, ChatMessage } from '../../session/models/types';
import { ToolCallStatus } from '../../tool/models/tool-call';

/**
 * Interface for message router
 */
export interface MessageRouter {
  /**
   * Send a message to a provider
   * @param sessionId Session ID
   * @param message Message to send
   * @param options Routing options
   * @returns Promise resolving to routing operation
   */
  sendMessage(
    sessionId: string,
    message: ChatMessage,
    options?: RoutingOptions
  ): Promise<RoutingOperation>;

  /**
   * Stream a message from a provider
   * @param sessionId Session ID
   * @param message Message to send
   * @param streamHandlers Stream handlers
   * @param options Routing options
   * @returns Promise resolving to routing operation
   */
  streamMessage(
    sessionId: string,
    message: ChatMessage,
    streamHandlers: MessageStreamHandlers,
    options?: RoutingOptions
  ): Promise<RoutingOperation>;

  /**
   * Abort an in-progress operation
   * @param operationId Operation ID to abort
   * @returns Promise resolving to true if aborted successfully
   */
  abortOperation(operationId: string): Promise<boolean>;

  /**
   * Get routing operation by ID
   * @param operationId Operation ID
   * @returns Routing operation or undefined if not found
   */
  getOperation(operationId: string): RoutingOperation | undefined;

  /**
   * Register a routing operation observer
   * @param observer Observer to register
   * @returns Function to unregister the observer
   */
  registerObserver(observer: RoutingOperationObserver): () => void;
}

/**
 * Interface for message processor
 */
export interface MessageProcessor {
  /**
   * Process a message
   * @param sessionId Session ID
   * @param message Message to process
   * @param options Processing options
   * @returns Promise resolving to processed message
   */
  processMessage(
    sessionId: string,
    message: ChatMessage,
    options?: ProcessingOptions
  ): Promise<ProcessedMessage>;

  /**
   * Process a message stream
   * @param sessionId Session ID
   * @param message Message to process
   * @param handlers Stream handlers
   * @param options Processing options
   * @returns Promise resolving when stream completes
   */
  processMessageStream(
    sessionId: string,
    message: ChatMessage,
    handlers: MessageStreamHandlers,
    options?: ProcessingOptions
  ): Promise<void>;
}

/**
 * Interface for tool call router
 */
export interface ToolCallRouter {
  /**
   * Route a tool call for execution
   * @param sessionId Session ID
   * @param toolCall Tool call to route
   * @param options Routing options
   * @returns Promise resolving to tool call result
   */
  routeToolCall(
    sessionId: string,
    toolCall: ToolCall,
    options?: RoutingOptions
  ): Promise<ToolCallResult>;

  /**
   * Get status of a tool call
   * @param toolCallId Tool call ID
   * @returns Tool call status or undefined if not found
   */
  getToolCallStatus(toolCallId: string): ToolCallStatus | undefined;
}

/**
 * Interface for response assembler
 */
export interface ResponseAssembler {
  /**
   * Assemble a response from provider response and tool results
   * @param sessionId Session ID
   * @param providerResponse Provider response
   * @param toolResults Tool results
   * @returns Assembled response
   */
  assembleResponse(
    sessionId: string,
    providerResponse: any,
    toolResults: ToolCallResult[]
  ): AssembledResponse;

  /**
   * Assemble a streaming response
   * @param sessionId Session ID
   * @param streamingResponse Streaming response
   * @param toolResults Tool results
   * @param options Assembly options
   * @returns Assembled streaming response
   */
  assembleStreamingResponse(
    sessionId: string,
    streamingResponse: AsyncIterable<any>,
    toolResults: Map<string, ToolCallResult>,
    options?: AssemblyOptions
  ): AsyncIterable<any>;
}

/**
 * Message processing options
 */
export interface ProcessingOptions {
  includeHistory?: boolean;
  historyLimit?: number;
  includeTools?: boolean | string[];
  systemPrompt?: string;
  providerOptions?: any;
}

/**
 * Processed message result
 */
export interface ProcessedMessage {
  originalMessage: ChatMessage;
  processedMessage: ChatMessage;
  response: ChatMessage;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
}

/**
 * Tool call structure
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  status: ToolCallStatus;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  result: any;
  error?: string;
  status: ToolCallStatus;
}

/**
 * Assembled response
 */
export interface AssembledResponse {
  message: ChatMessage;
  toolCalls: ToolCall[];
  toolResults: ToolCallResult[];
  metadata: any;
}

/**
 * Assembly options
 */
export interface AssemblyOptions {
  waitForToolResults?: boolean;
  maxWaitTime?: number;
  skipToolExecution?: boolean;
}
```

These core interfaces and models define the structure and behavior of the Message Routing Domain. They establish:

1. **Types and Statuses**: Enums for operation types, statuses, and priorities
2. **Options and Handlers**: Interfaces for configuration and event handling
3. **Core Components**: Interfaces for the router, processor, tool router, and assembler
4. **Data Structures**: Interfaces for operations, messages, tool calls, and results

The interfaces are designed to be flexible and extensible while providing clear contracts between components. They support both synchronous and streaming operations, as well as tool call routing and response assembly.

In the next step, we'll implement the Message Router component that orchestrates the flow of messages.

### Step 2: Implement Message Router

Next, we'll implement the Message Router component, which orchestrates the flow of messages between users, providers, and tools.

**File: `src/llm/message-routing/router/message-router.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../../infrastructure/event-bus';
import { CommandBus } from '../../infrastructure/command-bus';
import {
  MessageRouter,
  MessageProcessor,
  ToolCallRouter,
  ResponseAssembler,
} from '../models/router-interfaces';
import {
  RoutingOperation,
  RoutingOperationStatus,
  RoutingOperationType,
  RoutingOptions,
  MessageStreamHandlers,
  OperationPriority,
  RoutingOperationObserver,
} from '../models/routing-types';
import { ChatMessage } from '../../session/models/types';
import {
  SendMessageCommand,
  StreamMessageCommand,
} from '../../provider/commands/provider-commands';
import {
  ProviderResponseReceivedEvent,
  ProviderErrorEvent,
} from '../../provider/events/provider-events';
import {
  ToolExecutionStartedEvent,
  ToolExecutionCompletedEvent,
  ToolExecutionFailedEvent,
} from '../../tool/events/tool-events';
import { SessionRepository } from '../../session/repository/session-repository';

/**
 * Default implementation of the Message Router
 */
export class DefaultMessageRouter implements MessageRouter {
  private operations: Map<string, RoutingOperation> = new Map();
  private observers: Set<RoutingOperationObserver> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(
    private readonly eventBus: EventBus,
    private readonly commandBus: CommandBus,
    private readonly sessionRepository: SessionRepository,
    private readonly messageProcessor: MessageProcessor,
    private readonly toolCallRouter: ToolCallRouter,
    private readonly responseAssembler: ResponseAssembler
  ) {
    // Subscribe to relevant events
    this.subscribeToEvents();
  }

  async sendMessage(
    sessionId: string,
    message: ChatMessage,
    options?: RoutingOptions
  ): Promise<RoutingOperation> {
    // Create and store the operation
    const operation = this.createOperation(
      sessionId,
      RoutingOperationType.SEND_MESSAGE,
      message,
      options
    );

    // Create an abort controller for this operation
    const abortController = new AbortController();
    this.abortControllers.set(operation.id, abortController);

    // Process the operation asynchronously
    this.processOperation(operation).catch(error => {
      this.handleOperationError(operation.id, error);
    });

    return operation;
  }

  async streamMessage(
    sessionId: string,
    message: ChatMessage,
    streamHandlers: MessageStreamHandlers,
    options?: RoutingOptions
  ): Promise<RoutingOperation> {
    // Create and store the operation
    const operation = this.createOperation(
      sessionId,
      RoutingOperationType.STREAM_MESSAGE,
      message,
      { ...options, streamHandlers }
    );

    // Create an abort controller for this operation
    const abortController = new AbortController();
    this.abortControllers.set(operation.id, abortController);

    // Process the operation asynchronously
    this.processStreamOperation(operation).catch(error => {
      this.handleOperationError(operation.id, error);
    });

    return operation;
  }

  async abortOperation(operationId: string): Promise<boolean> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return false;
    }

    // Only abort if operation is pending or in progress
    if (
      operation.status !== RoutingOperationStatus.PENDING &&
      operation.status !== RoutingOperationStatus.IN_PROGRESS
    ) {
      return false;
    }

    // Get the abort controller
    const abortController = this.abortControllers.get(operationId);
    if (!abortController) {
      return false;
    }

    // Signal abort
    abortController.abort();

    // Update operation status
    this.updateOperationStatus(operationId, RoutingOperationStatus.ABORTED, {
      error: 'Operation aborted by user',
    });

    // Clean up
    this.abortControllers.delete(operationId);

    return true;
  }

  getOperation(operationId: string): RoutingOperation | undefined {
    return this.operations.get(operationId);
  }

  registerObserver(observer: RoutingOperationObserver): () => void {
    this.observers.add(observer);

    // Return a function to unregister the observer
    return () => {
      this.observers.delete(observer);
    };
  }

  /**
   * Create a new routing operation
   */
  private createOperation(
    sessionId: string,
    type: RoutingOperationType,
    payload: any,
    options?: RoutingOptions
  ): RoutingOperation {
    const operation: RoutingOperation = {
      id: uuidv4(),
      sessionId,
      type,
      status: RoutingOperationStatus.PENDING,
      payload,
      options,
      createdAt: new Date(),
      updatedAt: new Date(),
      priority: options?.priority || OperationPriority.NORMAL,
    };

    // Store the operation
    this.operations.set(operation.id, operation);

    return operation;
  }

  /**
   * Process a send message operation
   */
  private async processOperation(operation: RoutingOperation): Promise<void> {
    // Update operation status
    this.updateOperationStatus(
      operation.id,
      RoutingOperationStatus.IN_PROGRESS
    );

    try {
      // Get session info
      const session = await this.sessionRepository.getSession(
        operation.sessionId
      );
      if (!session) {
        throw new Error(`Session not found: ${operation.sessionId}`);
      }

      // Process the message
      const processed = await this.messageProcessor.processMessage(
        operation.sessionId,
        operation.payload,
        {
          includeHistory: operation.options?.contextOptions?.includeHistory,
          historyLimit: operation.options?.contextOptions?.historyLimit,
          includeTools: operation.options?.contextOptions?.includeTools,
          systemPrompt: operation.options?.contextOptions?.systemPrompt,
        }
      );

      // Store the user message in the session
      await this.sessionRepository.addMessage(
        operation.sessionId,
        operation.payload
      );

      // Send to provider
      const sendResult = await this.commandBus.execute(
        new SendMessageCommand(
          operation.sessionId,
          session.config.provider,
          processed.processedMessage,
          {
            model: session.config.model,
            abortSignal: this.abortControllers.get(operation.id)?.signal,
          }
        )
      );

      if (!sendResult.success) {
        throw new Error(
          sendResult.error || 'Failed to send message to provider'
        );
      }

      const providerResponse = sendResult.data;

      // Check for tool calls in the response
      const toolCalls = this.extractToolCalls(providerResponse);
      let toolResults = [];

      if (toolCalls && toolCalls.length > 0) {
        // Execute tool calls
        toolResults = await Promise.all(
          toolCalls.map(toolCall =>
            this.toolCallRouter.routeToolCall(
              operation.sessionId,
              toolCall,
              operation.options
            )
          )
        );

        // Combine provider response with tool results
        const assembledResponse = this.responseAssembler.assembleResponse(
          operation.sessionId,
          providerResponse,
          toolResults
        );

        // Store the assistant response in the session
        await this.sessionRepository.addMessage(
          operation.sessionId,
          assembledResponse.message
        );

        // Update operation with result
        this.updateOperationStatus(
          operation.id,
          RoutingOperationStatus.COMPLETED,
          {
            result: assembledResponse,
            completedAt: new Date(),
          }
        );
      } else {
        // No tool calls, just store and return the assistant response
        await this.sessionRepository.addMessage(
          operation.sessionId,
          providerResponse.message
        );

        // Update operation with result
        this.updateOperationStatus(
          operation.id,
          RoutingOperationStatus.COMPLETED,
          {
            result: providerResponse,
            completedAt: new Date(),
          }
        );
      }
    } catch (error) {
      this.handleOperationError(operation.id, error);
    }
  }

  /**
   * Process a stream message operation
   */
  private async processStreamOperation(
    operation: RoutingOperation
  ): Promise<void> {
    // Update operation status
    this.updateOperationStatus(
      operation.id,
      RoutingOperationStatus.IN_PROGRESS
    );

    try {
      // Get session info
      const session = await this.sessionRepository.getSession(
        operation.sessionId
      );
      if (!session) {
        throw new Error(`Session not found: ${operation.sessionId}`);
      }

      // Call onStart handler if provided
      operation.options?.streamHandlers?.onStart?.();

      // Process the message stream
      await this.messageProcessor.processMessageStream(
        operation.sessionId,
        operation.payload,
        operation.options?.streamHandlers || {},
        {
          includeHistory: operation.options?.contextOptions?.includeHistory,
          historyLimit: operation.options?.contextOptions?.historyLimit,
          includeTools: operation.options?.contextOptions?.includeTools,
          systemPrompt: operation.options?.contextOptions?.systemPrompt,
        }
      );

      // Update operation as completed
      this.updateOperationStatus(
        operation.id,
        RoutingOperationStatus.COMPLETED,
        {
          completedAt: new Date(),
        }
      );
    } catch (error) {
      this.handleOperationError(operation.id, error);
    }
  }

  /**
   * Update operation status and notify observers
   */
  private updateOperationStatus(
    operationId: string,
    status: RoutingOperationStatus,
    updates: Partial<RoutingOperation> = {}
  ): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return;
    }

    // Save previous status
    const previousStatus = operation.status;

    // Update operation
    operation.status = status;
    operation.updatedAt = new Date();

    // Apply additional updates
    Object.assign(operation, updates);

    // Store updated operation
    this.operations.set(operationId, operation);

    // Notify observers of status change
    if (previousStatus !== status) {
      this.notifyStatusChanged(operation);
    }

    // Notify observers of completion or failure
    if (status === RoutingOperationStatus.COMPLETED) {
      this.notifyOperationCompleted(operation);
    } else if (status === RoutingOperationStatus.FAILED) {
      this.notifyOperationFailed(operation, operation.error);
    }
  }

  /**
   * Handle operation error
   */
  private handleOperationError(operationId: string, error: any): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.updateOperationStatus(operationId, RoutingOperationStatus.FAILED, {
      error: errorMessage,
      completedAt: new Date(),
    });

    // Log the error
    console.error(`Message routing operation ${operationId} failed:`, error);

    // Clean up
    this.abortControllers.delete(operationId);
  }

  /**
   * Extract tool calls from a provider response
   */
  private extractToolCalls(providerResponse: any): any[] {
    // Check for tool calls in the response
    const message = providerResponse.message;

    if (!message || !message.content) {
      return [];
    }

    // Extract tool calls from message content
    const toolCalls = message.content
      .filter((content: any) => content.type === 'tool_call')
      .map((content: any) => ({
        id: content.toolCallId,
        name: content.name,
        arguments: content.arguments,
        status: 'pending', // Initial status
      }));

    return toolCalls;
  }

  /**
   * Subscribe to relevant events
   */
  private subscribeToEvents(): void {
    // Subscribe to provider response events
    this.eventBus.subscribe(
      ProviderResponseReceivedEvent.name,
      this.handleProviderResponse.bind(this)
    );

    // Subscribe to provider error events
    this.eventBus.subscribe(
      ProviderErrorEvent.name,
      this.handleProviderError.bind(this)
    );

    // Subscribe to tool execution events
    this.eventBus.subscribe(
      ToolExecutionStartedEvent.name,
      this.handleToolExecutionStarted.bind(this)
    );

    this.eventBus.subscribe(
      ToolExecutionCompletedEvent.name,
      this.handleToolExecutionCompleted.bind(this)
    );

    this.eventBus.subscribe(
      ToolExecutionFailedEvent.name,
      this.handleToolExecutionFailed.bind(this)
    );
  }

  /**
   * Handle provider response event
   */
  private handleProviderResponse(event: ProviderResponseReceivedEvent): void {
    // Look for operations associated with this session
    // This is a simplified implementation - in a real scenario we would
    // track which operation is associated with which provider call
  }

  /**
   * Handle provider error event
   */
  private handleProviderError(event: ProviderErrorEvent): void {
    // Similar to handleProviderResponse, but for errors
  }

  /**
   * Handle tool execution started event
   */
  private handleToolExecutionStarted(event: ToolExecutionStartedEvent): void {
    // Update relevant operations with tool execution status
  }

  /**
   * Handle tool execution completed event
   */
  private handleToolExecutionCompleted(
    event: ToolExecutionCompletedEvent
  ): void {
    // Update relevant operations with tool execution results
  }

  /**
   * Handle tool execution failed event
   */
  private handleToolExecutionFailed(event: ToolExecutionFailedEvent): void {
    // Update relevant operations with tool execution failures
  }

  /**
   * Notify observers of operation status change
   */
  private notifyStatusChanged(operation: RoutingOperation): void {
    for (const observer of this.observers) {
      try {
        observer.onOperationStatusChanged(operation);
      } catch (error) {
        console.error('Error notifying observer of status change:', error);
      }
    }
  }

  /**
   * Notify observers of operation completion
   */
  private notifyOperationCompleted(operation: RoutingOperation): void {
    for (const observer of this.observers) {
      try {
        observer.onOperationCompleted(operation);
      } catch (error) {
        console.error('Error notifying observer of completion:', error);
      }
    }
  }

  /**
   * Notify observers of operation failure
   */
  private notifyOperationFailed(operation: RoutingOperation, error: any): void {
    for (const observer of this.observers) {
      try {
        observer.onOperationFailed(operation, error);
      } catch (error) {
        console.error('Error notifying observer of failure:', error);
      }
    }
  }
}

/**
 * Global instance of the message router
 */
let globalMessageRouter: MessageRouter | null = null;

/**
 * Get the global message router
 */
export function getMessageRouter(): MessageRouter {
  if (!globalMessageRouter) {
    throw new Error(
      'Message router not initialized. Call initializeMessageRouter first.'
    );
  }
  return globalMessageRouter;
}

/**
 * Initialize the global message router
 * @param router Message router instance
 */
export function initializeMessageRouter(router: MessageRouter): void {
  globalMessageRouter = router;
}
```

The Message Router is responsible for:

1. **Operation Management**: Creating, tracking, and updating routing operations
2. **Message Processing**: Coordinating message processing and provider communication
3. **Tool Call Handling**: Detecting tool calls and routing them to the Tool Domain
4. **Response Assembly**: Combining tool results with provider responses
5. **Event Handling**: Responding to events from other domains
6. **Observer Pattern**: Notifying observers of operation statuses

The implementation uses dependency injection to receive the required components:

- `EventBus` for event-based communication
- `CommandBus` for sending commands to other domains
- `SessionRepository` for storing messages in sessions
- `MessageProcessor` for preprocessing messages
- `ToolCallRouter` for routing tool calls
- `ResponseAssembler` for assembling responses

The router supports both synchronous and streaming operations, with the ability to abort in-progress operations. It also provides a simple observer pattern for monitoring operation statuses.

In the next step, we'll implement the Message Processor component that prepares messages for providers.

### Step 3: Implement Message Processor

Next, we'll implement the Message Processor component, which prepares messages for LLM providers by adding context, history, and tools.

**File: `src/llm/message-routing/processor/message-processor.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../../infrastructure/event-bus';
import { CommandBus } from '../../infrastructure/command-bus';
import {
  MessageProcessor,
  ProcessingOptions,
  ProcessedMessage,
  ToolCall,
  ToolCallResult,
} from '../models/router-interfaces';
import { MessageStreamHandlers } from '../models/routing-types';
import {
  ChatMessage,
  ChatMessageRole,
  MessageContent,
  MessageContentType,
} from '../../session/models/types';
import { SessionRepository } from '../../session/repository/session-repository';
import { GetToolsForProviderCommand } from '../../tool/commands/tool-commands';
import {
  SendMessageCommand,
  StreamMessageCommand,
} from '../../provider/commands/provider-commands';
import { ToolCallRouter } from '../models/router-interfaces';
import { formatSystemPrompt } from '../../context/prompt-formatter';

/**
 * Default implementation of Message Processor
 */
export class DefaultMessageProcessor implements MessageProcessor {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
    private readonly sessionRepository: SessionRepository,
    private readonly toolCallRouter: ToolCallRouter
  ) {}

  async processMessage(
    sessionId: string,
    message: ChatMessage,
    options?: ProcessingOptions
  ): Promise<ProcessedMessage> {
    try {
      // Get session information
      const session = await this.sessionRepository.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Get conversation history if needed
      let historyMessages: ChatMessage[] = [];
      if (options?.includeHistory !== false) {
        historyMessages = await this.getConversationHistory(
          sessionId,
          options?.historyLimit || 10
        );
      }

      // Create system message if provided
      let systemMessage: ChatMessage | null = null;
      if (options?.systemPrompt) {
        systemMessage = this.createSystemMessage(options.systemPrompt);
      } else if (session.config.systemPrompt) {
        systemMessage = this.createSystemMessage(session.config.systemPrompt);
      }

      // Get tools if needed
      const tools = await this.getToolsForProvider(
        session.config.provider,
        options?.includeTools
      );

      // Build the full message array
      const processedMessages: ChatMessage[] = [];

      // Add system message if available
      if (systemMessage) {
        processedMessages.push(systemMessage);
      }

      // Add history messages
      processedMessages.push(...historyMessages);

      // Add the current message
      processedMessages.push(message);

      // Create processed message
      const processedMessage: ChatMessage = {
        ...message,
        id: message.id || uuidv4(),
      };

      // Send the message to the provider
      const providerOptions = {
        ...options?.providerOptions,
        model: session.config.model,
      };

      // Add tools if available
      if (tools && tools.length > 0) {
        providerOptions.tools = tools;
      }

      const result = await this.commandBus.execute(
        new SendMessageCommand(
          sessionId,
          session.config.provider,
          processedMessages,
          providerOptions
        )
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message to provider');
      }

      // Extract any tool calls from the response
      const toolCalls = this.extractToolCalls(result.data);

      // Execute tool calls if any
      const toolResults = await this.executeToolCalls(sessionId, toolCalls);

      return {
        originalMessage: message,
        processedMessage,
        response: result.data.message,
        toolCalls,
        toolResults,
      };
    } catch (error) {
      console.error('Failed to process message:', error);
      throw error;
    }
  }

  async processMessageStream(
    sessionId: string,
    message: ChatMessage,
    handlers: MessageStreamHandlers,
    options?: ProcessingOptions
  ): Promise<void> {
    try {
      // Get session information
      const session = await this.sessionRepository.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Get conversation history if needed
      let historyMessages: ChatMessage[] = [];
      if (options?.includeHistory !== false) {
        historyMessages = await this.getConversationHistory(
          sessionId,
          options?.historyLimit || 10
        );
      }

      // Create system message if provided
      let systemMessage: ChatMessage | null = null;
      if (options?.systemPrompt) {
        systemMessage = this.createSystemMessage(options.systemPrompt);
      } else if (session.config.systemPrompt) {
        systemMessage = this.createSystemMessage(session.config.systemPrompt);
      }

      // Get tools if needed
      const tools = await this.getToolsForProvider(
        session.config.provider,
        options?.includeTools
      );

      // Build the full message array
      const processedMessages: ChatMessage[] = [];

      // Add system message if available
      if (systemMessage) {
        processedMessages.push(systemMessage);
      }

      // Add history messages
      processedMessages.push(...historyMessages);

      // Add the current message
      processedMessages.push(message);

      // Create processed message
      const processedMessage: ChatMessage = {
        ...message,
        id: message.id || uuidv4(),
      };

      // Store the user message in the session
      await this.sessionRepository.addMessage(sessionId, message);

      // Prepare provider options
      const providerOptions = {
        ...options?.providerOptions,
        model: session.config.model,
      };

      // Add tools if available
      if (tools && tools.length > 0) {
        providerOptions.tools = tools;
      }

      // Call onStart handler if provided
      if (handlers.onStart) {
        handlers.onStart();
      }

      // Create a map to track tool calls
      const toolCalls: Map<string, ToolCall> = new Map();
      const toolResults: Map<string, ToolCallResult> = new Map();

      // Define handlers for stream processing
      const streamHandlers = {
        onChunk: async (chunk: any) => {
          // Extract tool calls from chunk
          const chunkToolCalls = this.extractToolCallsFromChunk(chunk);

          // Store tool calls
          for (const toolCall of chunkToolCalls) {
            toolCalls.set(toolCall.id, toolCall);
          }

          // Execute any new tool calls in parallel
          if (chunkToolCalls.length > 0) {
            // Notify about tool calls
            if (handlers.onToolCall) {
              for (const toolCall of chunkToolCalls) {
                handlers.onToolCall(toolCall);
              }
            }

            // Execute tool calls in the background
            this.executeToolCallsInBackground(
              sessionId,
              chunkToolCalls,
              (toolCallId, result) => {
                // Store result
                toolResults.set(toolCallId, result);

                // Notify about tool result
                if (handlers.onToolResult) {
                  handlers.onToolResult(result);
                }
              }
            );
          }

          // Forward chunk to handler
          if (handlers.onMessage) {
            handlers.onMessage(chunk);
          }
        },

        onComplete: async (result: any) => {
          // Get complete message text
          const completeMessage = result.message;

          // Store the assistant response in the session
          await this.sessionRepository.addMessage(sessionId, completeMessage);

          // Wait for any pending tool calls to complete
          await this.waitForToolCalls(Array.from(toolCalls.values()));

          // Call onComplete handler if provided
          if (handlers.onComplete) {
            handlers.onComplete({
              message: completeMessage,
              toolCalls: Array.from(toolCalls.values()),
              toolResults: Array.from(toolResults.values()),
            });
          }
        },

        onError: (error: any) => {
          // Forward error to handler
          if (handlers.onError) {
            handlers.onError(error);
          }
        },
      };

      // Stream message from provider
      const result = await this.commandBus.execute(
        new StreamMessageCommand(
          sessionId,
          session.config.provider,
          processedMessages,
          streamHandlers,
          providerOptions
        )
      );

      if (!result.success) {
        throw new Error(
          result.error || 'Failed to stream message from provider'
        );
      }
    } catch (error) {
      console.error('Failed to process message stream:', error);

      // Forward error to handler
      if (handlers.onError) {
        handlers.onError(error);
      }

      throw error;
    }
  }

  /**
   * Get conversation history
   * @param sessionId Session ID
   * @param limit Maximum number of messages to retrieve
   * @returns Array of chat messages
   */
  private async getConversationHistory(
    sessionId: string,
    limit: number
  ): Promise<ChatMessage[]> {
    try {
      const messages = await this.sessionRepository.getMessages(
        sessionId,
        limit
      );
      return messages;
    } catch (error) {
      console.error('Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Create a system message
   * @param content System message content
   * @returns Chat message with system role
   */
  private createSystemMessage(content: string): ChatMessage {
    const formattedContent = formatSystemPrompt(content);

    return {
      id: uuidv4(),
      role: ChatMessageRole.SYSTEM,
      content: [
        {
          type: MessageContentType.TEXT,
          text: formattedContent,
        },
      ],
      createdAt: new Date(),
    };
  }

  /**
   * Get tools for a provider
   * @param providerType Provider type
   * @param includeTools Whether to include tools
   * @returns Array of formatted tools
   */
  private async getToolsForProvider(
    providerType: string,
    includeTools?: boolean | string[]
  ): Promise<any[]> {
    if (includeTools === false) {
      return [];
    }

    try {
      const result = await this.commandBus.execute(
        new GetToolsForProviderCommand(
          providerType,
          true // Format tools for provider
        )
      );

      if (!result.success) {
        console.error('Failed to get tools:', result.error);
        return [];
      }

      const tools = result.data;

      // If includeTools is an array of tool names, filter tools
      if (Array.isArray(includeTools)) {
        return tools.filter((tool: any) => {
          const toolName = tool.function?.name || tool.name;
          return includeTools.includes(toolName);
        });
      }

      return tools;
    } catch (error) {
      console.error('Failed to get tools for provider:', error);
      return [];
    }
  }

  /**
   * Extract tool calls from a provider response
   * @param response Provider response
   * @returns Array of tool calls
   */
  private extractToolCalls(response: any): ToolCall[] {
    // Check for tool calls in the response
    const message = response.message;

    if (!message || !message.content) {
      return [];
    }

    // Extract tool calls from message content
    const toolCalls = message.content
      .filter((content: any) => content.type === 'tool_call')
      .map((content: any) => ({
        id: content.toolCallId,
        name: content.name,
        arguments: content.arguments,
        status: 'pending', // Initial status
      }));

    return toolCalls;
  }

  /**
   * Extract tool calls from a stream chunk
   * @param chunk Stream chunk
   * @returns Array of tool calls
   */
  private extractToolCallsFromChunk(chunk: any): ToolCall[] {
    if (!chunk || !chunk.chunk || !chunk.chunk.content) {
      return [];
    }

    // Extract tool calls from chunk content
    const toolCalls = chunk.chunk.content
      .filter((content: any) => content.type === 'tool_call')
      .map((content: any) => {
        let args = content.arguments;

        // Try to parse arguments if they're a string
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }

        return {
          id: content.toolCallId,
          name: content.name,
          arguments: args,
          status: 'pending', // Initial status
        };
      });

    return toolCalls;
  }

  /**
   * Execute tool calls
   * @param sessionId Session ID
   * @param toolCalls Tool calls to execute
   * @returns Array of tool results
   */
  private async executeToolCalls(
    sessionId: string,
    toolCalls: ToolCall[]
  ): Promise<ToolCallResult[]> {
    if (!toolCalls || toolCalls.length === 0) {
      return [];
    }

    // Execute all tool calls in parallel
    const results = await Promise.all(
      toolCalls.map(toolCall =>
        this.toolCallRouter.routeToolCall(sessionId, toolCall)
      )
    );

    return results;
  }

  /**
   * Execute tool calls in background
   * @param sessionId Session ID
   * @param toolCalls Tool calls to execute
   * @param onResult Callback for when a result is available
   */
  private executeToolCallsInBackground(
    sessionId: string,
    toolCalls: ToolCall[],
    onResult: (toolCallId: string, result: ToolCallResult) => void
  ): void {
    // Execute each tool call
    for (const toolCall of toolCalls) {
      this.toolCallRouter
        .routeToolCall(sessionId, toolCall)
        .then(result => {
          onResult(toolCall.id, result);
        })
        .catch(error => {
          console.error(`Failed to execute tool call ${toolCall.id}:`, error);
          onResult(toolCall.id, {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            result: null,
            error: error.message || 'Unknown error',
            status: 'failed',
          });
        });
    }
  }

  /**
   * Wait for tool calls to complete
   * @param toolCalls Tool calls to wait for
   * @param timeout Maximum time to wait in milliseconds
   */
  private async waitForToolCalls(
    toolCalls: ToolCall[],
    timeout: number = 5000
  ): Promise<void> {
    if (!toolCalls || toolCalls.length === 0) {
      return;
    }

    const startTime = Date.now();
    const pendingToolCalls = new Set(toolCalls.map(tc => tc.id));

    while (pendingToolCalls.size > 0) {
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        console.warn(
          `Timeout waiting for tool calls: ${Array.from(pendingToolCalls)}`
        );
        break;
      }

      // Check status of each pending tool call
      for (const toolCallId of Array.from(pendingToolCalls)) {
        const status = this.toolCallRouter.getToolCallStatus(toolCallId);

        // Remove from pending if completed or failed
        if (
          status === 'completed' ||
          status === 'failed' ||
          status === 'timeout' ||
          status === 'cancelled'
        ) {
          pendingToolCalls.delete(toolCallId);
        }
      }

      // If still pending, wait a bit
      if (pendingToolCalls.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

/**
 * Create a new Message Processor
 */
export function createMessageProcessor(
  commandBus: CommandBus,
  eventBus: EventBus,
  sessionRepository: SessionRepository,
  toolCallRouter: ToolCallRouter
): MessageProcessor {
  return new DefaultMessageProcessor(
    commandBus,
    eventBus,
    sessionRepository,
    toolCallRouter
  );
}
```

The Message Processor is responsible for:

1. **Context Assembly**: Gathering and preparing conversation context with history and system prompts
2. **Tool Integration**: Including relevant tools for the provider
3. **Message Transformation**: Processing messages to add necessary context
4. **Parallel Tool Execution**: Handling multiple tool calls efficiently
5. **Stream Processing**: Supporting streaming responses from providers

The implementation uses dependency injection for the `CommandBus`, `EventBus`, `SessionRepository`, and `ToolCallRouter`, allowing for flexible configuration and easier testing.

In the next step, we'll implement the Tool Call Router component.

### Step 4: Implement Tool Call Router

Next, we'll implement the Tool Call Router, which is responsible for routing tool calls from LLM providers to the Tool Domain for execution.

**File: `src/llm/message-routing/router/tool-call-router.ts`**

```typescript
import { CommandBus } from '../../infrastructure/command-bus';
import { EventBus } from '../../infrastructure/event-bus';
import {
  ToolCallRouter,
  ToolCall,
  ToolCallResult,
} from '../models/router-interfaces';
import { RoutingOptions } from '../models/routing-types';
import { ToolCallStatus } from '../../tool/models/tool-call';
import {
  ExecuteToolCommand,
  ExecuteToolByNameCommand,
  ValidateToolArgumentsCommand,
} from '../../tool/commands/tool-commands';
import {
  ToolExecutionStartedEvent,
  ToolExecutionCompletedEvent,
  ToolExecutionFailedEvent,
} from '../../tool/events/tool-events';

/**
 * Map to track tool call statuses
 */
const toolCallStatusMap = new Map<string, ToolCallStatus>();

/**
 * Default implementation of Tool Call Router
 */
export class DefaultToolCallRouter implements ToolCallRouter {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus
  ) {
    // Subscribe to tool execution events
    this.subscribeToEvents();
  }

  async routeToolCall(
    sessionId: string,
    toolCall: ToolCall,
    options?: RoutingOptions
  ): Promise<ToolCallResult> {
    // Set initial status
    toolCallStatusMap.set(toolCall.id, ToolCallStatus.PENDING);

    try {
      // Validate tool arguments (optional)
      if (options?.validateArgs !== false) {
        await this.validateToolArguments(toolCall);
      }

      // Update status to in progress
      toolCallStatusMap.set(toolCall.id, ToolCallStatus.EXECUTING);

      // Execute the tool
      const executeResult = await this.commandBus.execute(
        new ExecuteToolByNameCommand(
          sessionId,
          toolCall.name,
          toolCall.arguments,
          {
            timeout: options?.timeout,
            maxRetries: options?.retryStrategy?.maxRetries,
            context: {
              toolCallId: toolCall.id,
              sessionId,
              ...options?.contextOptions?.retrievalOptions,
            },
          },
          options?.userId,
          options?.requestId
        )
      );

      if (!executeResult.success) {
        // Update status to failed
        toolCallStatusMap.set(toolCall.id, ToolCallStatus.FAILED);

        return {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: null,
          error: executeResult.error || 'Unknown error',
          status: ToolCallStatus.FAILED,
        };
      }

      // Update status to completed
      toolCallStatusMap.set(toolCall.id, ToolCallStatus.COMPLETED);

      // Return the result
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result: executeResult.data,
        status: ToolCallStatus.COMPLETED,
      };
    } catch (error) {
      // Update status to failed
      toolCallStatusMap.set(toolCall.id, ToolCallStatus.FAILED);

      // Return error result
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        status: ToolCallStatus.FAILED,
      };
    }
  }

  getToolCallStatus(toolCallId: string): ToolCallStatus | undefined {
    return toolCallStatusMap.get(toolCallId);
  }

  /**
   * Validate tool arguments
   * @param toolCall Tool call to validate
   * @returns Promise resolving when validation is complete
   */
  private async validateToolArguments(toolCall: ToolCall): Promise<void> {
    try {
      // Find tool ID by name (this could be optimized by caching tool IDs by name)
      // This is a simplified implementation - in a real scenario we might have
      // additional ways to map tool names to IDs
      // For now, we'll assume that tools can be executed directly by name
      // In a more advanced implementation, we would first resolve the tool ID
      // and then validate arguments against that specific tool
      // If we had the tool ID, we could validate arguments like this:
      // const result = await this.commandBus.execute(
      //   new ValidateToolArgumentsCommand(toolId, toolCall.arguments)
      // );
      //
      // if (!result.success || !result.data.valid) {
      //   throw new Error(`Invalid arguments: ${result.data.errors?.join(', ')}`);
      // }
    } catch (error) {
      console.error('Failed to validate tool arguments:', error);
      // We'll continue with execution even if validation fails
      // In a real scenario, you might want to fail the tool call here
    }
  }

  /**
   * Subscribe to tool execution events
   */
  private subscribeToEvents(): void {
    // Subscribe to tool execution events to update status map
    this.eventBus.subscribe(
      ToolExecutionStartedEvent.name,
      this.handleToolExecutionStarted.bind(this)
    );

    this.eventBus.subscribe(
      ToolExecutionCompletedEvent.name,
      this.handleToolExecutionCompleted.bind(this)
    );

    this.eventBus.subscribe(
      ToolExecutionFailedEvent.name,
      this.handleToolExecutionFailed.bind(this)
    );
  }

  /**
   * Handle tool execution started event
   */
  private handleToolExecutionStarted(event: ToolExecutionStartedEvent): void {
    toolCallStatusMap.set(event.toolCallId, ToolCallStatus.EXECUTING);
  }

  /**
   * Handle tool execution completed event
   */
  private handleToolExecutionCompleted(
    event: ToolExecutionCompletedEvent
  ): void {
    toolCallStatusMap.set(event.toolCallId, ToolCallStatus.COMPLETED);
  }

  /**
   * Handle tool execution failed event
   */
  private handleToolExecutionFailed(event: ToolExecutionFailedEvent): void {
    toolCallStatusMap.set(event.toolCallId, ToolCallStatus.FAILED);
  }
}

/**
 * Create a new Tool Call Router
 */
export function createToolCallRouter(
  commandBus: CommandBus,
  eventBus: EventBus
): ToolCallRouter {
  return new DefaultToolCallRouter(commandBus, eventBus);
}
```

The Tool Call Router is responsible for:

1. **Tool Call Routing**: Directing tool calls to the Tool Domain for execution
2. **Status Tracking**: Maintaining the status of tool calls
3. **Argument Validation**: Optionally validating tool arguments before execution
4. **Error Handling**: Handling errors during tool execution

The implementation uses a simple in-memory map to track tool call statuses, which allows the Message Processor to check the status of tool calls and wait for their completion if needed. It also subscribes to tool execution events to update the status map when tool execution status changes.

The router delegates the actual tool execution to the Tool Domain through the Command Bus, executing tools by name rather than by ID to simplify integration. In a more complex implementation, it might first resolve the tool ID from the name and then execute it by ID.

In the next step, we'll implement the Response Assembler component.

### Step 5: Implement Response Assembler

Now, let's implement the Response Assembler component, which combines responses from providers with tool results into a cohesive final response.

**File: `src/llm/message-routing/assembler/response-assembler.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  ResponseAssembler,
  ToolCallResult,
  AssembledResponse,
  ToolCall,
} from '../models/router-interfaces';
import {
  ChatMessage,
  ChatMessageRole,
  MessageContent,
  MessageContentType,
} from '../../session/models/types';
import { AssemblyOptions } from '../models/router-interfaces';
import { CommandBus } from '../../infrastructure/command-bus';
import { SendMessageCommand } from '../../provider/commands/provider-commands';
import { SessionRepository } from '../../session/repository/session-repository';
import { ToolCallStatus } from '../../tool/models/tool-call';

/**
 * Default implementation of Response Assembler
 */
export class DefaultResponseAssembler implements ResponseAssembler {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly sessionRepository: SessionRepository
  ) {}

  assembleResponse(
    sessionId: string,
    providerResponse: any,
    toolResults: ToolCallResult[]
  ): AssembledResponse {
    // Extract the message from the provider response
    const providerMessage = providerResponse.message;

    // Extract tool calls from the message
    const toolCalls = this.extractToolCalls(providerMessage);

    // Create a map of tool results by tool call ID for quick lookup
    const resultMap = new Map<string, ToolCallResult>();
    for (const result of toolResults) {
      resultMap.set(result.toolCallId, result);
    }

    // Check if any tool calls need to be included in the response
    if (toolCalls.length === 0 || toolResults.length === 0) {
      // No tool calls, return the provider response as is
      return {
        message: providerMessage,
        toolCalls: [],
        toolResults: [],
        metadata: {
          model: providerResponse.model,
          usage: providerResponse.usage,
          finishReason: providerResponse.finishReason,
        },
      };
    }

    // Create tool messages for each tool call
    const toolMessages = this.createToolMessages(toolResults);

    // Assemble the final message content
    const assembledContent: MessageContent[] = [];

    // 1. Add any text content from the provider message
    const textContent = providerMessage.content.filter(
      (c: any) => c.type === MessageContentType.TEXT
    );
    assembledContent.push(...textContent);

    // 2. Add a summary of tool calls and results if not already in the text
    const toolSummary = this.createToolSummary(toolCalls, toolResults);
    if (toolSummary) {
      assembledContent.push({
        type: MessageContentType.TEXT,
        text: toolSummary,
      });
    }

    // Create the assembled message
    const assembledMessage: ChatMessage = {
      id: providerMessage.id || uuidv4(),
      role: ChatMessageRole.ASSISTANT,
      content: assembledContent,
      createdAt: providerMessage.createdAt || new Date(),
    };

    return {
      message: assembledMessage,
      toolCalls,
      toolResults,
      metadata: {
        model: providerResponse.model,
        usage: providerResponse.usage,
        finishReason: providerResponse.finishReason,
        toolMessages,
      },
    };
  }

  async assembleStreamingResponse(
    sessionId: string,
    streamingResponse: AsyncIterable<any>,
    toolResults: Map<string, ToolCallResult>,
    options?: AssemblyOptions
  ): AsyncIterable<any> {
    // For streaming responses, we'll create a new async generator
    // that processes the chunks from the provider and injects tool results
    // at appropriate points

    // Set of tool calls that have been injected into the stream
    const injectedToolCalls = new Set<string>();

    // Final message content
    let finalContent: MessageContent[] = [];

    // Final tool calls
    const toolCalls: ToolCall[] = [];

    // Tracking variables
    let responseId: string | null = null;
    let isComplete = false;
    let hasToolCalls = false;

    // Create a new async generator
    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          // Process each chunk from the provider
          for await (const chunk of streamingResponse) {
            // Store response ID if not already stored
            if (!responseId && chunk.chunk?.id) {
              responseId = chunk.chunk.id;
            }

            // Check for tool calls
            const chunkToolCalls =
              DefaultResponseAssembler.extractToolCallsFromChunk(chunk);

            if (chunkToolCalls.length > 0) {
              hasToolCalls = true;
            }

            // Add tool calls to the list
            for (const toolCall of chunkToolCalls) {
              if (!toolCalls.find(tc => tc.id === toolCall.id)) {
                toolCalls.push(toolCall);
              }
            }

            // Collect content for the final message
            if (chunk.chunk?.content) {
              for (const content of chunk.chunk.content) {
                // Only add unique content to the final content
                if (
                  !finalContent.find(
                    c => JSON.stringify(c) === JSON.stringify(content)
                  )
                ) {
                  finalContent.push(content);
                }
              }
            }

            // If the chunk contains tool calls and we have results, inject them
            if (
              chunkToolCalls.length > 0 &&
              options?.waitForToolResults !== false &&
              !chunk.isComplete
            ) {
              // Check if we have results for these tool calls
              for (const toolCall of chunkToolCalls) {
                const result = toolResults.get(toolCall.id);

                // If we have a result and haven't injected it yet, add it to the chunk
                if (
                  result &&
                  !injectedToolCalls.has(toolCall.id) &&
                  (result.status === ToolCallStatus.COMPLETED ||
                    result.status === ToolCallStatus.FAILED)
                ) {
                  // Mark as injected
                  injectedToolCalls.add(toolCall.id);

                  // Create a modified chunk with the tool result
                  const modifiedChunk = {
                    ...chunk,
                    toolResult: result,
                    isToolResult: true,
                  };

                  // Yield the modified chunk
                  yield modifiedChunk;
                }
              }
            }

            // Forward the original chunk
            yield chunk;

            // If this is the final chunk and we have uninjected tool results, add them
            if (chunk.isComplete) {
              isComplete = true;

              // Add any remaining tool results
              for (const [toolCallId, result] of toolResults.entries()) {
                if (!injectedToolCalls.has(toolCallId)) {
                  // Mark as injected
                  injectedToolCalls.add(toolCallId);

                  // Create a modified chunk with the tool result
                  const finalToolResultChunk = {
                    chunk: {
                      id: responseId,
                      role: ChatMessageRole.ASSISTANT,
                      content: [],
                    },
                    model: chunk.model,
                    toolResult: result,
                    isToolResult: true,
                    isComplete: false,
                  };

                  // Yield the tool result chunk
                  yield finalToolResultChunk;
                }
              }
            }
          }

          // If we somehow didn't get a complete message, add a final chunk
          if (!isComplete) {
            const finalChunk = {
              chunk: {
                id: responseId || uuidv4(),
                role: ChatMessageRole.ASSISTANT,
                content: finalContent,
              },
              isComplete: true,
            };

            yield finalChunk;
          }
        } catch (error) {
          console.error('Error in assembleStreamingResponse:', error);

          // Yield an error chunk
          yield {
            error: error instanceof Error ? error.message : String(error),
            isComplete: true,
          };
        }
      },
    };
  }

  /**
   * Extract tool calls from a provider message
   * @param message Provider message
   * @returns Array of tool calls
   */
  private extractToolCalls(message: ChatMessage): ToolCall[] {
    if (!message || !message.content) {
      return [];
    }

    // Extract tool calls from message content
    const toolCalls = message.content
      .filter((content: any) => content.type === MessageContentType.TOOL_CALL)
      .map((content: any) => ({
        id: content.toolCallId,
        name: content.name,
        arguments: content.arguments,
        status: ToolCallStatus.COMPLETED, // Assume completed
      }));

    return toolCalls;
  }

  /**
   * Create tool messages from tool results
   * @param toolResults Tool results
   * @returns Array of chat messages
   */
  private createToolMessages(toolResults: ToolCallResult[]): ChatMessage[] {
    return toolResults.map(result => {
      // Create content based on tool result
      const content: MessageContent[] = [
        {
          type: MessageContentType.TEXT,
          text:
            result.status === ToolCallStatus.COMPLETED
              ? JSON.stringify(result.result)
              : `Error: ${result.error}`,
        },
      ];

      return {
        id: uuidv4(),
        role: ChatMessageRole.TOOL,
        toolCallId: result.toolCallId,
        name: result.toolName,
        content,
        createdAt: new Date(),
      };
    });
  }

  /**
   * Create a summary of tool calls and results
   * @param toolCalls Tool calls
   * @param toolResults Tool results
   * @returns Summary text or null if no summary needed
   */
  private createToolSummary(
    toolCalls: ToolCall[],
    toolResults: ToolCallResult[]
  ): string | null {
    // If no tool calls or results, no summary needed
    if (toolCalls.length === 0 || toolResults.length === 0) {
      return null;
    }

    // Create a map of tool results by tool call ID for quick lookup
    const resultMap = new Map<string, ToolCallResult>();
    for (const result of toolResults) {
      resultMap.set(result.toolCallId, result);
    }

    // Build summary lines
    const summaryLines: string[] = ['## Tool Call Results'];

    for (const toolCall of toolCalls) {
      const result = resultMap.get(toolCall.id);
      if (result) {
        if (result.status === ToolCallStatus.COMPLETED) {
          summaryLines.push(`**${result.toolName}**: Success`);
          summaryLines.push(`- Result: ${JSON.stringify(result.result)}`);
        } else {
          summaryLines.push(`**${result.toolName}**: Failed`);
          summaryLines.push(`- Error: ${result.error}`);
        }
      } else {
        summaryLines.push(`**${toolCall.name}**: No result available`);
      }
    }

    return summaryLines.join('\n');
  }

  /**
   * Extract tool calls from a stream chunk
   * @param chunk Stream chunk
   * @returns Array of tool calls
   */
  static extractToolCallsFromChunk(chunk: any): ToolCall[] {
    if (!chunk || !chunk.chunk || !chunk.chunk.content) {
      return [];
    }

    // Extract tool calls from chunk content
    const toolCalls = chunk.chunk.content
      .filter((content: any) => content.type === MessageContentType.TOOL_CALL)
      .map((content: any) => {
        let args = content.arguments;

        // Try to parse arguments if they're a string
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }

        return {
          id: content.toolCallId,
          name: content.name,
          arguments: args,
          status: ToolCallStatus.PENDING, // Initial status
        };
      });

    return toolCalls;
  }
}

/**
 * Create a new Response Assembler
 */
export function createResponseAssembler(
  commandBus: CommandBus,
  sessionRepository: SessionRepository
): ResponseAssembler {
  return new DefaultResponseAssembler(commandBus, sessionRepository);
}
```

The Response Assembler is responsible for:

1. **Response Combination**: Merging provider responses with tool results
2. **Stream Processing**: Injecting tool results into streaming responses
3. **Tool Summary Creation**: Generating summaries of tool calls and results
4. **Content Organization**: Arranging message content in a logical order

The implementation provides two main methods:

- `assembleResponse`: For synchronous responses, combines the provider response with tool results into a single cohesive response
- `assembleStreamingResponse`: For streaming responses, injects tool results and summaries into the stream at appropriate points

The streaming response assembly is more complex because it needs to:

1. Monitor the stream for tool calls
2. Inject tool results when they become available
3. Add summaries at appropriate points
4. Handle completion and errors gracefully

This component works closely with the Message Router and Tool Call Router to create a complete and coherent response that includes both LLM output and tool results.

### Step 6: Implement Message Commands and Events

Now, let's implement the commands and events for the Message Routing Domain. These will facilitate communication between components and with other domains.

**File: `src/llm/message-routing/commands/routing-commands.ts`**

```typescript
import { Command } from '../../infrastructure/command-bus';
import { RoutingOptions } from '../models/routing-types';
import { ChatMessage } from '../../session/models/types';
import { MessageStreamHandlers } from '../models/routing-types';

/**
 * Command to route a message to a provider
 */
export class RouteMessageCommand implements Command {
  readonly type = 'route-message';

  constructor(
    public readonly sessionId: string,
    public readonly message: ChatMessage,
    public readonly options?: RoutingOptions
  ) {}
}

/**
 * Command to route a message stream from a provider
 */
export class RouteMessageStreamCommand implements Command {
  readonly type = 'route-message-stream';

  constructor(
    public readonly sessionId: string,
    public readonly message: ChatMessage,
    public readonly streamHandlers: MessageStreamHandlers,
    public readonly options?: RoutingOptions
  ) {}
}

/**
 * Command to abort a routing operation
 */
export class AbortRoutingOperationCommand implements Command {
  readonly type = 'abort-routing-operation';

  constructor(public readonly operationId: string) {}
}

/**
 * Command to get a routing operation
 */
export class GetRoutingOperationCommand implements Command {
  readonly type = 'get-routing-operation';

  constructor(public readonly operationId: string) {}
}

/**
 * Command to get routing operations for a session
 */
export class GetSessionRoutingOperationsCommand implements Command {
  readonly type = 'get-session-routing-operations';

  constructor(public readonly sessionId: string) {}
}

/**
 * Command to process a message before sending to a provider
 */
export class ProcessMessageCommand implements Command {
  readonly type = 'process-message';

  constructor(
    public readonly sessionId: string,
    public readonly message: ChatMessage,
    public readonly options?: {
      includeHistory?: boolean;
      historyLimit?: number;
      includeTools?: boolean | string[];
      systemPrompt?: string;
    }
  ) {}
}

/**
 * Command to execute a tool call
 */
export class RouteToolCallCommand implements Command {
  readonly type = 'route-tool-call';

  constructor(
    public readonly sessionId: string,
    public readonly toolCallId: string,
    public readonly toolName: string,
    public readonly arguments: any,
    public readonly options?: RoutingOptions
  ) {}
}

/**
 * Command to assemble a response with tool results
 */
export class AssembleResponseCommand implements Command {
  readonly type = 'assemble-response';

  constructor(
    public readonly sessionId: string,
    public readonly providerResponse: any,
    public readonly toolResults: any[]
  ) {}
}
```

**File: `src/llm/message-routing/events/routing-events.ts`**

```typescript
import { Event } from '../../infrastructure/event-bus';
import {
  RoutingOperationStatus,
  RoutingOperationType,
} from '../models/routing-types';
import { ToolCallStatus } from '../../tool/models/tool-call';

/**
 * Base class for all routing events
 */
export abstract class RoutingEvent implements Event {
  abstract readonly type: string;

  constructor(public readonly timestamp: Date = new Date()) {}
}

/**
 * Event emitted when a routing operation is created
 */
export class RoutingOperationCreatedEvent extends RoutingEvent {
  readonly type = 'routing-operation-created';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly operationType: RoutingOperationType,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a routing operation status changes
 */
export class RoutingOperationStatusChangedEvent extends RoutingEvent {
  readonly type = 'routing-operation-status-changed';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly status: RoutingOperationStatus,
    public readonly previousStatus: RoutingOperationStatus,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a routing operation is completed
 */
export class RoutingOperationCompletedEvent extends RoutingEvent {
  readonly type = 'routing-operation-completed';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly result: any,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a routing operation fails
 */
export class RoutingOperationFailedEvent extends RoutingEvent {
  readonly type = 'routing-operation-failed';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly error: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a routing operation is aborted
 */
export class RoutingOperationAbortedEvent extends RoutingEvent {
  readonly type = 'routing-operation-aborted';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a message is routed to a provider
 */
export class MessageRoutedEvent extends RoutingEvent {
  readonly type = 'message-routed';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly messageId: string,
    public readonly providerType: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a message stream starts
 */
export class MessageStreamStartedEvent extends RoutingEvent {
  readonly type = 'message-stream-started';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly messageId: string,
    public readonly providerType: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a message stream ends
 */
export class MessageStreamEndedEvent extends RoutingEvent {
  readonly type = 'message-stream-ended';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly messageId: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a tool call is detected in a message
 */
export class ToolCallDetectedEvent extends RoutingEvent {
  readonly type = 'tool-call-detected';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly toolCallId: string,
    public readonly toolName: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a tool call is routed for execution
 */
export class ToolCallRoutedEvent extends RoutingEvent {
  readonly type = 'tool-call-routed';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly toolCallId: string,
    public readonly toolName: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a tool call status changes
 */
export class ToolCallStatusChangedEvent extends RoutingEvent {
  readonly type = 'tool-call-status-changed';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly toolCallId: string,
    public readonly status: ToolCallStatus,
    public readonly previousStatus: ToolCallStatus,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a response is assembled with tool results
 */
export class ResponseAssembledEvent extends RoutingEvent {
  readonly type = 'response-assembled';

  constructor(
    public readonly operationId: string,
    public readonly sessionId: string,
    public readonly messageId: string,
    public readonly toolCallCount: number,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}
```

These commands and events provide a comprehensive communication layer for the Message Routing Domain:

1. **Commands**:

   - `RouteMessageCommand`: Routes a message to a provider
   - `RouteMessageStreamCommand`: Routes a streaming message from a provider
   - `AbortRoutingOperationCommand`: Aborts an in-progress routing operation
   - `GetRoutingOperationCommand`: Gets information about a routing operation
   - `GetSessionRoutingOperationsCommand`: Gets all routing operations for a session
   - `ProcessMessageCommand`: Processes a message before sending to a provider
   - `RouteToolCallCommand`: Routes a tool call for execution
   - `AssembleResponseCommand`: Assembles a response with tool results

2. **Events**:
   - Operation-related events: Track the lifecycle of routing operations
   - Message-related events: Track the flow of messages
   - Tool call-related events: Track tool call detection and execution
   - Response-related events: Notify when responses are assembled

These commands and events enable decoupled communication between components within the Message Routing Domain, as well as with other domains. Components can subscribe to relevant events and respond accordingly, without needing to know the details of other components.

### Step 7: Implement Command Handlers

Now, let's implement the command handlers for the Message Routing Domain. These handlers will process commands and coordinate actions between components.

**File: `src/llm/message-routing/handlers/routing-command-handlers.ts`**

```typescript
import {
  CommandHandler,
  CommandResult,
} from '../../infrastructure/command-bus';
import { EventBus } from '../../infrastructure/event-bus';
import {
  RouteMessageCommand,
  RouteMessageStreamCommand,
  AbortRoutingOperationCommand,
  GetRoutingOperationCommand,
  GetSessionRoutingOperationsCommand,
  ProcessMessageCommand,
  RouteToolCallCommand,
  AssembleResponseCommand,
} from '../commands/routing-commands';
import {
  MessageRoutedEvent,
  MessageStreamStartedEvent,
  MessageStreamEndedEvent,
  ToolCallRoutedEvent,
  ResponseAssembledEvent,
  RoutingOperationCreatedEvent,
  RoutingOperationStatusChangedEvent,
  RoutingOperationCompletedEvent,
  RoutingOperationFailedEvent,
  RoutingOperationAbortedEvent,
} from '../events/routing-events';
import { MessageRouter, getMessageRouter } from '../router/message-router';
import { MessageProcessor } from '../models/router-interfaces';
import { ToolCallRouter } from '../models/router-interfaces';
import { ResponseAssembler } from '../models/router-interfaces';
import { RoutingOperation } from '../models/routing-types';

/**
 * Handler for RouteMessageCommand
 */
export class RouteMessageHandler
  implements CommandHandler<RouteMessageCommand, RoutingOperation>
{
  constructor(
    private readonly messageRouter: MessageRouter,
    private readonly eventBus: EventBus
  ) {}

  async handle(
    command: RouteMessageCommand
  ): Promise<CommandResult<RoutingOperation>> {
    try {
      // Route the message
      const operation = await this.messageRouter.sendMessage(
        command.sessionId,
        command.message,
        command.options
      );

      // Publish event
      this.eventBus.publish(
        new RoutingOperationCreatedEvent(
          operation.id,
          command.sessionId,
          operation.type
        )
      );

      // If the message has an ID, publish a MessageRoutedEvent
      if (command.message.id) {
        this.eventBus.publish(
          new MessageRoutedEvent(
            operation.id,
            command.sessionId,
            command.message.id,
            'unknown' // Provider type will be determined by the message router
          )
        );
      }

      return {
        success: true,
        data: operation,
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
 * Handler for RouteMessageStreamCommand
 */
export class RouteMessageStreamHandler
  implements CommandHandler<RouteMessageStreamCommand, RoutingOperation>
{
  constructor(
    private readonly messageRouter: MessageRouter,
    private readonly eventBus: EventBus
  ) {}

  async handle(
    command: RouteMessageStreamCommand
  ): Promise<CommandResult<RoutingOperation>> {
    try {
      // Route the message stream
      const operation = await this.messageRouter.streamMessage(
        command.sessionId,
        command.message,
        command.streamHandlers,
        command.options
      );

      // Publish event
      this.eventBus.publish(
        new RoutingOperationCreatedEvent(
          operation.id,
          command.sessionId,
          operation.type
        )
      );

      // If the message has an ID, publish a MessageStreamStartedEvent
      if (command.message.id) {
        this.eventBus.publish(
          new MessageStreamStartedEvent(
            operation.id,
            command.sessionId,
            command.message.id,
            'unknown' // Provider type will be determined by the message router
          )
        );
      }

      return {
        success: true,
        data: operation,
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
 * Handler for AbortRoutingOperationCommand
 */
export class AbortRoutingOperationHandler
  implements CommandHandler<AbortRoutingOperationCommand, boolean>
{
  constructor(
    private readonly messageRouter: MessageRouter,
    private readonly eventBus: EventBus
  ) {}

  async handle(
    command: AbortRoutingOperationCommand
  ): Promise<CommandResult<boolean>> {
    try {
      // Get the operation to get the session ID
      const operation = this.messageRouter.getOperation(command.operationId);
      if (!operation) {
        return {
          success: false,
          error: `Operation not found: ${command.operationId}`,
        };
      }

      // Abort the operation
      const result = await this.messageRouter.abortOperation(
        command.operationId
      );

      if (result) {
        // Publish event
        this.eventBus.publish(
          new RoutingOperationAbortedEvent(
            command.operationId,
            operation.sessionId
          )
        );
      }

      return {
        success: true,
        data: result,
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
 * Handler for GetRoutingOperationCommand
 */
export class GetRoutingOperationHandler
  implements CommandHandler<GetRoutingOperationCommand, RoutingOperation>
{
  constructor(private readonly messageRouter: MessageRouter) {}

  async handle(
    command: GetRoutingOperationCommand
  ): Promise<CommandResult<RoutingOperation>> {
    try {
      // Get the operation
      const operation = this.messageRouter.getOperation(command.operationId);

      if (!operation) {
        return {
          success: false,
          error: `Operation not found: ${command.operationId}`,
        };
      }

      return {
        success: true,
        data: operation,
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
 * Handler for GetSessionRoutingOperationsCommand
 */
export class GetSessionRoutingOperationsHandler
  implements
    CommandHandler<GetSessionRoutingOperationsCommand, RoutingOperation[]>
{
  constructor(private readonly messageRouter: MessageRouter) {}

  async handle(
    command: GetSessionRoutingOperationsCommand
  ): Promise<CommandResult<RoutingOperation[]>> {
    try {
      // This is a simplified implementation - in a real scenario,
      // the message router would need to keep track of operations by session ID
      // For now, we'll just return an empty array

      return {
        success: true,
        data: [],
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
 * Handler for ProcessMessageCommand
 */
export class ProcessMessageHandler
  implements CommandHandler<ProcessMessageCommand, any>
{
  constructor(private readonly messageProcessor: MessageProcessor) {}

  async handle(command: ProcessMessageCommand): Promise<CommandResult<any>> {
    try {
      // Process the message
      const result = await this.messageProcessor.processMessage(
        command.sessionId,
        command.message,
        command.options
      );

      return {
        success: true,
        data: result,
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
 * Handler for RouteToolCallCommand
 */
export class RouteToolCallHandler
  implements CommandHandler<RouteToolCallCommand, any>
{
  constructor(
    private readonly toolCallRouter: ToolCallRouter,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: RouteToolCallCommand): Promise<CommandResult<any>> {
    try {
      // Publish event
      this.eventBus.publish(
        new ToolCallRoutedEvent(
          'unknown', // Operation ID would typically be provided by the context
          command.sessionId,
          command.toolCallId,
          command.toolName
        )
      );

      // Route the tool call
      const result = await this.toolCallRouter.routeToolCall(
        command.sessionId,
        {
          id: command.toolCallId,
          name: command.toolName,
          arguments: command.arguments,
          status: 'pending',
        },
        command.options
      );

      return {
        success: true,
        data: result,
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
 * Handler for AssembleResponseCommand
 */
export class AssembleResponseHandler
  implements CommandHandler<AssembleResponseCommand, any>
{
  constructor(
    private readonly responseAssembler: ResponseAssembler,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: AssembleResponseCommand): Promise<CommandResult<any>> {
    try {
      // Assemble the response
      const result = this.responseAssembler.assembleResponse(
        command.sessionId,
        command.providerResponse,
        command.toolResults
      );

      // Publish event if the result has a message ID
      if (result.message?.id) {
        this.eventBus.publish(
          new ResponseAssembledEvent(
            'unknown', // Operation ID would typically be provided by the context
            command.sessionId,
            result.message.id,
            result.toolCalls.length
          )
        );
      }

      return {
        success: true,
        data: result,
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
 * Register all routing command handlers with the command bus
 */
export function registerRoutingCommandHandlers(
  commandBus: any,
  messageRouter: MessageRouter,
  messageProcessor: MessageProcessor,
  toolCallRouter: ToolCallRouter,
  responseAssembler: ResponseAssembler,
  eventBus: EventBus
): void {
  commandBus.registerHandler(
    'route-message',
    new RouteMessageHandler(messageRouter, eventBus)
  );

  commandBus.registerHandler(
    'route-message-stream',
    new RouteMessageStreamHandler(messageRouter, eventBus)
  );

  commandBus.registerHandler(
    'abort-routing-operation',
    new AbortRoutingOperationHandler(messageRouter, eventBus)
  );

  commandBus.registerHandler(
    'get-routing-operation',
    new GetRoutingOperationHandler(messageRouter)
  );

  commandBus.registerHandler(
    'get-session-routing-operations',
    new GetSessionRoutingOperationsHandler(messageRouter)
  );

  commandBus.registerHandler(
    'process-message',
    new ProcessMessageHandler(messageProcessor)
  );

  commandBus.registerHandler(
    'route-tool-call',
    new RouteToolCallHandler(toolCallRouter, eventBus)
  );

  commandBus.registerHandler(
    'assemble-response',
    new AssembleResponseHandler(responseAssembler, eventBus)
  );
}
```

The command handlers process commands from the command bus and coordinate actions between components:

1. `RouteMessageHandler`: Routes a message to a provider via the message router
2. `RouteMessageStreamHandler`: Routes a streaming message via the message router
3. `AbortRoutingOperationHandler`: Aborts an in-progress routing operation
4. `GetRoutingOperationHandler`: Gets information about a routing operation
5. `GetSessionRoutingOperationsHandler`: Gets all routing operations for a session
6. `ProcessMessageHandler`: Processes a message using the message processor
7. `RouteToolCallHandler`: Routes a tool call using the tool call router
8. `AssembleResponseHandler`: Assembles a response using the response assembler

Each handler follows a similar pattern:

- Receive a command from the command bus
- Coordinate with the appropriate component to perform the action
- Publish relevant events
- Return a success or failure result

The command handlers are registered with the command bus via the `registerRoutingCommandHandlers` function, which takes dependencies for all the required components.

### Step 8: Domain Integration

Finally, let's implement the integration code that brings all the components together and provides a facade for other domains to interact with the Message Routing Domain.

**File: `src/llm/message-routing/index.ts`**

```typescript
import { CommandBus } from '../infrastructure/command-bus';
import { EventBus } from '../infrastructure/event-bus';
import { SessionRepository } from '../session/repository/session-repository';
import {
  getMessageRouter,
  initializeMessageRouter,
  MessageRouter,
} from './router/message-router';
import {
  createMessageProcessor,
  MessageProcessor,
} from './processor/message-processor';
import {
  createToolCallRouter,
  ToolCallRouter,
} from './router/tool-call-router';
import {
  createResponseAssembler,
  ResponseAssembler,
} from './assembler/response-assembler';
import { registerRoutingCommandHandlers } from './handlers/routing-command-handlers';
import { ChatMessage } from '../session/models/types';
import { MessageStreamHandlers, RoutingOptions } from './models/routing-types';

/**
 * Initialize the Message Routing Domain
 * @param commandBus Command bus instance
 * @param eventBus Event bus instance
 * @param sessionRepository Session repository instance
 * @returns Message router instance
 */
export function initializeMessageRoutingDomain(
  commandBus: CommandBus,
  eventBus: EventBus,
  sessionRepository: SessionRepository
): MessageRouter {
  // Create core components
  const toolCallRouter = createToolCallRouter(commandBus, eventBus);
  const responseAssembler = createResponseAssembler(
    commandBus,
    sessionRepository
  );
  const messageProcessor = createMessageProcessor(
    commandBus,
    eventBus,
    sessionRepository,
    toolCallRouter
  );

  // Create and initialize the message router
  const messageRouter = new DefaultMessageRouter(
    eventBus,
    commandBus,
    sessionRepository,
    messageProcessor,
    toolCallRouter,
    responseAssembler
  );

  // Set the global message router
  initializeMessageRouter(messageRouter);

  // Register command handlers
  registerRoutingCommandHandlers(
    commandBus,
    messageRouter,
    messageProcessor,
    toolCallRouter,
    responseAssembler,
    eventBus
  );

  console.log('Message Routing Domain initialized');

  return messageRouter;
}

/**
 * Facade class for the Message Routing Domain
 * Provides a simplified interface for other domains to interact with
 */
export class MessageRoutingFacade {
  private readonly messageRouter: MessageRouter;

  constructor(messageRouter?: MessageRouter) {
    this.messageRouter = messageRouter || getMessageRouter();
  }

  /**
   * Send a message and get a response
   * @param sessionId Session ID
   * @param message Message to send
   * @param options Routing options
   * @returns Promise resolving to the operation result
   */
  async sendMessage(
    sessionId: string,
    message: ChatMessage,
    options?: RoutingOptions
  ): Promise<any> {
    const operation = await this.messageRouter.sendMessage(
      sessionId,
      message,
      options
    );

    // Wait for operation to complete
    return this.waitForOperation(operation.id);
  }

  /**
   * Stream a message and get responses in chunks
   * @param sessionId Session ID
   * @param message Message to send
   * @param handlers Stream handlers
   * @param options Routing options
   * @returns Promise resolving when streaming is complete
   */
  async streamMessage(
    sessionId: string,
    message: ChatMessage,
    handlers: MessageStreamHandlers,
    options?: RoutingOptions
  ): Promise<void> {
    await this.messageRouter.streamMessage(
      sessionId,
      message,
      handlers,
      options
    );
  }

  /**
   * Abort an in-progress operation
   * @param operationId Operation ID
   * @returns Promise resolving to true if aborted
   */
  async abortOperation(operationId: string): Promise<boolean> {
    return this.messageRouter.abortOperation(operationId);
  }

  /**
   * Wait for an operation to complete
   * @param operationId Operation ID
   * @param timeout Timeout in milliseconds
   * @returns Promise resolving to the operation result
   */
  private async waitForOperation(
    operationId: string,
    timeout: number = 60000
  ): Promise<any> {
    const startTime = Date.now();

    while (true) {
      const operation = this.messageRouter.getOperation(operationId);

      if (!operation) {
        throw new Error(`Operation not found: ${operationId}`);
      }

      if (operation.status === 'completed') {
        return operation.result;
      }

      if (operation.status === 'failed') {
        throw new Error(operation.error || 'Operation failed');
      }

      if (operation.status === 'aborted') {
        throw new Error('Operation aborted');
      }

      if (Date.now() - startTime > timeout) {
        throw new Error('Operation timed out');
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Re-export key types and interfaces
export * from './models/routing-types';
export * from './models/router-interfaces';
export * from './commands/routing-commands';
export * from './events/routing-events';
```

This integration code provides:

1. **Domain Initialization**: A function to create and wire up all the components
2. **Facade Pattern**: A simplified interface for other domains to interact with the Message Routing Domain
3. **Type Exports**: Convenient re-exports of key types and interfaces

The `MessageRoutingFacade` hides the complexity of the Message Routing Domain behind a simple interface with just a few methods:

- `sendMessage`: Send a message and get a response synchronously
- `streamMessage`: Stream a message and get responses in chunks asynchronously
- `abortOperation`: Abort an in-progress operation

The facade also handles waiting for operations to complete, so callers don't need to implement their own polling logic.

## Conclusion

The Message Routing Domain implementation provides a comprehensive solution for managing the flow of messages between users, LLM providers, and tools. It addresses several key challenges:

### Key Features

1. **Message Orchestration**: Coordinates the flow of messages between components
2. **Tool Call Detection**: Automatically detects and routes tool calls for execution
3. **Response Assembly**: Combines provider responses with tool results
4. **Streaming Support**: First-class support for streaming responses
5. **Error Handling**: Robust error handling at multiple levels
6. **Event-Driven Communication**: Publishes events to notify other domains of important changes
7. **Command-Based Interface**: Provides a clear command-based interface for other domains

### Benefits

1. **Decoupling**: The domain is fully decoupled from the Provider and Tool domains
2. **Extensibility**: New providers and tools can be added without modifying the Message Routing Domain
3. **Scalability**: The event-driven architecture allows for easy scaling
4. **Observability**: Comprehensive events provide visibility into message flow
5. **Testability**: Clear interfaces make testing easier

### Implementation Timeline

Implementing the Message Routing Domain will take approximately 2-3 weeks:

**Week 1:**

- Define core interfaces and models
- Implement the Message Router
- Implement the Message Processor

**Week 2:**

- Implement the Tool Call Router
- Implement the Response Assembler
- Create Commands and Events

**Week 3:**

- Implement Command Handlers
- Write comprehensive tests
- Create integration code and facade

The Message Routing Domain serves as the central coordinator for the entire system, enabling seamless communication between users, providers, and tools. By implementing this domain with clear boundaries and well-defined interfaces, we ensure that the system remains flexible, maintainable, and extensible as requirements evolve.
