import { ChatMessage, ContextSettings, MessageRelevance } from '../types';
import {
  calculateMessageRelevance,
  calculateSessionRelevanceScores,
  getTopRelevantMessageIndices,
} from './relevance-scorer';

/**
 * Prunes messages based on relevance scores to optimize token usage.
 * This implementation preserves:
 * 1. System messages (if specified in settings)
 * 2. Most recent N messages (if specified in settings)
 * 3. Messages with highest relevance scores
 * 4. Conversation coherence through Q&A pairs
 *
 * @param messages Array of messages to prune
 * @param settings Context settings that control pruning behavior
 * @param targetTokens Target token count to achieve after pruning
 * @returns Array of pruned messages
 */
export function pruneMessagesByRelevance(
  messages: ChatMessage[],
  settings: ContextSettings,
  targetTokens: number
): ChatMessage[] {
  // If no messages or target tokens is greater than current total, return all messages
  const totalTokens = messages.reduce(
    (sum: number, msg: ChatMessage) => sum + (msg.tokens || 0),
    0
  );
  if (messages.length === 0 || totalTokens <= targetTokens) {
    return [...messages];
  }

  // Extract system messages if they should be preserved
  const systemMessages: ChatMessage[] = settings.preserveSystemMessages
    ? messages.filter(msg => msg.role === 'system')
    : [];

  // Get non-system messages for relevance scoring
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

  // Keep recent messages if specified
  const recentMessageCount = settings.preserveRecentMessages || 2;
  const recentMessages: ChatMessage[] = nonSystemMessages.slice(
    -recentMessageCount
  );

  // Get candidate messages for relevance-based pruning
  // (excluding both system messages and the latest messages we want to preserve)
  let candidateMessages = nonSystemMessages.slice(0, -recentMessageCount);

  // If no candidates left after preserving recent messages, return system + recent
  if (candidateMessages.length === 0) {
    return [...systemMessages, ...recentMessages];
  }

  // Calculate relevance scores for all candidate messages
  const relevanceScores: MessageRelevance[] = candidateMessages.map(
    (msg, index) => calculateMessageRelevance(msg, index)
  );

  // Maintain conversation coherence by ensuring Q&A pairs stay together
  const preservedPairs = maintainConversationCoherence(
    candidateMessages,
    relevanceScores
  );

  // Calculate tokens from messages we're definitely keeping
  const fixedTokens = [...systemMessages, ...recentMessages].reduce(
    (sum: number, msg: ChatMessage) => sum + (msg.tokens || 0),
    0
  );

  // Calculate remaining token budget
  const remainingTokens = targetTokens - fixedTokens;

  // Select the most relevant messages to fill the remaining token budget
  const selectedMessages = selectMessagesByTokenBudget(
    candidateMessages,
    relevanceScores,
    remainingTokens,
    preservedPairs
  );

  // Reconstruct the message list: system messages + selected by relevance + recent
  const result = [...systemMessages, ...selectedMessages, ...recentMessages];

  // Sort by original order (message index)
  return sortMessagesByOriginalOrder(result, messages);
}

/**
 * Identifies conversation pairs (Q&A) that should be preserved together
 * to maintain coherence in the conversation
 *
 * @param messages Array of messages to analyze
 * @param relevanceScores Relevance scores for messages
 * @returns Set of message indices that should be preserved as pairs
 */
function maintainConversationCoherence(
  messages: ChatMessage[],
  relevanceScores: MessageRelevance[]
): Set<number> {
  const preservedIndices = new Set<number>();
  const highRelevanceThreshold = 0.6; // Messages above this threshold trigger pair preservation

  // Find messages with high relevance scores (likely important questions or statements)
  const highRelevanceIndices = relevanceScores
    .filter(r => r.score > highRelevanceThreshold)
    .map(r => r.messageIndex);

  // For each high relevance message, if it's a user message, preserve the assistant's response
  // If it's an assistant message with a question, preserve the user's response
  for (const index of highRelevanceIndices) {
    preservedIndices.add(index);

    // If this is a user message, preserve the next message (assistant's response)
    if (index < messages.length - 1 && messages[index].role === 'user') {
      preservedIndices.add(index + 1);
    }

    // If this is an assistant message, preserve the next message (user's follow-up)
    if (index < messages.length - 1 && messages[index].role === 'assistant') {
      preservedIndices.add(index + 1);
    }

    // If this is a response to a previous message, preserve that message too
    if (index > 0) {
      preservedIndices.add(index - 1);
    }
  }

  return preservedIndices;
}

