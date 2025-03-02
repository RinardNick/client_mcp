import { expect } from 'chai';
import sinon from 'sinon';
import { SessionManager } from './session';
import * as summarization from './conversation-summarization';
import { ChatMessage, ConversationSummary } from './types';

describe('Conversation Summarization', () => {
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

  describe('createMessageSummary', () => {
    it('should generate a summary for a group of messages', async () => {
      // Arrange
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'What is the capital of France?',
          tokens: 10,
          id: '1',
        },
        {
          role: 'assistant',
          content: 'The capital of France is Paris.',
          tokens: 10,
          id: '2',
        },
        {
          role: 'user',
          content: 'Tell me more about Paris.',
          tokens: 10,
          id: '3',
        },
      ];

      // Act
      const summary = await summarization.createMessageSummary(
        messages,
        mockModel
      );

      // Assert
      expect(summary).to.be.an('object');
      expect(summary.originalMessages).to.have.lengthOf(3);
      expect(summary.summaryText).to.equal(
        'This is a test summary of the conversation.'
      );
      expect(summary.originalTokens).to.equal(30);
      expect(summary.summaryTokens).to.equal(10);
      expect(summary.compressionRatio).to.equal(3); // 30/10 = 3
    });

    it('should include message IDs in the summary', async () => {
      // Arrange
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          tokens: 5,
          id: 'msg-1',
        },
        {
          role: 'assistant',
          content: 'Hi there',
          tokens: 5,
          id: 'msg-2',
        },
      ];

      // Act
      const summary = await summarization.createMessageSummary(
        messages,
        mockModel
      );

      // Assert
      expect(summary.originalMessages).to.eql(['msg-1', 'msg-2']);
    });
  });

  describe('summarizeConversation', () => {
    it('should summarize groups of messages in a conversation', async () => {
      // Arrange
      const sessionId = 'test-session';

      // Create a mock session directly
      const mockSession = {
        id: sessionId,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
            tokens: 10,
            id: 'sys-1',
          },
          { role: 'user', content: 'Question 1', tokens: 10, id: 'user-1' },
          { role: 'assistant', content: 'Answer 1', tokens: 10, id: 'asst-1' },
          { role: 'user', content: 'Question 2', tokens: 10, id: 'user-2' },
          { role: 'assistant', content: 'Answer 2', tokens: 10, id: 'asst-2' },
          { role: 'user', content: 'Question 3', tokens: 10, id: 'user-3' },
          { role: 'assistant', content: 'Answer 3', tokens: 10, id: 'asst-3' },
        ],
        tokenMetrics: { totalTokens: 70 },
        config: { model: mockModel },
        contextSettings: {
          maxTokenLimit: 100,
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 2,
          truncationStrategy: 'summarize',
        },
      };

      // Mock the session's getSession method to access the test session
      const getSessionStub = sandbox.stub(sessionManager, 'getSession');
      getSessionStub.returns(mockSession);

      // Act
      const result = await summarization.summarizeConversation(
        sessionId,
        sessionManager
      );

      // Assert
      expect(result.summaries).to.have.lengthOf.at.least(1);
      expect(result.tokensSaved).to.be.greaterThan(0);
      expect(result.messagesProcessed).to.be.greaterThan(0);
    });
  });

  describe('Integration with SessionManager', () => {
    it('should integrate with optimizeContext for summarization strategy', async () => {
      // Arrange
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
          totalTokens: 200,
          userTokens: 50,
          assistantTokens: 100,
          systemTokens: 20,
          toolTokens: 30,
          percentUsed: 90,
          maxContextTokens: 200,
          recommendation:
            'Context window is almost full, consider optimization.',
        },
        isContextWindowCritical: true,
        contextSettings: {
          maxTokenLimit: 200,
          autoTruncate: true,
          preserveSystemMessages: true,
          preserveRecentMessages: 4,
          truncationStrategy: 'summarize',
        },
      };

      // Create stubs and spies
      const truncateBySummarizationStub = sinon
        .stub(SessionManager.prototype, 'truncateBySummarization')
        .resolves([]);
      const sessionManager = new SessionManager();
      const getSessionStub = sinon
        .stub(sessionManager, 'getSession')
        .returns(mockSession as any);
      const updateMetricsStub = sinon
        .stub(sessionManager, 'updateTokenMetrics')
        .returns({
          totalTokens: 100,
          userTokens: 25,
          assistantTokens: 50,
          systemTokens: 10,
          toolTokens: 15,
          percentUsed: 50,
          maxContextTokens: 200,
        });

      // Act
      await sessionManager.optimizeContext('test-session');

      // Assert
      expect(truncateBySummarizationStub.calledOnce).to.be.true;
    });
  });
});
