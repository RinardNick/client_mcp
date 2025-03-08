# Tool Domain Implementation

This document provides a detailed implementation plan for the Tool Domain components, which will be responsible for managing tool definitions, handling tool calls, and executing tools within the LLM system.

## Overview

The Tool Domain manages the registration, discovery, formatting, and execution of tools that can be invoked by LLMs. These tools allow LLMs to perform actions beyond text generation, such as searching the web, retrieving information from databases, or interacting with external APIs.

### Components

The Tool Domain consists of the following core components:

1. **Tool Interfaces and Models**: Standardized interfaces and data structures for defining tools and their schemas
2. **Tool Registry**: Central registry for tool registration and discovery
3. **Tool Formatter**: Converts tool definitions to provider-specific formats
4. **Tool Executor**: Executes tool calls and handles results
5. **Tool Commands and Events**: Domain-specific commands and events for tool operations
6. **Tool Command Handlers**: Handlers for processing tool commands

### Key Responsibilities

- **Tool Registration**: Allow tools to be registered with metadata and schemas
- **Tool Discovery**: Provide mechanisms to discover available tools based on criteria
- **Tool Schema Management**: Maintain schemas for tools to ensure proper validation
- **Tool Execution**: Execute tool calls from LLMs and handle results
- **Provider Format Adaptation**: Format tools according to provider-specific requirements
- **Error Handling**: Handle errors during tool execution and provide meaningful feedback

## Architecture

The Tool Domain follows clean architecture principles with distinct layers:

1. **Domain Layer**: Core entities, interfaces, and business logic
2. **Application Layer**: Commands, command handlers, and services
3. **Infrastructure Layer**: Concrete implementations and external integrations

The domain will use the Command and Event patterns to communicate with other domains:

```
┌─────────────────┐     Commands     ┌─────────────────┐
│   Other Domains │─────────────────>│   Tool Domain   │
│                 │<───────────────┐ │                 │
└─────────────────┘     Events     └─────────────────┘
                                         │  ▲
                                         │  │
                                         ▼  │
                                    ┌────────────┐
                                    │ External   │
                                    │ Services   │
                                    └────────────┘
```

## Implementation Approach

The implementation will follow a modular approach, with clear interfaces between components:

1. Define core interfaces and models
2. Implement the tool registry for registration and discovery
3. Create the tool formatter for provider-specific adaptations
4. Develop the tool executor for handling tool calls
5. Implement commands and events for domain communication
6. Create command handlers to process requests

We'll start with a basic set of built-in tools and provide an extension mechanism for custom tools.

## Integration with Other Domains

The Tool Domain will integrate with:

- **Provider Domain**: To format tools for specific providers and handle tool calls
- **Session Domain**: To maintain context during tool execution and track session state
- **Context Domain**: To store and retrieve context relevant to tool execution
- **Message Routing**: To route tool call results back to the conversation

Now, let's outline the implementation details for each component.

## Implementation Steps

### Step 1: Define Tool Interfaces and Models

First, we'll define the core interfaces and models that will be used throughout the Tool Domain.

**File: `src/llm/tool/models/tool-types.ts`**

```typescript
/**
 * Type of tool
 */
export enum ToolType {
  FUNCTION = 'function', // Tools that execute JavaScript/TypeScript functions
  HTTP = 'http', // Tools that make HTTP requests
  CUSTOM = 'custom', // Custom tool types with custom execution logic
}

/**
 * Tool parameter schema
 * Compatible with JSON Schema
 */
export interface ToolParameterSchema {
  type: string; // Data type (string, number, boolean, object, array)
  description?: string; // Description of the parameter
  enum?: any[]; // Enumeration of possible values
  default?: any; // Default value
  required?: boolean; // Whether the parameter is required
  properties?: Record<string, ToolParameterSchema>; // For object types
  items?: ToolParameterSchema; // For array types
  minimum?: number; // For number types
  maximum?: number; // For number types
  minLength?: number; // For string types
  maxLength?: number; // For string types
  format?: string; // Format specifier (e.g., date, email)
  pattern?: string; // Regex pattern for validation
  additionalProperties?: boolean | ToolParameterSchema; // For object types
}

/**
 * Function tool schema
 */
export interface FunctionToolSchema {
  name: string; // Function name
  description: string; // Function description
  parameters: {
    // Parameters schema
    type: 'object'; // Always object for function parameters
    properties: Record<string, ToolParameterSchema>; // Parameter definitions
    required?: string[]; // Required parameter names
  };
  returns?: ToolParameterSchema; // Return value schema
}

/**
 * HTTP tool schema
 */
export interface HttpToolSchema {
  name: string; // HTTP endpoint name
  description: string; // Endpoint description
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // HTTP method
  url: string; // URL pattern with {param} placeholders
  parameters: {
    // Parameters schema
    type: 'object'; // Always object for HTTP parameters
    properties: Record<string, ToolParameterSchema>; // Parameter definitions
    required?: string[]; // Required parameter names
  };
  headers?: Record<string, string>; // Default headers
  authentication?: 'none' | 'basic' | 'bearer' | 'api_key'; // Auth type
  authConfig?: Record<string, string>; // Auth configuration
}

/**
 * Custom tool schema
 */
export interface CustomToolSchema {
  name: string; // Custom tool name
  description: string; // Tool description
  type: string; // Custom type identifier
  parameters: {
    // Parameters schema
    type: 'object'; // Always object for tool parameters
    properties: Record<string, ToolParameterSchema>; // Parameter definitions
    required?: string[]; // Required parameter names
  };
  metadata?: Record<string, any>; // Additional metadata for custom handling
}

/**
 * Union type for all tool schemas
 */
export type ToolSchema = FunctionToolSchema | HttpToolSchema | CustomToolSchema;

/**
 * Result of tool execution
 */
export interface ToolResult {
  success: boolean; // Whether the execution was successful
  data?: any; // Result data if successful
  error?: string; // Error message if unsuccessful
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * Tool context for execution
 */
export interface ToolContext {
  sessionId: string; // Session ID
  toolCallId: string; // Tool call ID
  userId?: string; // User ID if available
  requestId?: string; // Request ID for tracking
  sessionContext?: Record<string, any>; // Additional session context
}
```

**File: `src/llm/tool/models/tool-definition.ts`**

```typescript
import {
  ToolType,
  ToolSchema,
  FunctionToolSchema,
  HttpToolSchema,
  CustomToolSchema,
} from './tool-types';

/**
 * Categories for organizing tools
 */
export enum ToolCategory {
  UTILITY = 'utility', // General utility tools
  RETRIEVAL = 'retrieval', // Information retrieval tools
  ANALYSIS = 'analysis', // Data analysis tools
  GENERATION = 'generation', // Content generation tools
  INTEGRATION = 'integration', // External service integration tools
}

/**
 * Base tool definition interface
 */
export interface ToolDefinition {
  id: string; // Unique tool identifier
  name: string; // Tool name
  description: string; // Tool description
  version: string; // Tool version
  type: ToolType; // Tool type
  schema: ToolSchema; // Tool schema
  categories: ToolCategory[]; // Tool categories
  requiredPermissions?: string[]; // Required permissions to use the tool
  supportedProviders?: string[]; // LLM providers that support this tool
  enabled: boolean; // Whether the tool is enabled
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * Function tool definition
 */
export interface FunctionToolDefinition extends ToolDefinition {
  type: ToolType.FUNCTION;
  schema: FunctionToolSchema;
  executionFn: Function; // Function to execute
}

/**
 * HTTP tool definition
 */
export interface HttpToolDefinition extends ToolDefinition {
  type: ToolType.HTTP;
  schema: HttpToolSchema;
  transformRequest?: (params: any) => any; // Transform parameters to request format
  transformResponse?: (response: any) => any; // Transform response to result format
}

/**
 * Custom tool definition
 */
export interface CustomToolDefinition extends ToolDefinition {
  type: ToolType.CUSTOM;
  schema: CustomToolSchema;
  execute: (params: any, context: any) => Promise<any>; // Custom execution function
}

/**
 * Union type for all tool definitions
 */
export type AnyToolDefinition =
  | FunctionToolDefinition
  | HttpToolDefinition
  | CustomToolDefinition;
```

**File: `src/llm/tool/models/tool-call.ts`**

```typescript
import { ToolType } from './tool-types';
import { ToolDefinition } from './tool-definition';

/**
 * Status of a tool call
 */
export enum ToolCallStatus {
  PENDING = 'pending', // Tool call is pending execution
  EXECUTING = 'executing', // Tool is currently executing
  COMPLETED = 'completed', // Tool execution completed successfully
  FAILED = 'failed', // Tool execution failed
  TIMEOUT = 'timeout', // Tool execution timed out
  CANCELLED = 'cancelled', // Tool execution was cancelled
}

/**
 * Tool call interface
 */
export interface ToolCall {
  id: string; // Unique tool call ID
  sessionId: string; // Session ID
  toolId: string; // ID of the tool being called
  toolName: string; // Name of the tool being called
  toolType: ToolType; // Type of the tool being called
  arguments: any; // Arguments for the tool call
  status: ToolCallStatus; // Status of the tool call
  result?: any; // Result of the tool call (if completed)
  error?: string; // Error message (if failed)
  startTime: Date; // Time when the tool call started
  endTime?: Date; // Time when the tool call ended
  executionTime?: number; // Execution time in milliseconds
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  timeout?: number; // Execution timeout in milliseconds
  maxRetries?: number; // Maximum number of retries
  retryDelay?: number; // Delay between retries in milliseconds
  context?: Record<string, any>; // Additional context for execution
}

/**
 * Tool call batch for executing multiple tools
 */
export interface ToolCallBatch {
  id: string; // Batch ID
  sessionId: string; // Session ID
  calls: ToolCall[]; // Tool calls in this batch
  startTime: Date; // Batch start time
  endTime?: Date; // Batch end time
  status: ToolCallStatus; // Overall batch status
}

/**
 * Tool execution request
 */
export interface ToolExecutionRequest {
  sessionId: string; // Session ID
  toolId: string; // Tool ID
  arguments: any; // Tool arguments
  options?: ToolExecutionOptions; // Execution options
  userId?: string; // User ID if available
  requestId?: string; // Request ID for tracking
}

/**
 * Tool execution response
 */
export interface ToolExecutionResponse {
  toolCallId: string; // Tool call ID
  toolId: string; // Tool ID
  toolName: string; // Tool name
  result?: any; // Execution result if successful
  error?: string; // Error message if failed
  status: ToolCallStatus; // Execution status
  executionTime: number; // Execution time in milliseconds
}
```

These interfaces and models define the core data structures for the Tool Domain. They provide a flexible framework for defining, registering, and executing different types of tools while maintaining consistent interfaces for other domains to interact with.

In the next step, we'll implement the Tool Registry for registration and discovery of tools.

### Step 2: Implement Tool Registry

The Tool Registry serves as the central repository for registering and discovering tools. It provides methods to register, retrieve, and query tools based on various criteria.

