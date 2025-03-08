# Server Management Domain Implementation

This document provides a detailed implementation plan for the Server Management Domain components, which will be responsible for starting, stopping, and configuring the server that hosts the LLM application.

## Overview

The Server Management Domain manages the lifecycle and configuration of the server that hosts the LLM application. It provides abstractions for server initialization, configuration management, health monitoring, and graceful shutdown. This domain acts as a bridge between the application logic and the server infrastructure.

### Components

The Server Management Domain consists of the following core components:

1. **Server Manager**: The central component for server lifecycle management
2. **Configuration Manager**: Manages application configuration and environment variables
3. **Health Monitor**: Monitors the health of the server and its dependencies
4. **Request Handler**: Processes incoming HTTP requests and routes them to the appropriate domain
5. **Middleware Manager**: Manages HTTP middleware for security, logging, etc.
6. **API Router**: Routes API requests to the appropriate handlers

### Key Responsibilities

- **Server Lifecycle**: Starting, stopping, and restarting the server
- **Configuration Management**: Loading, validating, and providing access to configuration
- **Health Monitoring**: Checking the health of the server and its dependencies
- **Request Handling**: Processing HTTP requests and generating responses
- **API Routing**: Routing API requests to the appropriate domain handlers
- **Error Handling**: Capturing and processing server errors
- **Resource Cleanup**: Ensuring graceful shutdown and resource cleanup

## Architecture

The Server Management Domain follows a layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Server Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Middleware  │  │ Request/Resp │  │ Error Handling   │   │
│  │   Manager    │  │   Handler    │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                  Server Management Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │    Server    │  │ Configuration│  │  Health Monitor  │   │
│  │   Manager    │  │   Manager    │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                       API Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  API Router  │  │  Controller  │  │ Response Builder │   │
│  │              │  │   Factory    │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
             │                 │                 │
             ▼                 ▼                 ▼
    ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
    │  Provider Domain │ │ Tool Domain │ │ Session Domain  │
    └─────────────────┘ └─────────────┘ └─────────────────┘
```

The Server Management Domain acts as a bridge between the HTTP server infrastructure and the application domains:

1. **HTTP Server Layer**: Handles incoming HTTP requests, middleware, and error handling
2. **Server Management Layer**: Manages server lifecycle, configuration, and health monitoring
3. **API Layer**: Routes API requests to the appropriate controllers and builds responses

## Implementation Approach

The implementation will follow these principles:

1. **Dependency Injection**: Use dependency injection to allow for flexible configuration and testing
2. **Configuration-Driven**: Make the server behavior configurable through external configuration
3. **Health Monitoring**: Include comprehensive health checks for the server and its dependencies
4. **Graceful Shutdown**: Ensure graceful shutdown to prevent data loss or incomplete operations
5. **Error Boundaries**: Establish clear error boundaries to prevent cascading failures
6. **Logging**: Implement structured logging for debugging and monitoring

We'll implement the domain gradually, starting with core components and then adding more sophisticated features:

1. Define core interfaces and models
2. Implement configuration management
3. Implement server manager
4. Implement health monitoring
5. Implement request handling and middleware
6. Implement API routing

## Integration with Other Domains

The Server Management Domain will integrate with other domains through the API layer:

- **Message Routing Domain**: For routing messages between the server and other domains
- **Session Domain**: For managing sessions and their state
- **Provider Domain**: For accessing LLM providers
- **Tool Domain**: For executing tools

The Server Management Domain will be the entry point for all HTTP requests, routing them to the appropriate domains based on the requested endpoints.

Now, let's outline the implementation details for each component.

## Implementation Steps

### Step 1: Define Core Interfaces and Models

First, let's define the core interfaces and models that will be used throughout the Server Management Domain.

**File: `src/server/models/server-types.ts`**

```typescript
/**
 * Server status enumeration
 */
export enum ServerStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  // Server settings
  port: number;
  host: string;
  baseUrl: string;

  // Security settings
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };

  // Authentication settings
  auth: {
    enabled: boolean;
    type: 'api_key' | 'jwt' | 'oauth' | 'none';
    config: Record<string, any>;
  };

  // Rate limiting
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    message: string;
  };

  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    requests: boolean;
    responses: boolean;
  };

  // Timeouts
  timeouts: {
    server: number;
    request: number;
    socket: number;
  };

  // TLS/SSL settings
  tls: {
    enabled: boolean;
    keyPath?: string;
    certPath?: string;
  };

  // Static file serving
  static: {
    enabled: boolean;
    path: string;
    options: Record<string, any>;
  };
}

/**
 * Server health status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  components: Record<
    string,
    {
      status: HealthStatus;
      details?: any;
      lastChecked: Date;
    }
  >;
  timestamp: Date;
}

/**
 * Server statistics
 */
export interface ServerStats {
  uptime: number;
  requestCount: number;
  errorCount: number;
  pendingRequests: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: Date;
}

/**
 * Middleware definition
 */
export interface MiddlewareDefinition {
  name: string;
  enabled: boolean;
  priority: number;
  handler: MiddlewareHandler;
  options?: Record<string, any>;
}

/**
 * Middleware handler function
 */
export type MiddlewareHandler = (
  request: any,
  response: any,
  next: () => void
) => void | Promise<void>;

/**
 * API route definition
 */
export interface RouteDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  handler: RouteHandler;
  middleware?: MiddlewareHandler[];
  auth?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Route handler function
 */
export type RouteHandler = (
  request: any,
  response: any
) => void | Promise<void>;

/**
 * Server events enum
 */
export enum ServerEvent {
  STARTING = 'server:starting',
  STARTED = 'server:started',
  STOPPING = 'server:stopping',
  STOPPED = 'server:stopped',
  ERROR = 'server:error',
  REQUEST_RECEIVED = 'server:request:received',
  REQUEST_COMPLETED = 'server:request:completed',
  REQUEST_ERROR = 'server:request:error',
  HEALTH_CHECK = 'server:health:check',
}

/**
 * Server event listener
 */
export type ServerEventListener = (eventData: any) => void;
```

**File: `src/server/models/server-interfaces.ts`**

```typescript
import {
  ServerConfig,
  ServerStatus,
  HealthCheckResult,
  ServerStats,
  MiddlewareDefinition,
  RouteDefinition,
  ServerEvent,
  ServerEventListener,
} from './server-types';

/**
 * Interface for server manager
 */
export interface ServerManager {
  /**
   * Start the server
   * @param config Server configuration
   * @returns Promise resolving when server is started
   */
  start(config?: Partial<ServerConfig>): Promise<void>;

  /**
   * Stop the server
   * @param force Whether to force stop the server
   * @returns Promise resolving when server is stopped
   */
  stop(force?: boolean): Promise<void>;

  /**
   * Restart the server
   * @param config Server configuration
   * @returns Promise resolving when server is restarted
   */
  restart(config?: Partial<ServerConfig>): Promise<void>;

  /**
   * Get server status
   * @returns Current server status
   */
  getStatus(): ServerStatus;

  /**
   * Get server configuration
   * @returns Current server configuration
   */
  getConfig(): ServerConfig;

  /**
   * Update server configuration
   * @param config New configuration
   * @returns Whether update was successful
   */
  updateConfig(config: Partial<ServerConfig>): boolean;

  /**
   * Check server health
   * @returns Health check result
   */
  checkHealth(): Promise<HealthCheckResult>;

  /**
   * Get server statistics
   * @returns Server statistics
   */
  getStats(): ServerStats;

  /**
   * Add event listener
   * @param event Event to listen for
   * @param listener Listener function
   * @returns Function to remove the listener
   */
  addEventListener(
    event: ServerEvent,
    listener: ServerEventListener
  ): () => void;
}

/**
 * Interface for configuration manager
 */
export interface ConfigurationManager {
  /**
   * Load configuration from sources
   * @param sources Configuration sources
   * @returns Promise resolving to the loaded configuration
   */
  loadConfig(...sources: any[]): Promise<ServerConfig>;

  /**
   * Get the current configuration
   * @returns Current configuration
   */
  getConfig(): ServerConfig;

  /**
   * Get a specific configuration value
   * @param key Configuration key (dot notation supported)
   * @param defaultValue Default value if key not found
   * @returns Configuration value or default value
   */
  get<T>(key: string, defaultValue?: T): T;

  /**
   * Set a configuration value
   * @param key Configuration key (dot notation supported)
   * @param value Value to set
   * @returns Whether set was successful
   */
  set<T>(key: string, value: T): boolean;

  /**
   * Validate configuration
   * @param config Configuration to validate
   * @returns Validation result
   */
  validate(config: Partial<ServerConfig>): {
    valid: boolean;
    errors?: string[];
  };
}

/**
 * Interface for health monitor
 */
export interface HealthMonitor {
  /**
   * Check the health of the server and all components
   * @returns Health check result
   */
  checkHealth(): Promise<HealthCheckResult>;

  /**
   * Register a health check for a component
   * @param name Component name
   * @param check Health check function
   * @returns Function to unregister the health check
   */
  registerHealthCheck(
    name: string,
    check: () => Promise<{ status: HealthStatus; details?: any }>
  ): () => void;

  /**
   * Get the latest health check result
   * @returns Latest health check result or null if no check has been performed
   */
  getLatestHealthResult(): HealthCheckResult | null;

  /**
   * Start periodic health checks
   * @param intervalMs Interval in milliseconds
   * @returns Function to stop periodic health checks
   */
  startPeriodicChecks(intervalMs: number): () => void;
}

/**
 * Interface for middleware manager
 */
export interface MiddlewareManager {
  /**
   * Register middleware
   * @param middleware Middleware definition
   * @returns Function to unregister the middleware
   */
  registerMiddleware(middleware: MiddlewareDefinition): () => void;

  /**
   * Get all registered middleware
   * @returns Array of middleware definitions sorted by priority
   */
  getMiddleware(): MiddlewareDefinition[];

  /**
   * Enable middleware
   * @param name Middleware name
   * @returns Whether enable was successful
   */
  enableMiddleware(name: string): boolean;

  /**
   * Disable middleware
   * @param name Middleware name
   * @returns Whether disable was successful
   */
  disableMiddleware(name: string): boolean;

  /**
   * Apply all middleware to the server
   * @param server Server instance
   * @returns Whether apply was successful
   */
  applyMiddleware(server: any): boolean;
}

/**
 * Interface for API router
 */
export interface ApiRouter {
  /**
   * Register a route
   * @param route Route definition
   * @returns Function to unregister the route
   */
  registerRoute(route: RouteDefinition): () => void;

  /**
   * Register multiple routes
   * @param routes Route definitions
   * @returns Array of functions to unregister each route
   */
  registerRoutes(routes: RouteDefinition[]): (() => void)[];

  /**
   * Get all registered routes
   * @returns Array of route definitions
   */
  getRoutes(): RouteDefinition[];

  /**
   * Apply all routes to the server
   * @param server Server instance
   * @returns Whether apply was successful
   */
  applyRoutes(server: any): boolean;
}
```

These interfaces and models define the core abstractions for the Server Management Domain. They establish:

1. **Types and Statuses**: Enums for server status, health status, and server events
2. **Configuration**: Interface for server configuration, including security, logging, and timeouts
3. **Health Monitoring**: Interfaces for health checks and monitoring
4. **API Routing**: Interfaces for defining and managing API routes
5. **Middleware**: Interfaces for defining and managing middleware
6. **Event Handling**: Types for server events and event listeners

The interfaces provide clear contracts between components, making it easier to implement, test, and maintain the code. They also make the system more flexible by allowing for different implementations of the same interface.

In the next step, we'll implement the Configuration Manager component.

### Step 2: Implement Configuration Manager

The Configuration Manager is responsible for loading, validating, and providing access to the server configuration. It supports multiple configuration sources (environment variables, configuration files, command-line arguments) and provides a unified interface to access configuration values.

**File: `src/server/config/default-config.ts`**

```typescript
import { ServerConfig } from '../models/server-types';

