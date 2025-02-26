/**
 * Token counter and model capability utilities.
 * Provides accurate token counting and model detection features.
 */
import { ChatMessage } from './types';
import { encoding_for_model, get_encoding } from 'tiktoken';

// Model token limits and capabilities
interface ModelCapability {
  contextLimit: number;
  supportsThinking: boolean;
  inputCostPer1K: number;
  outputCostPer1K: number;
}

// Model capabilities by name
const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  'claude-3-opus': {
    contextLimit: 200000,
    supportsThinking: false,
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075
  },
  'claude-3-5-sonnet': {
    contextLimit: 200000,
    supportsThinking: false,
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015
  },
  'claude-3-haiku': {
    contextLimit: 200000,
    supportsThinking: false,
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.00125
  },
  'claude-3-7-sonnet': {
    contextLimit: 200000,
    supportsThinking: true,
    inputCostPer1K: 0.005,
    outputCostPer1K: 0.025
  },
  'claude-3-7-opus': {
    contextLimit: 200000,
    supportsThinking: true,
    inputCostPer1K: 0.02,
    outputCostPer1K: 0.1
  }
};

/**
 * Get the model family from a specific model version
 * E.g., "claude-3-5-sonnet-20241022" -> "claude-3-5-sonnet"
 */
export function getModelFamily(modelName: string): string {
  // Match pattern like "claude-3-5-sonnet" or "claude-3-7-opus"
  const baseMatch = modelName.match(/claude-\d+-\d+-(opus|sonnet|haiku)/i);
  
  if (baseMatch) {
    return baseMatch[0].toLowerCase();
  }
  
  // Try matching just "claude-3-opus" or similar
  const legacyMatch = modelName.match(/claude-\d+-(opus|sonnet|haiku)/i);
  if (legacyMatch) {
    return legacyMatch[0].toLowerCase();
  }
  
  // Return original if no match found
  return modelName.toLowerCase();
}

/**
 * Get model capabilities for a specific model
 */
export function getModelCapabilities(modelName: string): ModelCapability {
  const modelFamily = getModelFamily(modelName);
  
  // Return capabilities for the model family if found
  if (MODEL_CAPABILITIES[modelFamily]) {
    return MODEL_CAPABILITIES[modelFamily];
  }
  
  // Default values for unknown models
  return {
    contextLimit: 100000,
    supportsThinking: false,
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03
  };
}

/**
 * Calculate token count using tiktoken for Claude models
 * Falls back to GPT-4 encoding for Claude models since they're similar
 */
export function countTokens(text: string, modelName: string = 'claude'): number {
  try {
    // For Claude models, use cl100k_base encoding (similar to GPT-4)
    const enc = get_encoding('cl100k_base');
    const tokens = enc.encode(text);
    enc.free(); // Free resources
    return tokens.length;
  } catch (error) {
    // Fallback to character-based approximation if tiktoken fails
    console.warn('Tiktoken failed, falling back to character approximation:', error);
    return estimateTokenCount(text);
  }
}

/**
 * Simplified token count estimator as fallback.
 * Uses a character-based approximation (4 chars ≈ 1 token).
 */
export function estimateTokenCount(text: string): number {
  // Average English text tends to have ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Calculate token counts for messages with role-based tracking
 */
export function calculateMessageTokens(messages: ChatMessage[], modelName: string = 'claude'): {
  userTokens: number;
  assistantTokens: number;
  systemTokens: number;
  toolTokens: number;
  totalTokens: number;
} {
  let userTokens = 0;
  let assistantTokens = 0;
  let systemTokens = 0;
  let toolTokens = 0;

  // We add a small overhead for each message (format tax)
  const MESSAGE_OVERHEAD = 4;

  for (const message of messages) {
    const tokens = countTokens(message.content, modelName) + MESSAGE_OVERHEAD;

    switch (message.role) {
      case 'user':
        userTokens += tokens;
        break;
      case 'assistant':
        if (message.isToolResult) {
          toolTokens += tokens;
        } else {
          assistantTokens += tokens;
        }
        break;
      case 'system':
        systemTokens += tokens;
        break;
    }
  }

  return {
    userTokens,
    assistantTokens,
    systemTokens,
    toolTokens,
    totalTokens: userTokens + assistantTokens + systemTokens + toolTokens,
  };
}

/**
 * Calculate cost estimate for token usage
 */
export function calculateTokenCost(
  tokenUsage: {
    userTokens: number;
    assistantTokens: number;
    systemTokens: number;
    toolTokens: number;
  },
  modelName: string
): {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
} {
  const { inputCostPer1K, outputCostPer1K } = getModelCapabilities(modelName);
  
  // User and system messages are input costs
  const inputTokens = tokenUsage.userTokens + tokenUsage.systemTokens + tokenUsage.toolTokens;
  // Assistant messages are output costs
  const outputTokens = tokenUsage.assistantTokens;
  
  const inputCost = (inputTokens / 1000) * inputCostPer1K;
  const outputCost = (outputTokens / 1000) * outputCostPer1K;
  
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD'
  };
}

/**
 * Get context limit for a model
 */
export function getContextLimit(modelName: string): number {
  return getModelCapabilities(modelName).contextLimit;
}

/**
 * Determine if a model supports the thinking parameter
 */
export function supportsThinking(modelName: string): boolean {
  return getModelCapabilities(modelName).supportsThinking;
}

/**
 * Get default thinking budget for a model
 */
export function getDefaultThinkingBudget(modelName: string): number {
  // Default to 1/3 of context window
  return Math.floor(getContextLimit(modelName) / 3);
}

/**
 * Calculate percentage of context window used
 */
export function calculateContextUsage(totalTokens: number, modelName: string): number {
  const contextLimit = getContextLimit(modelName);
  return Math.round((totalTokens / contextLimit) * 100);
}

/**
 * Determine if context window is approaching limits
 */
export function isContextWindowCritical(totalTokens: number, modelName: string): boolean {
  const percentUsed = calculateContextUsage(totalTokens, modelName);
  return percentUsed > 85; // Critical threshold at 85%
}

/**
 * Get a recommendation based on context usage
 */
export function getContextRecommendation(totalTokens: number, modelName: string): string {
  const percentUsed = calculateContextUsage(totalTokens, modelName);
  
  if (percentUsed > 90) {
    return 'Context window is nearly full. Consider summarizing or clearing the conversation.';
  } else if (percentUsed > 75) {
    return 'Context window is filling up. Consider using more concise messages.';
  } else if (percentUsed > 50) {
    return 'Context window usage is moderate.';
  } else {
    return 'Context window usage is low.';
  }
}