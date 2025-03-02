import { ChatMessage } from './types';
import { getContextLimit } from './token-counter';

/**
 * Options for context window adaptation
 */
export interface ContextAdaptationOptions {
  /** Add a summary message explaining context adaptation */
  addContextSummary?: boolean;
  /** Strategy to use for message selection */
  strategy?: 'recency' | 'importance' | 'hybrid';
  /** Ensure conversation continuity by keeping question-answer pairs together */
  preserveContinuity?: boolean;
  /** Maximum percentage of context window to target (0.0-1.0) */
  targetUtilization?: number;
  /** Minimum percentage of context window to utilize (0.0-1.0) */
  minUtilization?: number;
  /** Custom scoring function for message importance */
  importanceScorer?: (message: ChatMessage, index: number) => number;
}

/**
 * Result of excess message identification
 */
export interface ExcessMessageResult {
  /** Whether the context exceeds the model's limit */
  exceedsLimit: boolean;
  /** Number of tokens that exceed the limit */
  excessTokens: number;
  /** Messages that could be removed to fit context */
  excessMessages: ChatMessage[];
}

/**
 * Recovery result for adaptive context optimization
 */
export interface AdaptiveRecoveryResult {
  /** Adapted messages */
  messages: ChatMessage[];
  /** Whether recovery was applied */
  recoveryApplied: boolean;
  /** Original token count */
  originalTokenCount: number;
  /** Final token count */
  finalTokenCount: number;
}

/**
 * Budget result for token allocation
 */
export interface BudgetAllocationResult {
  /** Adapted messages */
  messages: ChatMessage[];
  /** Breakdown of budget utilization */
  budgetUtilization: {
    system: number;
    recent: number;
    remaining: number;
    total: number;
  };
}

/**
 * Adapter for handling context window size differences between models
 */
export class ContextWindowAdapter {
  /**
   * Calculate the total tokens required for a set of messages
   * @param messages Array of chat messages
   * @returns Total token count
   */
  calculateRequiredContextSize(messages: ChatMessage[]): number {
    return messages.reduce((sum, message) => {
      // Use the token count if available, otherwise estimate
      const messageTokens =
        message.tokens || this.estimateTokens(message.content);
      return sum + messageTokens;
    }, 0);
  }

  /**
   * Identify messages that would exceed a model's context limit
   * @param messages Array of chat messages
   * @param modelId Model ID to check against
   * @returns Analysis of excess messages
   */
  identifyExcessMessages(
    messages: ChatMessage[],
    modelId: string
  ): ExcessMessageResult {
    const totalTokens = this.calculateRequiredContextSize(messages);
    const contextLimit = getContextLimit(modelId);

    if (totalTokens <= contextLimit) {
      return {
        exceedsLimit: false,
        excessTokens: 0,
        excessMessages: [],
      };
    }

    const excessTokens = totalTokens - contextLimit;

    // Identify which messages could be removed
    // Start with oldest messages, but preserve system messages
    const messagesCopy = [...messages];
    const excessMessages: ChatMessage[] = [];
    let tokensToRemove = excessTokens;

    // Sort non-system messages by recency (oldest first)
    const systemMessages = messagesCopy.filter(m => m.role === 'system');
    const nonSystemMessages = messagesCopy
      .filter(m => m.role !== 'system')
      .sort((a, b) => {
        // Sort by timestamp if available, otherwise use array position
        const aTime = a.timestamp ? a.timestamp.getTime() : 0;
        const bTime = b.timestamp ? b.timestamp.getTime() : 0;
        return aTime - bTime;
      });

    // Remove oldest messages first until we have enough tokens
    for (const message of nonSystemMessages) {
      const messageTokens =
        message.tokens || this.estimateTokens(message.content);

      if (tokensToRemove > 0) {
        excessMessages.push(message);
        tokensToRemove -= messageTokens;
      } else {
        break;
      }
    }

    return {
      exceedsLimit: true,
      excessTokens,
      excessMessages,
    };
  }