/**
 * Default server configuration
 */
export const defaultServerConfig: ServerConfig = {
  port: 3000,
  host: 'localhost',
  baseUrl: 'http://localhost:3000',

  cors: {
    enabled: true,
    origins: ['*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: [],
    credentials: false,
    maxAge: 86400,
  },

  auth: {
    enabled: false,
    type: 'none',
    config: {},
  },

  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxRequests: 100,
    message: 'Too many requests, please try again later',
  },

  logging: {
    level: 'info',
    format: 'json',
    requests: true,
    responses: true,
  },

  timeouts: {
    server: 120000,
    request: 30000,
    socket: 60000,
  },

  tls: {
    enabled: false,
  },

  static: {
    enabled: true,
    path: 'public',
    options: {
      maxAge: '1d',
      etag: true,
    },
  },
};
```

**File: `src/server/config/configuration-manager.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import {
  ConfigurationManager,
  ServerConfig,
} from '../models/server-interfaces';
import { defaultServerConfig } from './default-config';
import {
  deepMerge,
  getNestedProperty,
  setNestedProperty,
} from '../utils/object-utils';

/**
 * Source types for configuration
 */
export enum ConfigSourceType {
  DEFAULT = 'default',
  ENV = 'environment',
  FILE = 'file',
  ARGS = 'arguments',
  MEMORY = 'memory',
}

/**
 * Configuration source representation
 */
export interface ConfigSource {
  type: ConfigSourceType;
  priority: number;
  data: Partial<ServerConfig>;
}

/**
 * Default implementation of Configuration Manager
 */
export class DefaultConfigurationManager implements ConfigurationManager {
  private config: ServerConfig;
  private sources: Map<ConfigSourceType, ConfigSource> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.config = { ...defaultServerConfig };
    // Add default config source
    this.sources.set(ConfigSourceType.DEFAULT, {
      type: ConfigSourceType.DEFAULT,
      priority: 0,
      data: defaultServerConfig,
    });
  }

  /**
   * Load configuration from various sources
   * @param sources Configuration sources (environment, file, etc.)
   * @returns Loaded configuration
   */
  async loadConfig(...sources: any[]): Promise<ServerConfig> {
    // Process each source and add it to the sources map
    for (const source of sources) {
      const configSource = await this.processSource(source);
      if (configSource) {
        this.sources.set(configSource.type, configSource);
      }
    }

    // Merge all sources based on priority
    this.mergeConfiguration();
    this.initialized = true;

    return this.config;
  }

  /**
   * Get current configuration
   * @returns Server configuration
   */
  getConfig(): ServerConfig {
    this.ensureInitialized();
    return { ...this.config };
  }

  /**
   * Get configuration value
   * @param key Configuration key (dot notation supported)
   * @param defaultValue Default value if key not found
   * @returns Configuration value
   */
  get<T>(key: string, defaultValue?: T): T {
    this.ensureInitialized();
    const value = getNestedProperty<ServerConfig, any>(this.config, key);
    return value !== undefined ? value : (defaultValue as T);
  }

  /**
   * Set configuration value
   * @param key Configuration key (dot notation supported)
   * @param value Value to set
   * @returns Whether set was successful
   */
  set<T>(key: string, value: T): boolean {
    this.ensureInitialized();

    try {
      // Update the in-memory source
      const memorySource = this.sources.get(ConfigSourceType.MEMORY) || {
        type: ConfigSourceType.MEMORY,
        priority: 100,
        data: {},
      };

      setNestedProperty(memorySource.data, key, value);
      this.sources.set(ConfigSourceType.MEMORY, memorySource);

      // Remerge configuration
      this.mergeConfiguration();
      return true;
    } catch (error) {
      console.error(`Failed to set configuration value for ${key}:`, error);
      return false;
    }
  }

  /**
   * Validate configuration
   * @param config Configuration to validate
   * @returns Validation result
   */
  validate(config: Partial<ServerConfig>): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    // Validate port
    if (
      config.port !== undefined &&
      (isNaN(config.port) || config.port < 0 || config.port > 65535)
    ) {
      errors.push('Port must be a number between 0 and 65535');
    }

    // Validate host
    if (config.host !== undefined && typeof config.host !== 'string') {
      errors.push('Host must be a string');
    }

    // Validate CORS origins
    if (
      config.cors?.origins !== undefined &&
      !Array.isArray(config.cors.origins)
    ) {
      errors.push('CORS origins must be an array');
    }

    // Validate logging level
    if (
      config.logging?.level !== undefined &&
      !['debug', 'info', 'warn', 'error'].includes(config.logging.level)
    ) {
      errors.push('Logging level must be one of: debug, info, warn, error');
    }

    // Validate timeouts
    if (
      config.timeouts?.request !== undefined &&
      (isNaN(config.timeouts.request) || config.timeouts.request < 0)
    ) {
      errors.push('Request timeout must be a positive number');
    }

    if (
      config.timeouts?.socket !== undefined &&
      (isNaN(config.timeouts.socket) || config.timeouts.socket < 0)
    ) {
      errors.push('Socket timeout must be a positive number');
    }

    // Validate TLS configuration
    if (config.tls?.enabled === true) {
      if (!config.tls.keyPath || !config.tls.certPath) {
        errors.push(
          'TLS key and certificate paths must be provided when TLS is enabled'
        );
      } else {
        // Check if files exist
        if (!fs.existsSync(config.tls.keyPath)) {
          errors.push(`TLS key file not found: ${config.tls.keyPath}`);
        }
        if (!fs.existsSync(config.tls.certPath)) {
          errors.push(`TLS certificate file not found: ${config.tls.certPath}`);
        }
      }
    }

    // Return validation result
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Process a configuration source
   * @param source Source to process
   * @returns Processed configuration source
   */
  private async processSource(source: any): Promise<ConfigSource | null> {
    try {
      // Handle environment variables
      if (source === 'env') {
        return this.processEnvironmentVariables();
      }

      // Handle file source
      if (
        typeof source === 'string' &&
        (source.endsWith('.json') || source.endsWith('.js'))
      ) {
        return await this.processFileSource(source);
      }

      // Handle command-line arguments
      if (source === 'args') {
        return this.processCommandLineArgs();
      }

      // Handle direct configuration object
      if (typeof source === 'object' && source !== null) {
        return {
          type: ConfigSourceType.MEMORY,
          priority: 100,
          data: source,
        };
      }

      return null;
    } catch (error) {
      console.error(`Failed to process configuration source ${source}:`, error);
      return null;
    }
  }

  /**
   * Process environment variables
   * @returns Environment configuration source
   */
  private processEnvironmentVariables(): ConfigSource {
    const envConfig: Partial<ServerConfig> = {};

    // Map environment variables to configuration
    if (process.env.PORT) envConfig.port = parseInt(process.env.PORT, 10);
    if (process.env.HOST) envConfig.host = process.env.HOST;
    if (process.env.BASE_URL) envConfig.baseUrl = process.env.BASE_URL;

    // CORS configuration
    if (process.env.CORS_ENABLED)
      envConfig.cors = {
        ...envConfig.cors,
        enabled: process.env.CORS_ENABLED === 'true',
      };
    if (process.env.CORS_ORIGINS)
      envConfig.cors = {
        ...envConfig.cors,
        origins: process.env.CORS_ORIGINS.split(',').map(o => o.trim()),
      };

    // Auth configuration
    if (process.env.AUTH_ENABLED)
      envConfig.auth = {
        ...envConfig.auth,
        enabled: process.env.AUTH_ENABLED === 'true',
      };
    if (process.env.AUTH_TYPE)
      envConfig.auth = {
        ...envConfig.auth,
        type: process.env.AUTH_TYPE as any,
      };

    // Logging configuration
    if (process.env.LOG_LEVEL)
      envConfig.logging = {
        ...envConfig.logging,
        level: process.env.LOG_LEVEL as any,
      };
    if (process.env.LOG_FORMAT)
      envConfig.logging = {
        ...envConfig.logging,
        format: process.env.LOG_FORMAT as any,
      };

    // TLS configuration
    if (process.env.TLS_ENABLED)
      envConfig.tls = {
        ...envConfig.tls,
        enabled: process.env.TLS_ENABLED === 'true',
      };
    if (process.env.TLS_KEY_PATH)
      envConfig.tls = {
        ...envConfig.tls,
        keyPath: process.env.TLS_KEY_PATH,
      };
    if (process.env.TLS_CERT_PATH)
      envConfig.tls = {
        ...envConfig.tls,
        certPath: process.env.TLS_CERT_PATH,
      };

    return {
      type: ConfigSourceType.ENV,
      priority: 50,
      data: envConfig,
    };
  }

  /**
   * Process file-based configuration source
   * @param filePath Path to configuration file
   * @returns File configuration source
   */
  private async processFileSource(filePath: string): Promise<ConfigSource> {
    const resolvedPath = path.resolve(process.cwd(), filePath);

    try {
      // Handle JSON files
      if (filePath.endsWith('.json')) {
        const fileContent = await fs.promises.readFile(resolvedPath, 'utf-8');
        const configData = JSON.parse(fileContent);
        return {
          type: ConfigSourceType.FILE,
          priority: 25,
          data: configData,
        };
      }

      // Handle JS files
      if (filePath.endsWith('.js')) {
        const configModule = require(resolvedPath);
        const configData = configModule.default || configModule;
        return {
          type: ConfigSourceType.FILE,
          priority: 25,
          data: configData,
        };
      }

      throw new Error(`Unsupported file format: ${filePath}`);
    } catch (error) {
      console.error(`Failed to load configuration from ${filePath}:`, error);
      return {
        type: ConfigSourceType.FILE,
        priority: 25,
        data: {},
      };
    }
  }

  /**
   * Process command-line arguments
   * @returns Command-line arguments configuration source
   */
  private processCommandLineArgs(): ConfigSource {
    const argConfig: Partial<ServerConfig> = {};
    const args = process.argv.slice(2);

    // Parse command-line arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const equalsIndex = key.indexOf('=');

        if (equalsIndex !== -1) {
          // Handle --key=value format
          const actualKey = key.slice(0, equalsIndex);
          const value = key.slice(equalsIndex + 1);
          this.setConfigValueFromArg(argConfig, actualKey, value);
        } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          // Handle --key value format
          const value = args[i + 1];
          this.setConfigValueFromArg(argConfig, key, value);
          i++; // Skip the value in the next iteration
        } else {
          // Handle --key (boolean flag)
          this.setConfigValueFromArg(argConfig, key, 'true');
        }
      }
    }

    return {
      type: ConfigSourceType.ARGS,
      priority: 75,
      data: argConfig,
    };
  }

  /**
   * Set configuration value from command-line argument
   * @param config Configuration object
   * @param key Key in kebab-case
   * @param value String value
   */
  private setConfigValueFromArg(
    config: Partial<ServerConfig>,
    key: string,
    value: string
  ): void {
    // Convert kebab-case to camelCase and dot notation
    const path = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    // Parse the value based on the expected type
    let parsedValue: any = value;

    // Try to parse as number
    if (!isNaN(Number(value)) && value.trim() !== '') {
      parsedValue = Number(value);
    }
    // Try to parse as boolean
    else if (value === 'true' || value === 'false') {
      parsedValue = value === 'true';
    }
    // Try to parse as array
    else if (value.startsWith('[') && value.endsWith(']')) {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string if parsing fails
      }
    }
    // Try to parse as object
    else if (value.startsWith('{') && value.endsWith('}')) {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string if parsing fails
      }
    }

    setNestedProperty(config, path, parsedValue);
  }

  /**
   * Merge all configuration sources based on priority
   */
  private mergeConfiguration(): void {
    // Sort sources by priority
    const sortedSources = Array.from(this.sources.values()).sort(
      (a, b) => a.priority - b.priority
    );

    // Start with an empty configuration
    let mergedConfig: Partial<ServerConfig> = {};

    // Merge each source
    for (const source of sortedSources) {
      mergedConfig = deepMerge(mergedConfig, source.data);
    }

    // Validate the merged configuration
    const validation = this.validate(mergedConfig);
    if (!validation.valid) {
      console.warn('Configuration validation warnings:', validation.errors);
    }

    // Update the current configuration
    this.config = mergedConfig as ServerConfig;
  }

  /**
   * Ensure the configuration manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      console.warn(
        'Configuration manager not initialized, using default configuration'
      );
      this.config = { ...defaultServerConfig };
      this.initialized = true;
    }
  }
}

/**
 * Object utility functions
 */
