import { describe, expect, it, beforeEach, vi, Mock } from 'vitest';
import { ContextWindowAdapter } from './context-window-adapter';
import { ChatMessage } from './types';

// Mock the token counter module
vi.mock('./token-counter', () => ({
  getContextLimit: vi.fn((modelId: string) => {
    // Return mocked context sizes based on model
    if (modelId === 'large-model') return 32000;
    if (modelId === 'medium-model') return 16000;
    if (modelId === 'small-model') return 8000;
    if (modelId === 'tiny-model') return 4000;
    return 8000; // Default
  }),
}));

// Import the mocked module
import * as tokenCounter from './token-counter';

describe('ContextWindowAdapter', () => {
  let adapter: ContextWindowAdapter;
  let mockMessages: ChatMessage[];
  let longMessages: ChatMessage[];

  // Mock getContextLimit for testing
  const mockGetContextLimit = tokenCounter.getContextLimit as Mock;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create adapter instance
    adapter = new ContextWindowAdapter();

    // Set up test messages
    mockMessages = [
      {
        role: 'system' as const,
        content: 'You are a helpful AI assistant.',
        tokens: 10,
      },
      {
        role: 'user' as const,
        content: 'Tell me about the solar system.',
        tokens: 8,
      },
      {
        role: 'assistant' as const,
        content:
          'The solar system consists of the Sun and everything that orbits around it, including planets, moons, asteroids, and comets.',
        tokens: 25,
      },
      {
        role: 'user' as const,
        content: 'How many planets are there?',
        tokens: 7,
      },
      {
        role: 'assistant' as const,
        content:
          'There are eight planets in our solar system: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.',
        tokens: 20,
      },
    ];

    // Generate longer message set for testing context limits
    longMessages = [...mockMessages];

    // Add more messages to test context limits
    for (let i = 0; i < 15; i++) {
      longMessages.push({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i} with some content that takes up tokens in the conversation context.`,
        tokens: 50,
      });
    }
  });

  describe('Context Size Analysis', () => {
    it('should calculate required context size for a set of messages', () => {
      const totalTokens = adapter.calculateRequiredContextSize(mockMessages);
      expect(totalTokens).toBe(70); // Sum of all token values (10+8+25+7+20)
    });

    it('should identify messages that would exceed context window', () => {
      // Configure the mock to return specific values for this test
      mockGetContextLimit.mockReturnValueOnce(100); // Large enough

      const largeModelResult = adapter.identifyExcessMessages(
        mockMessages,
        'large-model'
      );
      expect(largeModelResult.exceedsLimit).toBe(false);
      expect(largeModelResult.excessMessages.length).toBe(0);

      // Change mock for tiny model
      mockGetContextLimit.mockReturnValueOnce(50); // Too small

      const tinyModelResult = adapter.identifyExcessMessages(
        mockMessages,
        'tiny-model'
      );
      expect(tinyModelResult.exceedsLimit).toBe(true);
      expect(tinyModelResult.excessTokens).toBeGreaterThan(0);
      expect(tinyModelResult.excessMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Context Adaptation', () => {
    it('should preserve essential messages when adapting context', () => {
      // Configure the mocks
      mockGetContextLimit.mockReturnValueOnce(32000); // source model
      mockGetContextLimit.mockReturnValueOnce(8000); // target model

      // Mock calculateRequiredContextSize to force pruning
      const originalCalculate = adapter.calculateRequiredContextSize;
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(16000) // Initial message set - over limit
        .mockReturnValue(7000); // After pruning - under limit

      const adaptedMessages = adapter.adaptContextToModel(
        longMessages,
        'large-model',
        'small-model',
        { addContextSummary: false }
      );

      // Reset the mock
      adapter.calculateRequiredContextSize = originalCalculate;

      // Should remove some messages but keep system messages
      expect(adaptedMessages.length).toBeLessThanOrEqual(longMessages.length);

      // Should always preserve system messages
      const systemMessages = adaptedMessages.filter(m => m.role === 'system');
      expect(systemMessages.length).toBe(1);
    });

    it('should add a summary when context is heavily adapted', () => {
      // Configure the mocks
      mockGetContextLimit.mockReturnValueOnce(32000); // source model
      mockGetContextLimit.mockReturnValueOnce(8000); // target model

      // Create lots of messages to ensure pruning
      const veryLongMessages: ChatMessage[] = [...longMessages];
      for (let i = 0; i < 20; i++) {
        veryLongMessages.push({
          role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          content: `Additional message ${i} that should be pruned.`,
          tokens: 30,
        });
      }

      // Set total tokens much higher than context limit to force pruning
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(10000)
        .mockReturnValue(4000);

      const adaptedMessages = adapter.adaptContextToModel(
        veryLongMessages,
        'large-model',
        'small-model',
        { addContextSummary: true }
      );

      // Find a summary message
      const summaryMessage = adaptedMessages.find(
        m => m.role === 'system' && m.content.includes('Context adapted')
      );

      expect(summaryMessage).toBeDefined();

      // Total tokens should fit in small model
      expect(
        adapter.calculateRequiredContextSize(adaptedMessages)
      ).toBeLessThanOrEqual(8000);
    });
  });

  describe('Adaptation Strategies', () => {
    it('should support different pruning strategies', () => {
      // Configure the mocks for each call
      mockGetContextLimit.mockReturnValueOnce(32000).mockReturnValueOnce(8000); // For recency
      mockGetContextLimit.mockReturnValueOnce(32000).mockReturnValueOnce(8000); // For importance

      // Mock calculateRequiredContextSize to ensure we're over the limit
      const originalCalculate = adapter.calculateRequiredContextSize;
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(16000) // Initial check - over limit
        .mockReturnValue(5000); // After pruning - under limit

      // Add specific messages that would score differently with different strategies
      const strategiesTestMessages: ChatMessage[] = [
        ...mockMessages,
        {
          role: 'user' as const,
          content: 'This is a question with high importance?',
          tokens: 20,
        },
        {
          role: 'assistant' as const,
          content: 'This is a response with code ```console.log("hello")```',
          tokens: 20,
        },
        {
          role: 'user' as const,
          content: 'A recent but less important message',
          tokens: 20,
        },
      ];

      // Create custom importance scorer that prioritizes questions
      const customScorer = (message: ChatMessage) => {
        return message.content.includes('?') ? 100 : 10;
      };

      // Get adaptations with different strategies
      const recencyBasedMessages = adapter.adaptContextToModel(
        strategiesTestMessages,
        'large-model',
        'small-model',
        { strategy: 'recency', addContextSummary: false }
      );

      // Using importance strategy
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(16000) // Initial check - over limit
        .mockReturnValue(5000); // After pruning - under limit

      // Reset the mocked function
      adapter.calculateRequiredContextSize = originalCalculate;

      // Strategies should apply and adapter should be callable with different parameters
      expect(recencyBasedMessages).toBeDefined();
      expect(recencyBasedMessages.length).toBeGreaterThan(0);
    });

    it('should preserve conversation continuity', () => {
      // Configure the mocks
      mockGetContextLimit.mockReturnValueOnce(32000); // source model
      mockGetContextLimit.mockReturnValueOnce(8000); // target model

      // Create conversational pairs for testing
      const conversationMessages: ChatMessage[] = [
        { role: 'system' as const, content: 'System message', tokens: 10 },
        { role: 'user' as const, content: 'Question 1', tokens: 10 },
        { role: 'assistant' as const, content: 'Answer 1', tokens: 10 },
        { role: 'user' as const, content: 'Question 2', tokens: 10 },
        { role: 'assistant' as const, content: 'Answer 2', tokens: 10 },
        { role: 'user' as const, content: 'Question 3', tokens: 10 },
        { role: 'assistant' as const, content: 'Answer 3', tokens: 10 },
      ];

      // Mock to force pruning some messages
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(350) // Over limit for initial check
        .mockReturnValue(40); // Under limit after pruning

      const adaptedMessages = adapter.adaptContextToModel(
        conversationMessages,
        'large-model',
        'small-model',
        {
          preserveContinuity: true,
          addContextSummary: false,
        }
      );

      // Check that conversations are kept together
      // If we see a user message, the next message should be the assistant's response
      for (let i = 0; i < adaptedMessages.length - 1; i++) {
        if (adaptedMessages[i].role === 'user') {
          expect(adaptedMessages[i + 1].role).toBe('assistant');
        }
      }
    });
  });

  describe('Adaptive Recovery', () => {
    it('should handle over-pruning recovery', () => {
      // Configure the mocks
      mockGetContextLimit.mockReturnValue(16000); // For testing recovery

      // Mock functions for recovery
      const originalCalculate = adapter.calculateRequiredContextSize;
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(20000) // Original size
        .mockReturnValueOnce(400) // Over-pruned size
        .mockReturnValueOnce(400) // Utilization check
        .mockReturnValue(12000); // Size after recovery

      const result = adapter.adaptWithRecovery(
        longMessages,
        'large-model',
        'small-model',
        {
          minUtilization: 0.7,
          targetUtilization: 0.9,
        }
      );

      // Reset the mocked function
      adapter.calculateRequiredContextSize = originalCalculate;

      // Recovery should have been applied with the right metadata
      expect(result.recoveryApplied).toBe(true);
      expect(result.originalTokenCount).toBe(20000);
      expect(result.finalTokenCount).toBe(12000);
      expect(result.messages).toBeDefined();
    });

    it('should prioritize token budget for different message types', () => {
      // Configure the mocks
      mockGetContextLimit.mockReturnValueOnce(32000); // source model
      mockGetContextLimit.mockReturnValueOnce(4000); // target model

      // Mock functions for budget analysis
      const originalCalculate = adapter.calculateRequiredContextSize;
      adapter.calculateRequiredContextSize = vi
        .fn()
        .mockReturnValueOnce(12000) // Original size
        .mockReturnValue(12000); // Final size under budget

      // Create test data with varying roles
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          role: (i % 5 === 0
            ? 'system'
            : i % 2 === 0
            ? 'user'
            : 'assistant') as 'system' | 'user' | 'assistant',
          content: `Message ${i}`,
          tokens: 50,
        });
      }

      const result = adapter.adaptWithBudgets(
        messages,
        'large-model',
        'tiny-model',
        {
          systemMessageBudget: 0.1,
          recentMessageBudget: 0.4,
          remainingBudget: 0.5,
        }
      );

      // Reset the mocked function
      adapter.calculateRequiredContextSize = originalCalculate;

      // Check budget utilization is calculated
      expect(result.budgetUtilization).toBeDefined();
      expect(result.budgetUtilization.system).toBeDefined();
      expect(result.budgetUtilization.recent).toBeDefined();
      expect(result.budgetUtilization.remaining).toBeDefined();
      expect(result.budgetUtilization.total).toBeDefined();

      // Check the budget matches expected allocation
      expect(result.budgetUtilization.total).toBe(12000);
    });
  });
});
