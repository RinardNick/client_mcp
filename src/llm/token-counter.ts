/**
 * Token counter and model capability utilities.
 * This implementation provides token counting and model detection features.
 */
import { ChatMessage } from './types';

/**
 * Simplified token count estimator.
 * This uses a character-based approximation (4 chars ≈ 1 token).
 * In a production environment, this should be replaced with a more 
 * accurate tokenizer like tiktoken.
 */
export function estimateTokenCount(text: string): number {
  // Average English text tends to have ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Calculate token counts for a list of messages
 */
export function calculateMessageTokens(messages: ChatMessage[]): {
  userTokens: number;
  assistantTokens: number;
  systemTokens: number;
  totalTokens: number;
} {
  let userTokens = 0;
  let assistantTokens = 0;
  let systemTokens = 0;

  for (const message of messages) {
    const tokens = estimateTokenCount(message.content);

    switch (message.role) {
      case 'user':
        userTokens += tokens;
        break;
      case 'assistant':
        assistantTokens += tokens;
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
    totalTokens: userTokens + assistantTokens + systemTokens,
  };
}

/**
 * Get approximate context limit for a model
 */
export function getContextLimit(model: string): number {
  if (model.includes('claude-3-opus')) {
    return 200000;
  } else if (model.includes('claude-3-sonnet') || model.includes('claude-3-5-sonnet')) {
    return 200000;
  } else if (model.includes('claude-3-haiku')) {
    return 200000;
  } else if (model.includes('claude-3-7')) {
    return 200000;
  }
  
  // Default for unknown models
  return 100000;
}

/**
 * Determine if a model supports the thinking parameter
 */
export function supportsThinking(model: string): boolean {
  // Parse model version from string (e.g., claude-3-7-sonnet-20250219 → 3.7)
  const modelMatch = model.match(/claude-(\d+)[-.](\d+)/i);
  if (!modelMatch) return false;
  
  const majorVersion = parseInt(modelMatch[1], 10);
  const minorVersion = parseInt(modelMatch[2], 10);
  
  // Claude 3.7 or higher supports thinking
  return (majorVersion > 3) || (majorVersion === 3 && minorVersion >= 7);
}

/**
 * Get default thinking budget for a model
 */
export function getDefaultThinkingBudget(model: string): number {
  // Default to 1/3 of context window
  return Math.floor(getContextLimit(model) / 3);
}