export const configurationManager = new DefaultConfigurationManager();
```

**File: `src/server/utils/object-utils.ts`**

```typescript
/**
 * Deep merge two objects
 * @param target Target object
 * @param source Source object
 * @returns Merged object
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

/**
 * Check if value is an object
 * @param item Value to check
 * @returns Whether the value is an object
 */
export function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Get a nested property from an object using dot notation
 * @param obj Object to get property from
 * @param path Path to property using dot notation
 * @returns Property value
 */
export function getNestedProperty<T, R>(obj: T, path: string): R | undefined {
  const keys = path.split('.');
  return keys.reduce((o, key) => {
    return o && o[key] !== undefined ? o[key] : undefined;
  }, obj as any) as R | undefined;
}

/**
 * Set a nested property on an object using dot notation
 * @param obj Object to set property on
 * @param path Path to property using dot notation
 * @param value Value to set
 */
export function setNestedProperty<T>(obj: T, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;

  const target = keys.reduce((o, key) => {
    o[key] = o[key] || {};
    return o[key];
  }, obj as any);

  target[lastKey] = value;
}
```

**File: `src/server/config/configuration-manager.test.ts`**

```typescript
import { DefaultConfigurationManager } from './configuration-manager';
import { ServerConfig } from '../models/server-types';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
  existsSync: jest.fn().mockReturnValue(true),
}));

describe('ConfigurationManager', () => {
  let configManager: DefaultConfigurationManager;

  beforeEach(() => {
    jest.resetAllMocks();
    configManager = new DefaultConfigurationManager();

    // Mock environment variables
    process.env.PORT = '4000';
    process.env.HOST = 'api.example.com';
    process.env.CORS_ORIGINS = 'http://example.com,http://localhost:8080';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.CORS_ORIGINS;
  });

  describe('loadConfig', () => {
    it('should load configuration from environment variables', async () => {
      await configManager.loadConfig('env');
      const config = configManager.getConfig();

      expect(config.port).toBe(4000);
      expect(config.host).toBe('api.example.com');
      expect(config.cors.origins).toEqual([
        'http://example.com',
        'http://localhost:8080',
      ]);
    });

    it('should load configuration from a JSON file', async () => {
      const mockConfig = {
        port: 5000,
        logging: {
          level: 'debug',
        },
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(mockConfig)
      );

      await configManager.loadConfig('config.json');
      const config = configManager.getConfig();

      expect(config.port).toBe(5000);
      expect(config.logging.level).toBe('debug');
    });

    it('should merge multiple configuration sources with correct priority', async () => {
      // Mock file config
      const fileConfig = {
        port: 5000,
        logging: {
          level: 'debug',
        },
      };

      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
        JSON.stringify(fileConfig)
      );

      // Load config from multiple sources
      await configManager.loadConfig(
        'config.json', // Priority 25
        'env', // Priority 50
        { port: 6000 } // Priority 100 (memory)
      );

      const config = configManager.getConfig();

      // Environment vars (priority 50) should override file config (priority 25)
      // Memory config (priority 100) should override both
      expect(config.port).toBe(6000);

      // File config should be applied for properties not in other sources
      expect(config.logging.level).toBe('debug');

      // Environment vars should be applied for properties not in memory config
      expect(config.host).toBe('api.example.com');
    });
  });

  describe('get and set', () => {
    beforeEach(async () => {
      await configManager.loadConfig('env');
    });

    it('should get configuration values using dot notation', () => {
      expect(configManager.get('port')).toBe(4000);
      expect(configManager.get('cors.origins')).toEqual([
        'http://example.com',
        'http://localhost:8080',
      ]);
      expect(configManager.get('logging.level')).toBe('info'); // Default value
    });

    it('should return default value for undefined properties', () => {
      expect(configManager.get('nonexistent', 'default')).toBe('default');
    });

    it('should set configuration values using dot notation', () => {
      configManager.set('logging.level', 'debug');
      expect(configManager.get('logging.level')).toBe('debug');

      configManager.set('timeouts.request', 60000);
      expect(configManager.get('timeouts.request')).toBe(60000);

      configManager.set('cors.origins', ['https://example.org']);
      expect(configManager.get('cors.origins')).toEqual([
        'https://example.org',
      ]);
    });
  });

  describe('validate', () => {
    it('should validate port correctly', () => {
      expect(configManager.validate({ port: 3000 }).valid).toBe(true);
      expect(configManager.validate({ port: -1 }).valid).toBe(false);
      expect(configManager.validate({ port: 70000 }).valid).toBe(false);
    });

    it('should validate logging level correctly', () => {
      expect(
        configManager.validate({ logging: { level: 'debug' } }).valid
      ).toBe(true);
      expect(
        configManager.validate({ logging: { level: 'trace' } }).valid
      ).toBe(false);
    });

    it('should validate TLS configuration correctly', () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      expect(
        configManager.validate({
          tls: {
            enabled: true,
            keyPath: '/path/to/key.pem',
            certPath: '/path/to/cert.pem',
          },
        }).valid
      ).toBe(true);

      expect(
        configManager.validate({
          tls: {
            enabled: true,
          },
        }).valid
      ).toBe(false);

      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      expect(
        configManager.validate({
          tls: {
            enabled: true,
            keyPath: '/nonexistent/key.pem',
            certPath: '/path/to/cert.pem',
          },
        }).valid
      ).toBe(false);
    });
  });
});
```

The Configuration Manager implementation includes the following features:

1. **Multiple Configuration Sources**: Support for loading configuration from environment variables, JSON/JS files, command-line arguments, and in-memory objects.

2. **Priority-Based Merging**: Configuration sources are merged based on priority, allowing higher-priority sources to override lower-priority ones.

3. **Dot Notation Access**: Configuration values can be accessed and modified using dot notation (e.g., `get('cors.origins')` or `set('logging.level', 'debug')`).

4. **Validation**: Configuration values are validated to ensure they meet requirements (e.g., port is a valid number, TLS files exist).

5. **Default Values**: Default configuration is provided for all settings, ensuring the application can run with minimal configuration.

6. **Type Safety**: TypeScript interfaces ensure type safety throughout the configuration system.

The implementation follows good practices such as:

- **Immutability**: Configuration objects are cloned to prevent direct modification.
- **Error Handling**: Errors during configuration loading or parsing are handled gracefully.
- **Testability**: The implementation is fully testable, with a comprehensive test suite.
- **Flexibility**: Support for various configuration formats and sources.

In the next step, we'll implement the Server Manager component.

### Step 3: Implement Server Manager

The Server Manager is responsible for managing the lifecycle of the HTTP server. It handles server startup, shutdown, configuration updates, and server events. The implementation below uses Express as the underlying HTTP server framework, but the interface is designed to be adaptable to other server frameworks.

**File: `src/server/manager/server-manager.ts`**

```typescript
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as express from 'express';
import { EventEmitter } from 'events';
import {
  ServerManager,
  ConfigurationManager,
  HealthMonitor,
  MiddlewareManager,
  ApiRouter,
} from '../models/server-interfaces';
import {
  ServerConfig,
  ServerStatus,
  HealthCheckResult,
  ServerStats,
  ServerEvent,
  ServerEventListener,
} from '../models/server-types';
import { configurationManager } from '../config/configuration-manager';

/**
 * Implementation of Server Manager using Express
 */
export class ExpressServerManager implements ServerManager {
  private server: http.Server | https.Server | null = null;
  private app: express.Application;
  private status: ServerStatus = ServerStatus.STOPPED;
  private startTime: number = 0;
  private stats: ServerStats = this.createEmptyStats();
  private eventEmitter: EventEmitter = new EventEmitter();
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private configManager: ConfigurationManager;
  private healthMonitor: HealthMonitor;
  private middlewareManager: MiddlewareManager;
  private apiRouter: ApiRouter;

  /**
   * Constructor for Express Server Manager
   */
  constructor(
    configManager: ConfigurationManager,
    healthMonitor: HealthMonitor,
    middlewareManager: MiddlewareManager,
    apiRouter: ApiRouter
  ) {
    this.app = express();
    this.configManager = configManager;
    this.healthMonitor = healthMonitor;
    this.middlewareManager = middlewareManager;
    this.apiRouter = apiRouter;

    // Set up request tracking for stats
    this.app.use(this.trackRequest.bind(this));
  }

  /**
   * Start the server
   * @param config Partial server configuration
   * @returns Promise that resolves when server is started
   */
  async start(config?: Partial<ServerConfig>): Promise<void> {
    if (this.status === ServerStatus.RUNNING) {
      throw new Error('Server is already running');
    }

    try {
      // Update status to starting
      this.setStatus(ServerStatus.STARTING);
      this.emit(ServerEvent.STARTING, { timestamp: new Date() });

      // Update configuration if provided
      if (config) {
        this.configManager.loadConfig(config);
      }

      // Get current configuration
      const serverConfig = this.configManager.getConfig();

      // Apply middleware
      this.middlewareManager.applyMiddleware(this.app);

      // Apply routes
      this.apiRouter.applyRoutes(this.app);

      // Create server instance
      if (
        serverConfig.tls &&
        serverConfig.tls.enabled &&
        serverConfig.tls.keyPath &&
        serverConfig.tls.certPath
      ) {
        // Create HTTPS server
        const httpsOptions = {
          key: fs.readFileSync(serverConfig.tls.keyPath),
          cert: fs.readFileSync(serverConfig.tls.certPath),
        };
        this.server = https.createServer(httpsOptions, this.app);
      } else {
        // Create HTTP server
        this.server = http.createServer(this.app);
      }

      // Set up server event handlers
      this.server.on('error', this.handleServerError.bind(this));

      // Set timeouts
      if (serverConfig.timeouts) {
        this.server.timeout = serverConfig.timeouts.server;
        this.server.keepAliveTimeout = serverConfig.timeouts.socket;
      }

      // Start the server
      await this.bindServerToPort(serverConfig.port, serverConfig.host);

      // Update status to running
      this.startTime = Date.now();
      this.resetStats();
      this.setStatus(ServerStatus.RUNNING);
      this.emit(ServerEvent.STARTED, {
        timestamp: new Date(),
        port: serverConfig.port,
        host: serverConfig.host,
        tls: serverConfig.tls?.enabled || false,
      });

      console.log(
        `Server started on ${serverConfig.tls?.enabled ? 'https' : 'http'}://${
          serverConfig.host
        }:${serverConfig.port}`
      );
    } catch (error) {
      this.setStatus(ServerStatus.ERROR);
      this.emit(ServerEvent.ERROR, {
        timestamp: new Date(),
        error,
      });
      throw error;
    }
  }

  /**
   * Stop the server
   * @param force Whether to force stop the server
   * @returns Promise that resolves when server is stopped
   */
  async stop(force: boolean = false): Promise<void> {
    if (this.status === ServerStatus.STOPPED) {
      console.log('Server is already stopped');
      return;
    }

    this.setStatus(ServerStatus.STOPPING);
    this.emit(ServerEvent.STOPPING, { timestamp: new Date(), force });

    // Clear any existing shutdown timeout
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = null;
    }

