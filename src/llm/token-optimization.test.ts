import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session';
import {
  countTokens,
  calculateMessageTokens,
  getContextLimit,
} from './token-counter';
import { LLMConfig } from '../config/types';
import { ChatMessage } from './types';

// Mock external dependencies like in session.test.ts
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
vi.mock('../../src/server/discovery', () => ({
  ServerDiscovery: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue({
      client: { callTool: vi.fn() },
      capabilities: { tools: [], resources: [] },
    }),
  })),
}));

vi.mock('../../src/server/launcher', () => ({
  ServerLauncher: vi.fn().mockImplementation(() => ({
    launchServer: vi.fn().mockResolvedValue(undefined),
    getServerProcess: vi.fn().mockReturnValue({
      pid: 123,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    }),
  })),
}));

describe('Token Optimization Features', () => {
  let sessionManager: SessionManager;
  let config: LLMConfig;

  beforeEach(() => {
    sessionManager = new SessionManager();
    config = {
      type: 'claude',
      api_key: 'test-key',
      model: 'claude-3-5-sonnet-20241022',
      system_prompt: 'You are a helpful assistant with context optimization.',
      token_optimization: {
        enabled: true,
        auto_truncate: true,
        preserve_system_messages: true,
        preserve_recent_messages: 3,
        truncation_strategy: 'oldest-first',
      },
    };
  });

  describe('Token Counting', () => {
    it('should count tokens accurately', () => {
      const text = 'This is a test message with some content to count tokens.';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('should calculate message tokens by role', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' },
        {
          role: 'assistant',
          content: 'I am doing well, thank you for asking.',
        },
        { role: 'assistant', content: 'Tool result', isToolResult: true },
      ];

      const tokenCounts = calculateMessageTokens(messages);

      expect(tokenCounts.systemTokens).toBeGreaterThan(0);
      expect(tokenCounts.userTokens).toBeGreaterThan(0);
      expect(tokenCounts.assistantTokens).toBeGreaterThan(0);
      expect(tokenCounts.toolTokens).toBeGreaterThan(0);
      expect(tokenCounts.totalTokens).toBe(
        tokenCounts.systemTokens +
          tokenCounts.userTokens +
          tokenCounts.assistantTokens +
          tokenCounts.toolTokens
      );
    });

    it('should retrieve correct context limits by model', () => {
      const opus = getContextLimit('claude-3-opus-20240229');
      const sonnet = getContextLimit('claude-3-5-sonnet-20241022');
      const haiku = getContextLimit('claude-3-haiku-20240307');

      expect(opus).toBeGreaterThan(0);
      expect(sonnet).toBeGreaterThan(0);
      expect(haiku).toBeGreaterThan(0);
    });
  });

  describe('Context Management', () => {
    it('should initialize session with token optimization settings', async () => {
      const session = await sessionManager.initializeSession(config);

      expect(session.contextSettings).toBeDefined();
      expect(session.contextSettings!.autoTruncate).toBe(true);
      expect(session.contextSettings!.preserveSystemMessages).toBe(true);
      expect(session.contextSettings!.preserveRecentMessages).toBe(3);
      expect(session.contextSettings!.truncationStrategy).toBe('oldest-first');
    });

    it('should update context settings', async () => {
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      sessionManager.setContextSettings(sessionId, {
        autoTruncate: false,
        preserveRecentMessages: 5,
      });

      expect(session.contextSettings!.autoTruncate).toBe(false);
      expect(session.contextSettings!.preserveRecentMessages).toBe(5);
      expect(session.contextSettings!.preserveSystemMessages).toBe(true); // Unchanged
    });

    it('should provide token metrics', async () => {
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      const metrics = sessionManager.getSessionTokenUsage(sessionId);

      expect(metrics).toBeDefined();
      expect(metrics.totalTokens).toBeGreaterThan(0); // Should have system message
      expect(metrics.maxContextTokens).toBeGreaterThan(0);
      expect(metrics.percentUsed).toBeGreaterThanOrEqual(0);
      expect(metrics.recommendation).toBeDefined();
    });

    it('should optimize context when approaching limits', async () => {
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      // Add a bunch of messages manually to simulate a long conversation
      for (let i = 0; i < 20; i++) {
        session.messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `This is message number ${i}`,
          timestamp: new Date(Date.now() - (20 - i) * 1000), // Older to newer
          tokens: 10,
        });
      }

      // Force critical context flag
      session.isContextWindowCritical = true;

      // Count messages before optimization
      const messageBefore = session.messages.length;

      // Run optimization
      const optimizedMetrics = sessionManager.optimizeContext(sessionId);

      // Count messages after optimization
      const messagesAfter = session.messages.length;

      // Verify behavior
      expect(messagesAfter).toBeLessThan(messageBefore);
      expect(messagesAfter).toBe(4); // System + 3 recent (from settings)
      expect(session.messages[0].role).toBe('system');
      expect(optimizedMetrics.totalTokens).toBeLessThan(messageBefore * 10);
    });

    it('should skip optimization when auto-truncate is disabled', async () => {
      const session = await sessionManager.initializeSession({
        ...config,
        token_optimization: {
          ...config.token_optimization,
          auto_truncate: false,
        },
      });
      const sessionId = session.id;

      // Add messages
      for (let i = 0; i < 10; i++) {
        session.messages.push({
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date(),
          tokens: 5,
        });
      }

      // Force critical context flag
      session.isContextWindowCritical = true;

      // Count messages before
      const messageBefore = session.messages.length;

      // Run optimization
      sessionManager.optimizeContext(sessionId);

      // Should not truncate when auto-truncate is disabled
      expect(session.messages.length).toBe(messageBefore);
    });

    it('should provide cost estimation', async () => {
      const session = await sessionManager.initializeSession(config);
      const sessionId = session.id;

      // Add some messages to generate token usage
      session.messages.push({
        role: 'user',
        content: 'This is a test message',
        timestamp: new Date(),
        tokens: 10,
      });

      session.messages.push({
        role: 'assistant',
        content: 'This is a response message',
        timestamp: new Date(),
        tokens: 15,
      });

      // Update token metrics
      sessionManager.updateTokenMetrics(sessionId);

      // Get cost estimate
      const cost = sessionManager.getTokenCostEstimate(sessionId);

      expect(cost).toBeDefined();
      expect(cost.inputCost).toBeGreaterThanOrEqual(0);
      expect(cost.outputCost).toBeGreaterThanOrEqual(0);
      expect(cost.totalCost).toBeGreaterThanOrEqual(0);
      expect(cost.totalCost).toBe(cost.inputCost + cost.outputCost);
      expect(cost.currency).toBe('USD');
    });
  });
});
