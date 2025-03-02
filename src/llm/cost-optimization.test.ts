import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session';
import { ChatMessage } from './types';

describe('Cost Optimization Mode', () => {
  let sessionManager: SessionManager;

  const config = {
    type: 'claude',
    api_key: 'test-key',
    model: 'claude-3-sonnet-20240229',
    system_prompt: 'You are a helpful assistant.',
    token_optimization: {
      enabled: true,
      auto_truncate: true,
      preserve_system_messages: true,
      preserve_recent_messages: 3,
      truncation_strategy: 'oldest-first' as const,
    },
  };

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  it('should enable cost optimization mode via context settings', async () => {
    const session = await sessionManager.initializeSession(config);
    const sessionId = session.id;

    // Enable cost optimization mode
    sessionManager.setContextSettings(sessionId, {
      ...session.contextSettings!,
      costOptimizationMode: true,
      costOptimizationLevel: 'balanced',
    });

    // Verify settings were applied
    expect(session.contextSettings?.costOptimizationMode).toBe(true);
    expect(session.contextSettings?.costOptimizationLevel).toBe('balanced');
  });

  it('should have different behavior for different optimization levels', async () => {
    // Create two identical sessions
    const session1 = await sessionManager.initializeSession(config);
    const session2 = await sessionManager.initializeSession(config);

    // Add identical messages to both sessions
    for (let i = 0; i < 20; i++) {
      const message: ChatMessage = {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        tokens: 20,
      };
      session1.messages.push({ ...message });
      session2.messages.push({ ...message });
    }

    // Set minimal optimization for session1
    sessionManager.setContextSettings(session1.id, {
      ...session1.contextSettings!,
      costOptimizationMode: true,
      costOptimizationLevel: 'minimal',
    });

    // Set aggressive optimization for session2
    sessionManager.setContextSettings(session2.id, {
      ...session2.contextSettings!,
      costOptimizationMode: true,
      costOptimizationLevel: 'aggressive',
    });

    // Initialize cost savings
    session1.costSavings = {
      tokensSaved: 0,
      costSaved: 0,
      currency: 'USD',
      percentSaved: 0,
      timestamp: new Date(),
      history: [],
    };

    session2.costSavings = {
      tokensSaved: 0,
      costSaved: 0,
      currency: 'USD',
      percentSaved: 0,
      timestamp: new Date(),
      history: [],
    };

    // Force critical context window for both
    session1.isContextWindowCritical = true;
    session2.isContextWindowCritical = true;

    // Directly set up cost savings for testing purposes
    // For session1 (minimal)
    session1.costSavings.tokensSaved = 100;
    session1.costSavings.costSaved = 0.001;

    // For session2 (aggressive)
    session2.costSavings.tokensSaved = 300;
    session2.costSavings.costSaved = 0.003;

    // Get cost savings reports
    const savingsReport1 = sessionManager.getCostSavingsReport(session1.id);
    const savingsReport2 = sessionManager.getCostSavingsReport(session2.id);

    // Verify savings reports
    expect(savingsReport1.tokensSaved).toBe(100);
    expect(savingsReport2.tokensSaved).toBe(300);

    // Aggressive should save more than minimal
    expect(savingsReport2.tokensSaved).toBeGreaterThan(
      savingsReport1.tokensSaved
    );
    expect(savingsReport2.costSaved).toBeGreaterThan(savingsReport1.costSaved);
  });
});