    // Get shutdown timeout from config
    const config = this.configManager.getConfig();
    const shutdownTimeoutMs = force ? 1000 : config.timeouts?.server || 30000;

    try {
      // Graceful shutdown
      if (this.server) {
        // Set a timeout to force close if graceful shutdown takes too long
        this.shutdownTimeout = setTimeout(() => {
          console.warn(
            `Server shutdown timed out after ${shutdownTimeoutMs}ms, forcing close`
          );
          if (this.server) {
            this.server.close();
          }
        }, shutdownTimeoutMs);

        // Stop accepting new connections
        await new Promise<void>((resolve, reject) => {
          if (!this.server) {
            resolve();
            return;
          }

          this.server.close(err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // Clear the timeout if successful
        if (this.shutdownTimeout) {
          clearTimeout(this.shutdownTimeout);
          this.shutdownTimeout = null;
        }
      }

      this.server = null;
      this.setStatus(ServerStatus.STOPPED);
      this.emit(ServerEvent.STOPPED, { timestamp: new Date() });
      console.log('Server stopped successfully');
    } catch (error) {
      this.setStatus(ServerStatus.ERROR);
      this.emit(ServerEvent.ERROR, {
        timestamp: new Date(),
        error,
      });
      throw error;
    }
  }

  /**
   * Restart the server
   * @param config Partial server configuration
   * @returns Promise that resolves when server is restarted
   */
  async restart(config?: Partial<ServerConfig>): Promise<void> {
    try {
      await this.stop();
      await this.start(config);
    } catch (error) {
      this.setStatus(ServerStatus.ERROR);
      this.emit(ServerEvent.ERROR, {
        timestamp: new Date(),
        error,
      });
      throw error;
    }
  }

  /**
   * Get server status
   * @returns Current server status
   */
  getStatus(): ServerStatus {
    return this.status;
  }

  /**
   * Get server configuration
   * @returns Current server configuration
   */
  getConfig(): ServerConfig {
    return this.configManager.getConfig();
  }

  /**
   * Update server configuration
   * @param config New configuration
   * @returns Whether update was successful
   */
  updateConfig(config: Partial<ServerConfig>): boolean {
    // Validate configuration
    const validation = this.configManager.validate(config);
    if (!validation.valid) {
      console.error('Invalid configuration:', validation.errors);
      return false;
    }

    try {
      // Update configuration
      for (const [key, value] of Object.entries(config)) {
        this.configManager.set(key, value);
      }

      return true;
    } catch (error) {
      console.error('Failed to update configuration:', error);
      return false;
    }
  }

  /**
   * Check server health
   * @returns Health check result
   */
  async checkHealth(): Promise<HealthCheckResult> {
    return this.healthMonitor.checkHealth();
  }

  /**
   * Get server statistics
   * @returns Server statistics
   */
  getStats(): ServerStats {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();

    return {
      ...this.stats,
      uptime: this.getUptime(),
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memoryUsage.rss / (1024 * 1024), // Convert to MB
      timestamp: new Date(),
    };
  }

  /**
   * Add event listener
   * @param event Event to listen for
   * @param listener Listener function
   * @returns Function to remove the listener
   */
  addEventListener(
    event: ServerEvent,
    listener: ServerEventListener
  ): () => void {
    this.eventEmitter.on(event, listener);
    return () => {
      this.eventEmitter.off(event, listener);
    };
  }

  /**
   * Get the Express application instance
   * @returns Express application
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Get the server instance
   * @returns HTTP/HTTPS server
   */
  getServer(): http.Server | https.Server | null {
    return this.server;
  }

  /**
   * Set server status
   * @param status New status
   */
  private setStatus(status: ServerStatus): void {
    this.status = status;
  }

  /**
   * Get server uptime in milliseconds
   * @returns Uptime in milliseconds
   */
  private getUptime(): number {
    if (this.status !== ServerStatus.RUNNING) {
      return 0;
    }

    return Date.now() - this.startTime;
  }

  /**
   * Reset server statistics
   */
  private resetStats(): void {
    this.stats = this.createEmptyStats();
  }

  /**
   * Create empty server statistics
   * @returns Empty server statistics
   */
  private createEmptyStats(): ServerStats {
    return {
      uptime: 0,
      requestCount: 0,
      errorCount: 0,
      pendingRequests: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Track requests for server statistics
   * @param req Request
   * @param res Response
   * @param next Next function
   */
  private trackRequest(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    // Emit request received event
    this.emit(ServerEvent.REQUEST_RECEIVED, {
      timestamp: new Date(),
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    // Update request stats
    this.stats.requestCount++;
    this.stats.pendingRequests++;

    // Track response
    res.on('finish', () => {
      this.stats.pendingRequests--;

      // Check if response is an error
      if (res.statusCode >= 400) {
        this.stats.errorCount++;

        // Emit request error event
        this.emit(ServerEvent.REQUEST_ERROR, {
          timestamp: new Date(),
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          ip: req.ip,
        });
      }

      // Emit request completed event
      this.emit(ServerEvent.REQUEST_COMPLETED, {
        timestamp: new Date(),
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ip: req.ip,
        responseTime: res.getHeader('X-Response-Time'),
      });
    });

    next();
  }

  /**
   * Handle server error
   * @param error Error
   */
  private handleServerError(error: Error): void {
    this.setStatus(ServerStatus.ERROR);
    this.emit(ServerEvent.ERROR, {
      timestamp: new Date(),
      error,
    });
    console.error('Server error:', error);
  }

  /**
   * Bind server to port and host
   * @param port Port
   * @param host Host
   * @returns Promise that resolves when server is bound
   */
  private bindServerToPort(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.listen(port, host, () => {
        resolve();
      });
    });
  }

  /**
   * Emit server event
   * @param event Event
   * @param data Event data
   */
  private emit(event: ServerEvent, data: any): void {
    this.eventEmitter.emit(event, data);
  }
}

/**
 * Create a singleton instance of the server manager
 */
export const createServerManager = (
  configManager: ConfigurationManager,
  healthMonitor: HealthMonitor,
  middlewareManager: MiddlewareManager,
  apiRouter: ApiRouter
): ServerManager => {
  return new ExpressServerManager(
    configManager,
    healthMonitor,
    middlewareManager,
    apiRouter
  );
};
```

**File: `src/server/manager/server-manager.test.ts`**

```typescript
import { ExpressServerManager } from './server-manager';
import {
  ConfigurationManager,
  HealthMonitor,
  MiddlewareManager,
  ApiRouter,
} from '../models/server-interfaces';
import {
  ServerStatus,
  ServerEvent,
  HealthStatus,
  HealthCheckResult,
} from '../models/server-types';
import * as http from 'http';
import * as express from 'express';

// Mock dependencies
const mockConfigManager: jest.Mocked<ConfigurationManager> = {
  loadConfig: jest.fn().mockResolvedValue({}),
  getConfig: jest.fn().mockReturnValue({
    port: 3000,
    host: 'localhost',
    timeouts: {
      server: 5000,
      socket: 5000,
    },
  }),
  get: jest.fn(),
  set: jest.fn().mockReturnValue(true),
  validate: jest.fn().mockReturnValue({ valid: true }),
};

const mockHealthMonitor: jest.Mocked<HealthMonitor> = {
  checkHealth: jest.fn().mockResolvedValue({
    status: HealthStatus.HEALTHY,
    components: {},
    timestamp: new Date(),
  } as HealthCheckResult),
  registerHealthCheck: jest.fn().mockReturnValue(() => {}),
  getLatestHealthResult: jest.fn().mockReturnValue(null),
  startPeriodicChecks: jest.fn().mockReturnValue(() => {}),
};

const mockMiddlewareManager: jest.Mocked<MiddlewareManager> = {
  registerMiddleware: jest.fn().mockReturnValue(() => {}),
  getMiddleware: jest.fn().mockReturnValue([]),
  enableMiddleware: jest.fn().mockReturnValue(true),
  disableMiddleware: jest.fn().mockReturnValue(true),
  applyMiddleware: jest.fn().mockReturnValue(true),
};

const mockApiRouter: jest.Mocked<ApiRouter> = {
  registerRoute: jest.fn().mockReturnValue(() => {}),
  registerRoutes: jest.fn().mockReturnValue([]),
  getRoutes: jest.fn().mockReturnValue([]),
  applyRoutes: jest.fn().mockReturnValue(true),
};

// Mock HTTP server
const mockHttpServer = {
  listen: jest.fn((port, host, cb) => {
    cb();
    return mockHttpServer;
  }),
  close: jest.fn(cb => {
    cb();
    return mockHttpServer;
  }),
  on: jest.fn(),
  timeout: 0,
  keepAliveTimeout: 0,
};

// Mock Express
jest.mock('express', () => {
  const mockExpress = jest.fn(() => ({
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    listen: jest.fn(),
  }));
  mockExpress.json = jest.fn();
  mockExpress.urlencoded = jest.fn();
  return mockExpress;
});

// Mock HTTP
jest.mock('http', () => ({
  createServer: jest.fn(() => mockHttpServer),
}));

describe('ExpressServerManager', () => {
  let serverManager: ExpressServerManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new server manager for each test
    serverManager = new ExpressServerManager(
      mockConfigManager,
      mockHealthMonitor,
      mockMiddlewareManager,
      mockApiRouter
    );
  });

  describe('start', () => {
    it('should start the server successfully', async () => {
      // Listen for server started event
      const startedListener = jest.fn();
      serverManager.addEventListener(ServerEvent.STARTED, startedListener);

      // Start the server
      await serverManager.start();

      // Verify server is running
      expect(serverManager.getStatus()).toBe(ServerStatus.RUNNING);

      // Verify dependencies were called
      expect(mockMiddlewareManager.applyMiddleware).toHaveBeenCalled();
      expect(mockApiRouter.applyRoutes).toHaveBeenCalled();
      expect(http.createServer).toHaveBeenCalled();
      expect(mockHttpServer.listen).toHaveBeenCalledWith(
        3000,
        'localhost',
        expect.any(Function)
      );

      // Verify event was emitted
      expect(startedListener).toHaveBeenCalled();
    });

    it('should throw error if server is already running', async () => {
      // Start the server
      await serverManager.start();

      // Try to start again
      await expect(serverManager.start()).rejects.toThrow(
        'Server is already running'
      );
    });

    it('should update configuration if provided', async () => {
      const config = { port: 4000 };
      await serverManager.start(config);

      expect(mockConfigManager.loadConfig).toHaveBeenCalledWith(config);
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      // Start the server before each test
      await serverManager.start();
    });

    it('should stop the server successfully', async () => {
      // Listen for server stopped event
      const stoppedListener = jest.fn();
      serverManager.addEventListener(ServerEvent.STOPPED, stoppedListener);

      // Stop the server
      await serverManager.stop();

      // Verify server is stopped
      expect(serverManager.getStatus()).toBe(ServerStatus.STOPPED);
      expect(mockHttpServer.close).toHaveBeenCalled();

      // Verify event was emitted
      expect(stoppedListener).toHaveBeenCalled();
    });

    it('should force stop the server if force=true', async () => {
      // Stop the server with force=true
      await serverManager.stop(true);

      // Verify server is stopped
      expect(serverManager.getStatus()).toBe(ServerStatus.STOPPED);
    });
  });

  describe('restart', () => {
    beforeEach(async () => {
      // Start the server before each test
      await serverManager.start();
    });

    it('should restart the server successfully', async () => {
      // Listen for server events
      const stoppedListener = jest.fn();
      const startedListener = jest.fn();
      serverManager.addEventListener(ServerEvent.STOPPED, stoppedListener);
      serverManager.addEventListener(ServerEvent.STARTED, startedListener);

      // Restart the server
      await serverManager.restart();

      // Verify server is running
      expect(serverManager.getStatus()).toBe(ServerStatus.RUNNING);

      // Verify events were emitted
      expect(stoppedListener).toHaveBeenCalled();
      expect(startedListener).toHaveBeenCalled();
    });

    it('should restart with new configuration if provided', async () => {
      const config = { port: 4000 };
      await serverManager.restart(config);

      expect(mockConfigManager.loadConfig).toHaveBeenCalledWith(config);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration successfully', () => {
      const config = { port: 4000 };
      const result = serverManager.updateConfig(config);

      expect(result).toBe(true);
      expect(mockConfigManager.validate).toHaveBeenCalledWith(config);
      expect(mockConfigManager.set).toHaveBeenCalledWith('port', 4000);
    });

    it('should return false if validation fails', () => {
      mockConfigManager.validate.mockReturnValueOnce({
        valid: false,
        errors: ['Invalid port'],
      });

      const config = { port: -1 };
      const result = serverManager.updateConfig(config);

      expect(result).toBe(false);
    });
  });

  describe('checkHealth', () => {
    it('should return health check result', async () => {
      const healthResult = await serverManager.checkHealth();

      expect(healthResult).toBeDefined();
      expect(healthResult.status).toBe(HealthStatus.HEALTHY);
      expect(mockHealthMonitor.checkHealth).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return server statistics', () => {
      const stats = serverManager.getStats();

      expect(stats).toBeDefined();
      expect(stats.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('addEventListener', () => {
    it('should add event listener and return remove function', () => {
      const listener = jest.fn();
      const removeListener = serverManager.addEventListener(
        ServerEvent.STARTED,
        listener
      );

      expect(typeof removeListener).toBe('function');

      // Trigger the event via internal method
      (serverManager as any).emit(ServerEvent.STARTED, {
        timestamp: new Date(),
      });

      expect(listener).toHaveBeenCalled();

      // Remove the listener
      removeListener();

      // Reset the mock
      listener.mockReset();

      // Trigger the event again
      (serverManager as any).emit(ServerEvent.STARTED, {
        timestamp: new Date(),
      });

      // Listener should not be called
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
```

The Server Manager implementation provides the following features:

1. **Server Lifecycle Management**: Complete control over server startup, shutdown, and restart operations.

2. **HTTP/HTTPS Support**: Configurable HTTP or HTTPS server based on configuration.

3. **Event System**: Comprehensive event system for notifying about server lifecycle events and request/response events.

4. **Health Monitoring**: Integration with the Health Monitor for reporting server health.

5. **Statistics Tracking**: Collection and reporting of server statistics, including request counts, error counts, and resource usage.

6. **Graceful Shutdown**: Implementation of graceful shutdown with configurable timeout.

7. **Configuration Management**: Integration with Configuration Manager for managing server settings.

The implementation follows good practices such as:

- **Dependency Injection**: Dependencies are injected through the constructor, making the class easier to test and extend.
- **Error Handling**: Comprehensive error handling for all server operations.
- **Event-Driven Architecture**: Server events are emitted for important state changes and activities.
- **Resource Management**: Careful management of server resources, including tracking open connections.
- **Testability**: The implementation is fully testable, with a comprehensive test suite.

In the next step, we'll implement the Health Monitor component.

### Step 4: Implement Health Monitor

The Health Monitor is responsible for checking the health of the server and its dependencies. It provides a unified interface for registering health checks for different components and aggregating the results. It also supports periodic health checks and health status reporting.

**File: `src/server/health/health-monitor.ts`**

```typescript
import { HealthMonitor, ServerManager } from '../models/server-interfaces';
import {
  HealthStatus,
  HealthCheckResult,
  ServerEvent,
} from '../models/server-types';

/**
 * Type for health check function
 */
export type HealthCheckFunction = () => Promise<{
  status: HealthStatus;
  details?: any;
}>;

/**
 * Health check registration
 */
interface HealthCheckRegistration {
  name: string;
  check: HealthCheckFunction;
  timeout: number;
}

/**
 * Default implementation of Health Monitor
 */
export class DefaultHealthMonitor implements HealthMonitor {
  private healthChecks: Map<string, HealthCheckRegistration> = new Map();
  private latestResult: HealthCheckResult | null = null;
  private periodicCheckInterval: NodeJS.Timeout | null = null;
  private serverManager: ServerManager | null = null;

  /**
   * Constructor for Default Health Monitor
   */
  constructor() {}

  /**
   * Set the server manager reference
   * This is set after construction to avoid circular dependencies
   * @param serverManager Server manager instance
   */
  setServerManager(serverManager: ServerManager): void {
    this.serverManager = serverManager;

    // Listen for server events
    if (this.serverManager) {
      this.serverManager.addEventListener(ServerEvent.STARTED, () => {
        // Perform an initial health check when server starts
        this.checkHealth().catch(error => {
          console.error('Error during initial health check:', error);
        });
      });
    }
  }

  /**
   * Check the health of all registered components
   * @returns Health check result
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const components: Record<
      string,
      {
        status: HealthStatus;
        details?: any;
        lastChecked: Date;
      }
    > = {};

    let overallStatus = HealthStatus.HEALTHY;

    // Check each registered health check
    for (const [name, registration] of this.healthChecks.entries()) {
      try {
        // Run health check with timeout
        const result = await this.runWithTimeout(
          registration.check(),
          registration.timeout
        );

        components[name] = {
          ...result,
          lastChecked: new Date(),
        };

        // Update overall status
        if (result.status === HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.UNHEALTHY;
        } else if (
          result.status === HealthStatus.DEGRADED &&
          overallStatus !== HealthStatus.UNHEALTHY
        ) {
          overallStatus = HealthStatus.DEGRADED;
        }
      } catch (error) {
        console.error(`Health check for ${name} failed:`, error);

        // Mark component as unhealthy
        components[name] = {
          status: HealthStatus.UNHEALTHY,
          details: { error: error.message || String(error) },
          lastChecked: new Date(),
        };

        // Update overall status
        overallStatus = HealthStatus.UNHEALTHY;
      }
    }

    // Add server status
    if (this.serverManager) {
      const serverStatus = this.serverManager.getStatus();
      const serverStats = this.serverManager.getStats();

      components['server'] = {
        status:
          serverStatus === 'running'
            ? HealthStatus.HEALTHY
            : HealthStatus.UNHEALTHY,
        details: {
          status: serverStatus,
          uptime: serverStats.uptime,
          requestCount: serverStats.requestCount,
          errorCount: serverStats.errorCount,
          pendingRequests: serverStats.pendingRequests,
        },
        lastChecked: new Date(),
      };

      // Update overall status based on server status
      if (components['server'].status === HealthStatus.UNHEALTHY) {
        overallStatus = HealthStatus.UNHEALTHY;
      }
    }

    // Create the health check result
    const result: HealthCheckResult = {
      status: overallStatus,
      components,
      timestamp: new Date(),
    };

    // Update latest result
    this.latestResult = result;

    // Emit health check event if server manager is available
    if (this.serverManager) {
      this.serverManager.addEventListener(ServerEvent.HEALTH_CHECK, result);
    }

    return result;
  }

  /**
   * Register a health check for a component
   * @param name Component name
   * @param check Health check function
   * @param timeout Timeout in milliseconds
   * @returns Function to unregister the health check
   */
  registerHealthCheck(
    name: string,
    check: HealthCheckFunction,
    timeout: number = 5000
  ): () => void {
    this.healthChecks.set(name, { name, check, timeout });

    return () => {
      this.healthChecks.delete(name);
    };
  }

  /**
   * Get the latest health check result
   * @returns Latest health check result or null if no check has been performed
   */
  getLatestHealthResult(): HealthCheckResult | null {
    return this.latestResult;
  }

  /**
   * Start periodic health checks
   * @param intervalMs Interval in milliseconds
   * @returns Function to stop periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 60000): () => void {
    // Stop any existing interval
    this.stopPeriodicChecks();

    // Start new interval
    this.periodicCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error('Error during periodic health check:', error);
      }
    }, intervalMs);

    // Ensure interval doesn't prevent Node from exiting
    if (this.periodicCheckInterval.unref) {
      this.periodicCheckInterval.unref();
    }

    return this.stopPeriodicChecks.bind(this);
  }

  /**
   * Stop periodic health checks
   */
  private stopPeriodicChecks(): void {
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
      this.periodicCheckInterval = null;
    }
  }

  /**
   * Run a promise with a timeout
   * @param promise Promise to run
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise result
   */
  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Execute promise
      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

/**
 * Create common health checks for dependencies
 */
export const healthChecks = {
  /**
   * Create a database health check
   * @param db Database connection
   * @param timeout Timeout in milliseconds
   * @returns Health check function
   */
  database(db: any, timeout: number = 5000): HealthCheckFunction {
    return async () => {
      try {
        // Try a simple query to check if database is responsive
        if (typeof db.query === 'function') {
          await db.query('SELECT 1');
        } else if (typeof db.ping === 'function') {
          await db.ping();
        } else if (typeof db.isConnected === 'function') {
          const connected = await db.isConnected();
          if (!connected) {
            throw new Error('Database is not connected');
          }
        } else {
          throw new Error('No method available to check database health');
        }

        return {
          status: HealthStatus.HEALTHY,
          details: { connected: true },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          details: { error: error.message || 'Database connection failed' },
        };
      }
    };
  },

  /**
   * Create a Redis health check
   * @param redis Redis client
   * @param timeout Timeout in milliseconds
   * @returns Health check function
   */
  redis(redis: any, timeout: number = 5000): HealthCheckFunction {
    return async () => {
      try {
        // Try a simple command to check if Redis is responsive
        if (typeof redis.ping === 'function') {
          const result = await redis.ping();
          if (result !== 'PONG') {
            throw new Error('Redis ping failed');
          }
        } else if (typeof redis.isConnected === 'function') {
          const connected = await redis.isConnected();
          if (!connected) {
            throw new Error('Redis is not connected');
          }
        } else {
          throw new Error('No method available to check Redis health');
        }

        return {
          status: HealthStatus.HEALTHY,
          details: { connected: true },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          details: { error: error.message || 'Redis connection failed' },
        };
      }
    };
  },

  /**
   * Create an external API health check
   * @param url URL to check
   * @param options Fetch options
   * @param validator Function to validate response
   * @returns Health check function
   */
  externalApi(
    url: string,
    options: RequestInit = {},
    validator: (response: Response) => Promise<boolean> = async response =>
      response.ok
  ): HealthCheckFunction {
    return async () => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          ...options,
          headers: {
            Accept: 'application/json',
            ...(options.headers || {}),
          },
        });

        const isValid = await validator(response);

        if (!isValid) {
          return {
            status: HealthStatus.DEGRADED,
            details: {
              statusCode: response.status,
              message: `API responded with status ${response.status}`,
            },
          };
        }

        return {
          status: HealthStatus.HEALTHY,
          details: { statusCode: response.status },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          details: { error: error.message || 'API request failed' },
        };
      }
    };
  },

  /**
   * Create a disk space health check
   * @param thresholdPercent Threshold percentage for warning
   * @returns Health check function
   */
  diskSpace(thresholdPercent: number = 90): HealthCheckFunction {
    return async () => {
      try {
        // Note: In a real implementation, this would use a library like 'diskusage'
        // or call system commands to get disk usage. For this example, we'll simulate it.
        const simulatedUsagePercent = Math.floor(Math.random() * 100);

        if (simulatedUsagePercent >= thresholdPercent) {
          return {
            status: HealthStatus.DEGRADED,
            details: {
              usagePercent: simulatedUsagePercent,
              threshold: thresholdPercent,
              message: `Disk usage (${simulatedUsagePercent}%) exceeds threshold (${thresholdPercent}%)`,
            },
          };
        }

        return {
          status: HealthStatus.HEALTHY,
          details: {
            usagePercent: simulatedUsagePercent,
            threshold: thresholdPercent,
          },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          details: { error: error.message || 'Failed to check disk space' },
        };
      }
    };
  },

  /**
   * Create a memory usage health check
   * @param thresholdPercent Threshold percentage for warning
   * @returns Health check function
   */
  memoryUsage(thresholdPercent: number = 90): HealthCheckFunction {
    return async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const usedHeapSize = memoryUsage.heapUsed;
        const totalHeapSize = memoryUsage.heapTotal;
        const usagePercent = Math.round((usedHeapSize / totalHeapSize) * 100);

        if (usagePercent >= thresholdPercent) {
          return {
            status: HealthStatus.DEGRADED,
            details: {
              usagePercent,
              usedHeapSize: Math.round(usedHeapSize / (1024 * 1024)) + ' MB',
              totalHeapSize: Math.round(totalHeapSize / (1024 * 1024)) + ' MB',
              threshold: thresholdPercent,
              message: `Memory usage (${usagePercent}%) exceeds threshold (${thresholdPercent}%)`,
            },
          };
        }

        return {
          status: HealthStatus.HEALTHY,
          details: {
            usagePercent,
            usedHeapSize: Math.round(usedHeapSize / (1024 * 1024)) + ' MB',
            totalHeapSize: Math.round(totalHeapSize / (1024 * 1024)) + ' MB',
            threshold: thresholdPercent,
          },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          details: { error: error.message || 'Failed to check memory usage' },
        };
      }
    };
  },
};

/**
 * Create a singleton instance of the health monitor
 */
export const createHealthMonitor = (): HealthMonitor => {
  return new DefaultHealthMonitor();
};
```

**File: `src/server/health/health-monitor.test.ts`**

```typescript
import { DefaultHealthMonitor, healthChecks } from './health-monitor';
import {
  HealthStatus,
  ServerEvent,
  ServerStatus,
} from '../models/server-types';
import { ServerManager } from '../models/server-interfaces';

// Mock server manager
const mockServerManager: jest.Mocked<Partial<ServerManager>> = {
  addEventListener: jest.fn().mockReturnValue(() => {}),
  getStatus: jest.fn().mockReturnValue(ServerStatus.RUNNING),
  getStats: jest.fn().mockReturnValue({
    uptime: 60000,
    requestCount: 100,
    errorCount: 5,
    pendingRequests: 2,
    cpuUsage: 0.5,
    memoryUsage: 100,
    timestamp: new Date(),
  }),
};

describe('DefaultHealthMonitor', () => {
  let healthMonitor: DefaultHealthMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    healthMonitor = new DefaultHealthMonitor();
    healthMonitor.setServerManager(mockServerManager as any);
  });

  afterEach(() => {
    // Clean up any intervals
    healthMonitor.startPeriodicChecks(1000);
    const stopPeriodicChecks = healthMonitor.startPeriodicChecks(1000);
    stopPeriodicChecks();
  });

  describe('checkHealth', () => {
    it('should return healthy status when no health checks are registered', async () => {
      const result = await healthMonitor.checkHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.components).toHaveProperty('server');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should register and run health checks', async () => {
      // Register a healthy check
      const healthyCheck = jest.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        details: { message: 'All good' },
      });

      // Register a degraded check
      const degradedCheck = jest.fn().mockResolvedValue({
        status: HealthStatus.DEGRADED,
        details: { message: 'Slow response' },
      });

      // Register an unhealthy check
      const unhealthyCheck = jest.fn().mockResolvedValue({
        status: HealthStatus.UNHEALTHY,
        details: { message: 'Connection failed' },
      });

      healthMonitor.registerHealthCheck('healthy-service', healthyCheck);
      healthMonitor.registerHealthCheck('degraded-service', degradedCheck);
      healthMonitor.registerHealthCheck('unhealthy-service', unhealthyCheck);

      const result = await healthMonitor.checkHealth();

      // Verify all checks were called
      expect(healthyCheck).toHaveBeenCalled();
      expect(degradedCheck).toHaveBeenCalled();
      expect(unhealthyCheck).toHaveBeenCalled();

      // Verify component statuses
      expect(result.components['healthy-service'].status).toBe(
        HealthStatus.HEALTHY
      );
      expect(result.components['degraded-service'].status).toBe(
        HealthStatus.DEGRADED
      );
      expect(result.components['unhealthy-service'].status).toBe(
        HealthStatus.UNHEALTHY
      );

      // Verify overall status (should be unhealthy due to one unhealthy service)
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should handle errors in health checks', async () => {
      // Register a check that throws an error
      const errorCheck = jest.fn().mockRejectedValue(new Error('Check failed'));

      healthMonitor.registerHealthCheck('error-service', errorCheck);

      const result = await healthMonitor.checkHealth();

      // Verify check was called
      expect(errorCheck).toHaveBeenCalled();

      // Verify component status
      expect(result.components['error-service'].status).toBe(
        HealthStatus.UNHEALTHY
      );
      expect(result.components['error-service'].details.error).toBe(
        'Check failed'
      );

      // Verify overall status
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should handle timeouts in health checks', async () => {
      // Register a check that never resolves
      const timeoutCheck = jest
        .fn()
        .mockImplementation(() => new Promise(() => {}));

      healthMonitor.registerHealthCheck('timeout-service', timeoutCheck, 100);

      const result = await healthMonitor.checkHealth();

      // Verify check was called
      expect(timeoutCheck).toHaveBeenCalled();

      // Verify component status
      expect(result.components['timeout-service'].status).toBe(
        HealthStatus.UNHEALTHY
      );
      expect(result.components['timeout-service'].details.error).toContain(
        'timed out'
      );

      // Verify overall status
      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('registerHealthCheck', () => {
    it('should register a health check and return an unregister function', () => {
      const check = jest.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
      });

      const unregister = healthMonitor.registerHealthCheck(
        'test-service',
        check
      );

      // Run a health check to verify it's registered
      const result1 = await healthMonitor.checkHealth();
      expect(result1.components).toHaveProperty('test-service');
      expect(check).toHaveBeenCalled();

      // Unregister the check
      unregister();

      // Reset the mock
      check.mockReset();

      // Run another health check to verify it's unregistered
      const result2 = await healthMonitor.checkHealth();
      expect(result2.components).not.toHaveProperty('test-service');
      expect(check).not.toHaveBeenCalled();
    });
  });

  describe('getLatestHealthResult', () => {
    it('should return null initially', () => {
      expect(healthMonitor.getLatestHealthResult()).toBeNull();
    });

    it('should return the latest health check result', async () => {
      await healthMonitor.checkHealth();

      const result = healthMonitor.getLatestHealthResult();

      expect(result).not.toBeNull();
      expect(result!.status).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('startPeriodicChecks', () => {
    it('should start periodic health checks', async () => {
      // Mock the checkHealth method
      const checkHealthSpy = jest
        .spyOn(healthMonitor, 'checkHealth')
        .mockResolvedValue({
          status: HealthStatus.HEALTHY,
          components: {},
          timestamp: new Date(),
        });

      // Set interval to a small value for testing
      const stopChecks = healthMonitor.startPeriodicChecks(100);

      // Wait for the interval to trigger at least once
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify checkHealth was called
      expect(checkHealthSpy).toHaveBeenCalled();

      // Stop periodic checks
      stopChecks();

      // Reset the spy count
      checkHealthSpy.mockClear();

      // Wait to ensure no more calls
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify checkHealth was not called again
      expect(checkHealthSpy).not.toHaveBeenCalled();
    });
  });
});

describe('healthChecks', () => {
  describe('database', () => {
    it('should return healthy status when database is connected', async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue([{ '1': 1 }]),
      };

      const check = healthChecks.database(mockDb);
      const result = await check();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return unhealthy status when database query fails', async () => {
      const mockDb = {
        query: jest.fn().mockRejectedValue(new Error('Connection lost')),
      };

      const check = healthChecks.database(mockDb);
      const result = await check();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.details.error).toBe('Connection lost');
    });
  });

  describe('memoryUsage', () => {
    it('should return healthy status when memory usage is below threshold', async () => {
      const check = healthChecks.memoryUsage(90);
      const result = await check();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details.threshold).toBe(90);
    });
  });

  describe('externalApi', () => {
    it('should return healthy status when API responds successfully', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const check = healthChecks.externalApi('https://api.example.com');
      const result = await check();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details.statusCode).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return degraded status when API responds with error code', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const check = healthChecks.externalApi('https://api.example.com');
      const result = await check();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.details.statusCode).toBe(500);
    });

    it('should return unhealthy status when API request fails', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const check = healthChecks.externalApi('https://api.example.com');
      const result = await check();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.details.error).toBe('Network error');
    });
  });
});
```

The Health Monitor implementation provides the following features:

1. **Modular Health Checks**: Components can register their own health checks, allowing for a comprehensive view of system health.

2. **Timeout Protection**: Health checks have configurable timeouts to prevent hanging if a dependency is unresponsive.

3. **Status Aggregation**: The overall health status is determined by aggregating the status of all components.

4. **Periodic Checks**: Support for running health checks at regular intervals.

5. **Event Emission**: Health check results are emitted as events, allowing other components to react to health status changes.

6. **Built-in Health Checks**: Common health checks for databases, Redis, external APIs, disk space, and memory usage.

The implementation follows good practices such as:

- **Asynchronous Operation**: All health checks are asynchronous, preventing blocking of the event loop.
- **Error Handling**: Robust error handling ensures that health checks don't crash the application.
- **Configurability**: Each health check is configurable with timeouts and thresholds.
- **Testability**: The implementation is fully testable, with a comprehensive test suite.
- **Clean API**: The API is simple and intuitive, making it easy to register and manage health checks.

In the next step, we'll implement the Middleware Manager and API Router components.

### Step 5: Implement Middleware Manager and API Router

These components are responsible for managing HTTP middleware and routing API requests to the appropriate handlers. They provide centralized management of HTTP functionality while maintaining flexibility and extensibility.

#### Middleware Manager Implementation

The Middleware Manager is responsible for registering, organizing, and applying middleware to the HTTP server.

**File: `src/server/middleware/middleware-manager.ts`**

```typescript
import * as express from 'express';
import { MiddlewareManager } from '../models/server-interfaces';
import {
  MiddlewareDefinition,
  MiddlewareHandler,
} from '../models/server-types';

