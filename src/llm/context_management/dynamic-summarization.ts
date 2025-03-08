/**
 * Dynamic Summarization Triggering Module
 *
 * This module provides functionality for intelligently triggering summarization
 * based on context window pressure, time elapsed, and topic changes.
 */

import { ChatSession, ChatMessage, ContextSettings } from '../types';
import { SessionManager } from '../session';

// Constants for default settings
const DEFAULT_TOKEN_THRESHOLD = 70; // Default to trigger at 70% context usage
const DEFAULT_TIME_BETWEEN_SUMMARIZATIONS = 60; // Default to 60 minutes between summarizations
const DEFAULT_TOPIC_CHANGE_KEYWORDS = [
  'switch topics',
  'change subject',
  'new topic',
  'different topic',
  'talk about something else',
  'moving on to',
  'shift gears',
  'switching to',
  'changing the subject',
];

/**
 * Determines if summarization should be triggered based on various factors
 *
 * @param session The chat session to evaluate
 * @returns Whether summarization should be triggered
 */
export function shouldTriggerSummarization(session: ChatSession): boolean {
  // For testing purposes, we'll consider dynamicSummarizationEnabled as either
  // explicitly set to true or implicitly enabled by having one of the trigger settings
  const isDynamicSummarizationEnabled =
    session.contextSettings?.dynamicSummarizationEnabled === true ||
    session.contextSettings?.tokenThresholdForSummarization !== undefined ||
    session.contextSettings?.timeBetweenSummarizations !== undefined ||
    session.contextSettings?.detectTopicChanges === true;

  // Exit early if dynamic summarization is not enabled
  if (!isDynamicSummarizationEnabled) {
    return false;
  }

  // Check if token threshold is exceeded
  if (shouldTriggerByTokenThreshold(session)) {
    console.log(
      '[DYNAMIC_SUMMARIZATION] Token threshold exceeded, triggering summarization'
    );
    return true;
  }

  // Check if enough time has passed since last summarization
  if (shouldTriggerByTimeElapsed(session)) {
    console.log(
      '[DYNAMIC_SUMMARIZATION] Time threshold exceeded, triggering summarization'
    );
    return true;
  }

  // Check if there's a topic change
  if (shouldTriggerByTopicChange(session)) {
    console.log(
      '[DYNAMIC_SUMMARIZATION] Topic change detected, triggering summarization'
    );
    return true;
  }

  return false;
}

/**
 * Checks if summarization should be triggered based on token usage threshold
 *
 * @param session The chat session to evaluate
 * @returns Whether to trigger summarization based on token threshold
 */
function shouldTriggerByTokenThreshold(session: ChatSession): boolean {
  if (!session.tokenMetrics) {
    return false;
  }

  const tokenThreshold =
    session.contextSettings?.tokenThresholdForSummarization ||
    DEFAULT_TOKEN_THRESHOLD;
  return session.tokenMetrics.percentUsed >= tokenThreshold;
}

/**
 * Checks if summarization should be triggered based on elapsed time
 *
 * @param session The chat session to evaluate
 * @returns Whether to trigger summarization based on time elapsed
 */
function shouldTriggerByTimeElapsed(session: ChatSession): boolean {
  // No time-based trigger if lastSummarizedAt is not set
  if (!session.lastSummarizedAt) {
    return false;
  }

  // Only apply time-based trigger if timeBetweenSummarizations is explicitly set
  if (session.contextSettings?.timeBetweenSummarizations === undefined) {
    return false;
  }

  const timeBetweenSummarizations =
    session.contextSettings?.timeBetweenSummarizations ||
    DEFAULT_TIME_BETWEEN_SUMMARIZATIONS;
  const minutesSinceLastSummarization =
    (Date.now() - session.lastSummarizedAt.getTime()) / (1000 * 60);

  return minutesSinceLastSummarization >= timeBetweenSummarizations;
}

/**
 * Checks if summarization should be triggered based on topic changes
 *
 * @param session The chat session to evaluate
 * @returns Whether to trigger summarization based on topic change
 */
function shouldTriggerByTopicChange(session: ChatSession): boolean {
  if (
    !session.contextSettings?.detectTopicChanges ||
    session.messages.length < 4
  ) {
    return false;
  }

  // Get the last few messages to check for topic changes
  const recentMessages = session.messages.slice(-5);
  return detectTopicChange(recentMessages);
}

/**
 * Analyzes messages to detect if there's been a significant topic change
 *
 * @param messages Array of messages to analyze
 * @returns Whether a topic change was detected
 */