  /**
   * Adapt context from one model to another
   * @param messages Original messages
   * @param sourceModelId Source model ID
   * @param targetModelId Target model ID
   * @param options Adaptation options
   * @returns Adapted messages
   */
  adaptContextToModel(
    messages: ChatMessage[],
    sourceModelId: string,
    targetModelId: string,
    options: ContextAdaptationOptions = {}
  ): ChatMessage[] {
    const sourceLimit = getContextLimit(sourceModelId);
    const targetLimit = getContextLimit(targetModelId);

    // If target model has larger context, no adaptation needed
    if (targetLimit >= sourceLimit) {
      return [...messages];
    }

    // Calculate total tokens
    const totalTokens = this.calculateRequiredContextSize(messages);

    // If content already fits, no adaptation needed
    if (totalTokens <= targetLimit) {
      return [...messages];
    }

    const strategy = options.strategy || 'recency';
    const addSummary = options.addContextSummary ?? true;
    const preserveContinuity = options.preserveContinuity ?? true;

    // Apply the selected pruning strategy
    let adaptedMessages: ChatMessage[];

    switch (strategy) {
      case 'importance':
        adaptedMessages = this.adaptByImportance(
          messages,
          targetLimit,
          options
        );
        break;
      case 'hybrid':
        adaptedMessages = this.adaptHybrid(messages, targetLimit, options);
        break;
      case 'recency':
      default:
        adaptedMessages = this.adaptByRecency(
          messages,
          targetLimit,
          preserveContinuity
        );
        break;
    }

    // Add a summary message if requested
    if (addSummary) {
      const removedCount = messages.length - adaptedMessages.length;
      const percentRemoved = Math.round((removedCount / messages.length) * 100);

      if (removedCount > 0) {
        const summaryMessage: ChatMessage = {
          role: 'system',
          content: `[Context adapted: ${removedCount} older messages (${percentRemoved}%) were removed to fit the ${targetModelId} context window. The conversation continues with the most relevant context preserved.]`,
          tokens: 50, // Approximate
        };

        // Add summary after system messages but before conversation
        const systemMessages = adaptedMessages.filter(m => m.role === 'system');
        const nonSystemMessages = adaptedMessages.filter(
          m => m.role !== 'system'
        );

        adaptedMessages = [
          ...systemMessages,
          summaryMessage,
          ...nonSystemMessages,
        ];

        // Ensure we're still under the limit after adding summary
        if (this.calculateRequiredContextSize(adaptedMessages) > targetLimit) {
          // Remove one or more non-system messages to make room for summary
          nonSystemMessages.shift(); // Remove oldest non-system message

          adaptedMessages = [
            ...systemMessages,
            summaryMessage,
            ...nonSystemMessages,
          ];
        }
      }
    }

    return adaptedMessages;
  }

  /**
   * Adapt context with recovery to prevent over-pruning
   * @param messages Original messages
   * @param sourceModelId Source model ID
   * @param targetModelId Target model ID
   * @param options Adaptation options
   * @returns Adapted messages with recovery information
   */
  adaptWithRecovery(
    messages: ChatMessage[],
    sourceModelId: string,
    targetModelId: string,
    options: ContextAdaptationOptions = {}
  ): AdaptiveRecoveryResult {
    const targetUtilization = options.targetUtilization || 0.9; // Default 90%
    const minUtilization = options.minUtilization || 0.7; // Default 70%
    const targetLimit = getContextLimit(targetModelId);

    // First attempt at adaptation
    const adaptedMessages = this.adaptContextToModel(
      messages,
      sourceModelId,
      targetModelId,
      options
    );

    const originalTokenCount = this.calculateRequiredContextSize(messages);
    let finalTokenCount = this.calculateRequiredContextSize(adaptedMessages);

    // Check if we've over-pruned
    const utilization = finalTokenCount / targetLimit;

    // If we're below minimum utilization, try to recover some content
    let recoveryApplied = false;
    if (utilization < minUtilization) {
      recoveryApplied = true;

      // Identify candidate messages to add back
      const removedMessages = messages.filter(
        msg =>
          !adaptedMessages.some(
            m => m.content === msg.content && m.role === msg.role
          )
      );

      // Sort by importance (we can define custom scoring here)
      const scoredRemovedMessages = removedMessages
        .map(msg => ({
          message: msg,
          score: this.scoreMessageImportance(
            msg,
            messages.indexOf(msg),
            options
          ),
        }))
        .sort((a, b) => b.score - a.score);

      // Add back messages until we reach target utilization
      const targetTokens = Math.floor(targetLimit * targetUtilization);
      const additionalTokensNeeded = targetTokens - finalTokenCount;

      if (additionalTokensNeeded > 0) {
        // Find messages to add back
        const messagesToAddBack: ChatMessage[] = [];
        let tokensAdded = 0;

        for (const { message } of scoredRemovedMessages) {
          const messageTokens =
            message.tokens || this.estimateTokens(message.content);

          if (tokensAdded + messageTokens <= additionalTokensNeeded) {
            messagesToAddBack.push(message);
            tokensAdded += messageTokens;
          }
        }

        // Merge with adapted messages
        const systemMessages = adaptedMessages.filter(m => m.role === 'system');
        const nonSystemMessages = adaptedMessages.filter(
          m => m.role !== 'system'
        );

        // Rebuild conversation with added messages
        const allNonSystemMessages = [
          ...nonSystemMessages,
          ...messagesToAddBack,
        ];
        // Sort chronologically
        allNonSystemMessages.sort((a, b) => {
          const aIndex = messages.findIndex(
            m => m.content === a.content && m.role === a.role
          );
          const bIndex = messages.findIndex(
            m => m.content === b.content && m.role === b.role
          );
          return aIndex - bIndex;
        });

        // Combine back together
        const recoveredMessages = [...systemMessages, ...allNonSystemMessages];

        // Final check to ensure we're still under the target limit
        if (
          this.calculateRequiredContextSize(recoveredMessages) <= targetLimit
        ) {
          finalTokenCount =
            this.calculateRequiredContextSize(recoveredMessages);
          return {
            messages: recoveredMessages,
            recoveryApplied,
            originalTokenCount,
            finalTokenCount,
          };
        }
      }
    }

    return {
      messages: adaptedMessages,
      recoveryApplied,
      originalTokenCount,
      finalTokenCount,
    };
  }

