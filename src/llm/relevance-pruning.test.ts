import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session';
import { LLMConfig } from '../config/types';
import { ChatMessage, ContextSettings } from './types';
import { pruneMessagesByRelevance } from './relevance-pruning';

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

describe('Relevance-Based Pruning', () => {
  describe('Basic Pruning Functionality', () => {
    it('should prune messages based on relevance scores', () => {
      // Create a sample set of messages
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          timestamp: new Date(Date.now() - 10000),
          tokens: 10,
        },
        {
          role: 'user',
          content: 'Hello bot.',
          timestamp: new Date(Date.now() - 9000),
          tokens: 5,
        },
        {
          role: 'assistant',
          content: 'Hello! How can I help you today?',
          timestamp: new Date(Date.now() - 8000),
          tokens: 10,
        },
        {
          role: 'user',
          content: 'Tell me about Paris.',
          timestamp: new Date(Date.now() - 7000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content: 'Paris is the capital of France.',
          timestamp: new Date(Date.now() - 6000),
          tokens: 10,
        },
        {
          role: 'user',
          content: 'What is the weather like in Paris today?',
          timestamp: new Date(Date.now() - 5000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content: 'I need to check the weather. Let me use a tool.',
          hasToolCall: true,
          toolCall: {
            name: 'get_weather',
            parameters: { city: 'Paris' },
          },
          timestamp: new Date(Date.now() - 4000),
          tokens: 15,
        },
        {
          role: 'assistant',
          content: 'The weather in Paris today is sunny with a high of 72°F.',
          isToolResult: true,
          timestamp: new Date(Date.now() - 3000),
          tokens: 20,
        },
      ];

      // Define pruning settings
      const settings: ContextSettings = {
        maxTokenLimit: 100,
        autoTruncate: true,
        preserveSystemMessages: true,
        preserveRecentMessages: 2,
        truncationStrategy: 'selective',
      };

      // Target token count we want to achieve
      const targetTokens = 60;

      // Prune messages
      const prunedMessages = pruneMessagesByRelevance(
        messages,
        settings,
        targetTokens
      );

      // Verify system message was preserved
      expect(
        prunedMessages.find((m: ChatMessage) => m.role === 'system')
      ).toBeDefined();

      // Verify recent messages were preserved
      expect(prunedMessages[prunedMessages.length - 2].content).toBe(
        'I need to check the weather. Let me use a tool.'
      );
      expect(prunedMessages[prunedMessages.length - 1].content).toBe(
        'The weather in Paris today is sunny with a high of 72°F.'
      );

      // Verify tool results were preserved (they should have high relevance)
      expect(
        prunedMessages.find((m: ChatMessage) => m.isToolResult)
      ).toBeDefined();

      // Verify total tokens is less than before but meets our target
      const totalTokens = prunedMessages.reduce(
        (sum: number, msg: ChatMessage) => sum + (msg.tokens || 0),
        0
      );
      expect(totalTokens).toBeLessThanOrEqual(targetTokens);
    });

    it('should maintain conversation coherence', () => {
      // Create sample messages with questions and answers
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          timestamp: new Date(Date.now() - 10000),
          tokens: 10,
        },
        // First conversation thread about weather
        {
          role: 'user',
          content: 'What is the weather like in New York?',
          timestamp: new Date(Date.now() - 9000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content: 'The weather in New York is currently rainy.',
          timestamp: new Date(Date.now() - 8500),
          tokens: 10,
        },
        // Second conversation thread about food
        {
          role: 'user',
          content: 'What are some good restaurants in Paris?',
          timestamp: new Date(Date.now() - 8000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content:
            "There are many excellent restaurants in Paris, including Le Jules Verne and L'Ambroisie.",
          timestamp: new Date(Date.now() - 7500),
          tokens: 20,
        },
        // Third conversation thread (the most recent, about museums)
        {
          role: 'user',
          content: 'Tell me about museums in Paris.',
          timestamp: new Date(Date.now() - 7000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content:
            "Paris has many famous museums like the Louvre and Musée d'Orsay.",
          timestamp: new Date(Date.now() - 6500),
          tokens: 15,
        },
        {
          role: 'user',
          content: 'When was the Louvre built?',
          timestamp: new Date(Date.now() - 6000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content:
            'The Louvre Palace was originally built in the late 12th to 13th century. It became a museum in 1793.',
          timestamp: new Date(Date.now() - 5500),
          tokens: 25,
        },
      ];

      // Define pruning settings
      const settings: ContextSettings = {
        maxTokenLimit: 100,
        autoTruncate: true,
        preserveSystemMessages: true,
        preserveRecentMessages: 2,
        truncationStrategy: 'selective',
      };

      // Target token count (force pruning)
      const targetTokens = 70;

      // Prune messages
      const prunedMessages = pruneMessagesByRelevance(
        messages,
        settings,
        targetTokens
      );

      // Verify system message was preserved
      expect(
        prunedMessages.find((m: ChatMessage) => m.role === 'system')
      ).toBeDefined();

      // Verify that we maintained coherence - if we keep a question, we should keep its answer
      const museumQuestion = prunedMessages.findIndex(
        (m: ChatMessage) =>
          m.role === 'user' && m.content === 'Tell me about museums in Paris.'
      );
      const museumAnswer = prunedMessages.findIndex(
        (m: ChatMessage) =>
          m.role === 'assistant' &&
          m.content ===
            "Paris has many famous museums like the Louvre and Musée d'Orsay."
      );

      // If we kept the question, verify we kept the answer
      if (museumQuestion !== -1) {
        expect(museumAnswer).not.toBe(-1);
        expect(museumAnswer).toBe(museumQuestion + 1);
      }

      // Verify the most recent Q&A pair is preserved
      expect(prunedMessages.slice(-2)).toEqual([
        messages[messages.length - 2],
        messages[messages.length - 1],
      ]);

      // Verify total tokens is within target
      const totalTokens = prunedMessages.reduce(
        (sum: number, msg: ChatMessage) => sum + (msg.tokens || 0),
        0
      );
      expect(totalTokens).toBeLessThanOrEqual(targetTokens);
    });
  });

  describe('Integration with SessionManager', () => {
    let sessionManager: SessionManager;
    let config: LLMConfig;

    beforeEach(() => {
      sessionManager = new SessionManager();
      config = {
        type: 'claude',
        api_key: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        system_prompt: 'You are a helpful assistant.',
        token_optimization: {
          truncation_strategy: 'selective',
          auto_truncate: true,
          preserve_system_messages: true,
          preserve_recent_messages: 2,
        },
      };
    });

    it('should apply relevance-based pruning when selective strategy is selected', async () => {
      // Initialize session with selective strategy
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      // Add a bunch of messages manually to simulate a long conversation
      for (let i = 0; i < 10; i++) {
        session.messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `This is message number ${i}`,
          timestamp: new Date(Date.now() - (10 - i) * 1000), // Older to newer
          tokens: 10,
        });
      }

      // Add a tool call & result (should be preserved due to higher relevance)
      session.messages.push({
        role: 'assistant',
        content: 'Let me check that information for you.',
        hasToolCall: true,
        toolCall: {
          name: 'search',
          parameters: { query: 'test' },
        },
        timestamp: new Date(Date.now() - 2000),
        tokens: 15,
      });

      session.messages.push({
        role: 'assistant',
        content: 'Here is the information you requested: test results.',
        isToolResult: true,
        timestamp: new Date(Date.now() - 1000),
        tokens: 15,
      });

      // Force critical context flag and set a low token limit to ensure pruning happens
      session.isContextWindowCritical = true;
      session.contextSettings!.truncationStrategy = 'selective';

      // Set a very tight token limit that will force pruning
      session.contextSettings!.maxTokenLimit = 80;

      // Count messages before optimization
      const messagesBefore = session.messages.length;
      const tokensBefore = session.messages.reduce(
        (sum: number, msg: ChatMessage) => sum + (msg.tokens || 0),
        0
      );

      console.log(
        `Before pruning: ${messagesBefore} messages, ${tokensBefore} tokens`
      );

      // Run optimization
      const optimizedMetrics = sessionManager.optimizeContext(sessionId);

      // Verify behavior
      const messagesAfter = session.messages.length;
      const tokensAfter = session.messages.reduce(
        (sum: number, msg: ChatMessage) => sum + (msg.tokens || 0),
        0
      );

      console.log(
        `After pruning: ${messagesAfter} messages, ${tokensAfter} tokens`
      );

      // Should prune messages
      expect(messagesAfter).toBeLessThan(messagesBefore);

      // System message should be preserved
      expect(session.messages[0].role).toBe('system');

      // Tool call and result should be preserved (high relevance)
      expect(session.messages.some((m: ChatMessage) => m.hasToolCall)).toBe(
        true
      );
      expect(session.messages.some((m: ChatMessage) => m.isToolResult)).toBe(
        true
      );

      // Token usage should be reduced
      expect(optimizedMetrics.totalTokens).toBeLessThan(tokensBefore);
      expect(tokensAfter).toBeLessThanOrEqual(80 * 0.7); // Should be at or below the 70% target
    });
  });
});
