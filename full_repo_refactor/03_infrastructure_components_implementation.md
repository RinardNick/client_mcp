# Infrastructure Components Implementation

This document provides a detailed implementation plan for the foundational infrastructure components needed for the domain-driven architecture. These components will enable communication between domains and provide the basis for all further refactoring.

## Overview

The infrastructure components consist of:

1. **Command Bus** - For operation requests between domains
2. **Event Bus** - For state change notifications
3. **Dependency Injection Container** - For managing component dependencies

## Implementation Steps

### Step 1: Create Basic Types and Interfaces

**File: `src/llm/infrastructure/types.ts`**

```typescript
/**
 * Base interface for all commands
 */
export interface Command {
  /**
   * Unique type identifier for the command
   */
  type: string;
}

/**
 * Result of command execution
 */
export interface CommandResult<T = unknown> {
  /**
   * Whether the command was successful
   */
  success: boolean;

  /**
   * Data returned by the command handler
   */
  data?: T;

  /**
   * Error message if the command failed
   */
  error?: string;
}

/**
 * Interface for command handlers
 */
export interface CommandHandler<TCommand extends Command, TResult = unknown> {
  /**
   * Handle a command
   * @param command The command to handle
   * @returns Result of the command execution
   */
  handle(command: TCommand): Promise<CommandResult<TResult>>;
}

/**
 * Base interface for all events
 */
export interface Event {
  /**
   * Unique type identifier for the event
   */
  type: string;

  /**
   * When the event occurred
   */
  timestamp: Date;
}

/**
 * Interface for event handlers
 */
export interface EventHandler<TEvent extends Event> {
  /**
   * Handle an event
   * @param event The event to handle
   */
  handle(event: TEvent): void | Promise<void>;
}

/**
 * Subscription to event notifications
 */
export interface Subscription {
  /**
   * Unique identifier for the subscription
   */
  id: string;

  /**
   * Unsubscribe from further notifications
   */
  unsubscribe(): void;
}

/**
 * Type for constructors, used for command/event registration
 */
export type Constructor<T> = new (...args: any[]) => T;
```

#### Test: `src/llm/infrastructure/types.test.ts`

```typescript
import { Command, CommandResult, Event } from './types';

describe('Infrastructure Types', () => {
  test('Command interface can be implemented', () => {
    class TestCommand implements Command {
      type = 'test-command';
      constructor(public readonly data: string) {}
    }

    const command = new TestCommand('test-data');
    expect(command.type).toBe('test-command');
    expect(command.data).toBe('test-data');
  });

  test('CommandResult interface can be implemented', () => {
    const successResult: CommandResult<string> = {
      success: true,
      data: 'success-data',
    };

    const errorResult: CommandResult = {
      success: false,
      error: 'error-message',
    };

    expect(successResult.success).toBe(true);
    expect(successResult.data).toBe('success-data');

    expect(errorResult.success).toBe(false);
    expect(errorResult.error).toBe('error-message');
  });

  test('Event interface can be implemented', () => {
    class TestEvent implements Event {
      type = 'test-event';
      timestamp = new Date();
      constructor(public readonly data: string) {}
    }

    const event = new TestEvent('test-data');
    expect(event.type).toBe('test-event');
    expect(event.data).toBe('test-data');
    expect(event.timestamp).toBeInstanceOf(Date);
  });
});
```

### Step 2: Implement Command Bus

**File: `src/llm/infrastructure/command-bus.ts`**

```typescript
import { Command, CommandHandler, CommandResult, Constructor } from './types';

/**
 * Interface for the command bus
 */
export interface CommandBus {
  /**
   * Dispatch a command to its handler
   * @param command The command to dispatch
   * @returns Result of command execution
   */
  dispatch<TCommand extends Command, TResult = unknown>(
    command: TCommand
  ): Promise<CommandResult<TResult>>;

  /**
   * Register a handler for a command type
   * @param commandType Constructor for the command
   * @param handler Handler for the command
   */
  registerHandler<TCommand extends Command, TResult = unknown>(
    commandType: Constructor<TCommand>,
    handler: CommandHandler<TCommand, TResult>
  ): void;
}

/**
 * In-memory implementation of the command bus
 */
export class InMemoryCommandBus implements CommandBus {
  private handlers = new Map<string, CommandHandler<any, any>>();

  /**
   * Dispatch a command to its handler
   * @param command The command to dispatch
   * @returns Result of command execution
   */
  async dispatch<TCommand extends Command, TResult = unknown>(
    command: TCommand
  ): Promise<CommandResult<TResult>> {
    const handler = this.handlers.get(command.type);

    if (!handler) {
      return {
        success: false,
        error: `No handler registered for command type: ${command.type}`,
      };
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Register a handler for a command type
   * @param commandType Constructor for the command
   * @param handler Handler for the command
   */
  registerHandler<TCommand extends Command, TResult = unknown>(
    commandType: Constructor<TCommand>,
    handler: CommandHandler<TCommand, TResult>
  ): void {
    // Create a new instance to get the type
    const command = new commandType();
    this.handlers.set(command.type, handler);
  }
}
```