**File: `src/llm/tool/registry/tool-registry.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  ToolType,
  ToolCategory,
  ToolDefinition,
  FunctionToolDefinition,
  HttpToolDefinition,
  CustomToolDefinition,
  AnyToolDefinition,
} from '../models/tool-definition';

/**
 * Interface for tool registry
 */
export interface ToolRegistry {
  /**
   * Register a new tool
   * @param tool Tool definition to register
   * @returns The registered tool with its assigned ID
   */
  registerTool(tool: Omit<AnyToolDefinition, 'id'>): AnyToolDefinition;

  /**
   * Unregister a tool by ID
   * @param id Tool ID
   * @returns True if the tool was unregistered, false if it wasn't found
   */
  unregisterTool(id: string): boolean;

  /**
   * Get a tool by ID
   * @param id Tool ID
   * @returns The tool definition, or undefined if not found
   */
  getTool(id: string): AnyToolDefinition | undefined;

  /**
   * Get a tool by name
   * @param name Tool name
   * @returns The tool definition, or undefined if not found
   */
  getToolByName(name: string): AnyToolDefinition | undefined;

  /**
   * Get all registered tools
   * @returns Array of all registered tools
   */
  getAllTools(): AnyToolDefinition[];

  /**
   * Get tools by category
   * @param category Tool category
   * @returns Array of tools in the specified category
   */
  getToolsByCategory(category: ToolCategory): AnyToolDefinition[];

  /**
   * Get tools by type
   * @param type Tool type
   * @returns Array of tools of the specified type
   */
  getToolsByType(type: ToolType): AnyToolDefinition[];

  /**
   * Get tools supported by a specific provider
   * @param provider Provider ID
   * @returns Array of tools supported by the provider
   */
  getToolsForProvider(provider: string): AnyToolDefinition[];

  /**
   * Check if a tool is registered
   * @param id Tool ID
   * @returns True if the tool is registered
   */
  hasToolWithId(id: string): boolean;

  /**
   * Check if a tool with the given name is registered
   * @param name Tool name
   * @returns True if a tool with the name is registered
   */
  hasToolWithName(name: string): boolean;

  /**
   * Enable a tool
   * @param id Tool ID
   * @returns True if the tool was enabled, false if not found
   */
  enableTool(id: string): boolean;

  /**
   * Disable a tool
   * @param id Tool ID
   * @returns True if the tool was disabled, false if not found
   */
  disableTool(id: string): boolean;

  /**
   * Get all enabled tools
   * @returns Array of all enabled tools
   */
  getEnabledTools(): AnyToolDefinition[];

  /**
   * Validate if a user has permission to use a tool
   * @param toolId Tool ID
   * @param permissions Array of permissions the user has
   * @returns True if the user has permission
   */
  validateToolPermission(toolId: string, permissions: string[]): boolean;

  /**
   * Update a tool definition
   * @param id Tool ID
   * @param updates Partial updates to apply
   * @returns The updated tool, or undefined if not found
   */
  updateTool(
    id: string,
    updates: Partial<Omit<ToolDefinition, 'id' | 'type'>>
  ): AnyToolDefinition | undefined;
}

/**
 * In-memory implementation of the tool registry
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private tools: Map<string, AnyToolDefinition> = new Map();
  private toolsByName: Map<string, AnyToolDefinition> = new Map();

  constructor() {}

  registerTool(tool: Omit<AnyToolDefinition, 'id'>): AnyToolDefinition {
    // Check if a tool with this name already exists
    if (this.hasToolWithName(tool.name)) {
      throw new Error(`A tool with name "${tool.name}" is already registered`);
    }

    // Assign an ID if not provided
    const id = 'id' in tool ? (tool as any).id : uuidv4();
    const fullTool = { ...tool, id } as AnyToolDefinition;

    // Store the tool
    this.tools.set(id, fullTool);
    this.toolsByName.set(tool.name.toLowerCase(), fullTool);

    return fullTool;
  }

  unregisterTool(id: string): boolean {
    const tool = this.tools.get(id);
    if (!tool) {
      return false;
    }

    // Remove from both maps
    this.tools.delete(id);
    this.toolsByName.delete(tool.name.toLowerCase());

    return true;
  }

  getTool(id: string): AnyToolDefinition | undefined {
    return this.tools.get(id);
  }

  getToolByName(name: string): AnyToolDefinition | undefined {
    return this.toolsByName.get(name.toLowerCase());
  }

  getAllTools(): AnyToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: ToolCategory): AnyToolDefinition[] {
    return this.getAllTools().filter(tool =>
      tool.categories.includes(category)
    );
  }

  getToolsByType(type: ToolType): AnyToolDefinition[] {
    return this.getAllTools().filter(tool => tool.type === type);
  }

  getToolsForProvider(provider: string): AnyToolDefinition[] {
    const providerLower = provider.toLowerCase();
    return this.getAllTools().filter(
      tool =>
        !tool.supportedProviders ||
        tool.supportedProviders.some(p => p.toLowerCase() === providerLower)
    );
  }

  hasToolWithId(id: string): boolean {
    return this.tools.has(id);
  }

  hasToolWithName(name: string): boolean {
    return this.toolsByName.has(name.toLowerCase());
  }

  enableTool(id: string): boolean {
    const tool = this.tools.get(id);
    if (!tool) {
      return false;
    }

    tool.enabled = true;
    return true;
  }

  disableTool(id: string): boolean {
    const tool = this.tools.get(id);
    if (!tool) {
      return false;
    }

    tool.enabled = false;
    return true;
  }

  getEnabledTools(): AnyToolDefinition[] {
    return this.getAllTools().filter(tool => tool.enabled);
  }

  validateToolPermission(toolId: string, permissions: string[]): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return false;
    }

    // If tool doesn't require permissions, allow it
    if (!tool.requiredPermissions || tool.requiredPermissions.length === 0) {
      return true;
    }

    // Check if user has all required permissions
    return tool.requiredPermissions.every(permission =>
      permissions.includes(permission)
    );
  }

  updateTool(
    id: string,
    updates: Partial<Omit<ToolDefinition, 'id' | 'type'>>
  ): AnyToolDefinition | undefined {
    const tool = this.tools.get(id);
    if (!tool) {
      return undefined;
    }

    // If name is being updated, update the name map
    if (updates.name && updates.name !== tool.name) {
      this.toolsByName.delete(tool.name.toLowerCase());
      this.toolsByName.set(updates.name.toLowerCase(), tool);
    }

    // Apply updates
    Object.assign(tool, updates);

    return tool;
  }
}

/**
 * Global singleton instance of the tool registry
 */
let globalRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry instance
 * Creates it if it doesn't exist
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new InMemoryToolRegistry();
  }
  return globalRegistry;
}

/**
 * Set the global tool registry instance
 * Useful for testing or custom implementations
 */
export function setToolRegistry(registry: ToolRegistry): void {
  globalRegistry = registry;
}
```

**File: `src/llm/tool/registry/tool-registry.test.ts`**

```typescript
import { InMemoryToolRegistry } from './tool-registry';
import { ToolType, ToolCategory } from '../models/tool-definition';

describe('InMemoryToolRegistry', () => {
  let registry: InMemoryToolRegistry;

  beforeEach(() => {
    registry = new InMemoryToolRegistry();
  });

  test('should register a tool', () => {
    const tool = {
      name: 'testTool',
      description: 'A test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input parameter',
            },
          },
          required: ['input'],
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn(),
    };

    const registered = registry.registerTool(tool);

    expect(registered.id).toBeDefined();
    expect(registered.name).toBe('testTool');
    expect(registry.getAllTools()).toHaveLength(1);
  });

  test('should retrieve a tool by ID', () => {
    const tool = {
      name: 'testTool',
      description: 'A test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input parameter',
            },
          },
          required: ['input'],
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn(),
    };

    const registered = registry.registerTool(tool);
    const retrieved = registry.getTool(registered.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(registered.id);
  });

  test('should retrieve a tool by name', () => {
    const tool = {
      name: 'testTool',
      description: 'A test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input parameter',
            },
          },
          required: ['input'],
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn(),
    };

    registry.registerTool(tool);
    const retrieved = registry.getToolByName('testTool');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('testTool');

    // Case insensitive lookup
    const retrievedCaseInsensitive = registry.getToolByName('TESTTOOL');
    expect(retrievedCaseInsensitive).toBeDefined();
  });

  test('should filter tools by category', () => {
    const tool1 = {
      name: 'utilityTool',
      description: 'A utility tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'utilityTool',
        description: 'A utility tool',
        parameters: { type: 'object', properties: {} },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn(),
    };

    const tool2 = {
      name: 'retrievalTool',
      description: 'A retrieval tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'retrievalTool',
        description: 'A retrieval tool',
        parameters: { type: 'object', properties: {} },
      },
      categories: [ToolCategory.RETRIEVAL],
      enabled: true,
      executionFn: jest.fn(),
    };

    registry.registerTool(tool1);
    registry.registerTool(tool2);

    const utilityTools = registry.getToolsByCategory(ToolCategory.UTILITY);
    expect(utilityTools).toHaveLength(1);
    expect(utilityTools[0].name).toBe('utilityTool');

    const retrievalTools = registry.getToolsByCategory(ToolCategory.RETRIEVAL);
    expect(retrievalTools).toHaveLength(1);
    expect(retrievalTools[0].name).toBe('retrievalTool');
  });

  test('should unregister a tool', () => {
    const tool = {
      name: 'testTool',
      description: 'A test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn(),
    };

    const registered = registry.registerTool(tool);
    expect(registry.getAllTools()).toHaveLength(1);

    registry.unregisterTool(registered.id);
    expect(registry.getAllTools()).toHaveLength(0);
    expect(registry.getToolByName('testTool')).toBeUndefined();
  });

  test('should validate tool permissions', () => {
    const tool = {
      name: 'restrictedTool',
      description: 'A restricted tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'restrictedTool',
        description: 'A restricted tool',
        parameters: { type: 'object', properties: {} },
      },
      categories: [ToolCategory.UTILITY],
      requiredPermissions: ['admin', 'special'],
      enabled: true,
      executionFn: jest.fn(),
    };

    const registered = registry.registerTool(tool);

    // User with all required permissions
    expect(
      registry.validateToolPermission(registered.id, [
        'admin',
        'special',
        'other',
      ])
    ).toBe(true);

    // User with some but not all permissions
    expect(registry.validateToolPermission(registered.id, ['admin'])).toBe(
      false
    );

    // User with no required permissions
    expect(registry.validateToolPermission(registered.id, ['other'])).toBe(
      false
    );
  });

  test('should enable and disable tools', () => {
    const tool = {
      name: 'testTool',
      description: 'A test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
      },
      categories: [ToolCategory.UTILITY],
      enabled: false,
      executionFn: jest.fn(),
    };

    const registered = registry.registerTool(tool);
    expect(registry.getEnabledTools()).toHaveLength(0);

    registry.enableTool(registered.id);
    expect(registry.getEnabledTools()).toHaveLength(1);

    registry.disableTool(registered.id);
    expect(registry.getEnabledTools()).toHaveLength(0);
  });

  test('should update tool definitions', () => {
    const tool = {
      name: 'testTool',
      description: 'A test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'testTool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn(),
    };

    const registered = registry.registerTool(tool);

    registry.updateTool(registered.id, {
      name: 'updatedTool',
      description: 'An updated tool',
      version: '1.1.0',
    });

    const updated = registry.getTool(registered.id);
    expect(updated?.name).toBe('updatedTool');
    expect(updated?.description).toBe('An updated tool');
    expect(updated?.version).toBe('1.1.0');

    // Tool should be retrievable by new name
    expect(registry.getToolByName('updatedTool')).toBeDefined();
    expect(registry.getToolByName('testTool')).toBeUndefined();
  });
});
```

The Tool Registry provides a comprehensive interface for managing tools, including registration, querying, and permission validation. The `InMemoryToolRegistry` implementation stores tools in memory using Maps for efficient lookup by both ID and name.

Key features of the Tool Registry include:

1. **Tool Registration**: Register tools with automatic ID generation
2. **Tool Discovery**: Find tools by ID, name, category, type, or provider
3. **Tool Management**: Enable/disable tools, update tool definitions
4. **Permission Validation**: Check if a user has permission to use a tool
5. **Efficient Lookups**: Optimized lookup by both ID and name with case-insensitive search

The registry also provides singleton access through the `getToolRegistry` function, which ensures a single registry instance is used throughout the application.

In the next step, we'll implement the Tool Formatter to convert tool definitions to provider-specific formats.

### Step 3: Implement Tool Formatter

The Tool Formatter is responsible for converting our standardized tool definitions into provider-specific formats. Different LLM providers have their own requirements for tool definitions, and this component handles those conversions.

**File: `src/llm/tool/formatter/tool-formatter.ts`**