/**
 * Default implementation of Middleware Manager
 */
export class DefaultMiddlewareManager implements MiddlewareManager {
  private middleware: Map<string, MiddlewareDefinition> = new Map();

  /**
   * Register middleware
   * @param middleware Middleware definition
   * @returns Function to unregister the middleware
   */
  registerMiddleware(middleware: MiddlewareDefinition): () => void {
    // Validate middleware
    if (!middleware.name) {
      throw new Error('Middleware must have a name');
    }

    if (!middleware.handler || typeof middleware.handler !== 'function') {
      throw new Error('Middleware must have a handler function');
    }

    // Register middleware
    this.middleware.set(middleware.name, {
      ...middleware,
      // Ensure priority is a number
      priority: middleware.priority || 0,
      // Middleware is enabled by default
      enabled: middleware.enabled !== false,
    });

    // Return unregister function
    return () => {
      this.middleware.delete(middleware.name);
    };
  }

  /**
   * Get all registered middleware
   * @returns Array of middleware definitions sorted by priority
   */
  getMiddleware(): MiddlewareDefinition[] {
    return Array.from(this.middleware.values()).sort(
      (a, b) => a.priority - b.priority
    );
  }

  /**
   * Enable middleware
   * @param name Middleware name
   * @returns Whether enable was successful
   */
  enableMiddleware(name: string): boolean {
    const middleware = this.middleware.get(name);
    if (!middleware) {
      return false;
    }

    middleware.enabled = true;
    this.middleware.set(name, middleware);
    return true;
  }

