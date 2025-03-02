import { MCPTool } from '../types';
import { ChatMessage, ToolCall } from '../types';

/**
 * Provider-specific configuration options
 */
export interface ProviderConfig {
  /**
   * API key for the provider
   */
  apiKey: string;

  /**
   * Default model to use for this provider
   */
  defaultModel: string;

  /**
   * Provider-specific options
   */
  options?: Record<string, unknown>;
}

/**
 * Message options for sending messages to the provider
 */
export interface MessageOptions {
  /**
   * Model to use for this message
   */
  model: string;

  /**
   * Maximum number of tokens to generate
   */
  maxTokens?: number;

  /**
   * System message/instructions
   */
  systemMessage?: string;

  /**
   * Temperature for generation (0-1)
   */
  temperature?: number;

  /**
   * Tools/functions to make available
   */
  tools?: MCPTool[];

  /**
   * Whether to enable streaming
   */
  stream?: boolean;

  /**
   * Provider-specific options
   */
  providerOptions?: Record<string, unknown>;
}

/**
 * Chunk of a streaming response
 */
export interface LLMResponseChunk {
  type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'thinking' | 'done';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

/**
 * Complete response from an LLM
 */
export interface LLMResponse {
  /**
   * The generated text content
   */
  content: string;

  /**
   * Tool call if the model wants to use a tool
   */
  toolCall?: ToolCall;

  /**
   * Usage information from the provider
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Raw response from the provider
   */
  rawResponse?: unknown;
}

/**
 * Model capability information
 */
export interface ModelCapability {
  /**
   * Model identifier
   */
  id: string;

  /**
   * Context window size in tokens
   */
  contextWindow: number;

  /**
   * Whether the model supports function/tool calling
   */
  supportsFunctions: boolean;

  /**
   * Whether the model supports image inputs
   */
  supportsImages: boolean;

  /**
   * Cost per 1K input tokens in USD
   */
  inputCostPer1K: number;

  /**
   * Cost per 1K output tokens in USD
   */
  outputCostPer1K: number;
}

/**
 * Feature set supported by a specific model
 */
export interface FeatureSet {
  /**
   * Whether the model supports function/tool calling
   */
  functionCalling: boolean;

  /**
   * Whether the model supports image inputs
   */
  imageInputs: boolean;

  /**
   * Whether the model supports streaming responses
   */
  streaming: boolean;

  /**
   * Whether the model supports JSON mode for structured outputs
   */
  jsonMode: boolean;

  /**
   * Whether the model supports thinking process
   */
  thinking: boolean;

  /**
   * Whether the model supports system messages
   */
  systemMessages: boolean;

  /**
   * Maximum context size in tokens
   */
  maxContextSize: number;
}

/**
 * Core interface that all LLM providers must implement
 */
export interface LLMProviderInterface {
  /**
   * Provider name (e.g., "anthropic", "openai")
   */
  name: string;

  /**
   * List of supported models and their capabilities
   */
  supportedModels: ModelCapability[];

  /**
   * Initialize the provider with configuration
   * @param config Provider configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Send a message to the LLM and get a complete response
   * @param message The message to send
   * @param options Message options
   */
  sendMessage(message: string, options: MessageOptions): Promise<LLMResponse>;

  /**
   * Stream a message to the LLM and get chunks of the response
   * @param message The message to send
   * @param options Message options
   */
  streamMessage(
    message: string,
    options: MessageOptions
  ): AsyncGenerator<LLMResponseChunk>;

  /**
   * Count tokens in a piece of text
   * @param text The text to count tokens for
   * @param model Optional model to use for counting
   */
  countTokens(text: string, model?: string): number;

  /**
   * Format tools in provider-specific format
   * @param tools MCP tools to format
   */
  formatToolsForProvider(tools: MCPTool[]): unknown;

  /**
   * Parse a tool call from provider response
   * @param response LLM response to parse
   */
  parseToolCall(response: LLMResponse): ToolCall | null;
}