  /**
   * Adapt context using token budgets for different message types
   * @param messages Original messages
   * @param sourceModelId Source model ID
   * @param targetModelId Target model ID
   * @param budgets Budget allocation settings
   * @returns Adapted messages with budget information
   */
  adaptWithBudgets(
    messages: ChatMessage[],
    sourceModelId: string,
    targetModelId: string,
    budgets: {
      systemMessageBudget: number;
      recentMessageBudget: number;
      remainingBudget: number;
    }
  ): BudgetAllocationResult {
    const { systemMessageBudget, recentMessageBudget, remainingBudget } =
      budgets;
    const targetLimit = getContextLimit(targetModelId);

    // Check budgets add up to 1.0
    const totalBudget =
      systemMessageBudget + recentMessageBudget + remainingBudget;
    if (Math.abs(totalBudget - 1.0) > 0.001) {
      throw new Error('Budgets must add up to 1.0');
    }

    // Split messages by type
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate token budgets
    const systemBudgetTokens = Math.floor(targetLimit * systemMessageBudget);
    const recentBudgetTokens = Math.floor(targetLimit * recentMessageBudget);
    const remainingBudgetTokens = Math.floor(targetLimit * remainingBudget);

    // Always include system messages
    let resultMessages: ChatMessage[] = [];
    let systemTokensUsed = 0;

    // Add system messages (up to budget)
    for (const msg of systemMessages) {
      const msgTokens = msg.tokens || this.estimateTokens(msg.content);
      if (systemTokensUsed + msgTokens <= systemBudgetTokens) {
        resultMessages.push(msg);
        systemTokensUsed += msgTokens;
      }
    }

    // Select recent messages (up to budget)
    let recentTokensUsed = 0;
    const reversedNonSystem = [...nonSystemMessages].reverse();
    const recentMessages: ChatMessage[] = [];

    for (const msg of reversedNonSystem) {
      const msgTokens = msg.tokens || this.estimateTokens(msg.content);
      if (recentTokensUsed + msgTokens <= recentBudgetTokens) {
        recentMessages.unshift(msg); // Add to front to preserve order
        recentTokensUsed += msgTokens;
      } else {
        break;
      }
    }

    // Add recent messages
    resultMessages = [...resultMessages, ...recentMessages];

    // For remaining budget, select important messages from what's left
    const remainingCandidates = nonSystemMessages.filter(
      msg => !recentMessages.includes(msg)
    );

    // Score by importance
    const scoredRemaining = remainingCandidates
      .map(msg => ({
        message: msg,
        score: this.scoreMessageImportance(msg, messages.indexOf(msg)),
      }))
      .sort((a, b) => b.score - a.score);

    // Add important messages up to remaining budget
    let remainingTokensUsed = 0;
    const importantMessages: ChatMessage[] = [];

    for (const { message } of scoredRemaining) {
      const msgTokens = message.tokens || this.estimateTokens(message.content);
      if (remainingTokensUsed + msgTokens <= remainingBudgetTokens) {
        importantMessages.push(message);
        remainingTokensUsed += msgTokens;
      } else {
        break;
      }
    }

    // Sort remaining messages by original position
    importantMessages.sort((a, b) => {
      const aIndex = messages.findIndex(
        m => m.content === a.content && m.role === a.role
      );
      const bIndex = messages.findIndex(
        m => m.content === b.content && m.role === b.role
      );
      return aIndex - bIndex;
    });

    // Add important messages
    resultMessages = [...resultMessages, ...importantMessages];

    // Calculate final token usage
    const finalTokens = this.calculateRequiredContextSize(resultMessages);

    return {
      messages: resultMessages,
      budgetUtilization: {
        system: systemTokensUsed,
        recent: recentTokensUsed,
        remaining: remainingTokensUsed,
        total: finalTokens,
      },
    };
  }