  /**
   * Disable middleware
   * @param name Middleware name
   * @returns Whether disable was successful
   */
  disableMiddleware(name: string): boolean {
    const middleware = this.middleware.get(name);
    if (!middleware) {
      return false;
    }

    middleware.enabled = false;
    this.middleware.set(name, middleware);
    return true;
  }

  /**
   * Apply all middleware to the server
   * @param app Express application
   * @returns Whether apply was successful
   */
  applyMiddleware(app: express.Application): boolean {
    try {
      // Get all enabled middleware sorted by priority
      const enabledMiddleware = this.getMiddleware().filter(mw => mw.enabled);

      // Apply each middleware
      for (const middleware of enabledMiddleware) {
        console.log(`Applying middleware: ${middleware.name}`);
        app.use(middleware.handler);
      }

      return true;
    } catch (error) {
      console.error('Error applying middleware:', error);
      return false;
    }
  }
}

/**
 * Create common middleware
 */
export const commonMiddleware = {
  /**
   * Create JSON parsing middleware
   * @param options Options for JSON middleware
   * @returns Middleware definition
   */
  json(options: express.json.Options = {}): MiddlewareDefinition {
    return {
      name: 'json',
      priority: 10,
      enabled: true,
      handler: express.json(options),
    };
  },

  /**
   * Create URL-encoded parsing middleware
   * @param options Options for URL-encoded middleware
   * @returns Middleware definition
   */
  urlencoded(
    options: express.urlencoded.Options = { extended: true }
  ): MiddlewareDefinition {
    return {
      name: 'urlencoded',
      priority: 20,
      enabled: true,
      handler: express.urlencoded(options),
    };
  },

  /**
   * Create CORS middleware
   * @param origins Allowed origins
   * @param methods Allowed methods
   * @param headers Allowed headers
   * @returns Middleware definition
   */
  cors(
    origins: string[] = ['*'],
    methods: string[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers: string[] = ['Content-Type', 'Authorization']
  ): MiddlewareDefinition {
    return {
      name: 'cors',
      priority: 0,
      enabled: true,
      handler: (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        // Set CORS headers
        const origin = req.headers.origin;
        if (origin && (origins.includes('*') || origins.includes(origin))) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        }

        res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.status(204).end();
          return;
        }

        next();
      },
    };
  },

  /**
   * Create request logging middleware
   * @param logFn Log function
   * @returns Middleware definition
   */
  requestLogger(
    logFn: (message: string, ...args: any[]) => void = console.log
  ): MiddlewareDefinition {
    return {
      name: 'requestLogger',
      priority: 5,
      enabled: true,
      handler: (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        const start = Date.now();
        const requestId =
          req.headers['x-request-id'] ||
          Math.random().toString(36).substring(2, 15);

        // Add requestId to request object
        (req as any).requestId = requestId;

        // Log request
        logFn(
          `[${requestId}] ${req.method} ${
            req.url
          } - ${new Date().toISOString()}`
        );

        // Capture original end method
        const originalEnd = res.end;

        // Override end method to log response
        res.end = function (
          chunk?: any,
          encoding?: BufferEncoding,
          callback?: () => void
        ): any {
          // Restore original end method
          res.end = originalEnd;

          // Calculate duration
          const duration = Date.now() - start;

          // Set response time header
          res.setHeader('X-Response-Time', `${duration}ms`);

          // Log response
          logFn(
            `[${requestId}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
          );

          // Call original end method
          return originalEnd.call(this, chunk, encoding, callback);
        };

        next();
      },
    };
  },

  /**
   * Create error handling middleware
   * @param logFn Log function
   * @returns Middleware definition
   */
  errorHandler(
    logFn: (message: string, ...args: any[]) => void = console.error
  ): MiddlewareDefinition {
    return {
      name: 'errorHandler',
      priority: 1000, // Very high priority - should be last
      enabled: true,
      handler: (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        // Log error
        logFn(`Error processing ${req.method} ${req.url}: ${err.message}`, {
          stack: err.stack,
          requestId: (req as any).requestId,
        });

        // Send error response
        res.status(500).json({
          error: 'Internal Server Error',
          message:
            process.env.NODE_ENV === 'production'
              ? 'An unexpected error occurred'
              : err.message,
          requestId: (req as any).requestId,
        });
      },
    } as MiddlewareDefinition;
  },

  /**
   * Create rate limiting middleware
   * @param windowMs Time window in milliseconds
   * @param maxRequests Maximum requests per window
   * @param message Error message
   * @returns Middleware definition
   */
  rateLimit(
    windowMs: number = 60000,
    maxRequests: number = 100,
    message: string = 'Too many requests, please try again later'
  ): MiddlewareDefinition {
    // Simple in-memory store for rate limiting
    const store = new Map<string, { count: number; resetTime: number }>();

    return {
      name: 'rateLimit',
      priority: 30,
      enabled: true,
      handler: (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        // Get or create record for this IP
        let record = store.get(ip);
        if (!record || record.resetTime <= now) {
          record = { count: 0, resetTime: now + windowMs };
        }

        // Increment count
        record.count += 1;
        store.set(ip, record);

        // Set headers
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader(
          'X-RateLimit-Remaining',
          Math.max(0, maxRequests - record.count).toString()
        );
        res.setHeader(
          'X-RateLimit-Reset',
          Math.ceil(record.resetTime / 1000).toString()
        );

        // Check if limit exceeded
        if (record.count > maxRequests) {
          res.status(429).json({ error: 'Too Many Requests', message });
          return;
        }

        next();
      },
    };
  },
};

/**
 * Create a singleton instance of the middleware manager
 */
export const createMiddlewareManager = (): MiddlewareManager => {
  return new DefaultMiddlewareManager();
};
```

#### API Router Implementation

The API Router is responsible for registering and managing API routes and applying them to the HTTP server.

**File: `src/server/router/api-router.ts`**

```typescript
import * as express from 'express';
import { ApiRouter } from '../models/server-interfaces';
import {
  RouteDefinition,
  RouteHandler,
  MiddlewareHandler,
} from '../models/server-types';

/**
 * Default implementation of API Router
 */
export class DefaultApiRouter implements ApiRouter {
  private routes: Map<string, RouteDefinition> = new Map();

  /**
   * Register a route
   * @param route Route definition
   * @returns Function to unregister the route
   */
  registerRoute(route: RouteDefinition): () => void {
    // Validate route
    if (!route.path) {
      throw new Error('Route must have a path');
    }

    if (!route.method) {
      throw new Error('Route must have a method');
    }

    if (!route.handler || typeof route.handler !== 'function') {
      throw new Error('Route must have a handler function');
    }

    // Generate a unique key for the route
    const key = this.getRouteKey(route.method, route.path);

    // Register route
    this.routes.set(key, { ...route });

    // Return unregister function
    return () => {
      this.routes.delete(key);
    };
  }

  /**
   * Register multiple routes
   * @param routes Route definitions
   * @returns Array of functions to unregister each route
   */
  registerRoutes(routes: RouteDefinition[]): (() => void)[] {
    return routes.map(route => this.registerRoute(route));
  }

  /**
   * Get all registered routes
   * @returns Array of route definitions
   */
  getRoutes(): RouteDefinition[] {
    return Array.from(this.routes.values());
  }

  /**
   * Apply all routes to the server
   * @param app Express application
   * @returns Whether apply was successful
   */
  applyRoutes(app: express.Application): boolean {
    try {
      // Get all routes
      const routes = this.getRoutes();

      // Apply each route
      for (const route of routes) {
        console.log(`Registering route: ${route.method} ${route.path}`);

        // Get method function from Express application
        const methodFn = this.getMethodFunction(app, route.method);

        // Apply route
        if (route.middleware && route.middleware.length > 0) {
          methodFn.call(app, route.path, ...route.middleware, route.handler);
        } else {
          methodFn.call(app, route.path, route.handler);
        }
      }

      return true;
    } catch (error) {
      console.error('Error applying routes:', error);
      return false;
    }
  }

  /**
   * Generate a unique key for a route
   * @param method HTTP method
   * @param path Route path
   * @returns Unique key
   */
  private getRouteKey(method: string, path: string): string {
    return `${method.toUpperCase()}:${path}`;
  }

  /**
   * Get the corresponding method function from Express application
   * @param app Express application
   * @param method HTTP method
   * @returns Method function
   */
  private getMethodFunction(
    app: express.Application,
    method: string
  ): Function {
    const methodName = method.toLowerCase();
    if (typeof app[methodName] !== 'function') {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }
    return app[methodName];
  }
}

/**
 * Create common route handlers
 */
export const routeHandlers = {
  /**
   * Create a health check route
   * @param path Route path
   * @param healthCheck Health check function
   * @returns Route definition
   */
  healthCheck(
    path: string = '/health',
    healthCheck: () => Promise<any>
  ): RouteDefinition {
    return {
      path,
      method: 'GET',
      handler: async (req: express.Request, res: express.Response) => {
        try {
          const health = await healthCheck();

          // Set status code based on health status
          const statusCode =
            health.status === 'healthy'
              ? 200
              : health.status === 'degraded'
              ? 200
              : 503;

          res.status(statusCode).json(health);
        } catch (error) {
          res.status(500).json({
            status: 'unhealthy',
            error: error.message || 'Health check failed',
          });
        }
      },
    };
  },

  /**
   * Create a version info route
   * @param path Route path
   * @param getVersionInfo Function to get version info
   * @returns Route definition
   */
  versionInfo(
    path: string = '/version',
    getVersionInfo: () => any
  ): RouteDefinition {
    return {
      path,
      method: 'GET',
      handler: (req: express.Request, res: express.Response) => {
        try {
          const versionInfo = getVersionInfo();
          res.status(200).json(versionInfo);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get version info',
            message: error.message,
          });
        }
      },
    };
  },

  /**
   * Create a metrics route
   * @param path Route path
   * @param getMetrics Function to get metrics
   * @returns Route definition
   */
  metrics(path: string = '/metrics', getMetrics: () => any): RouteDefinition {
    return {
      path,
      method: 'GET',
      handler: async (req: express.Request, res: express.Response) => {
        try {
          const metrics = await getMetrics();
          res.status(200).json(metrics);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get metrics',
            message: error.message,
          });
        }
      },
    };
  },

  /**
   * Create a route that serves static content
   * @param content Content to serve
   * @param contentType Content type
   * @returns Route handler function
   */
  staticContent(
    content: string,
    contentType: string = 'text/plain'
  ): RouteHandler {
    return (req: express.Request, res: express.Response) => {
      res.type(contentType).send(content);
    };
  },
};

/**
 * Create a singleton instance of the API router
 */
export const createApiRouter = (): ApiRouter => {
  return new DefaultApiRouter();
};
```

**File: `src/server/middleware/middleware-manager.test.ts`**

```typescript
import {
  DefaultMiddlewareManager,
  commonMiddleware,
} from './middleware-manager';
import * as express from 'express';

// Mock Express app
const mockApp = {
  use: jest.fn(),
};

describe('DefaultMiddlewareManager', () => {
  let middlewareManager: DefaultMiddlewareManager;

  beforeEach(() => {
    jest.clearAllMocks();
    middlewareManager = new DefaultMiddlewareManager();
  });

  describe('registerMiddleware', () => {
    it('should register middleware successfully', () => {
      const middleware = {
        name: 'test-middleware',
        priority: 10,
        enabled: true,
        handler: jest.fn(),
      };

      const unregister = middlewareManager.registerMiddleware(middleware);

      // Verify middleware is registered
      const registeredMiddleware = middlewareManager.getMiddleware();
      expect(registeredMiddleware).toHaveLength(1);
      expect(registeredMiddleware[0].name).toBe('test-middleware');

      // Unregister middleware
      unregister();

      // Verify middleware is unregistered
      expect(middlewareManager.getMiddleware()).toHaveLength(0);
    });

    it('should throw an error if middleware has no name', () => {
      const middleware = {
        name: '',
        priority: 10,
        enabled: true,
        handler: jest.fn(),
      };

      expect(() => middlewareManager.registerMiddleware(middleware)).toThrow(
        'Middleware must have a name'
      );
    });

    it('should throw an error if middleware has no handler', () => {
      const middleware = {
        name: 'test-middleware',
        priority: 10,
        enabled: true,
        handler: null as any,
      };

      expect(() => middlewareManager.registerMiddleware(middleware)).toThrow(
        'Middleware must have a handler function'
      );
    });
  });

  describe('enableMiddleware and disableMiddleware', () => {
    it('should enable and disable middleware', () => {
      // Register middleware
      middlewareManager.registerMiddleware({
        name: 'test-middleware',
        priority: 10,
        enabled: false,
        handler: jest.fn(),
      });

      // Verify middleware is disabled
      expect(middlewareManager.getMiddleware()[0].enabled).toBe(false);

      // Enable middleware
      const enableResult =
        middlewareManager.enableMiddleware('test-middleware');

      // Verify middleware is enabled
      expect(enableResult).toBe(true);
      expect(middlewareManager.getMiddleware()[0].enabled).toBe(true);

      // Disable middleware
      const disableResult =
        middlewareManager.disableMiddleware('test-middleware');

      // Verify middleware is disabled
      expect(disableResult).toBe(true);
      expect(middlewareManager.getMiddleware()[0].enabled).toBe(false);
    });

    it('should return false when enabling non-existent middleware', () => {
      expect(middlewareManager.enableMiddleware('non-existent')).toBe(false);
    });

    it('should return false when disabling non-existent middleware', () => {
      expect(middlewareManager.disableMiddleware('non-existent')).toBe(false);
    });
  });

  describe('applyMiddleware', () => {
    it('should apply middleware to the server', () => {
      // Register middleware
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      middlewareManager.registerMiddleware({
        name: 'middleware1',
        priority: 10,
        enabled: true,
        handler: handler1,
      });

      middlewareManager.registerMiddleware({
        name: 'middleware2',
        priority: 20,
        enabled: true,
        handler: handler2,
      });

      // Apply middleware
      const result = middlewareManager.applyMiddleware(mockApp as any);

      // Verify result
      expect(result).toBe(true);

      // Verify middleware was applied in correct order
      expect(mockApp.use).toHaveBeenCalledTimes(2);
      expect(mockApp.use).toHaveBeenNthCalledWith(1, handler1);
      expect(mockApp.use).toHaveBeenNthCalledWith(2, handler2);
    });

    it('should only apply enabled middleware', () => {
      // Register middleware
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      middlewareManager.registerMiddleware({
        name: 'middleware1',
        priority: 10,
        enabled: true,
        handler: handler1,
      });

      middlewareManager.registerMiddleware({
        name: 'middleware2',
        priority: 20,
        enabled: false,
        handler: handler2,
      });

      // Apply middleware
      const result = middlewareManager.applyMiddleware(mockApp as any);

      // Verify result
      expect(result).toBe(true);

      // Verify only enabled middleware was applied
      expect(mockApp.use).toHaveBeenCalledTimes(1);
      expect(mockApp.use).toHaveBeenCalledWith(handler1);
    });

    it('should return false if an error occurs during application', () => {
      // Register middleware
      middlewareManager.registerMiddleware({
        name: 'middleware1',
        priority: 10,
        enabled: true,
        handler: jest.fn(),
      });

      // Mock an error during application
      (mockApp.use as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Application error');
      });

      // Apply middleware
      const result = middlewareManager.applyMiddleware(mockApp as any);

      // Verify result
      expect(result).toBe(false);
    });
  });

  describe('commonMiddleware', () => {
    it('should create JSON middleware', () => {
      const middleware = commonMiddleware.json();

      expect(middleware.name).toBe('json');
      expect(middleware.priority).toBe(10);
      expect(middleware.enabled).toBe(true);
      expect(middleware.handler).toBeDefined();
    });

    it('should create URL-encoded middleware', () => {
      const middleware = commonMiddleware.urlencoded();

      expect(middleware.name).toBe('urlencoded');
      expect(middleware.priority).toBe(20);
      expect(middleware.enabled).toBe(true);
      expect(middleware.handler).toBeDefined();
    });

    it('should create CORS middleware', () => {
      const middleware = commonMiddleware.cors();

      expect(middleware.name).toBe('cors');
      expect(middleware.priority).toBe(0);
      expect(middleware.enabled).toBe(true);
      expect(middleware.handler).toBeDefined();
    });

    it('should create request logger middleware', () => {
      const logFn = jest.fn();
      const middleware = commonMiddleware.requestLogger(logFn);

      expect(middleware.name).toBe('requestLogger');
      expect(middleware.priority).toBe(5);
      expect(middleware.enabled).toBe(true);
      expect(middleware.handler).toBeDefined();
    });
  });
});
```

**File: `src/server/router/api-router.test.ts`**

```typescript
import { DefaultApiRouter, routeHandlers } from './api-router';
import * as express from 'express';
import { RouteDefinition } from '../models/server-types';

// Mock Express app
const mockApp = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  options: jest.fn(),
};

describe('DefaultApiRouter', () => {
  let apiRouter: DefaultApiRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    apiRouter = new DefaultApiRouter();
  });

  describe('registerRoute', () => {
    it('should register a route successfully', () => {
      const route: RouteDefinition = {
        path: '/test',
        method: 'GET',
        handler: jest.fn(),
      };

      const unregister = apiRouter.registerRoute(route);

      // Verify route is registered
      const routes = apiRouter.getRoutes();
      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe('/test');

      // Unregister route
      unregister();

      // Verify route is unregistered
      expect(apiRouter.getRoutes()).toHaveLength(0);
    });

    it('should throw an error if route has no path', () => {
      const route: RouteDefinition = {
        path: '',
        method: 'GET',
        handler: jest.fn(),
      };

      expect(() => apiRouter.registerRoute(route)).toThrow(
        'Route must have a path'
      );
    });

    it('should throw an error if route has no method', () => {
      const route: RouteDefinition = {
        path: '/test',
        method: '' as any,
        handler: jest.fn(),
      };

      expect(() => apiRouter.registerRoute(route)).toThrow(
        'Route must have a method'
      );
    });

    it('should throw an error if route has no handler', () => {
      const route: RouteDefinition = {
        path: '/test',
        method: 'GET',
        handler: null as any,
      };

      expect(() => apiRouter.registerRoute(route)).toThrow(
        'Route must have a handler function'
      );
    });
  });

  describe('registerRoutes', () => {
    it('should register multiple routes', () => {
      const routes: RouteDefinition[] = [
        {
          path: '/test1',
          method: 'GET',
          handler: jest.fn(),
        },
        {
          path: '/test2',
          method: 'POST',
          handler: jest.fn(),
        },
      ];

      const unregisterFunctions = apiRouter.registerRoutes(routes);

      // Verify routes are registered
      expect(apiRouter.getRoutes()).toHaveLength(2);

      // Unregister routes
      unregisterFunctions.forEach(unregister => unregister());

      // Verify routes are unregistered
      expect(apiRouter.getRoutes()).toHaveLength(0);
    });
  });

  describe('applyRoutes', () => {
    it('should apply routes to the server', () => {
      // Register routes
      const getHandler = jest.fn();
      const postHandler = jest.fn();

      apiRouter.registerRoute({
        path: '/test1',
        method: 'GET',
        handler: getHandler,
      });

      apiRouter.registerRoute({
        path: '/test2',
        method: 'POST',
        handler: postHandler,
      });

      // Apply routes
      const result = apiRouter.applyRoutes(mockApp as any);

      // Verify result
      expect(result).toBe(true);

      // Verify routes were applied
      expect(mockApp.get).toHaveBeenCalledTimes(1);
      expect(mockApp.get).toHaveBeenCalledWith('/test1', getHandler);

      expect(mockApp.post).toHaveBeenCalledTimes(1);
      expect(mockApp.post).toHaveBeenCalledWith('/test2', postHandler);
    });

    it('should apply routes with middleware', () => {
      // Create middleware
      const middleware1 = jest.fn();
      const middleware2 = jest.fn();

      // Register route with middleware
      const handler = jest.fn();

      apiRouter.registerRoute({
        path: '/test',
        method: 'GET',
        middleware: [middleware1, middleware2],
        handler,
      });

      // Apply routes
      apiRouter.applyRoutes(mockApp as any);

      // Verify route was applied with middleware
      expect(mockApp.get).toHaveBeenCalledTimes(1);
      expect(mockApp.get).toHaveBeenCalledWith(
        '/test',
        middleware1,
        middleware2,
        handler
      );
    });

    it('should return false if an error occurs during application', () => {
      // Register route
      apiRouter.registerRoute({
        path: '/test',
        method: 'GET',
        handler: jest.fn(),
      });

      // Mock an error during application
      (mockApp.get as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Application error');
      });

      // Apply routes
      const result = apiRouter.applyRoutes(mockApp as any);

      // Verify result
      expect(result).toBe(false);
    });
  });

  describe('routeHandlers', () => {
    it('should create a health check route', () => {
      const healthCheckFn = jest.fn().mockResolvedValue({ status: 'healthy' });
      const route = routeHandlers.healthCheck('/health', healthCheckFn);

      expect(route.path).toBe('/health');
      expect(route.method).toBe('GET');
      expect(route.handler).toBeDefined();
    });

    it('should create a version info route', () => {
      const getVersionInfo = jest.fn().mockReturnValue({ version: '1.0.0' });
      const route = routeHandlers.versionInfo('/version', getVersionInfo);

      expect(route.path).toBe('/version');
      expect(route.method).toBe('GET');
      expect(route.handler).toBeDefined();
    });

    it('should create a metrics route', () => {
      const getMetrics = jest.fn().mockResolvedValue({ requests: 100 });
      const route = routeHandlers.metrics('/metrics', getMetrics);

      expect(route.path).toBe('/metrics');
      expect(route.method).toBe('GET');
      expect(route.handler).toBeDefined();
    });

    it('should create a static content handler', () => {
      const handler = routeHandlers.staticContent(
        'Hello, world!',
        'text/plain'
      );

      expect(handler).toBeDefined();
    });
  });
});
```

These components provide the following features:

1. **Middleware Management**: The Middleware Manager provides a centralized system for registering, enabling, disabling, and applying HTTP middleware.

2. **Common Middleware**: A set of common middleware functions is provided out of the box, including JSON parsing, URL-encoded parsing, CORS handling, request logging, error handling, and rate limiting.

3. **Route Management**: The API Router provides a standardized way to register and manage HTTP routes.

4. **Route Handlers**: Common route handlers for health checks, version information, metrics, and static content are provided.

5. **Flexible Configuration**: Both components support flexible configuration options to adapt to different requirements.

The implementation follows good practices such as:

- **Separation of Concerns**: Clear separation between middleware management and route management.
- **Prioritization**: Middleware can be ordered based on priority.
- **Route Organization**: Routes are organized by HTTP method and path.
- **Error Handling**: Robust error handling ensures that errors in one component don't bring down the entire system.
- **Testability**: The components are designed to be easily testable.

In the next step, we'll implement the Request Handler component and the Domain Command/Events to handle requests and communicate with other domains.
