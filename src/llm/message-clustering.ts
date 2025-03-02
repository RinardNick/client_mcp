/**
 * Message Clustering
 *
 * Utility for grouping related messages in a conversation into clusters
 * for more intelligent context optimization. This allows the system to
 * maintain topic coherence while removing less important topics.
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, MessageCluster, ChatSession } from './types';
import { logger } from '../utils/logger';

// Define debug log function if logger module doesn't have it
const debugLog = (category: string, message: string) => {
  logger.debug(`[${category}] ${message}`);
};

const COMMON_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'for',
  'nor',
  'on',
  'at',
  'to',
  'from',
  'by',
  'with',
  'in',
  'out',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'any',
  'both',
  'each',
  'few',
  'more',
  'most',
  'some',
  'such',
  'no',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  's',
  't',
  'can',
  'will',
  'just',
  'should',
  'now',
  'I',
  'you',
  'he',
  'she',
  'we',
  'they',
  'it',
  'who',
  'whom',
  'whose',
  'which',
  'what',
  'this',
  'that',
  'these',
  'those',
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'would',
  'could',
  'should',
  'might',
  'must',
  'shall',
  'can',
  'may',
  'my',
  'your',
  'his',
  'her',
  'its',
  'our',
  'their',
  'of',
  'me',
  'him',
  'us',
  'them',
]);

/**
 * Extracts the main keywords from a text string
 * @param text - Text to extract keywords from
 * @param maxKeywords - Maximum number of keywords to extract
 * @returns Array of extracted keywords
 */
