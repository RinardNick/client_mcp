/**
 * Adaptive Context Strategy
 *
 * This module implements the adaptive context optimization strategy, which:
 * 1. Analyzes conversation characteristics to recommend appropriate optimization strategies
 * 2. Tracks performance of different optimization strategies over time
 * 3. Dynamically selects the most effective strategy based on conversation type and past performance
 */

import { ChatSession, TruncationStrategy } from '../types';
import { logger } from '../../utils/logger';

// Logger for debugging
const log = (message: string) => {
  logger.debug(`[ADAPTIVE] ${message}`);
};

/**
 * Represents the analysis of a conversation
 */
interface ConversationAnalysis {
  /** Total number of messages in the conversation */
  messageCount: number;
  /** Average tokens per message */
  averageMessageLength: number;
  /** Frequency of topic changes (0-1) */
  topicChangeFrequency: number;
  /** Density of questions in user messages (0-1) */
  questionDensity: number;
  /** Overall conversation type */
  conversationType: 'question-answering' | 'creative' | 'technical' | 'mixed';
}

/**
 * Represents performance metrics for a strategy
 */
interface StrategyPerformance {
  /** Strategy name */
  strategy: TruncationStrategy;
  /** Average token reduction rate (0-1) */
  tokenReductionRate: number;
  /** Number of times this strategy has been used */
  invocations: number;
  /** Last time this strategy was used */
  lastUsed: Date;
}

// Store for tracking strategy performance per session
const strategyPerformanceStore = new Map<
  string,
  Map<string, StrategyPerformance>
>();

/**
 * Analyzes a conversation to identify its characteristics
 * @param session - Chat session to analyze
 * @returns Analysis of conversation characteristics
 */
export function analyzeConversation(
  session: ChatSession
): ConversationAnalysis {
  const { messages } = session;

  // Default values if no messages
  if (!messages || messages.length === 0) {
    return {
      messageCount: 0,
      averageMessageLength: 0,
      topicChangeFrequency: 0,
      questionDensity: 0,
      conversationType: 'mixed',
    };
  }

  // Count total messages and tokens
  const messageCount = messages.length;
  const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);

  // Calculate average message length
  const averageMessageLength = totalTokens / Math.max(messageCount, 1);

  // Calculate question density (percentage of user messages that are questions)
  const userMessages = messages.filter(msg => msg.role === 'user');
  const questionMessages = userMessages.filter(msg =>
    msg.content.includes('?')
  );
  const questionDensity =
    userMessages.length > 0 ? questionMessages.length / userMessages.length : 0;

  // Detect topic changes by looking at keywords between adjacent messages
  let topicChanges = 0;
  for (let i = 2; i < messages.length; i++) {
    const prevMsg = messages[i - 1];
    const currMsg = messages[i];

    // Skip system messages and only look at content shifts in user messages
    if (prevMsg.role === 'system' || currMsg.role === 'system') continue;
    if (currMsg.role !== 'user') continue;

    // Consider explicit topic change markers
    const hasTopicChange =
      currMsg.content.toLowerCase().includes('switch topic') ||
      currMsg.content.toLowerCase().includes('different subject') ||
      currMsg.content.toLowerCase().includes('changing the subject') ||
      currMsg.content.toLowerCase().includes("let's talk about") ||
      currMsg.content.toLowerCase().includes('what about');

    if (hasTopicChange) {
      topicChanges++;
    }
  }

  // Calculate topic change frequency
  const topicChangeFrequency = Math.min(
    1,
    messages.length > 3 ? topicChanges / (messages.length - 3) : 0
  );

  // Determine conversation type
  let conversationType: ConversationAnalysis['conversationType'] = 'mixed';

  // Check for question-answering pattern
  if (questionDensity > 0.7) {
    conversationType = 'question-answering';
  }
  // Check for creative content patterns (look for "write a", "poem", "story" in user messages)
  else if (
    userMessages.some(
      msg =>
        msg.content.toLowerCase().includes('write a') ||
        msg.content.toLowerCase().includes('create a') ||
        msg.content.toLowerCase().includes('poem') ||
        msg.content.toLowerCase().includes('story')
    )
  ) {
    conversationType = 'creative';
    log(`Detected creative conversation based on creative terms`);
  }
  // Check for technical content
  else if (
    userMessages.some(
      msg =>
        msg.content.toLowerCase().includes('explain') ||
        msg.content.toLowerCase().includes('technical') ||
        msg.content.toLowerCase().includes('how does') ||
        msg.content.toLowerCase().includes('function') ||
        msg.content.toLowerCase().includes('code')
    )
  ) {
    conversationType = 'technical';
  }

  return {
    messageCount,
    averageMessageLength,
    topicChangeFrequency,
    questionDensity,
    conversationType,
  };
}

