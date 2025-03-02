import { LLMConfig } from '../config/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Simple type definitions matching the SDK's structure
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  name: string;
  type?: string;
  description?: string;
  uri?: string;
  mimeType?: string;
}

/**
 * Token metrics for tracking token usage in a session
 */
export interface TokenMetrics {
  userTokens: number;
  assistantTokens: number;
  systemTokens: number;
  toolTokens: number;
  totalTokens: number;
  maxContextTokens: number;
  percentUsed: number;
  recommendation?: string;
}

/**
 * Token cost estimates for tracking expenses
 */
export interface TokenCost {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

/**
 * Interface representing a summary of a group of messages in a conversation
 */
export interface ConversationSummary {
  /** IDs of messages that were summarized */
  originalMessages: string[];
  /** The summarized content */
  summaryText: string;
  /** Total tokens in the original messages */
  originalTokens: number;
  /** Tokens in the summary */
  summaryTokens: number;
  /** Compression ratio (original tokens / summary tokens) */
  compressionRatio: number;
  /** When this summary was created */
  timestamp: Date;
}

/**
 * Interface for the result of summarizing a conversation
 */
export interface SummarizationResult {
  /** Array of summaries created */
  summaries: ConversationSummary[];
  /** Total number of messages that were processed */
  messagesProcessed: number;
  /** Total number of tokens saved through summarization */
  tokensSaved: number;
}

/**
 * Interface for tracking summarization metrics of a session
 */
export interface SummarizationMetrics {
  /** Total number of summaries created */
  totalSummaries: number;
  /** Total tokens saved through summarization */
  totalTokensSaved: number;
  /** Average compression ratio across all summaries */
  averageCompressionRatio: number;
  /** Last time summarization was performed */
  lastSummarizedAt?: Date;
}

/**
 * Context optimization settings
 */
export interface ContextSettings {
  maxTokenLimit?: number; // Override model's default
  autoTruncate: boolean;
  preserveSystemMessages: boolean;
  preserveRecentMessages: number; // Number of recent messages to always keep
  truncationStrategy: TruncationStrategy;
  /* Message batch size for summarization */
  summarizationBatchSize?: number;
  /* Minimum compression ratio to keep summaries */
  minCompressionRatio?: number;

  /* Dynamic summarization settings */
  dynamicSummarizationEnabled?: boolean; // Enable dynamic summarization triggering
  tokenThresholdForSummarization?: number; // Percentage threshold to trigger summarization (0-100)
  timeBetweenSummarizations?: number; // Minutes between summarizations
  detectTopicChanges?: boolean; // Whether to detect topic changes for summarization
  adaptiveSummarizationAggressiveness?: boolean; // Adjust summarization aggressiveness based on context pressure

  /* Adaptive strategy settings */
  adaptiveStrategyEnabled?: boolean; // Enable dynamic strategy selection
  strategySelectionThreshold?: number; // Minimum performance data needed before relying on past performance
}

/**
 * Message relevance scoring for context optimization
 * Used to determine which messages are most important to keep
 */
export interface MessageRelevance {
  messageIndex: number; // Index of message in the session
  score: number; // 0-100 relevance score
  factors: {
    recency: number; // Score based on how recent the message is
    significance: number; // Score based on content significance (questions, key facts)
    reference: number; // Score based on being referenced by other messages
    toolUse: number; // Score boost for tool usage or results
  };
}

/**
 * Chat session interface
 */
export interface ChatSession {
  id: string;
  config: LLMConfig;
  createdAt: Date;
  lastActivityAt: Date;
  messages: ChatMessage[];
  serverClients: Map<string, Client>;
  toolCallCount: number;
  maxToolCalls: number;
  tools: MCPTool[];
  resources: MCPResource[];
  // Enhanced token tracking fields
  tokenMetrics?: TokenMetrics;
  tokenCost?: TokenCost;
  contextSettings?: ContextSettings;
  isContextWindowCritical?: boolean;
  // Summarization tracking
  lastSummarizedAt?: Date; // When the conversation was last summarized
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  hasToolCall?: boolean;
  toolCall?: ToolCall;
  isToolResult?: boolean;
  toolId?: string; // Add toolId for tool result tracking
  name?: string;
  tokens?: number; // Track tokens per message
  timestamp?: Date; // When message was created
  id?: string;

  // Summarization-related properties
  isSummary?: boolean; // Whether this message is a summary
  summarizedMessages?: string[]; // IDs of messages this summary replaces
  compressionRatio?: number; // For summary messages, the compression ratio achieved
  tokensSaved?: number; // Tokens saved by this summary
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Token threshold alert
 */
export interface TokenAlert {
  sessionId: string;
  threshold: number;
  currentUsage: number;
  timestamp: Date;
  recommendation: string;
}

/**
 * Represents a group of related messages in a conversation
 */
export interface MessageCluster {
  /** Topic or theme of the cluster */
  topic: string;
  /** Messages that belong to this cluster */
  messages: ChatMessage[];
  /** Importance score of this cluster (higher = more important) */
  importance: number;
  /** Unique identifier for the cluster */
  id?: string;
  /** Total tokens used by all messages in this cluster */
  totalTokens?: number;
}

/**
 * Available strategies for truncating conversation context
 */
export type TruncationStrategy =
  | 'oldest-first'
  | 'relevance'
  | 'summarize'
  | 'cluster';