#### Test: `src/llm/infrastructure/command-bus.test.ts`

```typescript
import { Command, CommandHandler, CommandResult } from './types';
import { InMemoryCommandBus } from './command-bus';

// Define a test command
class TestCommand implements Command {
  type = 'test-command';
  constructor(public readonly data: string) {}
}

// Define a test command handler
class TestCommandHandler implements CommandHandler<TestCommand, string> {
  async handle(command: TestCommand): Promise<CommandResult<string>> {
    return {
      success: true,
      data: `Handled: ${command.data}`,
    };
  }
}

describe('InMemoryCommandBus', () => {
  let commandBus: InMemoryCommandBus;
  let handler: TestCommandHandler;

  beforeEach(() => {
    commandBus = new InMemoryCommandBus();
    handler = new TestCommandHandler();
    commandBus.registerHandler(TestCommand, handler);
  });

  test('should dispatch command to registered handler', async () => {
    const command = new TestCommand('test-data');
    const result = await commandBus.dispatch(command);

    expect(result.success).toBe(true);
    expect(result.data).toBe('Handled: test-data');
  });

  test('should return error for unregistered command', async () => {
    class UnregisteredCommand implements Command {
      type = 'unregistered-command';
    }

    const command = new UnregisteredCommand();
    const result = await commandBus.dispatch(command);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('No handler registered');
  });

  test('should handle errors thrown by handler', async () => {
    class ErrorCommand implements Command {
      type = 'error-command';
    }

    class ErrorHandler implements CommandHandler<ErrorCommand> {
      async handle(): Promise<CommandResult> {
        throw new Error('Test error');
      }
    }

    commandBus.registerHandler(ErrorCommand, new ErrorHandler());

    const command = new ErrorCommand();
    const result = await commandBus.dispatch(command);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Test error');
  });
});
```

### Step 3: Implement Event Bus

**File: `src/llm/infrastructure/event-bus.ts`**

```typescript
import { Event, EventHandler, Subscription, Constructor } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for the event bus
 */
export interface EventBus {
  /**
   * Publish an event to all subscribers
   * @param event The event to publish
   */
  publish<TEvent extends Event>(event: TEvent): void;

  /**
   * Subscribe to events of a specific type
   * @param eventType Constructor for the event
   * @param handler Handler for the event
   * @returns Subscription that can be used to unsubscribe
   */
  subscribe<TEvent extends Event>(
    eventType: Constructor<TEvent>,
    handler: EventHandler<TEvent>
  ): Subscription;
}

/**
 * Subscription implementation
 */
class EventSubscription implements Subscription {
  constructor(
    public readonly id: string,
    private readonly unsubscribeFn: () => void
  ) {}

  unsubscribe(): void {
    this.unsubscribeFn();
  }
}

/**
 * In-memory implementation of the event bus
 */
export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Map<string, EventHandler<any>>>();

  /**
   * Publish an event to all subscribers
   * @param event The event to publish
   */
  publish<TEvent extends Event>(event: TEvent): void {
    const eventType = event.type;
    const handlers = this.handlers.get(eventType);

    if (!handlers) {
      return; // No handlers for this event type
    }

    // Execute all handlers
    handlers.forEach(handler => {
      try {
        // Use setTimeout to make handlers execute asynchronously
        // This prevents one handler's error from blocking others
        setTimeout(() => {
          handler.handle(event);
        }, 0);
      } catch (error) {
        console.error(`Error handling event ${eventType}:`, error);
      }
    });
  }

  /**
   * Subscribe to events of a specific type
   * @param eventType Constructor for the event
   * @param handler Handler for the event
   * @returns Subscription that can be used to unsubscribe
   */
  subscribe<TEvent extends Event>(
    eventType: Constructor<TEvent>,
    handler: EventHandler<TEvent>
  ): Subscription {
    // Create a new instance to get the type
    const event = new eventType();
    const type = event.type;

    // Get or create handlers map for this event type
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Map());
    }

    // Generate unique ID for this subscription
    const subscriptionId = uuidv4();

    // Add handler to the map
    this.handlers.get(type)!.set(subscriptionId, handler);

    // Create subscription with unsubscribe function
    return new EventSubscription(subscriptionId, () => {
      const handlersForType = this.handlers.get(type);
      if (handlersForType) {
        handlersForType.delete(subscriptionId);
        // Clean up empty handler maps
        if (handlersForType.size === 0) {
          this.handlers.delete(type);
        }
      }
    });
  }
}
```