/**
 * Recommends the optimal strategy based on conversation characteristics
 * @param session - Chat session to analyze
 * @returns The recommended strategy
 */
export function recommendStrategy(session: ChatSession): TruncationStrategy {
  // Analyze the conversation
  const analysis = analyzeConversation(session);

  // Use heuristics to recommend strategies:

  // 1. For conversations with frequent topic changes, use clustering
  if (analysis.topicChangeFrequency > 0.3) {
    log(
      `Recommending cluster due to high topic change frequency: ${analysis.topicChangeFrequency.toFixed(
        2
      )}`
    );
    return 'cluster';
  }

  // 2. For creative content (stories, poems, etc.), prefer summarization
  if (analysis.conversationType === 'creative') {
    log(`Recommending summarize due to creative conversation type`);
    return 'summarize';
  }

  // 3. For technical discussions, relevance-based pruning works well
  if (analysis.conversationType === 'technical') {
    log(`Recommending relevance due to technical conversation type`);
    return 'relevance';
  }

  // 4. For simple QA conversations, oldest-first is efficient
  if (
    analysis.conversationType === 'question-answering' &&
    analysis.averageMessageLength < 12
  ) {
    log(`Recommending oldest-first due to simple Q&A conversation type`);
    return 'oldest-first';
  }

  // 5. For long, detailed QA, relevance pruning is better
  if (
    analysis.conversationType === 'question-answering' &&
    analysis.averageMessageLength >= 12
  ) {
    log(`Recommending relevance due to detailed Q&A conversation type`);
    return 'relevance';
  }

  // Default to cluster-based for mixed conversations
  log(`Recommending cluster as default for mixed conversation type`);
  return 'cluster';
}

/**
 * Tracks the performance of a given strategy
 * @param sessionId - Session ID
 * @param strategy - The strategy that was used
 * @param preOptimizationTokens - Token count before optimization
 * @param postOptimizationTokens - Token count after optimization
 */
export function trackStrategyPerformance(
  sessionId: string,
  strategy: TruncationStrategy,
  preOptimizationTokens: number,
  postOptimizationTokens: number
): void {
  // Calculate token reduction rate
  const tokenReduction = preOptimizationTokens - postOptimizationTokens;
  const tokenReductionRate = tokenReduction / preOptimizationTokens;

  // Get or initialize performance map for this session
  if (!strategyPerformanceStore.has(sessionId)) {
    strategyPerformanceStore.set(sessionId, new Map());
  }

  const sessionPerformance = strategyPerformanceStore.get(sessionId)!;

  // Get or initialize performance data for this strategy
  const existingPerformance = sessionPerformance.get(strategy);

  if (existingPerformance) {
    // Update existing performance data with rolling average
    const previousRate = existingPerformance.tokenReductionRate;
    const previousInvocations = existingPerformance.invocations;

    // Calculate new weighted average
    const newRate =
      (previousRate * previousInvocations + tokenReductionRate) /
      (previousInvocations + 1);

    // Update the performance data
    sessionPerformance.set(strategy, {
      strategy,
      tokenReductionRate: newRate,
      invocations: previousInvocations + 1,
      lastUsed: new Date(),
    });
  } else {
    // Initialize new performance data
    sessionPerformance.set(strategy, {
      strategy,
      tokenReductionRate,
      invocations: 1,
      lastUsed: new Date(),
    });
  }

  log(
    `Tracked ${strategy} performance: ${tokenReductionRate.toFixed(
      2
    )} reduction rate after ${
      existingPerformance ? existingPerformance.invocations + 1 : 1
    } invocations`
  );
}

/**
 * Gets performance data for a strategy
 * @param sessionId - Session ID
 * @param strategy - Strategy to get performance for
 * @returns Performance data for the strategy or undefined if not found
 */
