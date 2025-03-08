import { expect } from 'chai';
import sinon from 'sinon';
import { SessionManager } from '../session';
import * as dynamicSummarization from './dynamic-summarization';
import * as summarization from './conversation-summarization';
import { ChatMessage, ChatSession, ContextSettings } from '../types';

describe('Dynamic Summarization Triggering', () => {
  let sessionManager: SessionManager;
  const mockModel = 'claude-3-sonnet-20240229';
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sessionManager = new SessionManager();

    // Mock the LLM call for summarization to avoid actual API calls
    sandbox.stub(summarization, 'callLLMForSummarization').resolves({
      summaryText: 'This is a test summary of the conversation.',
      summaryTokens: 10,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('shouldTriggerSummarization', () => {
    it('should trigger summarization when token threshold is exceeded', () => {
      // Arrange
      const session = createMockSession({
        tokenMetrics: {
          totalTokens: 8000,
          maxContextTokens: 10000,
          percentUsed: 80,
          userTokens: 4000,
          assistantTokens: 3500,
          systemTokens: 500,
          toolTokens: 0,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          // Adding dynamic summarization settings
          tokenThresholdForSummarization: 75, // 75% threshold
        },
      });

      // Act
      const shouldTrigger =
        dynamicSummarization.shouldTriggerSummarization(session);

      // Assert
      expect(shouldTrigger).to.be.true;
    });

    it('should not trigger summarization when token threshold is not exceeded', () => {
      // Arrange
      const session = createMockSession({
        tokenMetrics: {
          totalTokens: 5000,
          maxContextTokens: 10000,
          percentUsed: 50,
          userTokens: 2500,
          assistantTokens: 2000,
          systemTokens: 500,
          toolTokens: 0,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          tokenThresholdForSummarization: 75, // 75% threshold
        },
      });

      // Act
      const shouldTrigger =
        dynamicSummarization.shouldTriggerSummarization(session);

      // Assert
      expect(shouldTrigger).to.be.false;
    });

    it('should trigger summarization based on time elapsed since last summarization', () => {
      // Arrange
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

      const session = createMockSession({
        tokenMetrics: {
          totalTokens: 5000,
          maxContextTokens: 10000,
          percentUsed: 50,
          userTokens: 2500,
          assistantTokens: 2000,
          systemTokens: 500,
          toolTokens: 0,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          timeBetweenSummarizations: 30, // 30 minutes
        },
        lastSummarizedAt: oneHourAgo,
      });

      // Act
      const shouldTrigger =
        dynamicSummarization.shouldTriggerSummarization(session);

      // Assert
      expect(shouldTrigger).to.be.true;
    });

    it('should not trigger summarization if time elapsed is not sufficient', () => {
      // Arrange
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

      const session = createMockSession({
        tokenMetrics: {
          totalTokens: 5000,
          maxContextTokens: 10000,
          percentUsed: 50,
          userTokens: 2500,
          assistantTokens: 2000,
          systemTokens: 500,
          toolTokens: 0,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          timeBetweenSummarizations: 30, // 30 minutes
        },
        lastSummarizedAt: tenMinutesAgo,
      });

      // Act
      const shouldTrigger =
        dynamicSummarization.shouldTriggerSummarization(session);

      // Assert
      expect(shouldTrigger).to.be.false;
    });

    it('should trigger summarization when topic changes are detected', () => {
      // Arrange
      const session = createMockSession({
        messages: [
          {
            role: 'user',
            content: "Let's talk about Python programming.",
            id: '1',
          },
          {
            role: 'assistant',
            content: 'Sure, what would you like to know about Python?',
            id: '2',
          },
          {
            role: 'user',
            content: 'How do I use list comprehensions?',
            id: '3',
          },
          {
            role: 'assistant',
            content: 'List comprehensions are a concise way to create lists...',
            id: '4',
          },
          {
            role: 'user',
            content:
              "That makes sense. Now, let's switch topics. Can you tell me about gardening?",
            id: '5',
          },
          {
            role: 'assistant',
            content: 'Of course! Gardening is a rewarding hobby...',
            id: '6',
          },
        ],
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          detectTopicChanges: true,
        },
      });

      // Mock the topic change detection function
      sandbox.stub(dynamicSummarization, 'detectTopicChange').returns(true);

      // Act
      const shouldTrigger =
        dynamicSummarization.shouldTriggerSummarization(session);

      // Assert
      expect(shouldTrigger).to.be.true;
    });
  });

  describe('detectTopicChange', () => {
    it('should detect topic changes in conversation', () => {
      // Arrange
      const messages = [
        {
          role: 'user',
          content: "Let's talk about Python programming.",
          id: '1',
        },
        {
          role: 'assistant',
          content: 'Sure, what would you like to know about Python?',
          id: '2',
        },
        { role: 'user', content: 'How do I use list comprehensions?', id: '3' },
        {
          role: 'assistant',
          content: 'List comprehensions are a concise way to create lists...',
          id: '4',
        },
        {
          role: 'user',
          content:
            "That makes sense. Now, let's switch topics. Can you tell me about gardening?",
          id: '5',
        },
        {
          role: 'assistant',
          content: 'Of course! Gardening is a rewarding hobby...',
          id: '6',
        },
      ];

      // Act
      const topicChanged = dynamicSummarization.detectTopicChange(messages);

      // Assert
      expect(topicChanged).to.be.true;
    });

    it('should not detect topic changes in a consistent conversation', () => {
      // Arrange
      const messages = [
        {
          role: 'user',
          content: "Let's talk about Python programming.",
          id: '1',
        },
        {
          role: 'assistant',
          content: 'Sure, what would you like to know about Python?',
          id: '2',
        },
        { role: 'user', content: 'How do I use list comprehensions?', id: '3' },
        {
          role: 'assistant',
          content: 'List comprehensions are a concise way to create lists...',
          id: '4',
        },
        {
          role: 'user',
          content: 'Can you show me an example with filtering?',
          id: '5',
        },
        {
          role: 'assistant',
          content:
            "Here's an example of filtering with a list comprehension...",
          id: '6',
        },
      ];

      // Act
      const topicChanged = dynamicSummarization.detectTopicChange(messages);

      // Assert
      expect(topicChanged).to.be.false;
    });
  });

  describe('getAdaptiveSummarizationSettings', () => {
    it('should increase aggressiveness when context pressure is high', () => {
      // Arrange
      const session = createMockSession({
        tokenMetrics: {
          totalTokens: 9000,
          maxContextTokens: 10000,
          percentUsed: 90,
          userTokens: 4500,
          assistantTokens: 4000,
          systemTokens: 500,
          toolTokens: 0,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          summarizationBatchSize: 3,
        },
      });

      // Act
      const adaptiveSettings =
        dynamicSummarization.getAdaptiveSummarizationSettings(session);

      // Assert
      expect(adaptiveSettings.summarizationBatchSize).to.be.greaterThan(3);
      expect(adaptiveSettings.minCompressionRatio).to.be.lessThan(1.5); // Default is 1.5, should be lower to keep more summaries
    });

    it('should be less aggressive when context pressure is low', () => {
      // Arrange
      const session = createMockSession({
        tokenMetrics: {
          totalTokens: 4000,
          maxContextTokens: 10000,
          percentUsed: 40,
          userTokens: 2000,
          assistantTokens: 1500,
          systemTokens: 500,
          toolTokens: 0,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          summarizationBatchSize: 3,
        },
      });

      // Act
      const adaptiveSettings =
        dynamicSummarization.getAdaptiveSummarizationSettings(session);

      // Assert
      expect(adaptiveSettings.summarizationBatchSize).to.be.lessThanOrEqual(3);
      expect(adaptiveSettings.minCompressionRatio).to.be.greaterThanOrEqual(
        1.5
      ); // Default is 1.5, should be higher for better compression
    });
  });

  describe('Integration with SessionManager', () => {
    it('should dynamically trigger summarization during message sending', async () => {
      // Arrange
      const sessionId = 'test-session';
      // Create a mock session with values that should trigger summarization
      const mockSession = {
        id: sessionId,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        config: {
          model: mockModel,
          api_key: 'test-key',
          type: 'claude',
          system_prompt: 'You are a helpful assistant',
        },
        messages: [{ role: 'user', content: 'Test message', id: 'msg-1' }],
        serverClients: new Map(),
        toolCallCount: 0,
        maxToolCalls: 5,
        tools: [],
        resources: [],
        tokenMetrics: {
          userTokens: 4000,
          assistantTokens: 3500,
          systemTokens: 500,
          toolTokens: 0,
          totalTokens: 8000,
          maxContextTokens: 10000,
          percentUsed: 80,
        },
        contextSettings: {
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
          tokenThresholdForSummarization: 75, // 75% threshold
          dynamicSummarizationEnabled: true,
        },
      };

      // Mock session manager methods
      sandbox.stub(sessionManager, 'getSession').returns(mockSession);

      // Mock the optimizeContext method to avoid actual summarization
      const optimizeContextStub = sandbox.stub(
        sessionManager,
        'optimizeContext'
      );
      optimizeContextStub.resolves({
        totalTokens: 5000,
        percentUsed: 50,
      } as any);

      // Mock the setContextSettings method
      const setContextSettingsStub = sandbox.stub(
        sessionManager,
        'setContextSettings'
      );

      // Act
      const result = await dynamicSummarization.checkAndTriggerSummarization(
        sessionId,
        sessionManager
      );

      // Assert
      expect(result).to.be.true;
      expect(optimizeContextStub.calledOnce).to.be.true;
      expect(setContextSettingsStub.calledOnce).to.be.true;
      expect(mockSession.lastSummarizedAt).to.be.a('date');
    });
  });

  // Helper function to create mock sessions
  function createMockSession(
    overrides: Partial<ChatSession> = {}
  ): ChatSession {
    return {
      id: 'test-session',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      config: {
        model: mockModel,
        api_key: 'test-key',
        type: 'claude',
        system_prompt: 'You are a helpful assistant',
      },
      messages: [],
      serverClients: new Map(),
      toolCallCount: 0,
      maxToolCalls: 5,
      tools: [],
      resources: [],
      tokenMetrics: {
        userTokens: 0,
        assistantTokens: 0,
        systemTokens: 0,
        toolTokens: 0,
        totalTokens: 0,
        maxContextTokens: 100000,
        percentUsed: 0,
      },
      contextSettings: {
        autoTruncate: true,
        preserveSystemMessages: true,
        preserveRecentMessages: 4,
        truncationStrategy: 'summarize',
      },
      ...overrides,
    };
  }
});