#### Test: `src/llm/infrastructure/event-bus.test.ts`

```typescript
import { Event, EventHandler } from './types';
import { InMemoryEventBus } from './event-bus';

// Define a test event
class TestEvent implements Event {
  type = 'test-event';
  timestamp = new Date();
  constructor(public readonly data: string) {}
}

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should notify subscribers when event is published', () => {
    const handler: EventHandler<TestEvent> = {
      handle: jest.fn(),
    };

    eventBus.subscribe(TestEvent, handler);

    const event = new TestEvent('test-data');
    eventBus.publish(event);

    // Fast-forward timers to execute async handlers
    jest.runAllTimers();

    expect(handler.handle).toHaveBeenCalledWith(event);
  });

  test('should allow unsubscribing from events', () => {
    const handler: EventHandler<TestEvent> = {
      handle: jest.fn(),
    };

    const subscription = eventBus.subscribe(TestEvent, handler);

    // First event - should be handled
    const event1 = new TestEvent('test-data-1');
    eventBus.publish(event1);

    // Unsubscribe
    subscription.unsubscribe();

    // Second event - should not be handled
    const event2 = new TestEvent('test-data-2');
    eventBus.publish(event2);

    // Fast-forward timers to execute async handlers
    jest.runAllTimers();

    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(handler.handle).toHaveBeenCalledWith(event1);
    expect(handler.handle).not.toHaveBeenCalledWith(event2);
  });

  test('should not fail when publishing event with no subscribers', () => {
    const event = new TestEvent('test-data');

    // This should not throw an error
    expect(() => {
      eventBus.publish(event);
      jest.runAllTimers();
    }).not.toThrow();
  });

  test('should handle multiple subscribers for the same event', () => {
    const handler1: EventHandler<TestEvent> = {
      handle: jest.fn(),
    };

    const handler2: EventHandler<TestEvent> = {
      handle: jest.fn(),
    };

    eventBus.subscribe(TestEvent, handler1);
    eventBus.subscribe(TestEvent, handler2);

    const event = new TestEvent('test-data');
    eventBus.publish(event);

    // Fast-forward timers to execute async handlers
    jest.runAllTimers();

    expect(handler1.handle).toHaveBeenCalledWith(event);
    expect(handler2.handle).toHaveBeenCalledWith(event);
  });
});
```

### Step 4: Implement Dependency Injection Container

**File: `src/llm/infrastructure/container.ts`**

```typescript
/**
 * Interface for a dependency injection container
 */
export interface DIContainer {
  /**
   * Register a dependency with the container
   * @param key Key to register the dependency under
   * @param implementation Implementation of the dependency
   */
  register<T>(key: string, implementation: T): void;

  /**
   * Get a dependency from the container
   * @param key Key of the dependency to retrieve
   * @returns The registered implementation
   * @throws Error if the dependency is not registered
   */
  get<T>(key: string): T;
}

/**
 * Simple in-memory dependency injection container
 */
export class InMemoryContainer implements DIContainer {
  private static instance: InMemoryContainer;
  private dependencies = new Map<string, any>();

  /**
   * Get the singleton instance
   */
  public static getInstance(): InMemoryContainer {
    if (!InMemoryContainer.instance) {
      InMemoryContainer.instance = new InMemoryContainer();
    }
    return InMemoryContainer.instance;
  }

  /**
   * Private constructor to enforce singleton
   */
  private constructor() {}

  /**
   * Register a dependency with the container
   * @param key Key to register the dependency under
   * @param implementation Implementation of the dependency
   */
  register<T>(key: string, implementation: T): void {
    this.dependencies.set(key, implementation);
  }

  /**
   * Get a dependency from the container
   * @param key Key of the dependency to retrieve
   * @returns The registered implementation
   * @throws Error if the dependency is not registered
   */
  get<T>(key: string): T {
    const implementation = this.dependencies.get(key);
    if (!implementation) {
      throw new Error(`Dependency not found: ${key}`);
    }
    return implementation as T;
  }

  /**
   * Check if a dependency is registered
   * @param key Key to check
   * @returns Whether the dependency is registered
   */
  has(key: string): boolean {
    return this.dependencies.has(key);
  }

  /**
   * Clear all dependencies (mainly for testing)
   */
  clear(): void {
    this.dependencies.clear();
  }
}

/**
 * Standard keys for common dependencies
 */
export const DI_KEYS = {
  COMMAND_BUS: 'commandBus',
  EVENT_BUS: 'eventBus',
  SESSION_REPOSITORY: 'sessionRepository',
  PROVIDER_MANAGER: 'providerManager',
  TOOL_MANAGER: 'toolManager',
  CONTEXT_MANAGER: 'contextManager',
  SERVER_MANAGER: 'serverManager',
  MESSAGE_ROUTER: 'messageRouter',
  SESSION_MANAGER: 'sessionManager',
};
```