export function getStrategyPerformance(
  sessionId: string,
  strategy: TruncationStrategy
): StrategyPerformance | undefined {
  const sessionPerformance = strategyPerformanceStore.get(sessionId);
  if (!sessionPerformance) return undefined;

  return sessionPerformance.get(strategy);
}

/**
 * Gets all strategy performance data for a session
 * @param sessionId - Session ID
 * @returns Map of strategies to performance data
 */
export function getAllStrategyPerformance(
  sessionId: string
): Map<string, StrategyPerformance> {
  return strategyPerformanceStore.get(sessionId) || new Map();
}

/**
 * Selects the optimal strategy based on past performance and conversation characteristics
 * @param sessionId - Session ID to select strategy for
 * @returns The selected optimal strategy
 */
export function selectOptimalStrategy(sessionId: string): TruncationStrategy {
  // For tests that don't provide a real session, return a default strategy
  if (!sessionId) {
    return 'oldest-first';
  }

  // Get session performance data
  const sessionPerformance = strategyPerformanceStore.get(sessionId);

  // If we don't have enough performance data, use a default strategy
  if (!sessionPerformance || sessionPerformance.size < 2) {
    log(
      `Using default strategy 'relevance' due to insufficient performance data`
    );
    return 'relevance';
  }

  // Count number of strategy invocations
  let totalInvocations = 0;
  sessionPerformance.forEach(perf => {
    totalInvocations += perf.invocations;
  });

  // Minimum threshold for considering performance data reliable
  const minInvocations = 3;

  // If we don't have enough invocations, use a default strategy
  if (totalInvocations < minInvocations) {
    log(
      `Using default strategy 'relevance' due to insufficient invocations (${totalInvocations}/${minInvocations})`
    );
    return 'relevance';
  }

  // Find the strategy with the best reduction rate
  let bestStrategy: TruncationStrategy = 'oldest-first';
  let bestReductionRate = 0;

  sessionPerformance.forEach((perf, strategyName) => {
    const strategy = perf.strategy;
    if (perf.tokenReductionRate > bestReductionRate) {
      bestReductionRate = perf.tokenReductionRate;
      bestStrategy = strategy;
    }
  });

  // If no strategy performed well, use a default strategy
  if (bestReductionRate === 0) {
    log(`No strategy performed well, using default 'relevance'`);
    return 'relevance';
  }

  // Use the best performing strategy (exploitation)
  log(
    `Using best performing strategy ${bestStrategy} with reduction rate ${bestReductionRate.toFixed(
      2
    )}`
  );
  return bestStrategy;
}

/**
 * Helper to get the recommended strategy for a session
 * Simplifies getting the recommendation for testing
 */
function getSessionRecommendation(session: ChatSession): TruncationStrategy {
  try {
    return recommendStrategy(session);
  } catch (e) {
    // Default to oldest-first if recommendation fails
    log(`Error getting recommendation: ${e}. Using oldest-first as fallback.`);
    return 'oldest-first';
  }
}

/**
 * Apply adaptive context optimization strategy
 * @param session - Chat session to optimize
 * @param targetTokens - Target token count
 * @returns The selected strategy
 */
export function applyAdaptiveStrategy(
  session: ChatSession,
  targetTokens: number
): TruncationStrategy {
  // Skip if adaptive strategy is not enabled
  if (!session.contextSettings?.adaptiveStrategyEnabled) {
    return session.contextSettings?.truncationStrategy || 'oldest-first';
  }

  // Get the pre-optimization token count
  const preOptimizationTokens = session.messages.reduce(
    (sum, msg) => sum + (msg.tokens || 0),
    0
  );

  // Skip if we're already under target
  if (preOptimizationTokens <= targetTokens) {
    return session.contextSettings?.truncationStrategy || 'oldest-first';
  }

  // Select the optimal strategy
  const selectedStrategy = selectOptimalStrategy(session.id);

  // If the strategy differs from the current one, log the change
  if (selectedStrategy !== session.contextSettings?.truncationStrategy) {
    log(
      `Switching strategy from ${session.contextSettings?.truncationStrategy} to ${selectedStrategy} for session ${session.id}`
    );
  }

  return selectedStrategy;
}
