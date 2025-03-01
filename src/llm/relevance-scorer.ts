/**
 * Message relevance scoring utilities for intelligent context optimization.
 * This module helps determine which messages in a conversation are most important
 * to keep when context window optimization is needed.
 */
import { ChatMessage, ChatSession, MessageRelevance } from './types';

/**
 * Weights for different relevance factors, applied when scoring messages.
 * These can be adjusted to prioritize different aspects.
 */
const RELEVANCE_WEIGHTS = {
  // Recency has very high weight - newer messages are important
  recency: 40,
  // Message content significance (questions, key information)
  significance: 30,
  // References to other messages or information
  reference: 15,
  // Tool usage or results
  toolUse: 15,
};

/**
 * Calculates a relevance score for a single message based on various factors.
 *
 * @param message - The message to evaluate
 * @param messageIndex - Index of message in the conversation
 * @returns A relevance score object with total score and factor breakdown
 */
export function calculateMessageRelevance(
  message: ChatMessage,
  messageIndex: number
): MessageRelevance {
  // Calculate individual factors
  const recencyScore = calculateRecencyScore(message);
  const significanceScore = calculateSignificanceScore(message);
  const referenceScore = calculateReferenceScore(message);
  const toolUseScore = calculateToolUseScore(message);

  // Calculate weighted score
  const weightedScore =
    recencyScore * RELEVANCE_WEIGHTS.recency +
    significanceScore * RELEVANCE_WEIGHTS.significance +
    referenceScore * RELEVANCE_WEIGHTS.reference +
    toolUseScore * RELEVANCE_WEIGHTS.toolUse;

  // Normalize to 0-100 scale
  const normalizedScore = Math.min(Math.round(weightedScore), 100);

  return {
    messageIndex,
    score: normalizedScore,
    factors: {
      recency: recencyScore,
      significance: significanceScore,
      reference: referenceScore,
      toolUse: toolUseScore,
    },
  };
}

/**
 * Calculates recency score based on message timestamp.
 * More recent messages get higher scores.
 */
function calculateRecencyScore(message: ChatMessage): number {
  // If no timestamp, default to a middle value
  if (!message.timestamp) {
    return 0.5;
  }

  // Calculate age in milliseconds, with a 10-minute window providing a good gradient
  const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
  const ageMs = Date.now() - message.timestamp.getTime();

  // Normalize: 1.0 for current, scaling down to 0.2 for messages older than MAX_AGE_MS
  const normalized = Math.max(0.2, 1.0 - ageMs / MAX_AGE_MS);

  // System messages maintain an elevated recency score regardless of age
  if (message.role === 'system') {
    return Math.max(normalized, 0.7);
  }

  return normalized;
}

/**
 * Calculates significance score based on message content.
 * Higher scores for questions, important statements, etc.
 */
function calculateSignificanceScore(message: ChatMessage): number {
  const content = message.content.toLowerCase();
  let score = 0.5; // Default score

  // System messages are highly significant
  if (message.role === 'system') {
    score += 0.4;
  }

  // Questions are typically more significant
  if (
    content.includes('?') ||
    content.includes('what') ||
    content.includes('how') ||
    content.includes('why') ||
    content.includes('when') ||
    content.includes('where')
  ) {
    score += 0.3;
  }

  // Look for imperative statements/commands
  if (content.match(/^(find|get|show|tell|explain|list|analyze|calculate)/i)) {
    score += 0.2;
  }

  // Complex message (typically more important)
  if (message.tokens && message.tokens > 50) {
    score += 0.1;
  }

  // Cap at 1.0
  return Math.min(score, 1.0);
}

/**
 * Calculates reference score based on potential references to other messages.
 * Higher scores for messages that refer to or build on previous context.
 */
function calculateReferenceScore(message: ChatMessage): number {
  const content = message.content.toLowerCase();
  let score = 0.3; // Base score

  // Check for words that suggest referring to previous content
  if (
    content.includes('you mentioned') ||
    content.includes('as i said') ||
    content.includes('earlier') ||
    content.includes('previous') ||
    content.includes('above')
  ) {
    score += 0.3;
  }

  // Check for quotes which might indicate references
  if (content.includes('"') || content.includes("'")) {
    score += 0.2;
  }

  // Check for phrases that indicate building on previous context
  if (
    content.includes('additionally') ||
    content.includes('furthermore') ||
    content.includes('moreover') ||
    content.includes('also')
  ) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Calculates tool usage score.
 * Higher scores for messages with tool calls or tool results.
 */
function calculateToolUseScore(message: ChatMessage): number {
  let score = 0.2; // Base score

  // Significant boost for tool calls
  if (message.hasToolCall) {
    score += 0.5;
  }

  // Even higher score for tool results (often contain key information)
  if (message.isToolResult) {
    score += 0.7;
  }

  return Math.min(score, 1.0);
}

/**
 * Calculates relevance scores for all messages in a session.
 *
 * @param session The chat session to score
 * @returns Array of relevance scores for each message
 */
export function calculateSessionRelevanceScores(
  session: ChatSession
): MessageRelevance[] {
  return session.messages.map((message, index) => {
    return calculateMessageRelevance(message, index);
  });
}

/**
 * Returns the indices of the most relevant messages based on relevance scores.
 * Useful for selective pruning or summarization.
 *
 * @param relevanceScores Array of message relevance scores
 * @param count Number of top messages to return
 * @returns Array of message indices in order of relevance
 */
export function getTopRelevantMessageIndices(
  relevanceScores: MessageRelevance[],
  count: number
): number[] {
  // Sort messages by relevance score (descending)
  const sortedIndices = [...relevanceScores]
    .sort((a, b) => b.score - a.score)
    .map(r => r.messageIndex)
    .slice(0, count);

  // Return indices in original conversation order (not by score)
  return sortedIndices.sort((a, b) => a - b);
}