  /**
   * Adapt context by prioritizing recent messages
   * @param messages Original messages
   * @param targetLimit Target token limit
   * @param preserveContinuity Whether to preserve conversation continuity
   * @returns Adapted messages
   */
  private adaptByRecency(
    messages: ChatMessage[],
    targetLimit: number,
    preserveContinuity: boolean = true
  ): ChatMessage[] {
    // Always include system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate space available for non-system messages
    const systemTokens = this.calculateRequiredContextSize(systemMessages);
    const availableTokens = targetLimit - systemTokens;

    let selectedMessages: ChatMessage[] = [];

    if (preserveContinuity) {
      // Group by conversation turns (Q&A pairs)
      const conversationTurns: ChatMessage[][] = [];
      let currentTurn: ChatMessage[] = [];

      for (let i = 0; i < nonSystemMessages.length; i++) {
        const message = nonSystemMessages[i];
        currentTurn.push(message);

        // If this is an assistant message and not the last message,
        // and the next message is from a user, end the current turn
        if (
          message.role === 'assistant' &&
          i < nonSystemMessages.length - 1 &&
          nonSystemMessages[i + 1].role === 'user'
        ) {
          conversationTurns.push(currentTurn);
          currentTurn = [];
        }
      }

      // Add the last turn if not empty
      if (currentTurn.length > 0) {
        conversationTurns.push(currentTurn);
      }

      // Select turns from most recent to oldest
      const reversedTurns = [...conversationTurns].reverse();
      let tokensUsed = 0;

      for (const turn of reversedTurns) {
        const turnTokens = this.calculateRequiredContextSize(turn);

        if (tokensUsed + turnTokens <= availableTokens) {
          selectedMessages = [...turn, ...selectedMessages];
          tokensUsed += turnTokens;
        } else {
          break;
        }
      }
    } else {
      // Simple recency-based selection without preserving continuity
      const reversedMessages = [...nonSystemMessages].reverse();
      let tokensUsed = 0;

      for (const message of reversedMessages) {
        const messageTokens =
          message.tokens || this.estimateTokens(message.content);

        if (tokensUsed + messageTokens <= availableTokens) {
          selectedMessages.unshift(message); // Add to front to preserve order
          tokensUsed += messageTokens;
        } else {
          break;
        }
      }
    }

    // Combine system messages with selected messages
    return [...systemMessages, ...selectedMessages];
  }

  /**
   * Adapt context by prioritizing important messages
   * @param messages Original messages
   * @param targetLimit Target token limit
   * @param options Adaptation options
   * @returns Adapted messages
   */
  private adaptByImportance(
    messages: ChatMessage[],
    targetLimit: number,
    options: ContextAdaptationOptions = {}
  ): ChatMessage[] {
    // Always include system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate space available for non-system messages
    const systemTokens = this.calculateRequiredContextSize(systemMessages);
    const availableTokens = targetLimit - systemTokens;

    // Score messages by importance
    const scoredMessages = nonSystemMessages.map((message, index) => ({
      message,
      score: options.importanceScorer
        ? options.importanceScorer(message, index)
        : this.scoreMessageImportance(message, index, options),
      originalIndex: index,
    }));

    // Sort by importance score (highest first)
    scoredMessages.sort((a, b) => b.score - a.score);

    // Select important messages up to the available token limit
    const selectedScoredMessages: typeof scoredMessages = [];
    let tokensUsed = 0;

    for (const item of scoredMessages) {
      const messageTokens =
        item.message.tokens || this.estimateTokens(item.message.content);

      if (tokensUsed + messageTokens <= availableTokens) {
        selectedScoredMessages.push(item);
        tokensUsed += messageTokens;
      } else if (tokensUsed === 0) {
        // If we can't fit any messages, at least include the most important one
        selectedScoredMessages.push(item);
        break;
      } else {
        break;
      }
    }

    // Sort selected messages by original order
    selectedScoredMessages.sort((a, b) => a.originalIndex - b.originalIndex);

    // Extract messages from scored objects
    const selectedMessages = selectedScoredMessages.map(item => item.message);

    // Combine system messages with selected messages
    return [...systemMessages, ...selectedMessages];
  }