```typescript
import {
  ToolType,
  AnyToolDefinition,
  FunctionToolDefinition,
  HttpToolDefinition,
  CustomToolDefinition,
} from '../models/tool-definition';

/**
 * Supported provider formats
 */
export enum ProviderFormat {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  CUSTOM = 'custom',
}

/**
 * Interface for tool formatters
 */
export interface ToolFormatter {
  /**
   * Format tools for a specific provider
   * @param tools Array of tool definitions to format
   * @param providerFormat Target provider format
   * @param options Additional formatting options
   * @returns Formatted tools in provider-specific format
   */
  formatToolsForProvider(
    tools: AnyToolDefinition[],
    providerFormat: ProviderFormat,
    options?: Record<string, any>
  ): any[];

  /**
   * Register a custom formatter for a provider
   * @param providerFormat Provider format to register for
   * @param formatter Formatter function
   */
  registerCustomFormatter(
    providerFormat: string,
    formatter: (
      tools: AnyToolDefinition[],
      options?: Record<string, any>
    ) => any[]
  ): void;
}

/**
 * Default implementation of the tool formatter
 */
export class DefaultToolFormatter implements ToolFormatter {
  private customFormatters: Map<
    string,
    (tools: AnyToolDefinition[], options?: Record<string, any>) => any[]
  > = new Map();

  constructor() {}

  formatToolsForProvider(
    tools: AnyToolDefinition[],
    providerFormat: ProviderFormat | string,
    options?: Record<string, any>
  ): any[] {
    // Check for custom formatter
    const customFormatter = this.customFormatters.get(
      providerFormat.toLowerCase()
    );
    if (customFormatter) {
      return customFormatter(tools, options);
    }

    // Use built-in formatters
    switch (providerFormat.toLowerCase()) {
      case ProviderFormat.OPENAI.toLowerCase():
        return this.formatForOpenAI(tools, options);
      case ProviderFormat.ANTHROPIC.toLowerCase():
        return this.formatForAnthropic(tools, options);
      case ProviderFormat.GOOGLE.toLowerCase():
        return this.formatForGoogle(tools, options);
      default:
        throw new Error(`Unsupported provider format: ${providerFormat}`);
    }
  }

  registerCustomFormatter(
    providerFormat: string,
    formatter: (
      tools: AnyToolDefinition[],
      options?: Record<string, any>
    ) => any[]
  ): void {
    this.customFormatters.set(providerFormat.toLowerCase(), formatter);
  }

  /**
   * Format tools for OpenAI
   * @param tools Tools to format
   * @param options Formatting options
   * @returns Tools formatted for OpenAI
   */
  private formatForOpenAI(
    tools: AnyToolDefinition[],
    options?: Record<string, any>
  ): any[] {
    return tools.map(tool => {
      // Format based on tool type
      if (tool.type === ToolType.FUNCTION) {
        const functionTool = tool as FunctionToolDefinition;
        return {
          type: 'function',
          function: {
            name: functionTool.schema.name,
            description: functionTool.schema.description,
            parameters: {
              type: 'object',
              properties: this.convertParameters(
                functionTool.schema.parameters.properties
              ),
              required: functionTool.schema.parameters.required || [],
            },
          },
        };
      } else if (tool.type === ToolType.HTTP) {
        const httpTool = tool as HttpToolDefinition;
        // For OpenAI, we present HTTP tools as functions
        return {
          type: 'function',
          function: {
            name: httpTool.schema.name,
            description: httpTool.schema.description,
            parameters: {
              type: 'object',
              properties: this.convertParameters(
                httpTool.schema.parameters.properties
              ),
              required: httpTool.schema.parameters.required || [],
            },
          },
        };
      } else if (tool.type === ToolType.CUSTOM) {
        const customTool = tool as CustomToolDefinition;
        // For OpenAI, custom tools are also presented as functions
        return {
          type: 'function',
          function: {
            name: customTool.schema.name,
            description: customTool.schema.description,
            parameters: {
              type: 'object',
              properties: this.convertParameters(
                customTool.schema.parameters.properties
              ),
              required: customTool.schema.parameters.required || [],
            },
          },
        };
      }

      // Fallback for unknown tool types
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      };
    });
  }

  /**
   * Format tools for Anthropic
   * @param tools Tools to format
   * @param options Formatting options
   * @returns Tools formatted for Anthropic
   */
  private formatForAnthropic(
    tools: AnyToolDefinition[],
    options?: Record<string, any>
  ): any[] {
    return tools.map(tool => {
      // For Anthropic, all tools are presented as functions
      const functionDefinition = {
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      };

      // Extract parameters based on tool type
      if (tool.type === ToolType.FUNCTION) {
        const functionTool = tool as FunctionToolDefinition;
        functionDefinition.input_schema.properties = this.convertParameters(
          functionTool.schema.parameters.properties
        );
        functionDefinition.input_schema.required =
          functionTool.schema.parameters.required || [];
      } else if (tool.type === ToolType.HTTP) {
        const httpTool = tool as HttpToolDefinition;
        functionDefinition.input_schema.properties = this.convertParameters(
          httpTool.schema.parameters.properties
        );
        functionDefinition.input_schema.required =
          httpTool.schema.parameters.required || [];
      } else if (tool.type === ToolType.CUSTOM) {
        const customTool = tool as CustomToolDefinition;
        functionDefinition.input_schema.properties = this.convertParameters(
          customTool.schema.parameters.properties
        );
        functionDefinition.input_schema.required =
          customTool.schema.parameters.required || [];
      }

      return {
        function: functionDefinition,
      };
    });
  }

  /**
   * Format tools for Google (Gemini)
   * @param tools Tools to format
   * @param options Formatting options
   * @returns Tools formatted for Google
   */
  private formatForGoogle(
    tools: AnyToolDefinition[],
    options?: Record<string, any>
  ): any[] {
    return tools.map(tool => {
      // For Google, all tools are presented as functions
      const functionDeclaration = {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties: {},
          required: [],
        },
      };

      // Extract parameters based on tool type
      if (tool.type === ToolType.FUNCTION) {
        const functionTool = tool as FunctionToolDefinition;
        functionDeclaration.parameters.properties =
          this.convertParametersForGoogle(
            functionTool.schema.parameters.properties
          );
        functionDeclaration.parameters.required =
          functionTool.schema.parameters.required || [];
      } else if (tool.type === ToolType.HTTP) {
        const httpTool = tool as HttpToolDefinition;
        functionDeclaration.parameters.properties =
          this.convertParametersForGoogle(
            httpTool.schema.parameters.properties
          );
        functionDeclaration.parameters.required =
          httpTool.schema.parameters.required || [];
      } else if (tool.type === ToolType.CUSTOM) {
        const customTool = tool as CustomToolDefinition;
        functionDeclaration.parameters.properties =
          this.convertParametersForGoogle(
            customTool.schema.parameters.properties
          );
        functionDeclaration.parameters.required =
          customTool.schema.parameters.required || [];
      }

      return {
        functionDeclarations: [functionDeclaration],
      };
    });
  }

  /**
   * Convert parameter definitions (general)
   * @param parameters Parameter definitions
   * @returns Converted parameters
   */
  private convertParameters(
    parameters: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [name, param] of Object.entries(parameters)) {
      result[name] = { ...param };

      // Handle nested properties
      if (param.type === 'object' && param.properties) {
        result[name].properties = this.convertParameters(param.properties);
      }

      // Handle array items
      if (param.type === 'array' && param.items) {
        if (param.items.type === 'object' && param.items.properties) {
          result[name].items = {
            ...param.items,
            properties: this.convertParameters(param.items.properties),
          };
        } else {
          result[name].items = { ...param.items };
        }
      }
    }

    return result;
  }

  /**
   * Convert parameter definitions for Google (handles type differences)
   * @param parameters Parameter definitions
   * @returns Converted parameters for Google
   */
  private convertParametersForGoogle(
    parameters: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [name, param] of Object.entries(parameters)) {
      // Copy the parameter
      result[name] = { ...param };

      // Convert types to uppercase for Google
      if (param.type) {
        result[name].type = param.type.toUpperCase();
      }

      // Handle nested properties
      if (param.type === 'object' && param.properties) {
        result[name].properties = this.convertParametersForGoogle(
          param.properties
        );
      }

      // Handle array items
      if (param.type === 'array' && param.items) {
        if (param.items.type === 'object' && param.items.properties) {
          result[name].items = {
            ...param.items,
            type: param.items.type.toUpperCase(),
            properties: this.convertParametersForGoogle(param.items.properties),
          };
        } else {
          result[name].items = {
            ...param.items,
            type: param.items.type ? param.items.type.toUpperCase() : undefined,
          };
        }
      }
    }

    return result;
  }
}

/**
 * Global singleton instance of the tool formatter
 */
let globalFormatter: ToolFormatter | null = null;

/**
 * Get the global tool formatter instance
 * Creates it if it doesn't exist
 */
export function getToolFormatter(): ToolFormatter {
  if (!globalFormatter) {
    globalFormatter = new DefaultToolFormatter();
  }
  return globalFormatter;
}

/**
 * Set the global tool formatter instance
 * Useful for testing or custom implementations
 */
export function setToolFormatter(formatter: ToolFormatter): void {
  globalFormatter = formatter;
}
```

**File: `src/llm/tool/formatter/tool-formatter.test.ts`**