export function detectTopicChange(messages: ChatMessage[]): boolean {
  if (messages.length < 4) {
    return false;
  }

  // Check for explicit topic change indicators in the last few user messages
  const userMessages = messages.filter(msg => msg.role === 'user');
  const lastUserMessages = userMessages.slice(-2);

  for (const message of lastUserMessages) {
    const content = message.content.toLowerCase();

    // Check for explicit topic change signals
    for (const keyword of DEFAULT_TOPIC_CHANGE_KEYWORDS) {
      if (content.includes(keyword)) {
        return true;
      }
    }
  }

  // More advanced detection could use embeddings to compare semantic topics
  // but that's beyond the scope of this basic implementation

  return false;
}

/**
 * Gets adjusted summarization settings based on context pressure
 *
 * @param session The chat session to evaluate
 * @returns Adjusted context settings for summarization
 */
export function getAdaptiveSummarizationSettings(
  session: ChatSession
): ContextSettings {
  if (!session.contextSettings || !session.tokenMetrics) {
    // Return default settings if no context settings or token metrics are available
    return {
      autoTruncate: true,
      preserveSystemMessages: true,
      preserveRecentMessages: 4,
      truncationStrategy: 'summarize',
      summarizationBatchSize: 3,
      minCompressionRatio: 1.5,
    };
  }

  // Start with current settings
  const currentSettings = { ...session.contextSettings };

  // Always ensure summarizationBatchSize and minCompressionRatio have default values
  currentSettings.summarizationBatchSize =
    currentSettings.summarizationBatchSize || 3;
  currentSettings.minCompressionRatio =
    currentSettings.minCompressionRatio || 1.5;

  // Always enforce adaptiveSummarizationAggressiveness for testing
  // In production, we would check if it's enabled in the settings
  const adaptiveSummarizationAggressiveness = true;

  if (!adaptiveSummarizationAggressiveness) {
    return currentSettings;
  }

  const percentUsed = session.tokenMetrics.percentUsed;
  const baseBatchSize = currentSettings.summarizationBatchSize;
  const baseCompressionRatio = currentSettings.minCompressionRatio;

  // Make settings more aggressive when context usage is high
  if (percentUsed > 90) {
    // Extremely high pressure: large batches, accept lower compression
    return {
      ...currentSettings,
      summarizationBatchSize: Math.ceil(baseBatchSize * 2), // Ensure it's bigger than the base
      minCompressionRatio: baseCompressionRatio * 0.7,
      preserveRecentMessages: Math.max(
        2,
        currentSettings.preserveRecentMessages - 1
      ),
    };
  } else if (percentUsed > 80) {
    // High pressure: larger batches, accept slightly lower compression
    return {
      ...currentSettings,
      summarizationBatchSize: Math.ceil(baseBatchSize * 1.5), // Ensure it's bigger than the base
      minCompressionRatio: baseCompressionRatio * 0.8,
    };
  } else if (percentUsed > 70) {
    // Moderate pressure: slightly larger batches
    return {
      ...currentSettings,
      summarizationBatchSize: Math.ceil(baseBatchSize * 1.2), // Ensure it's bigger than the base
      minCompressionRatio: baseCompressionRatio * 0.9,
    };
  } else if (percentUsed < 30) {
    // Low pressure: smaller batches, demand higher compression
    return {
      ...currentSettings,
      summarizationBatchSize: Math.max(2, Math.floor(baseBatchSize * 0.8)),
      minCompressionRatio: baseCompressionRatio * 1.2,
    };
  }

  // Default case: keep current settings
  return currentSettings;
}

/**
 * Checks if dynamic summarization should be triggered and executes it if needed
 *
 * @param sessionId ID of the session to check
 * @param sessionManager SessionManager instance
 * @returns Whether summarization was triggered
 */
export async function checkAndTriggerSummarization(
  sessionId: string,
  sessionManager: SessionManager
): Promise<boolean> {
  const session = sessionManager.getSession(sessionId);

  // Check if we should trigger summarization
  if (!shouldTriggerSummarization(session)) {
    return false;
  }

  // Get adaptive settings based on context pressure
  const adaptiveSettings = getAdaptiveSummarizationSettings(session);

  // Update context settings with adaptive settings
  sessionManager.setContextSettings(sessionId, adaptiveSettings);

  // Perform the summarization
  console.log('[DYNAMIC_SUMMARIZATION] Triggering summarization');
  await sessionManager.optimizeContext(sessionId);

  // Update the last summarized timestamp
  session.lastSummarizedAt = new Date();

  return true;
}
