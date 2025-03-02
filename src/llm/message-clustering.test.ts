import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session';
import * as messageClustering from './message-clustering';
import { ChatMessage, MessageCluster } from './types';

// Mock external dependencies
vi.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Mock response' }],
        }),
      },
    })),
  };
});

// Mock server dependencies
vi.mock('../server/discovery', () => ({
  ServerDiscovery: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue({
      client: { callTool: vi.fn() },
      capabilities: { tools: [], resources: [] },
    }),
  })),
}));

vi.mock('../server/launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue(undefined),
    getServerProcess: vi.fn().mockReturnValue({
      pid: 123,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    }),
  })),
}));

describe('Message Clustering', () => {
  let sessionManager: SessionManager;
  let mockMessages: ChatMessage[];

  beforeEach(() => {
    sessionManager = new SessionManager();

    // Mock a conversation with multiple topics
    mockMessages = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
        id: 'system-1',
        timestamp: new Date(Date.now() - 10000),
        tokens: 10,
      },
      // First topic: Weather
      {
        role: 'user',
        content: "What's the weather like in New York?",
        id: 'user-1',
        timestamp: new Date(Date.now() - 9000),
        tokens: 10,
      },
      {
        role: 'assistant',
        content:
          'The weather in New York is currently sunny with a high of 75°F.',
        id: 'assistant-1',
        timestamp: new Date(Date.now() - 8500),
        tokens: 15,
      },
      {
        role: 'user',
        content: 'What about the weather forecast for tomorrow?',
        id: 'user-2',
        timestamp: new Date(Date.now() - 8000),
        tokens: 10,
      },
      {
        role: 'assistant',
        content:
          'Tomorrow will be partly cloudy with a chance of rain in the afternoon. High of 70°F.',
        id: 'assistant-2',
        timestamp: new Date(Date.now() - 7500),
        tokens: 20,
      },
      // Second topic: Restaurants
      {
        role: 'user',
        content:
          "Let's switch topics. Can you recommend some good restaurants in New York?",
        id: 'user-3',
        timestamp: new Date(Date.now() - 7000),
        tokens: 15,
      },
      {
        role: 'assistant',
        content:
          "New York has many excellent restaurants! Some top recommendations include Le Bernardin for seafood, Eleven Madison Park for fine dining, and Katz's Delicatessen for a classic NY deli experience.",
        id: 'assistant-3',
        timestamp: new Date(Date.now() - 6500),
        tokens: 35,
      },
      {
        role: 'user',
        content: "What's the price range for Le Bernardin?",
        id: 'user-4',
        timestamp: new Date(Date.now() - 6000),
        tokens: 10,
      },
      {
        role: 'assistant',
        content:
          'Le Bernardin is an upscale restaurant where dinner typically costs $150-$250 per person, not including drinks and gratuity.',
        id: 'assistant-4',
        timestamp: new Date(Date.now() - 5500),
        tokens: 25,
      },
      // Third topic: Museums
      {
        role: 'user',
        content:
          "Now I'd like to learn about museums in New York. Which ones should I visit?",
        id: 'user-5',
        timestamp: new Date(Date.now() - 5000),
        tokens: 15,
      },
      {
        role: 'assistant',
        content:
          'New York has world-class museums! The most popular include the Metropolitan Museum of Art (the Met), Museum of Modern Art (MoMA), American Museum of Natural History, and the Guggenheim Museum.',
        id: 'assistant-5',
        timestamp: new Date(Date.now() - 4500),
        tokens: 40,
      },
      {
        role: 'user',
        content: 'How much is admission to the Met?',
        id: 'user-6',
        timestamp: new Date(Date.now() - 4000),
        tokens: 10,
      },
      {
        role: 'assistant',
        content:
          'Admission to the Metropolitan Museum of Art is $25 for adults, $17 for seniors, and $12 for students. New York State residents and NY, NJ, CT students can pay what they wish.',
        id: 'assistant-6',
        timestamp: new Date(Date.now() - 3500),
        tokens: 35,
      },
    ];
  });

  describe('identifyMessageClusters', () => {
    it('should identify distinct topic clusters in messages', () => {
      // Act
      const clusters = messageClustering.identifyMessageClusters(mockMessages);

      // Assert
      expect(clusters).to.be.an('array');
      expect(clusters.length).to.be.greaterThanOrEqual(3); // Should identify at least 3 clusters (weather, restaurants, museums)

      // Verify cluster structure
      const firstCluster = clusters[0];
      expect(firstCluster).to.have.property('topic');
      expect(firstCluster).to.have.property('messages');
      expect(firstCluster).to.have.property('importance');
      expect(firstCluster.messages).to.be.an('array');
    });

    it('should assign system messages to a separate cluster', () => {
      // Act
      const clusters = messageClustering.identifyMessageClusters(mockMessages);

      // Assert
      const systemCluster = clusters.find(cluster =>
        cluster.messages.some(msg => msg.role === 'system')
      );

      expect(systemCluster).to.exist;
      expect(systemCluster?.topic.toLowerCase()).to.include('system');
    });

    it('should keep related messages in the same cluster', () => {
      // Force a lower similarity threshold to ensure related messages are clustered together
      const clusters = messageClustering.identifyMessageClusters(
        mockMessages,
        0.05
      );

      // Find weather-related cluster
      const weatherCluster = clusters.find(cluster =>
        cluster.messages.some(msg =>
          msg.content.toLowerCase().includes('weather')
        )
      );

      // Find restaurant-related cluster
      const restaurantCluster = clusters.find(cluster =>
        cluster.messages.some(msg =>
          msg.content.toLowerCase().includes('restaurant')
        )
      );

      // Find museum-related cluster
      const museumCluster = clusters.find(cluster =>
        cluster.messages.some(msg =>
          msg.content.toLowerCase().includes('museum')
        )
      );

      // Assert
      expect(weatherCluster).to.exist;
      expect(restaurantCluster).to.exist;
      expect(museumCluster).to.exist;

      // Check that related messages are in the right clusters
      expect(
        weatherCluster?.messages.some(msg => msg.content.includes('tomorrow'))
      ).to.be.true;
      expect(
        restaurantCluster?.messages.some(msg =>
          msg.content.includes('Le Bernardin')
        )
      ).to.be.true;
      expect(museumCluster?.messages.some(msg => msg.content.includes('Met')))
        .to.be.true;
    });
  });

  describe('calculateClusterImportance', () => {
    it('should assign higher importance to clusters with questions and recent messages', () => {
      // Create mock clusters
      const mockClusters = [
        {
          id: 'system-cluster',
          topic: 'system instructions',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
          ],
          importance: 1.0,
          totalTokens: 10,
        },
        {
          id: 'weather-cluster',
          topic: 'Topic: weather, forecast, tomorrow',
          messages: [
            {
              role: 'user',
              content: "What's the weather like?",
              timestamp: new Date(Date.now() - 5000),
            },
          ],
          importance: 0.5,
          totalTokens: 10,
        },
        {
          id: 'museum-cluster',
          topic: 'Topic: museum, admission, met',
          messages: [
            {
              role: 'user',
              content: 'How much is admission to the Met?',
              timestamp: new Date(),
            },
          ],
          importance: 0.5,
          totalTokens: 10,
        },
      ];

      // Call the function
      const result = messageClustering.calculateClusterImportance(
        mockClusters as any
      );

      // Find the clusters in the result
      const systemCluster = result.find(c => c.id === 'system-cluster');
      const weatherCluster = result.find(c => c.id === 'weather-cluster');
      const museumCluster = result.find(c => c.id === 'museum-cluster');

      // Assert
      expect(systemCluster).to.exist;
      expect(weatherCluster).to.exist;
      expect(museumCluster).to.exist;

      // System cluster should have highest importance
      expect(systemCluster?.importance).to.equal(1.0);

      // Museum cluster should have higher importance than weather (more recent + has question)
      expect(museumCluster?.importance).to.be.greaterThanOrEqual(
        weatherCluster?.importance
      );

      // Both should have importance values between 0 and 1
      expect(museumCluster?.importance).to.be.lessThan(1);
      expect(museumCluster?.importance).to.be.greaterThan(0);
      expect(weatherCluster?.importance).to.be.lessThan(1);
      expect(weatherCluster?.importance).to.be.greaterThan(0);
    });
  });

  describe('optimizeContextByClusters', () => {
    it('should remove least important clusters first when optimizing context', () => {
      // Create a mock session with context settings
      const mockSession = {
        id: 'test-session',
        messages: mockMessages,
        contextSettings: {
          maxTokenLimit: 100, // Set a small limit to force optimization
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 2,
          truncationStrategy: 'cluster',
        },
        tokenMetrics: {
          totalTokens: 250, // Sum of all message tokens
          maxContextTokens: 200,
          percentUsed: 125,
        },
        config: {
          model: 'claude-3-5-sonnet-20241022',
        },
        createdAt: new Date(),
        lastActivityAt: new Date(),
        serverClients: new Map(),
        toolCallCount: 0,
        maxToolCalls: 5,
        tools: [],
        resources: [],
      };

      // Override the identifyMessageClusters function to return predictable clusters
      const originalIdentifyMessageClusters =
        messageClustering.identifyMessageClusters;
      vi.spyOn(messageClustering, 'identifyMessageClusters').mockImplementation(
        messages => {
          // Create system cluster
          const systemMessages = messages.filter(msg => msg.role === 'system');
          const systemCluster = {
            id: 'system-cluster',
            topic: 'system instructions',
            messages: systemMessages,
            importance: 1.0,
            totalTokens: systemMessages.reduce(
              (sum, msg) => sum + (msg.tokens || 0),
              0
            ),
          };

          // Create recent messages cluster (high importance)
          const recentMessages = messages.slice(-2);
          const recentCluster = {
            id: 'recent-cluster',
            topic: 'Recent messages',
            messages: recentMessages,
            importance: 0.9,
            totalTokens: recentMessages.reduce(
              (sum, msg) => sum + (msg.tokens || 0),
              0
            ),
          };

          // Create low importance cluster
          const oldMessages = messages.slice(1, 5);
          const oldCluster = {
            id: 'old-cluster',
            topic: 'Old messages',
            messages: oldMessages,
            importance: 0.3,
            totalTokens: oldMessages.reduce(
              (sum, msg) => sum + (msg.tokens || 0),
              0
            ),
          };

          return [systemCluster, recentCluster, oldCluster];
        }
      );

      // Act
      const optimizedMessages = messageClustering.optimizeContextByClusters(
        mockSession as any,
        100 // Target token count
      );

      // Restore original function
      vi.spyOn(messageClustering, 'identifyMessageClusters').mockRestore();

      // Assert
      expect(optimizedMessages.length).to.be.lessThan(mockMessages.length);

      // System messages should be preserved
      expect(optimizedMessages.some(msg => msg.role === 'system')).to.be.true;

      // Most recent messages should be preserved
      const lastOriginalMessage = mockMessages[mockMessages.length - 1];
      const secondLastOriginalMessage = mockMessages[mockMessages.length - 2];

      expect(optimizedMessages).to.deep.include(lastOriginalMessage);
      expect(optimizedMessages).to.deep.include(secondLastOriginalMessage);
    });

    it('should maintain coherence within clusters when optimizing', () => {
      // Generate clusters to identify pairs that should stay together
      const clusters = messageClustering.identifyMessageClusters(mockMessages);

      // Identify a question-answer pair
      let questionId = '';
      let answerId = '';

      for (const cluster of clusters) {
        for (let i = 0; i < cluster.messages.length - 1; i++) {
          if (
            cluster.messages[i].role === 'user' &&
            cluster.messages[i + 1].role === 'assistant'
          ) {
            questionId = cluster.messages[i].id || '';
            answerId = cluster.messages[i + 1].id || '';
            break;
          }
        }
        if (questionId) break;
      }

      // Optimize with a strict token limit
      const optimizedMessages = messageClustering.optimizeContextByClusters(
        {
          messages: mockMessages,
          contextSettings: {
            truncationStrategy: 'cluster',
            preserveSystemMessages: true,
            preserveRecentMessages: 2,
          },
        } as any,
        100 // Target token count
      );

      // Check if both question and answer are either present or absent
      const hasQuestion = optimizedMessages.some(msg => msg.id === questionId);
      const hasAnswer = optimizedMessages.some(msg => msg.id === answerId);

      // Both should either be included or excluded together
      expect(hasQuestion).to.equal(hasAnswer);
    });
  });

  describe('integration with SessionManager', () => {
    it('should integrate with optimizeContext method', async () => {
      // Setup spy on handleClusterTruncation
      const handleClusterTruncationSpy = vi.spyOn(
        messageClustering,
        'handleClusterTruncation'
      );

      // Create a mock session with critical context window
      const mockSession = {
        id: 'test-session',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant',
            tokens: 10,
          },
          { role: 'user', content: 'Hello', tokens: 5 },
          { role: 'assistant', content: 'Hi there', tokens: 5 },
          { role: 'user', content: 'How are you?', tokens: 5 },
          { role: 'assistant', content: 'I am fine', tokens: 5 },
          { role: 'user', content: 'Tell me about AI', tokens: 10 },
          { role: 'assistant', content: 'AI is...', tokens: 50 },
          { role: 'user', content: 'Tell me more', tokens: 5 },
          { role: 'assistant', content: 'Sure...', tokens: 50 },
          { role: 'user', content: 'One more question', tokens: 5 },
          { role: 'assistant', content: 'Yes?', tokens: 5 },
        ],
        config: { model: 'claude-3-sonnet-20240229' },
        tokenMetrics: {
          totalTokens: 500,
          userTokens: 200,
          assistantTokens: 200,
          systemTokens: 50,
          toolTokens: 50,
          percentUsed: 90,
          maxContextTokens: 1000,
          recommendation:
            'Context window is almost full, consider optimization.',
        },
        isContextWindowCritical: true, // Force optimization
        contextSettings: {
          maxTokenLimit: 1000,
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'cluster', // Set to cluster for this test!
        },
      };

      // Create SessionManager instance
      const sessionManager = new SessionManager();

      // Stub getSession to return our mock
      vi.spyOn(sessionManager, 'getSession').mockReturnValue(
        mockSession as any
      );

      // Stub updateTokenMetrics
      vi.spyOn(sessionManager, 'updateTokenMetrics').mockReturnValue({
        totalTokens: 100,
        userTokens: 40,
        assistantTokens: 40,
        systemTokens: 10,
        toolTokens: 10,
        percentUsed: 10,
        maxContextTokens: 1000,
      });

      // Act
      await sessionManager.optimizeContext('test-session');

      // Assert
      expect(handleClusterTruncationSpy).toHaveBeenCalled();
    });
  });
});