#### Test: `src/llm/infrastructure/container.test.ts`

```typescript
import { InMemoryContainer, DI_KEYS } from './container';

describe('InMemoryContainer', () => {
  let container: InMemoryContainer;

  beforeEach(() => {
    // Reset the singleton for tests
    (InMemoryContainer as any).instance = undefined;
    container = InMemoryContainer.getInstance();

    // Clear any existing dependencies
    container.clear();
  });

  test('should be a singleton', () => {
    const instance1 = InMemoryContainer.getInstance();
    const instance2 = InMemoryContainer.getInstance();

    expect(instance1).toBe(instance2);
  });

  test('should register and retrieve dependencies', () => {
    const dependency = { value: 'test' };
    container.register('testKey', dependency);

    const retrieved = container.get('testKey');
    expect(retrieved).toBe(dependency);
  });

  test('should throw error when getting unregistered dependency', () => {
    expect(() => {
      container.get('nonExistentKey');
    }).toThrow('Dependency not found');
  });

  test('should check if dependency exists', () => {
    container.register('existingKey', {});

    expect(container.has('existingKey')).toBe(true);
    expect(container.has('nonExistentKey')).toBe(false);
  });

  test('should clear all dependencies', () => {
    container.register('key1', {});
    container.register('key2', {});

    container.clear();

    expect(container.has('key1')).toBe(false);
    expect(container.has('key2')).toBe(false);
  });

  test('DI_KEYS should define standard keys', () => {
    expect(DI_KEYS.COMMAND_BUS).toBeDefined();
    expect(DI_KEYS.EVENT_BUS).toBeDefined();
    expect(DI_KEYS.SESSION_REPOSITORY).toBeDefined();
    expect(DI_KEYS.PROVIDER_MANAGER).toBeDefined();
    expect(DI_KEYS.TOOL_MANAGER).toBeDefined();
    expect(DI_KEYS.CONTEXT_MANAGER).toBeDefined();
    expect(DI_KEYS.SERVER_MANAGER).toBeDefined();
    expect(DI_KEYS.MESSAGE_ROUTER).toBeDefined();
    expect(DI_KEYS.SESSION_MANAGER).toBeDefined();
  });
});
```

### Step 5: Create Infrastructure Index File

**File: `src/llm/infrastructure/index.ts`**

```typescript
// Export all infrastructure components
export * from './types';
export * from './command-bus';
export * from './event-bus';
export * from './container';

// Import for side effects
import { InMemoryContainer, DI_KEYS } from './container';
import { InMemoryCommandBus } from './command-bus';
import { InMemoryEventBus } from './event-bus';

/**
 * Initialize the infrastructure components
 * This registers the core components in the container
 */
export function initializeInfrastructure(): void {
  const container = InMemoryContainer.getInstance();

  // Create instances if they don't exist
  if (!container.has(DI_KEYS.COMMAND_BUS)) {
    container.register(DI_KEYS.COMMAND_BUS, new InMemoryCommandBus());
  }

  if (!container.has(DI_KEYS.EVENT_BUS)) {
    container.register(DI_KEYS.EVENT_BUS, new InMemoryEventBus());
  }
}
```

#### Test: `src/llm/infrastructure/index.test.ts`