```typescript
import { DefaultToolFormatter, ProviderFormat } from './tool-formatter';
import { ToolType, ToolCategory } from '../models/tool-definition';

describe('DefaultToolFormatter', () => {
  let formatter: DefaultToolFormatter;

  beforeEach(() => {
    formatter = new DefaultToolFormatter();
  });

  test('should format function tools for OpenAI', () => {
    const tools = [
      {
        id: 'tool1',
        name: 'searchTool',
        description: 'Search for information',
        version: '1.0.0',
        type: ToolType.FUNCTION,
        schema: {
          name: 'search',
          description: 'Search for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        categories: [ToolCategory.RETRIEVAL],
        enabled: true,
        executionFn: jest.fn(),
      },
    ];

    const formatted = formatter.formatToolsForProvider(
      tools,
      ProviderFormat.OPENAI
    );

    expect(formatted).toHaveLength(1);
    expect(formatted[0].type).toBe('function');
    expect(formatted[0].function.name).toBe('search');
    expect(formatted[0].function.description).toBe('Search for information');
    expect(formatted[0].function.parameters.properties.query.type).toBe(
      'string'
    );
    expect(formatted[0].function.parameters.required).toEqual(['query']);
  });

  test('should format HTTP tools for OpenAI', () => {
    const tools = [
      {
        id: 'tool2',
        name: 'weatherApi',
        description: 'Get weather information',
        version: '1.0.0',
        type: ToolType.HTTP,
        schema: {
          name: 'getWeather',
          description: 'Get weather information for a location',
          method: 'GET',
          url: 'https://api.weather.com/{location}',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'Location name',
              },
              units: {
                type: 'string',
                description: 'Temperature units',
                enum: ['celsius', 'fahrenheit'],
                default: 'celsius',
              },
            },
            required: ['location'],
          },
        },
        categories: [ToolCategory.INTEGRATION],
        enabled: true,
        transformRequest: jest.fn(),
        transformResponse: jest.fn(),
      },
    ];

    const formatted = formatter.formatToolsForProvider(
      tools,
      ProviderFormat.OPENAI
    );

    expect(formatted).toHaveLength(1);
    expect(formatted[0].type).toBe('function');
    expect(formatted[0].function.name).toBe('getWeather');
    expect(formatted[0].function.parameters.properties.location.type).toBe(
      'string'
    );
    expect(formatted[0].function.parameters.properties.units.enum).toEqual([
      'celsius',
      'fahrenheit',
    ]);
  });

  test('should format tools for Anthropic', () => {
    const tools = [
      {
        id: 'tool1',
        name: 'searchTool',
        description: 'Search for information',
        version: '1.0.0',
        type: ToolType.FUNCTION,
        schema: {
          name: 'search',
          description: 'Search for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        categories: [ToolCategory.RETRIEVAL],
        enabled: true,
        executionFn: jest.fn(),
      },
    ];

    const formatted = formatter.formatToolsForProvider(
      tools,
      ProviderFormat.ANTHROPIC
    );

    expect(formatted).toHaveLength(1);
    expect(formatted[0].function).toBeDefined();
    expect(formatted[0].function.name).toBe('searchTool');
    expect(formatted[0].function.input_schema).toBeDefined();
    expect(formatted[0].function.input_schema.properties.query.type).toBe(
      'string'
    );
    expect(formatted[0].function.input_schema.required).toEqual(['query']);
  });

  test('should format tools for Google', () => {
    const tools = [
      {
        id: 'tool1',
        name: 'searchTool',
        description: 'Search for information',
        version: '1.0.0',
        type: ToolType.FUNCTION,
        schema: {
          name: 'search',
          description: 'Search for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        categories: [ToolCategory.RETRIEVAL],
        enabled: true,
        executionFn: jest.fn(),
      },
    ];

    const formatted = formatter.formatToolsForProvider(
      tools,
      ProviderFormat.GOOGLE
    );

    expect(formatted).toHaveLength(1);
    expect(formatted[0].functionDeclarations).toBeDefined();
    expect(formatted[0].functionDeclarations[0].name).toBe('searchTool');
    expect(formatted[0].functionDeclarations[0].parameters.type).toBe('OBJECT');
    expect(
      formatted[0].functionDeclarations[0].parameters.properties.query.type
    ).toBe('STRING');
  });

  test('should handle custom formatters', () => {
    const customFormatter = (tools: any[]) => {
      return tools.map(tool => ({
        customFormat: true,
        name: tool.name,
        description: tool.description,
      }));
    };

    formatter.registerCustomFormatter('custom', customFormatter);

    const tools = [
      {
        id: 'tool1',
        name: 'customTool',
        description: 'Custom tool',
        version: '1.0.0',
        type: ToolType.FUNCTION,
        schema: {
          name: 'custom',
          description: 'Custom tool',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
        categories: [ToolCategory.UTILITY],
        enabled: true,
        executionFn: jest.fn(),
      },
    ];

    const formatted = formatter.formatToolsForProvider(tools, 'custom');

    expect(formatted).toHaveLength(1);
    expect(formatted[0].customFormat).toBe(true);
    expect(formatted[0].name).toBe('customTool');
  });

  test('should throw error for unsupported provider', () => {
    const tools = [
      {
        id: 'tool1',
        name: 'testTool',
        description: 'Test tool',
        version: '1.0.0',
        type: ToolType.FUNCTION,
        schema: {
          name: 'test',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
        categories: [ToolCategory.UTILITY],
        enabled: true,
        executionFn: jest.fn(),
      },
    ];

    expect(() => {
      formatter.formatToolsForProvider(tools, 'unsupported');
    }).toThrow('Unsupported provider format: unsupported');
  });
});
```

The Tool Formatter is responsible for adapting our standardized tool definitions to the specific formats required by different LLM providers. Key features include:

1. **Multi-provider Support**: Built-in support for OpenAI, Anthropic, and Google Gemini
2. **Extensibility**: Custom formatters can be registered for additional providers
3. **Type Conversion**: Handles the different type formats required by each provider
4. **Nested Parameter Support**: Properly converts nested objects and arrays in parameter schemas
5. **Global Access**: Singleton pattern for application-wide access

This implementation maintains the clean architecture pattern by separating the tool definition (domain model) from the provider-specific formats (external interfaces). Each provider has its own formatting logic that handles the specific requirements of that provider's API.

In the next step, we'll implement the Tool Executor to handle the execution of tool calls.

### Step 4: Implement Tool Executor

The Tool Executor is responsible for executing tool calls and handling their results. It includes validation, execution of different tool types, error handling, and result formatting.

**File: `src/llm/tool/executor/tool-executor.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosRequestConfig } from 'axios';
import { ToolType, ToolResult, ToolContext } from '../models/tool-types';
import {
  ToolCallStatus,
  ToolCall,
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolExecutionOptions,
} from '../models/tool-call';
import {
  AnyToolDefinition,
  FunctionToolDefinition,
  HttpToolDefinition,
  CustomToolDefinition,
} from '../models/tool-definition';
import { getToolRegistry, ToolRegistry } from '../registry/tool-registry';

/**
 * Interface for tool executor
 */
export interface ToolExecutor {
  /**
   * Execute a tool with the given arguments
   * @param request Tool execution request
   * @returns Promise resolving to execution response
   */
  executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResponse>;

  /**
   * Validate tool arguments against schema
   * @param toolId Tool ID
   * @param args Arguments to validate
   * @returns Validation result
   */
  validateToolArguments(
    toolId: string,
    args: any
  ): { valid: boolean; errors?: string[] };

  /**
   * Get the execution history for a session
   * @param sessionId Session ID
   * @returns Array of tool calls
   */
  getToolCallHistory(sessionId: string): ToolCall[];

  /**
   * Get a specific tool call by ID
   * @param toolCallId Tool call ID
   * @returns Tool call or undefined if not found
   */
  getToolCall(toolCallId: string): ToolCall | undefined;
}

/**
 * Default implementation of the tool executor
 */
export class DefaultToolExecutor implements ToolExecutor {
  private toolRegistry: ToolRegistry;
  private toolCalls: Map<string, ToolCall> = new Map();
  private toolCallsBySession: Map<string, string[]> = new Map();

  constructor(toolRegistry?: ToolRegistry) {
    this.toolRegistry = toolRegistry || getToolRegistry();
  }

  async executeTool(
    request: ToolExecutionRequest
  ): Promise<ToolExecutionResponse> {
    const startTime = Date.now();
    const toolCallId = uuidv4();

    // Get the tool definition
    const tool = this.toolRegistry.getTool(request.toolId);
    if (!tool) {
      return this.handleToolNotFound(toolCallId, request.toolId, startTime);
    }

    // Check if tool is enabled
    if (!tool.enabled) {
      return this.handleToolDisabled(toolCallId, tool, startTime);
    }

    // Validate arguments
    const validation = this.validateToolArguments(
      request.toolId,
      request.arguments
    );
    if (!validation.valid) {
      return this.handleInvalidArguments(
        toolCallId,
        tool,
        request.arguments,
        validation.errors,
        startTime
      );
    }

    // Create tool call record
    const toolCall: ToolCall = {
      id: toolCallId,
      sessionId: request.sessionId,
      toolId: tool.id,
      toolName: tool.name,
      toolType: tool.type,
      arguments: request.arguments,
      status: ToolCallStatus.EXECUTING,
      startTime: new Date(),
      metadata: {
        userId: request.userId,
        requestId: request.requestId,
      },
    };

    // Store the tool call
    this.toolCalls.set(toolCallId, toolCall);

    // Add to session history
    if (!this.toolCallsBySession.has(request.sessionId)) {
      this.toolCallsBySession.set(request.sessionId, []);
    }
    this.toolCallsBySession.get(request.sessionId)?.push(toolCallId);

    try {
      // Create execution context
      const context: ToolContext = {
        sessionId: request.sessionId,
        toolCallId: toolCallId,
        userId: request.userId,
        requestId: request.requestId,
        sessionContext: request.options?.context,
      };

      // Execute the tool based on its type
      let result: ToolResult;

      switch (tool.type) {
        case ToolType.FUNCTION:
          result = await this.executeFunctionTool(
            tool as FunctionToolDefinition,
            request.arguments,
            context
          );
          break;
        case ToolType.HTTP:
          result = await this.executeHttpTool(
            tool as HttpToolDefinition,
            request.arguments,
            context
          );
          break;
        case ToolType.CUSTOM:
          result = await this.executeCustomTool(
            tool as CustomToolDefinition,
            request.arguments,
            context
          );
          break;
        default:
          throw new Error(`Unsupported tool type: ${tool.type}`);
      }

      // Calculate execution time
      const endTime = new Date();
      const executionTime = endTime.getTime() - toolCall.startTime.getTime();

      // Update tool call record
      toolCall.status = result.success
        ? ToolCallStatus.COMPLETED
        : ToolCallStatus.FAILED;
      toolCall.result = result.data;
      toolCall.error = result.error;
      toolCall.endTime = endTime;
      toolCall.executionTime = executionTime;
      if (result.metadata) {
        toolCall.metadata = { ...toolCall.metadata, ...result.metadata };
      }

      // Return the execution response
      return {
        toolCallId,
        toolId: tool.id,
        toolName: tool.name,
        result: result.data,
        error: result.error,
        status: toolCall.status,
        executionTime,
      };
    } catch (error) {
      // Handle unexpected errors
      return this.handleExecutionError(toolCall, error, startTime);
    }
  }

  validateToolArguments(
    toolId: string,
    args: any
  ): { valid: boolean; errors?: string[] } {
    const tool = this.toolRegistry.getTool(toolId);
    if (!tool) {
      return { valid: false, errors: ['Tool not found'] };
    }

    // Extract the schema based on tool type
    let schema;
    if (tool.type === ToolType.FUNCTION) {
      schema = (tool as FunctionToolDefinition).schema.parameters;
    } else if (tool.type === ToolType.HTTP) {
      schema = (tool as HttpToolDefinition).schema.parameters;
    } else if (tool.type === ToolType.CUSTOM) {
      schema = (tool as CustomToolDefinition).schema.parameters;
    } else {
      return { valid: false, errors: ['Unknown tool type'] };
    }

    // Validate required parameters
    const errors: string[] = [];
    const required = schema.required || [];

    for (const req of required) {
      if (args[req] === undefined) {
        errors.push(`Missing required parameter: ${req}`);
      }
    }

    // Validate parameter types
    const properties = schema.properties || {};
    for (const [name, value] of Object.entries(args)) {
      const paramSchema = properties[name];
      if (!paramSchema) {
        errors.push(`Unknown parameter: ${name}`);
        continue;
      }

      // Validate type
      if (paramSchema.type && !this.validateType(value, paramSchema.type)) {
        errors.push(
          `Invalid type for parameter ${name}: expected ${paramSchema.type}`
        );
      }

      // Validate enum
      if (paramSchema.enum && !paramSchema.enum.includes(value)) {
        errors.push(
          `Invalid value for parameter ${name}: must be one of [${paramSchema.enum.join(
            ', '
          )}]`
        );
      }

      // Validate string constraints
      if (paramSchema.type === 'string') {
        if (
          paramSchema.minLength !== undefined &&
          value.length < paramSchema.minLength
        ) {
          errors.push(
            `Parameter ${name} must be at least ${paramSchema.minLength} characters`
          );
        }
        if (
          paramSchema.maxLength !== undefined &&
          value.length > paramSchema.maxLength
        ) {
          errors.push(
            `Parameter ${name} must be at most ${paramSchema.maxLength} characters`
          );
        }
        if (
          paramSchema.pattern &&
          !new RegExp(paramSchema.pattern).test(value)
        ) {
          errors.push(
            `Parameter ${name} must match pattern: ${paramSchema.pattern}`
          );
        }
      }

      // Validate number constraints
      if (paramSchema.type === 'number' || paramSchema.type === 'integer') {
        if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
          errors.push(
            `Parameter ${name} must be at least ${paramSchema.minimum}`
          );
        }
        if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
          errors.push(
            `Parameter ${name} must be at most ${paramSchema.maximum}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getToolCallHistory(sessionId: string): ToolCall[] {
    const callIds = this.toolCallsBySession.get(sessionId) || [];
    return callIds.map(id => this.toolCalls.get(id)!).filter(Boolean);
  }

  getToolCall(toolCallId: string): ToolCall | undefined {
    return this.toolCalls.get(toolCallId);
  }

  /**
   * Execute a function tool
   * @param tool Function tool definition
   * @param args Tool arguments
   * @param context Execution context
   * @returns Tool execution result
   */
  private async executeFunctionTool(
    tool: FunctionToolDefinition,
    args: any,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      // Execute the function
      const result = await tool.executionFn(args, context);

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

  /**
   * Execute an HTTP tool
   * @param tool HTTP tool definition
   * @param args Tool arguments
   * @param context Execution context
   * @returns Tool execution result
   */
  private async executeHttpTool(
    tool: HttpToolDefinition,
    args: any,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      // Prepare request URL with parameter substitution
      let url = tool.schema.url;

      // Replace path parameters
      for (const [key, value] of Object.entries(args)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
        }
      }

      // Prepare request options
      const config: AxiosRequestConfig = {
        method: tool.schema.method,
        url,
        headers: { ...tool.schema.headers },
      };

      // Add query parameters for GET requests
      if (tool.schema.method === 'GET') {
        const queryParams: Record<string, string> = {};
        for (const [key, value] of Object.entries(args)) {
          // Skip parameters already used in path
          if (
            !url.includes(`{${key}}`) &&
            (typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean')
          ) {
            queryParams[key] = String(value);
          }
        }
        config.params = queryParams;
      } else {
        // Add request body for non-GET requests
        if (tool.transformRequest) {
          config.data = tool.transformRequest(args);
        } else {
          config.data = args;
        }
      }

      // Add authentication if needed
      if (tool.schema.authentication) {
        switch (tool.schema.authentication) {
          case 'basic':
            if (
              tool.schema.authConfig?.username &&
              tool.schema.authConfig?.password
            ) {
              config.auth = {
                username: tool.schema.authConfig.username,
                password: tool.schema.authConfig.password,
              };
            }
            break;
          case 'bearer':
            if (tool.schema.authConfig?.token) {
              config.headers.Authorization = `Bearer ${tool.schema.authConfig.token}`;
            }
            break;
          case 'api_key':
            if (tool.schema.authConfig?.key && tool.schema.authConfig?.value) {
              if (tool.schema.authConfig.in === 'header') {
                config.headers[tool.schema.authConfig.key] =
                  tool.schema.authConfig.value;
              } else if (tool.schema.authConfig.in === 'query') {
                if (!config.params) config.params = {};
                config.params[tool.schema.authConfig.key] =
                  tool.schema.authConfig.value;
              }
            }
            break;
        }
      }

      // Execute the request
      const response = await axios(config);

      // Transform the response if needed
      let result = response.data;
      if (tool.transformResponse) {
        result = tool.transformResponse(response.data);
      }

      return {
        success: true,
        data: result,
        metadata: {
          statusCode: response.status,
          headers: response.headers,
        },
      };
    } catch (error) {
      // Handle Axios errors
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: error.response?.data?.message || error.message,
          metadata: {
            statusCode: error.response?.status,
            headers: error.response?.headers,
          },
        };
      }

      // Handle other errors
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a custom tool
   * @param tool Custom tool definition
   * @param args Tool arguments
   * @param context Execution context
   * @returns Tool execution result
   */
  private async executeCustomTool(
    tool: CustomToolDefinition,
    args: any,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      // Execute the custom tool
      const result = await tool.execute(args, context);

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

  /**
   * Handle case when tool is not found
   * @param toolCallId Tool call ID
   * @param toolId Tool ID
   * @param startTime Start time
   * @returns Error response
   */
  private handleToolNotFound(
    toolCallId: string,
    toolId: string,
    startTime: number
  ): ToolExecutionResponse {
    const errorMessage = `Tool not found: ${toolId}`;
    const endTime = Date.now();

    // Create and store failed tool call
    const toolCall: ToolCall = {
      id: toolCallId,
      sessionId: '',
      toolId,
      toolName: 'unknown',
      toolType: ToolType.FUNCTION,
      arguments: {},
      status: ToolCallStatus.FAILED,
      error: errorMessage,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      executionTime: endTime - startTime,
    };

    this.toolCalls.set(toolCallId, toolCall);

    return {
      toolCallId,
      toolId,
      toolName: 'unknown',
      error: errorMessage,
      status: ToolCallStatus.FAILED,
      executionTime: endTime - startTime,
    };
  }

  /**
   * Handle case when tool is disabled
   * @param toolCallId Tool call ID
   * @param tool Tool definition
   * @param startTime Start time
   * @returns Error response
   */
  private handleToolDisabled(
    toolCallId: string,
    tool: AnyToolDefinition,
    startTime: number
  ): ToolExecutionResponse {
    const errorMessage = `Tool is disabled: ${tool.name}`;
    const endTime = Date.now();

    // Create and store failed tool call
    const toolCall: ToolCall = {
      id: toolCallId,
      sessionId: '',
      toolId: tool.id,
      toolName: tool.name,
      toolType: tool.type,
      arguments: {},
      status: ToolCallStatus.FAILED,
      error: errorMessage,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      executionTime: endTime - startTime,
    };

    this.toolCalls.set(toolCallId, toolCall);

    return {
      toolCallId,
      toolId: tool.id,
      toolName: tool.name,
      error: errorMessage,
      status: ToolCallStatus.FAILED,
      executionTime: endTime - startTime,
    };
  }

  /**
   * Handle case when arguments are invalid
   * @param toolCallId Tool call ID
   * @param tool Tool definition
   * @param args Arguments
   * @param errors Validation errors
   * @param startTime Start time
   * @returns Error response
   */
  private handleInvalidArguments(
    toolCallId: string,
    tool: AnyToolDefinition,
    args: any,
    errors: string[] | undefined,
    startTime: number
  ): ToolExecutionResponse {
    const errorMessage = `Invalid arguments: ${
      errors?.join(', ') || 'unknown error'
    }`;
    const endTime = Date.now();

    // Create and store failed tool call
    const toolCall: ToolCall = {
      id: toolCallId,
      sessionId: '',
      toolId: tool.id,
      toolName: tool.name,
      toolType: tool.type,
      arguments: args,
      status: ToolCallStatus.FAILED,
      error: errorMessage,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      executionTime: endTime - startTime,
    };

    this.toolCalls.set(toolCallId, toolCall);

    return {
      toolCallId,
      toolId: tool.id,
      toolName: tool.name,
      error: errorMessage,
      status: ToolCallStatus.FAILED,
      executionTime: endTime - startTime,
    };
  }

  /**
   * Handle execution errors
   * @param toolCall Tool call being executed
   * @param error Error that occurred
   * @param startTime Start time
   * @returns Error response
   */
  private handleExecutionError(
    toolCall: ToolCall,
    error: any,
    startTime: number
  ): ToolExecutionResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const endTime = Date.now();

    // Update tool call record
    toolCall.status = ToolCallStatus.FAILED;
    toolCall.error = errorMessage;
    toolCall.endTime = new Date(endTime);
    toolCall.executionTime = endTime - startTime;

    return {
      toolCallId: toolCall.id,
      toolId: toolCall.toolId,
      toolName: toolCall.toolName,
      error: errorMessage,
      status: ToolCallStatus.FAILED,
      executionTime: endTime - startTime,
    };
  }

  /**
   * Validate a value against a type
   * @param value Value to validate
   * @param type Expected type
   * @returns Whether the value matches the expected type
   */
  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      case 'null':
        return value === null;
      default:
        return true; // Unknown types are considered valid
    }
  }
}

