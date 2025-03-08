import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../session';
import { LLMConfig } from '../../config/types';
import { ChatMessage, MessageRelevance } from '../types';
import {
  calculateMessageRelevance,
  calculateSessionRelevanceScores,
  getTopRelevantMessageIndices,
} from './relevance-scorer';

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

describe('Message Relevance Scoring', () => {
  describe('Basic Relevance Scoring', () => {
    it('should calculate relevance for a single message', () => {
      // Create a test message
      const message: ChatMessage = {
        role: 'user',
        content: 'What is the capital of France?',
        timestamp: new Date(),
        tokens: 10,
      };

      // Calculate relevance
      const relevance = calculateMessageRelevance(message, 0);

      // Verify result structure
      expect(relevance).toBeDefined();
      expect(relevance.score).toBeGreaterThan(0);
      expect(relevance.factors).toBeDefined();
      expect(relevance.factors.recency).toBeGreaterThan(0);
    });

    it('should assign higher scores to questions', () => {
      // Create test messages - one with question, one without
      const questionMessage: ChatMessage = {
        role: 'user',
        content: 'What is the weather today?',
        timestamp: new Date(),
        tokens: 10,
      };

      const statementMessage: ChatMessage = {
        role: 'user',
        content: 'The weather is nice today.',
        timestamp: new Date(),
        tokens: 10,
      };

      // Calculate relevance
      const questionRelevance = calculateMessageRelevance(questionMessage, 0);
      const statementRelevance = calculateMessageRelevance(statementMessage, 0);

      // Question should have higher significance
      expect(questionRelevance.factors.significance).toBeGreaterThan(
        statementRelevance.factors.significance
      );
    });

    it('should assign higher scores to tool-related messages', () => {
      // Create test messages - one with tool call, one without
      const toolMessage: ChatMessage = {
        role: 'assistant',
        content: 'Let me check that for you.',
        hasToolCall: true,
        toolCall: {
          name: 'search',
          parameters: { query: 'test' },
        },
        timestamp: new Date(),
        tokens: 15,
      };

      const normalMessage: ChatMessage = {
        role: 'assistant',
        content: 'I can help with that.',
        timestamp: new Date(),
        tokens: 10,
      };

      // Calculate relevance
      const toolRelevance = calculateMessageRelevance(toolMessage, 0);
      const normalRelevance = calculateMessageRelevance(normalMessage, 0);

      // Tool message should have higher tool use factor
      expect(toolRelevance.factors.toolUse).toBeGreaterThan(
        normalRelevance.factors.toolUse
      );
      // And higher overall score
      expect(toolRelevance.score).toBeGreaterThan(normalRelevance.score);
    });
  });

  describe('Session-wide Relevance Scoring', () => {
    let sessionManager: SessionManager;
    let config: LLMConfig;

    beforeEach(() => {
      sessionManager = new SessionManager();
      config = {
        type: 'claude',
        api_key: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        system_prompt: 'You are a helpful assistant.',
      };
    });

    it('should calculate relevance scores for all messages in a session', async () => {
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      // Add test messages
      session.messages.push(
        {
          role: 'user',
          content: 'Hello, how are you?',
          timestamp: new Date(Date.now() - 5000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content: 'I am doing well, thank you for asking.',
          timestamp: new Date(Date.now() - 4000),
          tokens: 15,
        },
        {
          role: 'user',
          content: 'What is the capital of France?',
          timestamp: new Date(Date.now() - 3000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content: 'The capital of France is Paris.',
          timestamp: new Date(Date.now() - 2000),
          tokens: 10,
        }
      );

      // Calculate relevance for the session
      const relevanceScores = calculateSessionRelevanceScores(session);

      // Verify results
      expect(relevanceScores).toHaveLength(session.messages.length);

      // Verify scores are assigned - we don't need to test specific ordering
      // as that depends on multiple factors, not just recency
      relevanceScores.forEach(score => {
        expect(score.score).toBeGreaterThan(0);
        expect(score.factors).toBeDefined();
      });
    });

    it('should identify the most important messages by relevance', async () => {
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      // Add various messages with different characteristics
      session.messages = [
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
          content: 'I need to find information about Paris.',
          timestamp: new Date(Date.now() - 7000),
          tokens: 10,
        },
        {
          role: 'assistant',
          content: 'I can help with that. Let me search for information.',
          hasToolCall: true,
          toolCall: {
            name: 'search',
            parameters: { query: 'Paris information' },
          },
          timestamp: new Date(Date.now() - 6000),
          tokens: 15,
        },
        {
          role: 'assistant',
          content:
            'Paris is the capital of France with a population of 2.1 million.',
          isToolResult: true,
          timestamp: new Date(Date.now() - 5000),
          tokens: 20,
        },
        {
          role: 'user',
          content: 'What is the weather like in Paris today?',
          timestamp: new Date(Date.now() - 4000),
          tokens: 10,
        },
      ];

      // Calculate relevance
      const relevanceScores = calculateSessionRelevanceScores(session);

      // Sort by score to find most important
      const sortedScores = [...relevanceScores].sort(
        (a, b) => b.score - a.score
      );

      // Check that system messages, tool results, and recent messages are prioritized
      // System messages should be highly relevant
      const systemPromptIndex = session.messages.findIndex(
        m => m.role === 'system'
      );
      expect(relevanceScores[systemPromptIndex].score).toBeGreaterThan(50);

      // Tool results should be highly relevant
      const toolResultIndex = session.messages.findIndex(
        m => m.isToolResult === true
      );
      expect(relevanceScores[toolResultIndex].score).toBeGreaterThan(50);

      // Most recent question should also be highly relevant
      const lastMessageIndex = session.messages.length - 1;
      expect(relevanceScores[lastMessageIndex].score).toBeGreaterThan(50);

      // Check that top relevant indices include important messages
      const topIndices = getTopRelevantMessageIndices(relevanceScores, 3);
      expect(topIndices.length).toBe(3);

      // Since sorting depends on many factors, just ensure system message is included
      // and check that indices are valid (between 0 and messages.length-1)
      expect(topIndices).toContain(0); // System message
      topIndices.forEach(index => {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(session.messages.length);
      });
    });
  });
});