  /**
   * Adapt context using a hybrid approach combining recency and importance
   * @param messages Original messages
   * @param targetLimit Target token limit
   * @param options Adaptation options
   * @returns Adapted messages
   */
  private adaptHybrid(
    messages: ChatMessage[],
    targetLimit: number,
    options: ContextAdaptationOptions = {}
  ): ChatMessage[] {
    // Always include system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Calculate space available for non-system messages
    const systemTokens = this.calculateRequiredContextSize(systemMessages);
    const availableTokens = targetLimit - systemTokens;

    // Allocate tokens for recent and important messages
    const recentBudget = Math.floor(availableTokens * 0.6); // 60% for recent messages
    const importanceBudget = availableTokens - recentBudget; // 40% for important non-recent messages

    // Get recent messages
    const recentMessagesCount = Math.ceil(nonSystemMessages.length * 0.3); // Consider 30% as recent
    const recentMessages = nonSystemMessages.slice(-recentMessagesCount);
    const olderMessages = nonSystemMessages.slice(0, -recentMessagesCount);

    // Include as many recent messages as possible within budget
    const selectedRecent: ChatMessage[] = [];
    let recentTokensUsed = 0;

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const message = recentMessages[i];
      const messageTokens =
        message.tokens || this.estimateTokens(message.content);

      if (recentTokensUsed + messageTokens <= recentBudget) {
        selectedRecent.unshift(message); // Add to front to preserve order
        recentTokensUsed += messageTokens;
      } else {
        break;
      }
    }

    // Score older messages by importance
    const scoredOlder = olderMessages.map((message, index) => ({
      message,
      score: options.importanceScorer
        ? options.importanceScorer(message, index)
        : this.scoreMessageImportance(message, index, options),
      originalIndex: index,
    }));

    // Sort by importance score (highest first)
    scoredOlder.sort((a, b) => b.score - a.score);

    // Select important older messages up to the importance budget
    const selectedScored: typeof scoredOlder = [];
    let importanceTokensUsed = 0;

    for (const item of scoredOlder) {
      const messageTokens =
        item.message.tokens || this.estimateTokens(item.message.content);

      if (importanceTokensUsed + messageTokens <= importanceBudget) {
        selectedScored.push(item);
        importanceTokensUsed += messageTokens;
      } else {
        break;
      }
    }

    // Sort selected older messages by original order
    selectedScored.sort((a, b) => a.originalIndex - b.originalIndex);

    // Extract messages from scored objects
    const selectedOlder = selectedScored.map(item => item.message);

    // Combine system messages with selected older and recent messages
    return [...systemMessages, ...selectedOlder, ...selectedRecent];
  }

  /**
   * Score a message's importance
   * @param message Message to score
   * @param index Message index in the conversation
   * @param options Adaptation options
   * @returns Importance score (higher is more important)
   */
  private scoreMessageImportance(
    message: ChatMessage,
    index: number,
    options: ContextAdaptationOptions = {}
  ): number {
    // If a custom scorer is provided, use it
    if (options.importanceScorer) {
      return options.importanceScorer(message, index);
    }

    // Default scoring algorithm
    let score = 0;

    // System messages are very important
    if (message.role === 'system') {
      return 1000; // Ensure system messages are always included
    }

    // Recent messages are more important (recency bias)
    const recencyScore = index * 2;
    score += recencyScore;

    // User messages with questions are more important
    if (
      message.role === 'user' &&
      (message.content.includes('?') ||
        message.content.toLowerCase().includes('what') ||
        message.content.toLowerCase().includes('how') ||
        message.content.toLowerCase().includes('why'))
    ) {
      score += 20;
    }

    // Longer messages may contain more information
    const contentLength = message.content.length;
    score += Math.min(contentLength / 100, 15); // Cap at 15 points

    // Messages with tools/code are usually important
    if (message.hasToolCall || message.content.includes('```')) {
      score += 25;
    }

    // Messages with URLs/references are usually important
    if (message.content.includes('http') || message.content.includes('www.')) {
      score += 15;
    }

    return score;
  }

  /**
   * Estimate token count of a message
   * @param content Message content
   * @returns Estimated token count
   */
  private estimateTokens(content: string): number {
    // Simple estimation: 1 token for ~4 characters
    return Math.ceil(content.length / 4);
  }
}