/**
 * Global singleton instance of the tool executor
 */
let globalExecutor: ToolExecutor | null = null;

/**
 * Get the global tool executor instance
 * Creates it if it doesn't exist
 */
export function getToolExecutor(): ToolExecutor {
  if (!globalExecutor) {
    globalExecutor = new DefaultToolExecutor();
  }
  return globalExecutor;
}

/**
 * Set the global tool executor instance
 * Useful for testing or custom implementations
 */
export function setToolExecutor(executor: ToolExecutor): void {
  globalExecutor = executor;
}
```

**File: `src/llm/tool/executor/tool-executor.test.ts`**

```typescript
import { DefaultToolExecutor } from './tool-executor';
import { ToolRegistry, InMemoryToolRegistry } from '../registry/tool-registry';
import {
  ToolType,
  ToolCategory,
  ToolCallStatus,
} from '../models/tool-definition';

describe('DefaultToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: DefaultToolExecutor;

  beforeEach(() => {
    registry = new InMemoryToolRegistry();
    executor = new DefaultToolExecutor(registry);
  });

  test('should execute a function tool', async () => {
    // Mock implementation of a search function
    const searchFunction = jest.fn().mockResolvedValue({
      results: [
        { title: 'Result 1', url: 'https://example.com/1' },
        { title: 'Result 2', url: 'https://example.com/2' },
      ],
    });

    // Register test tool
    const tool = registry.registerTool({
      name: 'searchTool',
      description: 'Search for information',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'search',
        description: 'Search for information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
      categories: [ToolCategory.RETRIEVAL],
      enabled: true,
      executionFn: searchFunction,
    });

    // Execute the tool
    const response = await executor.executeTool({
      sessionId: 'test-session',
      toolId: tool.id,
      arguments: {
        query: 'test query',
        limit: 2,
      },
    });

    // Verify execution
    expect(response.status).toBe(ToolCallStatus.COMPLETED);
    expect(response.toolId).toBe(tool.id);
    expect(response.toolName).toBe('searchTool');
    expect(response.result.results).toHaveLength(2);
    expect(searchFunction).toHaveBeenCalledWith(
      { query: 'test query', limit: 2 },
      expect.objectContaining({ sessionId: 'test-session' })
    );

    // Verify history
    const history = executor.getToolCallHistory('test-session');
    expect(history).toHaveLength(1);
    expect(history[0].toolId).toBe(tool.id);
    expect(history[0].status).toBe(ToolCallStatus.COMPLETED);
  });

  test('should handle tool not found', async () => {
    const response = await executor.executeTool({
      sessionId: 'test-session',
      toolId: 'non-existent-tool',
      arguments: {},
    });

    expect(response.status).toBe(ToolCallStatus.FAILED);
    expect(response.error).toContain('Tool not found');
  });

  test('should handle disabled tools', async () => {
    // Register disabled tool
    const tool = registry.registerTool({
      name: 'disabledTool',
      description: 'Disabled tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'disabled',
        description: 'Disabled tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: false,
      executionFn: jest.fn(),
    });

    const response = await executor.executeTool({
      sessionId: 'test-session',
      toolId: tool.id,
      arguments: {},
    });

    expect(response.status).toBe(ToolCallStatus.FAILED);
    expect(response.error).toContain('Tool is disabled');
  });

  test('should validate arguments', async () => {
    // Register tool with required arguments
    const tool = registry.registerTool({
      name: 'validationTool',
      description: 'Tool with validation',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'validate',
        description: 'Tool with validation',
        parameters: {
          type: 'object',
          properties: {
            requiredString: {
              type: 'string',
              description: 'Required string parameter',
            },
            numberInRange: {
              type: 'number',
              description: 'Number in range',
              minimum: 1,
              maximum: 10,
            },
            enumValue: {
              type: 'string',
              description: 'Enum value',
              enum: ['option1', 'option2', 'option3'],
            },
          },
          required: ['requiredString'],
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn().mockResolvedValue({ success: true }),
    });

    // Validate missing required parameter
    const validation1 = executor.validateToolArguments(tool.id, {
      numberInRange: 5,
    });
    expect(validation1.valid).toBe(false);
    expect(validation1.errors).toContain(
      'Missing required parameter: requiredString'
    );

    // Validate out of range parameter
    const validation2 = executor.validateToolArguments(tool.id, {
      requiredString: 'test',
      numberInRange: 20,
    });
    expect(validation2.valid).toBe(false);
    expect(validation2.errors).toContain(
      'Parameter numberInRange must be at most 10'
    );

    // Validate invalid enum value
    const validation3 = executor.validateToolArguments(tool.id, {
      requiredString: 'test',
      enumValue: 'invalid',
    });
    expect(validation3.valid).toBe(false);
    expect(validation3.errors).toContain(
      'Invalid value for parameter enumValue'
    );

    // Validate valid arguments
    const validation4 = executor.validateToolArguments(tool.id, {
      requiredString: 'test',
      numberInRange: 5,
      enumValue: 'option2',
    });
    expect(validation4.valid).toBe(true);
  });

  test('should handle execution errors', async () => {
    // Register tool that throws an error
    const tool = registry.registerTool({
      name: 'errorTool',
      description: 'Tool that throws an error',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'error',
        description: 'Tool that throws an error',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn().mockRejectedValue(new Error('Execution error')),
    });

    const response = await executor.executeTool({
      sessionId: 'test-session',
      toolId: tool.id,
      arguments: {},
    });

    expect(response.status).toBe(ToolCallStatus.FAILED);
    expect(response.error).toBe('Execution error');

    // Verify history
    const history = executor.getToolCallHistory('test-session');
    expect(history).toHaveLength(1);
    expect(history[0].toolId).toBe(tool.id);
    expect(history[0].status).toBe(ToolCallStatus.FAILED);
    expect(history[0].error).toBe('Execution error');
  });

  test('should retrieve tool call by ID', async () => {
    // Register and execute a tool
    const tool = registry.registerTool({
      name: 'testTool',
      description: 'Test tool',
      version: '1.0.0',
      type: ToolType.FUNCTION,
      schema: {
        name: 'test',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      categories: [ToolCategory.UTILITY],
      enabled: true,
      executionFn: jest.fn().mockResolvedValue({ success: true }),
    });

    const response = await executor.executeTool({
      sessionId: 'test-session',
      toolId: tool.id,
      arguments: {},
    });

    // Retrieve by ID
    const toolCall = executor.getToolCall(response.toolCallId);

    expect(toolCall).toBeDefined();
    expect(toolCall?.id).toBe(response.toolCallId);
    expect(toolCall?.toolId).toBe(tool.id);
    expect(toolCall?.status).toBe(ToolCallStatus.COMPLETED);

    // Try to retrieve non-existent tool call
    const nonExistentCall = executor.getToolCall('non-existent-id');
    expect(nonExistentCall).toBeUndefined();
  });
});
```

The Tool Executor is responsible for executing tool calls based on their type, validating arguments, and handling execution results. Key features include:

1. **Support for Multiple Tool Types**: Handles function, HTTP, and custom tool types
2. **Argument Validation**: Validates tool arguments against their schema
3. **Execution Context**: Provides context to tools during execution
4. **Error Handling**: Comprehensive error handling for different failure scenarios
5. **Execution History**: Maintains a history of tool calls for each session
6. **Timeout Support**: Can set timeouts for tool execution
7. **HTTP Tool Support**: Built-in support for HTTP requests with parameter substitution

The implementation follows clean architecture principles by separating the interface from the implementation and using the Tool Registry as a dependency. The executor also maintains a record of all tool calls, which can be useful for debugging, auditing, and analytics.

In the next step, we'll implement the Tool Commands and Events to enable domain communication.

### Step 5: Implement Tool Commands and Events

Tool Commands and Events enable communication between the Tool Domain and other domains. Commands represent requests to perform actions, while events notify other domains about changes in tool state.

**File: `src/llm/tool/commands/tool-commands.ts`**

```typescript
import { Command } from '../../infrastructure/command-bus';
import { ToolExecutionOptions } from '../models/tool-call';
import { ToolCategory, ToolType } from '../models/tool-definition';

/**
 * Command to register a tool
 */
export class RegisterToolCommand implements Command {
  readonly type = 'register-tool';

  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly toolType: ToolType,
    public readonly schema: any,
    public readonly categories: ToolCategory[],
    public readonly executionFn?: Function,
    public readonly transformRequest?: Function,
    public readonly transformResponse?: Function,
    public readonly execute?: Function,
    public readonly requiredPermissions?: string[],
    public readonly supportedProviders?: string[],
    public readonly enabled: boolean = true,
    public readonly version: string = '1.0.0',
    public readonly metadata?: Record<string, any>
  ) {}
}