```typescript
import { initializeInfrastructure } from './index';
import { InMemoryContainer, DI_KEYS } from './container';
import { InMemoryCommandBus } from './command-bus';
import { InMemoryEventBus } from './event-bus';

describe('Infrastructure Initialization', () => {
  beforeEach(() => {
    // Reset the container for each test
    (InMemoryContainer as any).instance = undefined;
    const container = InMemoryContainer.getInstance();
    container.clear();
  });

  test('should register core components in the container', () => {
    initializeInfrastructure();

    const container = InMemoryContainer.getInstance();

    expect(container.has(DI_KEYS.COMMAND_BUS)).toBe(true);
    expect(container.has(DI_KEYS.EVENT_BUS)).toBe(true);

    expect(container.get(DI_KEYS.COMMAND_BUS)).toBeInstanceOf(
      InMemoryCommandBus
    );
    expect(container.get(DI_KEYS.EVENT_BUS)).toBeInstanceOf(InMemoryEventBus);
  });

  test('should not override existing components', () => {
    const container = InMemoryContainer.getInstance();
    const customCommandBus = new InMemoryCommandBus();

    // Register a custom implementation
    container.register(DI_KEYS.COMMAND_BUS, customCommandBus);

    // Initialize infrastructure
    initializeInfrastructure();

    // Should still have our custom implementation
    expect(container.get(DI_KEYS.COMMAND_BUS)).toBe(customCommandBus);
  });
});
```

### Step 6: Demo Usage Example

**File: `src/llm/infrastructure/demo.ts`**

```typescript
// This file is for demonstration purposes only
// It shows how the infrastructure components can be used together

import {
  Command,
  CommandHandler,
  CommandResult,
  Event,
  EventHandler,
} from './types';
import { InMemoryCommandBus } from './command-bus';
import { InMemoryEventBus } from './event-bus';
import { InMemoryContainer, DI_KEYS } from './container';
import { initializeInfrastructure } from './index';

// Initialize infrastructure
initializeInfrastructure();

// Define a command
class GreetCommand implements Command {
  type = 'greet';
  constructor(public readonly name: string) {}
}

// Define a command handler
class GreetCommandHandler implements CommandHandler<GreetCommand, string> {
  async handle(command: GreetCommand): Promise<CommandResult<string>> {
    return {
      success: true,
      data: `Hello, ${command.name}!`,
    };
  }
}

// Define an event
class PersonGreetedEvent implements Event {
  type = 'person-greeted';
  timestamp = new Date();
  constructor(public readonly name: string, public readonly greeting: string) {}
}

// Define an event handler
class GreetingLogger implements EventHandler<PersonGreetedEvent> {
  handle(event: PersonGreetedEvent): void {
    console.log(
      `[${event.timestamp.toISOString()}] ${event.name} was greeted: ${
        event.greeting
      }`
    );
  }
}

// Get components from container
const container = InMemoryContainer.getInstance();
const commandBus = container.get<InMemoryCommandBus>(DI_KEYS.COMMAND_BUS);
const eventBus = container.get<InMemoryEventBus>(DI_KEYS.EVENT_BUS);

// Register command handler
commandBus.registerHandler(GreetCommand, new GreetCommandHandler());

// Register event handler
eventBus.subscribe(PersonGreetedEvent, new GreetingLogger());

// Use the components
async function demo() {
  // Dispatch a command
  const command = new GreetCommand('Alice');
  const result = await commandBus.dispatch(command);

  if (result.success && result.data) {
    // Publish an event
    const event = new PersonGreetedEvent('Alice', result.data);
    eventBus.publish(event);
  }
}

// Run the demo
demo().catch(console.error);
```

## Integration Steps

### Step 1: Add Infrastructure to Project

1. Create the necessary directories:

```bash
mkdir -p src/llm/infrastructure
```

2. Create and add the files as specified above.

3. Run the tests to ensure all components work correctly:

```bash
npm test -- --testPathPattern=src/llm/infrastructure
```

### Step 2: Update Project Configuration

Update the TypeScript configuration if needed to include the new infrastructure directory:

```json
// tsconfig.json
{
  "compilerOptions": {
    // ... existing options
  },
  "include": [
    // ... existing includes
    "src/llm/infrastructure/**/*"
  ]
}
```

### Step 3: Document the Infrastructure Components

Add JSDoc documentation to all public interfaces and methods. This is already included in the code above.

## Testing Plan

1. **Unit Tests**: Test each component in isolation (already provided above)
2. **Integration Tests**: Test components working together
3. **Example Usage**: Provide a demo of how the components are used together
4. **Documentation**: Ensure all public APIs are documented

## Success Criteria

- ✅ All infrastructure components are implemented
- ✅ All tests pass
- ✅ Documentation is complete
- ✅ Demo usage example works correctly
- ✅ Components are registered in the DI container

## Next Step

After completing the infrastructure components, proceed to implementing the Session State Repository as defined in the master implementation plan.