export function extractKeywords(text: string, maxKeywords = 10): string[] {
  // Convert to lowercase and remove punctuation
  const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');

  // Split into words and filter out common words and short words
  const words = cleanText
    .split(/\s+/)
    .filter(word => word.length > 2 && !COMMON_WORDS.has(word));

  // Count word frequency
  const wordFrequency: Record<string, number> = {};
  words.forEach(word => {
    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
  });

  // Sort by frequency and take top keywords
  return Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Calculates the similarity between two sets of keywords
 * @param keywords1 - First set of keywords
 * @param keywords2 - Second set of keywords
 * @returns Similarity score between 0 and 1
 */
export function calculateKeywordSimilarity(
  keywords1: string[],
  keywords2: string[]
): number {
  // Convert arrays to sets for efficient intersection and union calculation
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  // Calculate intersection
  const intersection = new Set([...set1].filter(x => set2.has(x)));

  // Calculate union
  const union = new Set([...set1, ...set2]);

  // Return Jaccard similarity coefficient
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Identifies clusters of related messages in a conversation
 * @param messages - Array of chat messages to cluster
 * @param similarityThreshold - Threshold for considering messages related (0-1)
 * @returns Array of message clusters
 */
export function identifyMessageClusters(
  messages: ChatMessage[],
  similarityThreshold = 0.15
): MessageCluster[] {
  // Initialize clusters array
  const clusters: MessageCluster[] = [];

  // Create a separate cluster for system messages
  const systemMessages = messages.filter(msg => msg.role === 'system');
  if (systemMessages.length > 0) {
    clusters.push({
      id: uuidv4(),
      topic: 'system instructions',
      messages: systemMessages,
      importance: 1.0, // System messages are always important
      totalTokens: systemMessages.reduce(
        (sum, msg) => sum + (msg.tokens || 0),
        0
      ),
    });
  }

  // Process non-system messages
  const conversationMessages = messages.filter(msg => msg.role !== 'system');

  // Extract keywords for each message
  const messageKeywords = conversationMessages.map(msg => ({
    message: msg,
    keywords: extractKeywords(msg.content),
  }));

  // First pass: Create initial clusters based on exact content matches
  const processedMessageIds = new Set<string>();

  // Group messages by topic keywords
  for (let i = 0; i < messageKeywords.length; i++) {
    const { message, keywords } = messageKeywords[i];

    // Skip if already processed
    if (message.id && processedMessageIds.has(message.id)) continue;

    // Find related messages
    const relatedMessages: ChatMessage[] = [message];
    const allKeywords = new Set(keywords);

    // Mark as processed
    if (message.id) processedMessageIds.add(message.id);

    // Look for related messages
    for (let j = 0; j < messageKeywords.length; j++) {
      if (i === j) continue; // Skip self

      const otherMsg = messageKeywords[j];

      // Skip if already processed
      if (otherMsg.message.id && processedMessageIds.has(otherMsg.message.id))
        continue;

      // Check for content similarity
      const similarity = calculateKeywordSimilarity(
        keywords,
        otherMsg.keywords
      );

      if (similarity >= similarityThreshold) {
        relatedMessages.push(otherMsg.message);

        // Add keywords to the combined set
        otherMsg.keywords.forEach(kw => allKeywords.add(kw));

        // Mark as processed
        if (otherMsg.message.id) processedMessageIds.add(otherMsg.message.id);
      }
    }

    // Create a new cluster if we found related messages
    if (relatedMessages.length > 0) {
      // Get top keywords for topic
      const topicKeywords = Array.from(allKeywords).slice(0, 3).join(', ');

      clusters.push({
        id: uuidv4(),
        topic: `Topic: ${topicKeywords}`,
        messages: relatedMessages,
        importance: 0.5, // Initial importance, will be recalculated
        totalTokens: relatedMessages.reduce(
          (sum, msg) => sum + (msg.tokens || 0),
          0
        ),
      });
    }
  }

  // Second pass: Assign any remaining messages to the most similar cluster
  for (const { message, keywords } of messageKeywords) {
    // Skip if already processed
    if (message.id && processedMessageIds.has(message.id)) continue;

    let bestCluster: MessageCluster | null = null;
    let bestSimilarity = 0;

    // Find the most similar cluster
    for (const cluster of clusters) {
      // Skip system messages cluster
      if (cluster.topic === 'system instructions') continue;

      // Get all keywords from the cluster
      const clusterKeywords = extractKeywords(
        cluster.messages.map(m => m.content).join(' ')
      );

      const similarity = calculateKeywordSimilarity(keywords, clusterKeywords);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = cluster;
      }
    }

    // Add to the best cluster or create a new one
    if (bestCluster && bestSimilarity > 0.1) {
      bestCluster.messages.push(message);
      bestCluster.totalTokens =
        (bestCluster.totalTokens || 0) + (message.tokens || 0);
    } else {
      // Create a new single-message cluster
      clusters.push({
        id: uuidv4(),
        topic: `Topic: ${keywords.slice(0, 3).join(', ')}`,
        messages: [message],
        importance: 0.5,
        totalTokens: message.tokens || 0,
      });
    }

    // Mark as processed
    if (message.id) processedMessageIds.add(message.id);
  }

  // Calculate importance for each cluster
  return calculateClusterImportance(clusters);
}

/**
 * Calculates importance scores for each cluster
 * @param clusters - Array of message clusters
 * @returns Array of clusters with updated importance scores
 */
export function calculateClusterImportance(
  clusters: MessageCluster[]
): MessageCluster[] {
  return clusters.map(cluster => {
    // Skip system messages, they're already set to highest importance
    if (cluster.topic === 'system instructions') return cluster;

    let importance = 0.5; // Base importance

    // Factor 1: Recency - more recent clusters are more important
    const timestamps = cluster.messages.map(msg =>
      msg.timestamp instanceof Date ? msg.timestamp.getTime() : Date.now()
    );
    const maxTimestamp = Math.max(...timestamps);
    const recencyFactor = (maxTimestamp / Date.now()) * 0.3; // Scale to 0-0.3

    // Factor 2: Size - larger clusters (more messages) are more important
    const sizeFactor = Math.min(cluster.messages.length / 10, 1) * 0.2; // Scale to 0-0.2

    // Factor 3: Questions - clusters with questions are more important
    const hasQuestions = cluster.messages.some(
      msg => msg.role === 'user' && msg.content.includes('?')
    );
    const questionFactor = hasQuestions ? 0.3 : 0;

    // Calculate total importance
    importance += recencyFactor + sizeFactor + questionFactor;

    // Ensure importance is between 0 and 1
    importance = Math.max(0, Math.min(importance, 0.95)); // Cap at 0.95 to ensure system messages are most important

    return {
      ...cluster,
      importance,
    };
  });
}

/**
 * Optimizes context by removing least important clusters first
 * @param session - Session object containing messages and settings
 * @param targetTokens - Target token count to reduce to
 * @returns Optimized array of messages
 */
export function optimizeContextByClusters(
  session: ChatSession,
  targetTokens: number
): ChatMessage[] {
  const { messages, contextSettings } = session;

  // Identify clusters in the conversation
  const clusters = identifyMessageClusters(messages);

  // Sort clusters by importance (lowest first)
  const sortedClusters = [...clusters].sort(
    (a, b) => a.importance - b.importance
  );

  // Initial set of messages to keep (start with all)
  let optimizedMessages = [...messages];
  let currentTokenCount = optimizedMessages.reduce(
    (sum, msg) => sum + (msg.tokens || 0),
    0
  );

  debugLog(
    'Message Clustering',
    `Starting optimization with ${currentTokenCount} tokens (target: ${targetTokens})`
  );
  debugLog('Message Clustering', `Found ${clusters.length} clusters`);

  // Preserve recent messages
  const preserveRecentCount = contextSettings?.preserveRecentMessages || 2;
  const recentMessages = messages.slice(-preserveRecentCount);
  const recentMessageIds = new Set(recentMessages.map(msg => msg.id));

  // Preserve system messages
  const systemMessageIds = new Set(
    messages.filter(msg => msg.role === 'system').map(msg => msg.id)
  );

  // Messages that must be preserved
  const preserveMessageIds = new Set([
    ...recentMessageIds,
    ...systemMessageIds,
  ]);

  // Remove clusters one by one, starting with least important, until we hit target
  for (const cluster of sortedClusters) {
    // Skip if we're already under target
    if (currentTokenCount <= targetTokens) break;

    // Don't remove clusters containing messages that must be preserved
    const containsPreservedMessages = cluster.messages.some(
      msg => msg.id && preserveMessageIds.has(msg.id)
    );

    if (containsPreservedMessages) {
      debugLog(
        'Message Clustering',
        `Keeping cluster "${
          cluster.topic
        }" (importance: ${cluster.importance.toFixed(
          2
        )}) - contains preserved messages`
      );
      continue;
    }

    // Remove this cluster's messages
    const clusterMessageIds = new Set(cluster.messages.map(msg => msg.id));
    optimizedMessages = optimizedMessages.filter(
      msg => !msg.id || !clusterMessageIds.has(msg.id)
    );

    // Update token count
    currentTokenCount -= cluster.totalTokens || 0;

    debugLog(
      'Message Clustering',
      `Removed cluster "${
        cluster.topic
      }" (importance: ${cluster.importance.toFixed(2)}) - ${
        cluster.messages.length
      } messages, ${cluster.totalTokens} tokens`
    );
    debugLog(
      'Message Clustering',
      `Current token count: ${currentTokenCount} / ${targetTokens}`
    );
  }

  return optimizedMessages;
}

/**
 * Updates the SessionManager to support cluster-based truncation
 * @param session - Session to optimize
 * @param targetTokens - Target token count after optimization
 * @returns Optimized messages
 */
export function handleClusterTruncation(
  session: ChatSession,
  targetTokens: number
): ChatMessage[] {
  if (session.contextSettings?.truncationStrategy !== 'cluster') {
    // If not using cluster strategy, return original messages
    return session.messages;
  }

  return optimizeContextByClusters(session, targetTokens);
}