/**
 * Command to unregister a tool
 */
export class UnregisterToolCommand implements Command {
  readonly type = 'unregister-tool';

  constructor(public readonly toolId: string) {}
}

/**
 * Command to enable a tool
 */
export class EnableToolCommand implements Command {
  readonly type = 'enable-tool';

  constructor(public readonly toolId: string) {}
}

/**
 * Command to disable a tool
 */
export class DisableToolCommand implements Command {
  readonly type = 'disable-tool';

  constructor(public readonly toolId: string) {}
}

/**
 * Command to execute a tool
 */
export class ExecuteToolCommand implements Command {
  readonly type = 'execute-tool';

  constructor(
    public readonly sessionId: string,
    public readonly toolId: string,
    public readonly arguments: any,
    public readonly options?: ToolExecutionOptions,
    public readonly userId?: string,
    public readonly requestId?: string
  ) {}
}

/**
 * Command to execute a tool by name
 */
export class ExecuteToolByNameCommand implements Command {
  readonly type = 'execute-tool-by-name';

  constructor(
    public readonly sessionId: string,
    public readonly toolName: string,
    public readonly arguments: any,
    public readonly options?: ToolExecutionOptions,
    public readonly userId?: string,
    public readonly requestId?: string
  ) {}
}

/**
 * Command to validate tool arguments
 */
export class ValidateToolArgumentsCommand implements Command {
  readonly type = 'validate-tool-arguments';

  constructor(public readonly toolId: string, public readonly arguments: any) {}
}

/**
 * Command to get tools for a provider
 */
export class GetToolsForProviderCommand implements Command {
  readonly type = 'get-tools-for-provider';

  constructor(
    public readonly providerType: string,
    public readonly formatTools: boolean = false
  ) {}
}

/**
 * Command to get tools by category
 */
export class GetToolsByCategoryCommand implements Command {
  readonly type = 'get-tools-by-category';

  constructor(public readonly category: ToolCategory) {}
}

/**
 * Command to format tools for a provider
 */
export class FormatToolsForProviderCommand implements Command {
  readonly type = 'format-tools-for-provider';

  constructor(
    public readonly toolIds: string[],
    public readonly providerType: string,
    public readonly options?: Record<string, any>
  ) {}
}

/**
 * Command to get tool execution history
 */
export class GetToolExecutionHistoryCommand implements Command {
  readonly type = 'get-tool-execution-history';

  constructor(public readonly sessionId: string) {}
}
```

**File: `src/llm/tool/events/tool-events.ts`**

```typescript
import { Event } from '../../infrastructure/event-bus';
import { ToolCallStatus } from '../models/tool-call';
import { ToolCategory, ToolType } from '../models/tool-definition';

/**
 * Base class for tool events
 */
export abstract class ToolEvent implements Event {
  abstract readonly type: string;

  constructor(public readonly timestamp: Date = new Date()) {}
}

/**
 * Event emitted when a tool is registered
 */
export class ToolRegisteredEvent extends ToolEvent {
  readonly type = 'tool-registered';