/**
 * Selects messages based on relevance scores up to a token budget
 *
 * @param messages Candidate messages for selection
 * @param relevanceScores Relevance scores for messages
 * @param tokenBudget Maximum tokens to use
 * @param preservedPairs Set of message indices that should be preserved together
 * @returns Selected messages within token budget
 */
function selectMessagesByTokenBudget(
  messages: ChatMessage[],
  relevanceScores: MessageRelevance[],
  tokenBudget: number,
  preservedPairs: Set<number>
): ChatMessage[] {
  // First, include all messages that are part of preserved pairs
  let selectedMessages: ChatMessage[] = [];
  let usedTokens = 0;

  // Sort indices by relevance score (descending)
  const sortedIndices = [...relevanceScores]
    .sort((a, b) => b.score - a.score)
    .map(r => r.messageIndex);

  // Process preserved pairs first - these have priority
  const preservedMessages: ChatMessage[] = [];
  for (const index of preservedPairs) {
    if (index >= 0 && index < messages.length) {
      preservedMessages.push(messages[index]);
      usedTokens += messages[index].tokens || 0;
    }
  }

  // If preserved pairs exceed budget, we need to do some trimming
  if (usedTokens > tokenBudget) {
    // Sort preserved messages by relevance
    const preservedIndices = Array.from(preservedPairs);
    const sortedPreserved = preservedIndices
      .map(index => ({
        message: messages[index],
        score: relevanceScores.find(r => r.messageIndex === index)?.score || 0,
      }))
      .sort((a, b) => b.score - a.score);

    // Keep adding until we hit the budget
    usedTokens = 0;
    preservedMessages.length = 0;
    for (const item of sortedPreserved) {
      const msgTokens = item.message.tokens || 0;
      if (usedTokens + msgTokens <= tokenBudget) {
        preservedMessages.push(item.message);
        usedTokens += msgTokens;
      }
    }
  }

  // Add preserved messages to our selection
  selectedMessages = [...preservedMessages];

  // Fill remaining budget with the most relevant messages
  for (const index of sortedIndices) {
    // Skip if already included in preserved pairs
    if (preservedPairs.has(index)) continue;

    const message = messages[index];
    const msgTokens = message.tokens || 0;

    // Check if adding this message would exceed our budget
    if (usedTokens + msgTokens <= tokenBudget) {
      selectedMessages.push(message);
      usedTokens += msgTokens;
    }
  }

  return selectedMessages;
}

/**
 * Sorts messages back to their original order in the conversation
 *
 * @param selectedMessages Messages that have been selected for preservation
 * @param originalMessages Original message array with correct order
 * @returns Messages sorted in original conversation order
 */
function sortMessagesByOriginalOrder(
  selectedMessages: ChatMessage[],
  originalMessages: ChatMessage[]
): ChatMessage[] {
  // Create a map of messages to their original indices
  const messageToIndex = new Map<ChatMessage, number>();
  originalMessages.forEach((msg, index) => {
    messageToIndex.set(msg, index);
  });

  // Sort selected messages by their original indices
  return selectedMessages.sort((a, b) => {
    const indexA = messageToIndex.get(a) || 0;
    const indexB = messageToIndex.get(b) || 0;
    return indexA - indexB;
  });
}

/**
 * Updates the ContextSettings type in the LLMConfig to support the 'selective' truncation strategy
 * and adds it to the SessionManager.optimizeContext method.
 *
 * This is a documentation function only - the actual implementation is done by updating:
 * 1. src/llm/types.ts - Add 'selective' to TruncationStrategy type
 * 2. src/llm/session.ts - Update optimizeContext method to use relevance-based pruning
 */
function documentRequiredChanges(): void {
  // This function exists only for documentation
  // The following changes need to be made:
  // In src/llm/types.ts:
  // export type TruncationStrategy = 'oldest-first' | 'selective';
  // In src/llm/session.ts, update optimizeContext:
  // if (session.contextSettings.truncationStrategy === 'selective') {
  //   // Use relevance-based pruning
  //   const newMessages = pruneMessagesByRelevance(
  //     session.messages,
  //     session.contextSettings,
  //     targetTokens
  //   );
  //   // Update messages and calculate new token counts
  //   session.messages = newMessages;
  // } else {
  //   // Original oldest-first strategy
  //   // ...existing code...
  // }
}