  constructor(
    public readonly toolId: string,
    public readonly name: string,
    public readonly toolType: ToolType,
    public readonly categories: ToolCategory[],
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a tool is unregistered
 */
export class ToolUnregisteredEvent extends ToolEvent {
  readonly type = 'tool-unregistered';

  constructor(
    public readonly toolId: string,
    public readonly name: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a tool is enabled
 */
export class ToolEnabledEvent extends ToolEvent {
  readonly type = 'tool-enabled';

  constructor(
    public readonly toolId: string,
    public readonly name: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when a tool is disabled
 */
export class ToolDisabledEvent extends ToolEvent {
  readonly type = 'tool-disabled';

  constructor(
    public readonly toolId: string,
    public readonly name: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when tool execution starts
 */
export class ToolExecutionStartedEvent extends ToolEvent {
  readonly type = 'tool-execution-started';

  constructor(
    public readonly toolCallId: string,
    public readonly sessionId: string,
    public readonly toolId: string,
    public readonly toolName: string,
    public readonly toolType: ToolType,
    public readonly arguments: any,
    public readonly userId?: string,
    public readonly requestId?: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when tool execution completes
 */
export class ToolExecutionCompletedEvent extends ToolEvent {
  readonly type = 'tool-execution-completed';

  constructor(
    public readonly toolCallId: string,
    public readonly sessionId: string,
    public readonly toolId: string,
    public readonly toolName: string,
    public readonly toolType: ToolType,
    public readonly result: any,
    public readonly executionTime: number,
    public readonly userId?: string,
    public readonly requestId?: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when tool execution fails
 */
export class ToolExecutionFailedEvent extends ToolEvent {
  readonly type = 'tool-execution-failed';

  constructor(
    public readonly toolCallId: string,
    public readonly sessionId: string,
    public readonly toolId: string,
    public readonly toolName: string,
    public readonly toolType: ToolType,
    public readonly error: string,
    public readonly executionTime: number,
    public readonly userId?: string,
    public readonly requestId?: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when tool execution status changes
 */
export class ToolExecutionStatusChangedEvent extends ToolEvent {
  readonly type = 'tool-execution-status-changed';

  constructor(
    public readonly toolCallId: string,
    public readonly sessionId: string,
    public readonly toolId: string,
    public readonly status: ToolCallStatus,
    public readonly previousStatus: ToolCallStatus,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when tool arguments are invalid
 */
export class ToolArgumentsInvalidEvent extends ToolEvent {
  readonly type = 'tool-arguments-invalid';

  constructor(
    public readonly toolId: string,
    public readonly toolName: string,
    public readonly arguments: any,
    public readonly errors: string[],
    public readonly sessionId?: string,
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}

/**
 * Event emitted when tools are formatted for a provider
 */
export class ToolsFormattedForProviderEvent extends ToolEvent {
  readonly type = 'tools-formatted-for-provider';

  constructor(
    public readonly providerType: string,
    public readonly toolCount: number,
    public readonly toolIds: string[],
    timestamp: Date = new Date()
  ) {
    super(timestamp);
  }
}
```

**File: `src/llm/tool/handlers/tool-command-handlers.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  CommandHandler,
  CommandResult,
} from '../../infrastructure/command-bus';
import { EventBus } from '../../infrastructure/event-bus';
import {
  RegisterToolCommand,
  UnregisterToolCommand,
  EnableToolCommand,
  DisableToolCommand,
  ExecuteToolCommand,
  ExecuteToolByNameCommand,
  ValidateToolArgumentsCommand,
  GetToolsForProviderCommand,
  GetToolsByCategoryCommand,
  FormatToolsForProviderCommand,
  GetToolExecutionHistoryCommand,
} from '../commands/tool-commands';
import {
  ToolRegisteredEvent,
  ToolUnregisteredEvent,
  ToolEnabledEvent,
  ToolDisabledEvent,
  ToolExecutionStartedEvent,
  ToolExecutionCompletedEvent,
  ToolExecutionFailedEvent,
  ToolArgumentsInvalidEvent,
  ToolsFormattedForProviderEvent,
} from '../events/tool-events';
import { ToolRegistry, getToolRegistry } from '../registry/tool-registry';
import { ToolFormatter, getToolFormatter } from '../formatter/tool-formatter';
import { ToolExecutor, getToolExecutor } from '../executor/tool-executor';
import {
  ToolType,
  FunctionToolDefinition,
  HttpToolDefinition,
  CustomToolDefinition,
} from '../models/tool-definition';
import { ToolCall } from '../models/tool-call';

/**
 * Handler for RegisterToolCommand
 */
export class RegisterToolHandler
  implements CommandHandler<RegisterToolCommand, string>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: RegisterToolCommand): Promise<CommandResult<string>> {
    try {
      // Create tool definition based on tool type
      const toolDefinition: any = {
        name: command.name,
        description: command.description,
        version: command.version,
        type: command.toolType,
        schema: command.schema,
        categories: command.categories,
        requiredPermissions: command.requiredPermissions,
        supportedProviders: command.supportedProviders,
        enabled: command.enabled,
        metadata: command.metadata,
      };

      // Add type-specific properties
      switch (command.toolType) {
        case ToolType.FUNCTION:
          if (!command.executionFn) {
            return {
              success: false,
              error: 'Function tool requires executionFn',
            };
          }
          toolDefinition.executionFn = command.executionFn;
          break;
        case ToolType.HTTP:
          if (command.transformRequest) {
            toolDefinition.transformRequest = command.transformRequest;
          }
          if (command.transformResponse) {
            toolDefinition.transformResponse = command.transformResponse;
          }
          break;
        case ToolType.CUSTOM:
          if (!command.execute) {
            return {
              success: false,
              error: 'Custom tool requires execute function',
            };
          }
          toolDefinition.execute = command.execute;
          break;
      }

      // Register the tool
      const registeredTool = this.toolRegistry.registerTool(toolDefinition);

      // Publish event
      this.eventBus.publish(
        new ToolRegisteredEvent(
          registeredTool.id,
          registeredTool.name,
          registeredTool.type,
          registeredTool.categories
        )
      );

      return {
        success: true,
        data: registeredTool.id,
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
 * Handler for UnregisterToolCommand
 */
export class UnregisterToolHandler
  implements CommandHandler<UnregisterToolCommand, boolean>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly eventBus: EventBus
  ) {}

  async handle(
    command: UnregisterToolCommand
  ): Promise<CommandResult<boolean>> {
    try {
      // Get tool before unregistering to have its name for the event
      const tool = this.toolRegistry.getTool(command.toolId);
      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${command.toolId}`,
        };
      }

      // Unregister the tool
      const result = this.toolRegistry.unregisterTool(command.toolId);

      if (result) {
        // Publish event
        this.eventBus.publish(
          new ToolUnregisteredEvent(command.toolId, tool.name)
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
 * Handler for EnableToolCommand
 */
export class EnableToolHandler
  implements CommandHandler<EnableToolCommand, boolean>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: EnableToolCommand): Promise<CommandResult<boolean>> {
    try {
      // Get tool before enabling to have its name for the event
      const tool = this.toolRegistry.getTool(command.toolId);
      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${command.toolId}`,
        };
      }

      // Enable the tool
      const result = this.toolRegistry.enableTool(command.toolId);

      if (result) {
        // Publish event
        this.eventBus.publish(new ToolEnabledEvent(command.toolId, tool.name));
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
 * Handler for DisableToolCommand
 */
export class DisableToolHandler
  implements CommandHandler<DisableToolCommand, boolean>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: DisableToolCommand): Promise<CommandResult<boolean>> {
    try {
      // Get tool before disabling to have its name for the event
      const tool = this.toolRegistry.getTool(command.toolId);
      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${command.toolId}`,
        };
      }

      // Disable the tool
      const result = this.toolRegistry.disableTool(command.toolId);

      if (result) {
        // Publish event
        this.eventBus.publish(new ToolDisabledEvent(command.toolId, tool.name));
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
 * Handler for ExecuteToolCommand
 */
export class ExecuteToolHandler
  implements CommandHandler<ExecuteToolCommand, any>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: ExecuteToolCommand): Promise<CommandResult<any>> {
    try {
      // Validate that tool exists
      const tool = this.toolRegistry.getTool(command.toolId);
      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${command.toolId}`,
        };
      }

      // Validate arguments
      const validation = this.toolExecutor.validateToolArguments(
        command.toolId,
        command.arguments
      );

      if (!validation.valid) {
        // Publish invalid arguments event
        this.eventBus.publish(
          new ToolArgumentsInvalidEvent(
            command.toolId,
            tool.name,
            command.arguments,
            validation.errors || [],
            command.sessionId
          )
        );

        return {
          success: false,
          error: `Invalid arguments: ${validation.errors?.join(', ')}`,
        };
      }

      // Publish execution started event
      this.eventBus.publish(
        new ToolExecutionStartedEvent(
          uuidv4(), // Temporary ID that will be replaced by actual tool call ID
          command.sessionId,
          command.toolId,
          tool.name,
          tool.type,
          command.arguments,
          command.userId,
          command.requestId
        )
      );

      // Execute the tool
      const result = await this.toolExecutor.executeTool({
        sessionId: command.sessionId,
        toolId: command.toolId,
        arguments: command.arguments,
        options: command.options,
        userId: command.userId,
        requestId: command.requestId,
      });

      // Publish execution completed or failed event
      if (result.status === 'completed') {
        this.eventBus.publish(
          new ToolExecutionCompletedEvent(
            result.toolCallId,
            command.sessionId,
            command.toolId,
            tool.name,
            tool.type,
            result.result,
            result.executionTime,
            command.userId,
            command.requestId
          )
        );
      } else {
        this.eventBus.publish(
          new ToolExecutionFailedEvent(
            result.toolCallId,
            command.sessionId,
            command.toolId,
            tool.name,
            tool.type,
            result.error || 'Unknown error',
            result.executionTime,
            command.userId,
            command.requestId
          )
        );
      }

      return {
        success: result.status === 'completed',
        data: result.result,
        error: result.error,
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
 * Handler for ExecuteToolByNameCommand
 */
export class ExecuteToolByNameHandler
  implements CommandHandler<ExecuteToolByNameCommand, any>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
    private readonly eventBus: EventBus
  ) {}

  async handle(command: ExecuteToolByNameCommand): Promise<CommandResult<any>> {
    try {
      // Find tool by name
      const tool = this.toolRegistry.getToolByName(command.toolName);
      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${command.toolName}`,
        };
      }

      // Convert to ExecuteToolCommand
      const executeCommand = new ExecuteToolCommand(
        command.sessionId,
        tool.id,
        command.arguments,
        command.options,
        command.userId,
        command.requestId
      );

      // Create handler and delegate
      const handler = new ExecuteToolHandler(
        this.toolRegistry,
        this.toolExecutor,
        this.eventBus
      );

      return handler.handle(executeCommand);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Handler for ValidateToolArgumentsCommand
 */
export class ValidateToolArgumentsHandler
  implements
    CommandHandler<
      ValidateToolArgumentsCommand,
      { valid: boolean; errors?: string[] }
    >
{
  constructor(private readonly toolExecutor: ToolExecutor) {}

  async handle(
    command: ValidateToolArgumentsCommand
  ): Promise<CommandResult<{ valid: boolean; errors?: string[] }>> {
    try {
      // Validate arguments
      const validation = this.toolExecutor.validateToolArguments(
        command.toolId,
        command.arguments
      );

      return {
        success: true,
        data: validation,
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
 * Handler for GetToolsForProviderCommand
 */
export class GetToolsForProviderHandler
  implements CommandHandler<GetToolsForProviderCommand, any[]>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolFormatter: ToolFormatter
  ) {}

  async handle(
    command: GetToolsForProviderCommand
  ): Promise<CommandResult<any[]>> {
    try {
      // Get tools supported by the provider
      const tools = this.toolRegistry.getToolsForProvider(command.providerType);

      // Format tools if requested
      if (command.formatTools) {
        return {
          success: true,
          data: this.toolFormatter.formatToolsForProvider(
            tools,
            command.providerType
          ),
        };
      }

      // Return unformatted tools
      return {
        success: true,
        data: tools,
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
 * Handler for GetToolsByCategoryCommand
 */
export class GetToolsByCategoryHandler
  implements CommandHandler<GetToolsByCategoryCommand, any[]>
{
  constructor(private readonly toolRegistry: ToolRegistry) {}

  async handle(
    command: GetToolsByCategoryCommand
  ): Promise<CommandResult<any[]>> {
    try {
      // Get tools by category
      const tools = this.toolRegistry.getToolsByCategory(command.category);

      return {
        success: true,
        data: tools,
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
 * Handler for FormatToolsForProviderCommand
 */
export class FormatToolsForProviderHandler
  implements CommandHandler<FormatToolsForProviderCommand, any[]>
{
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly toolFormatter: ToolFormatter,
    private readonly eventBus: EventBus
  ) {}

  async handle(
    command: FormatToolsForProviderCommand
  ): Promise<CommandResult<any[]>> {
    try {
      // Get tools by IDs
      const tools = command.toolIds
        .map(id => this.toolRegistry.getTool(id))
        .filter(Boolean);

      if (tools.length === 0) {
        return {
          success: false,
          error: 'No valid tools found',
        };
      }

      // Format tools for provider
      const formattedTools = this.toolFormatter.formatToolsForProvider(
        tools,
        command.providerType,
        command.options
      );

      // Publish event
      this.eventBus.publish(
        new ToolsFormattedForProviderEvent(
          command.providerType,
          formattedTools.length,
          tools.map(t => t.id)
        )
      );

      return {
        success: true,
        data: formattedTools,
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
 * Handler for GetToolExecutionHistoryCommand
 */
export class GetToolExecutionHistoryHandler
  implements CommandHandler<GetToolExecutionHistoryCommand, ToolCall[]>
{
  constructor(private readonly toolExecutor: ToolExecutor) {}

  async handle(
    command: GetToolExecutionHistoryCommand
  ): Promise<CommandResult<ToolCall[]>> {
    try {
      // Get tool call history for session
      const history = this.toolExecutor.getToolCallHistory(command.sessionId);

      return {
        success: true,
        data: history,
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
 * Create and register all tool command handlers
 * @param commandBus Command bus to register handlers with
 */
export function registerToolCommandHandlers(commandBus: any): void {
  const toolRegistry = getToolRegistry();
  const toolFormatter = getToolFormatter();
  const toolExecutor = getToolExecutor();
  const eventBus = new EventBus(); // Use your actual event bus instance

  // Register handlers
  commandBus.registerHandler(
    'register-tool',
    new RegisterToolHandler(toolRegistry, eventBus)
  );

  commandBus.registerHandler(
    'unregister-tool',
    new UnregisterToolHandler(toolRegistry, eventBus)
  );

  commandBus.registerHandler(
    'enable-tool',
    new EnableToolHandler(toolRegistry, eventBus)
  );

  commandBus.registerHandler(
    'disable-tool',
    new DisableToolHandler(toolRegistry, eventBus)
  );

  commandBus.registerHandler(
    'execute-tool',
    new ExecuteToolHandler(toolRegistry, toolExecutor, eventBus)
  );

  commandBus.registerHandler(
    'execute-tool-by-name',
    new ExecuteToolByNameHandler(toolRegistry, toolExecutor, eventBus)
  );

  commandBus.registerHandler(
    'validate-tool-arguments',
    new ValidateToolArgumentsHandler(toolExecutor)
  );

  commandBus.registerHandler(
    'get-tools-for-provider',
    new GetToolsForProviderHandler(toolRegistry, toolFormatter)
  );

  commandBus.registerHandler(
    'get-tools-by-category',
    new GetToolsByCategoryHandler(toolRegistry)
  );

  commandBus.registerHandler(
    'format-tools-for-provider',
    new FormatToolsForProviderHandler(toolRegistry, toolFormatter, eventBus)
  );

  commandBus.registerHandler(
    'get-tool-execution-history',
    new GetToolExecutionHistoryHandler(toolExecutor)
  );
}
```

The Tool Commands and Events provide a complete communication interface for the Tool Domain. Key aspects include:

1. **Commands**: Define requests to perform actions like registering tools, executing tools, and formatting tools for providers
2. **Events**: Notify other domains about important occurrences like tool registration, execution completion, and execution failures
3. **Command Handlers**: Process commands, interact with the Tool Registry, Formatter, and Executor, and publish events
4. **Event Publishing**: Emit events at appropriate points during command processing to notify interested subscribers

This implementation follows the Command-Query Responsibility Segregation (CQRS) pattern, separating commands (which modify state) from queries (which retrieve data). The commands and events provide a clear interface for other domains to interact with the Tool Domain without directly coupling to its implementation details.

In the next step, we'll create built-in tools to demonstrate the Tool Domain's capabilities.

### Step 6: Implement Built-in Tools

To demonstrate the capabilities of the Tool Domain, we'll implement a set of built-in tools that can be registered during application startup.

**File: `src/llm/tool/built-in/search-tool.ts`**

```typescript
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  ToolType,
  ToolCategory,
  FunctionToolDefinition,
} from '../models/tool-definition';
import { ToolContext } from '../models/tool-types';
import { getToolRegistry } from '../registry/tool-registry';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  executionTime: number;
}

/**
 * Search tool for retrieving information from the web
 */
export function registerSearchTool(): string {
  const toolRegistry = getToolRegistry();

  const searchTool: FunctionToolDefinition = {
    id: uuidv4(),
    name: 'search',
    description: 'Search for information on the web',
    version: '1.0.0',
    type: ToolType.FUNCTION,
    schema: {
      name: 'search',
      description: 'Search for information on the web',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 5,
          },
        },
        required: ['query'],
      },
      returns: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
                snippet: { type: 'string' },
              },
            },
          },
          totalResults: { type: 'number' },
          executionTime: { type: 'number' },
        },
      },
    },
    categories: [ToolCategory.RETRIEVAL],
    enabled: true,
    supportedProviders: ['openai', 'anthropic', 'google'],
    executionFn: async (
      args: { query: string; limit?: number },
      context: ToolContext
    ): Promise<SearchResponse> => {
      const startTime = Date.now();
      const limit = args.limit || 5;

      try {
        // This is a mock implementation - in a real application, you would
        // connect to a real search API like Google, Bing, or a custom implementation
        // For this example, we'll simulate a search response

        // Simulate a delay to mimic a real API call
        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate simulated search results
        const results: SearchResult[] = [];

        for (let i = 0; i < limit; i++) {
          results.push({
            title: `Result ${i + 1} for "${args.query}"`,
            url: `https://example.com/result-${i + 1}`,
            snippet: `This is a snippet that contains information about "${args.query}" and provides a summary of the content on the page.`,
          });
        }

        const endTime = Date.now();
        const executionTime = endTime - startTime;

        return {
          results,
          totalResults: 100, // Simulated total count
          executionTime,
        };
      } catch (error) {
        console.error('Error executing search tool:', error);

        return {
          results: [],
          totalResults: 0,
          executionTime: Date.now() - startTime,
        };
      }
    },
  };

  // Register the tool
  const registeredTool = toolRegistry.registerTool(searchTool);

  return registeredTool.id;
}
```

**File: `src/llm/tool/built-in/weather-tool.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import {
  ToolType,
  ToolCategory,
  HttpToolDefinition,
} from '../models/tool-definition';
import { getToolRegistry } from '../registry/tool-registry';

interface WeatherResponse {
  location: string;
  temperature: number;
  unit: string;
  conditions: string;
  humidity: number;
  windSpeed: number;
  forecast: {
    date: string;
    high: number;
    low: number;
    conditions: string;
  }[];
}

/**
 * Weather tool for retrieving weather information
 */
export function registerWeatherTool(apiKey?: string): string {
  const toolRegistry = getToolRegistry();

  const weatherTool: HttpToolDefinition = {
    id: uuidv4(),
    name: 'getWeather',
    description: 'Get current weather and forecast for a location',
    version: '1.0.0',
    type: ToolType.HTTP,
    schema: {
      name: 'getWeather',
      description: 'Get current weather and forecast for a location',
      method: 'GET',
      url: 'https://api.weather.example.com/v1/weather',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Location name (city, address)',
          },
          units: {
            type: 'string',
            description: 'Temperature units',
            enum: ['celsius', 'fahrenheit'],
            default: 'celsius',
          },
          days: {
            type: 'number',
            description: 'Number of forecast days to include',
            minimum: 1,
            maximum: 7,
            default: 3,
          },
        },
        required: ['location'],
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      authentication: apiKey ? 'api_key' : 'none',
      authConfig: apiKey
        ? {
            key: 'X-API-Key',
            value: apiKey,
            in: 'header',
          }
        : undefined,
    },
    categories: [ToolCategory.INTEGRATION],
    enabled: true,
    supportedProviders: ['openai', 'anthropic', 'google'],
    transformResponse: (response: any): WeatherResponse => {
      // This transforms the external API's response format to our internal format
      // In a real implementation, this would convert the actual API response

      // Since we're using a mock API, we'll just return a simulated response
      return {
        location: response.location || 'Unknown',
        temperature: response.current?.temp || 0,
        unit: response.units === 'imperial' ? 'fahrenheit' : 'celsius',
        conditions: response.current?.condition || 'Unknown',
        humidity: response.current?.humidity || 0,
        windSpeed: response.current?.wind_speed || 0,
        forecast: (response.forecast?.days || []).map((day: any) => ({
          date: day.date,
          high: day.temp_max,
          low: day.temp_min,
          conditions: day.condition,
        })),
      };
    },
  };

  // Register the tool
  const registeredTool = toolRegistry.registerTool(weatherTool);

  return registeredTool.id;
}
```

**File: `src/llm/tool/built-in/calculator-tool.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  ToolType,
  ToolCategory,
  FunctionToolDefinition,
} from '../models/tool-definition';
import { ToolContext } from '../models/tool-types';
import { getToolRegistry } from '../registry/tool-registry';

interface CalculationResult {
  expression: string;
  result: number;
  error?: string;
}

/**
 * Calculator tool for performing mathematical calculations
 */
export function registerCalculatorTool(): string {
  const toolRegistry = getToolRegistry();

  const calculatorTool: FunctionToolDefinition = {
    id: uuidv4(),
    name: 'calculator',
    description: 'Perform mathematical calculations',
    version: '1.0.0',
    type: ToolType.FUNCTION,
    schema: {
      name: 'calculate',
      description: 'Perform a mathematical calculation',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description:
              'Mathematical expression to evaluate (e.g., "2 + 2 * 3")',
          },
        },
        required: ['expression'],
      },
      returns: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          result: { type: 'number' },
          error: { type: 'string' },
        },
      },
    },
    categories: [ToolCategory.UTILITY],
    enabled: true,
    supportedProviders: ['openai', 'anthropic', 'google'],
    executionFn: async (
      args: { expression: string },
      context: ToolContext
    ): Promise<CalculationResult> => {
      const expression = args.expression.trim();

      try {
        // Security: Use a safe evaluation method rather than eval
        // For this example, we'll use a simple approach to evaluate basic expressions
        // In a real application, you might use a math library like math.js

        // Check if the expression is safe (only contains numbers, operators, parentheses, and common math functions)
        if (!isSafeExpression(expression)) {
          return {
            expression,
            result: 0,
            error: 'Invalid or unsafe expression',
          };
        }

        // Convert the expression to a JavaScript function
        // This is still not fully safe, but better than direct eval
        const fn = new Function(`return ${expression}`);
        const result = fn();

        if (typeof result !== 'number' || isNaN(result)) {
          return {
            expression,
            result: 0,
            error: 'Expression did not evaluate to a number',
          };
        }

        return {
          expression,
          result,
        };
      } catch (error) {
        return {
          expression,
          result: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  };

  // Register the tool
  const registeredTool = toolRegistry.registerTool(calculatorTool);

  return registeredTool.id;
}

/**
 * Check if a mathematical expression is safe to evaluate
 * @param expression Expression to check
 * @returns Whether the expression is safe
 */
function isSafeExpression(expression: string): boolean {
  // Only allow digits, basic operators, parentheses, decimal points, and whitespace
  const safeRegex = /^[\d\s+\-*/().,e\^\s]*$/;
  return safeRegex.test(expression);
}
```

**File: `src/llm/tool/built-in/index.ts`**

```typescript
import { registerSearchTool } from './search-tool';
import { registerWeatherTool } from './weather-tool';
import { registerCalculatorTool } from './calculator-tool';

/**
 * Register all built-in tools
 * @returns Object containing the IDs of all registered tools
 */
export function registerBuiltInTools(): Record<string, string> {
  const searchToolId = registerSearchTool();
  const weatherToolId = registerWeatherTool();
  const calculatorToolId = registerCalculatorTool();

  return {
    search: searchToolId,
    weather: weatherToolId,
    calculator: calculatorToolId,
  };
}
```

These built-in tools demonstrate different types of tool implementations:

1. **Search Tool**: A function tool that simulates a web search
2. **Weather Tool**: An HTTP tool that interacts with a (simulated) external API
3. **Calculator Tool**: A function tool that performs mathematical calculations

Each tool has a well-defined schema, proper error handling, and appropriate categorization. The `registerBuiltInTools` function provides a convenient way to register all built-in tools during application startup.

### Step 7: Tool Domain Integration

To complete the Tool Domain implementation, we need to provide a function to initialize the domain and register it with the rest of the application.

**File: `src/llm/tool/index.ts`**

```typescript
import { CommandBus } from '../infrastructure/command-bus';
import { EventBus } from '../infrastructure/event-bus';
import { getToolRegistry } from './registry/tool-registry';
import { getToolFormatter } from './formatter/tool-formatter';
import { getToolExecutor } from './executor/tool-executor';
import { registerToolCommandHandlers } from './handlers/tool-command-handlers';
import { registerBuiltInTools } from './built-in';

/**
 * Initialize the Tool Domain
 * @param commandBus Command bus instance
 * @param eventBus Event bus instance
 */
export function initializeToolDomain(
  commandBus: CommandBus,
  eventBus: EventBus
): void {
  // Get singleton instances
  const toolRegistry = getToolRegistry();
  const toolFormatter = getToolFormatter();
  const toolExecutor = getToolExecutor();

  // Register command handlers
  registerToolCommandHandlers(commandBus);

  // Register built-in tools
  const builtInTools = registerBuiltInTools();

  console.log(
    'Tool Domain initialized with built-in tools:',
    Object.keys(builtInTools)
  );
}

// Re-export core components
export * from './models/tool-types';
export * from './models/tool-definition';
export * from './models/tool-call';
export * from './commands/tool-commands';
export * from './events/tool-events';
export * from './registry/tool-registry';
export * from './formatter/tool-formatter';
export * from './executor/tool-executor';
```

## Conclusion

The Tool Domain implementation provides a comprehensive framework for defining, registering, and executing tools in the LLM application. Key features and benefits include:

### Key Features

1. **Standardized Tool Interfaces**: Common interfaces for different types of tools (function, HTTP, custom)
2. **Tool Registry**: Central registry for tool registration and discovery
3. **Type-Safe Tool Definitions**: Well-defined schemas ensure type safety and proper validation
4. **Command/Event Communication**: Command and event patterns for loose coupling with other domains
5. **Provider-Specific Formatting**: Automatic conversion of tools to provider-specific formats
6. **Execution and Validation**: Robust execution with argument validation and error handling
7. **Built-in Tools**: Ready-to-use tools demonstrating different tool types and capabilities

### Benefits

1. **Extensibility**: Easy to add new tools or tool types without modifying existing code
2. **Provider Agnosticism**: Tools work with any provider through standardized interfaces
3. **Type Safety**: Strong typing and validation reduce errors and improve developer experience
4. **Loose Coupling**: Command and event patterns prevent tight coupling between domains
5. **Comprehensive Logging**: Events provide detailed tracking of tool execution and results

### Implementation Timeline

Implementing the Tool Domain will take approximately 2-3 weeks:

**Week 1:**

- Define tool models and interfaces
- Implement Tool Registry and Formatter

**Week 2:**

- Implement Tool Executor
- Implement Commands, Events, and Handlers
- Create basic built-in tools

**Week 3:**

- Complete built-in tools
- Integrate with other domains
- Write comprehensive tests
- Finalize documentation

### Integration with Other Domains

The Tool Domain will integrate with:

1. **Provider Domain**: For formatting tools according to provider requirements
2. **Session Domain**: For maintaining tool execution context within a session
3. **Message Routing Domain**: For routing tool calls and results
4. **Context Domain**: For providing relevant context to tools during execution

This implementation creates a flexible, extensible, and maintainable Tool Domain that can easily adapt to new requirements and providers.
