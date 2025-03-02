# Token Usage Monitoring and Context Optimization Plan

This plan outlines the implementation of token usage tracking, monitoring, and intelligent context management for the TS-MCP-Client.

## Overview

To optimize the usage of LLM context windows and provide visibility into token consumption, we will implement a set of features focused on:

1. **Token Usage Tracking**: Count and report tokens used in conversations ✅
2. **Context Window Management**: Detect and manage approaching context limits ✅
3. **Intelligent Context Optimization**: Dynamically prune, summarize, and manage conversation context ⏳
4. **Cost Optimization**: Balance context quality with token usage costs ✅

## Implementation Plan

### Phase 1: Token Usage Tracking ✅

#### 1.1. Add Token Counting Utilities ✅

```
test: Add token counting utilities ✅
```

- **Implement Token Counters** ✅:

  - Add `tiktoken` or equivalent library for accurate token counting ✅
  - Create wrapper functions for different model tokenizers (Claude, GPT, etc.) ✅
  - Implement caching for efficient re-counting ⏳

- **Create Token Counting Service** ✅:
  - Design flexible API for counting tokens across different models ✅
  - Support batch counting for efficient processing of conversation history ✅
  - Add provider-specific token counting rules ✅

#### 1.2. Enhance Session State with Token Tracking ✅

```
test: Add token tracking to ChatSession ✅
```

- **Extend `ChatSession` Interface** ✅:

  ```typescript
  interface TokenMetrics {
    userTokens: number;
    assistantTokens: number;
    systemTokens: number;
    totalTokens: number;
    maxContextTokens: number;
    percentUsed: number;
  }

  interface ChatSession {
    // Existing fields
    tokenMetrics: TokenMetrics;
    modelTokenLimit: number;
  }
  ```

- **Implement Token Accounting** ✅:
  - Track tokens per message in real-time ✅
  - Update session metrics when messages are added ✅
  - Calculate percentage of context window used ✅

#### 1.3. Add Token Usage Reporting API ✅

```
test: Implement token usage reporting API ✅
```

- **Create Reporting Methods** ✅:

  ```typescript
  // Session Manager Extension
  getSessionTokenUsage(sessionId: string): TokenMetrics;
  getTokenCostEstimate(sessionId: string): { cost: number; currency: string; };
  ```

- **Implement Usage Monitoring** ✅:

  - Add event emitters for token usage thresholds ✅
  - Create hooks for approaching context limits ✅
  - Add detailed token breakdown by message type ✅

- **Add Cost Calculation** ✅:
  - Implement model-specific pricing calculations ✅
  - Track token usage costs over time ✅
  - Provide cost forecasting based on usage patterns ⏳

### Phase 2: Context Window Management ✅

#### 2.1. Implement Context Window Detection ✅

```
test: Add context window detection ✅
```

- **Define Model Context Limits** ✅:

  ```typescript
  interface ModelCapabilities {
    provider: string;
    model: string;
    maxTokens: number;
    inputCostPer1K: number;
    outputCostPer1K: number;
    recommendedReserve: number; // Tokens to reserve for response
  }
  ```

- **Add Threshold Monitoring** ✅:
  - Create warning thresholds (e.g., 70%, 85%, 95% of context) ✅
  - Implement event triggers at threshold crossings ✅
  - Track rate of context window consumption ✅

#### 2.2. Basic Context Truncation ✅

```
test: Implement basic context truncation ✅
```

- **Add Auto-Truncation Settings** ✅:

  ```typescript
  interface ContextSettings {
    maxTokenLimit: number; // Override model's default
    autoTruncate: boolean;
    preserveSystemMessages: boolean;
    preserveRecentMessages: number; // Number of recent messages to always keep
    truncationStrategy: 'oldest-first' | 'selective' | 'summarize';
  }
  ```

- **Implement Basic Truncation** ✅:
  - Remove oldest messages when approaching limit ✅
  - Preserve system messages and recent conversation ✅
  - Add recovery mechanism if truncation is too aggressive ⏳

### Phase 3: Intelligent Context Management ⏳

#### 3.1. Message Relevance Scoring ✅

```
test: Add message relevance scoring ✅
```

- **Design Relevance Algorithm** ✅:

  - Score messages based on recency, content significance, and conversation flow ✅
  - Use heuristics like presence of questions, explicit references, or tool calls ✅
  - Weight recent messages higher than older ones ✅

- **Implement Scoring System** ✅:
  ```typescript
  interface MessageRelevance {
    messageId: string;
    score: number; // 0-100 relevance score
    factors: {
      recency: number;
      significance: number;
      reference: number;
      toolUse: number;
    };
  }
  ```

#### 3.2. Relevance-Based Pruning ✅

```
test: Add relevance-based context pruning ✅
```

- **Selective Message Pruning** ✅:

  - Remove messages with lowest relevance scores first ✅
  - Maintain conversation coherence by keeping related messages ✅
  - Preserve critical information like tool results and key facts ✅

- **Implement Pruning Strategy** ✅:
  - Create configurable pruning thresholds ✅
  - Add safety checks to prevent over-pruning ✅
  - Maintain minimal context representation ✅

#### 3.3. Conversation Summarization ✅

```
test: Add conversation summarization ✅
```

- **Design Summarization System** ✅:

  - Create prompts for generating conversation summaries ✅
  - Implement batched summarization of related messages ✅
  - Balance summary detail with token efficiency ✅

- **LLM-based Summarization** ✅:

  - Use LLM to create concise summaries of message groups ✅
  - Preserve key information, decisions, and context ✅
  - Track summarization efficiency (original tokens vs. summary tokens) ✅

- **Implement Integration** ✅:
  ```typescript
  interface ConversationSummary {
    originalMessages: string[]; // IDs of summarized messages
    summaryText: string;
    originalTokens: number;
    summaryTokens: number;
    compressionRatio: number;
  }
  ```

#### 3.4. Dynamic Summarization Triggering ✅

```
test: Add dynamic summarization triggering ✅
```

- **Create Trigger Conditions** ✅:

  - Implement token threshold triggers ✅
  - Add time-based summarization for long sessions ✅
  - Create trigger for topic changes or natural breaking points ✅

- **Design Adaptive Strategy** ✅:
  - Dynamically adjust summarization aggressiveness based on context pressure ✅
  - Use more aggressive summarization when approaching limits ✅
  - Balance summarization with maintaining conversation quality ✅

#### 3.5. Advanced Context Optimization

- ✅ Message Clustering

  - ✅ Implement keyword-based message clustering
  - ✅ Calculate cluster importance based on recency, questions, and size
  - ✅ Optimize context by removing least important clusters first
  - ✅ Maintain coherence within clusters during optimization
  - ✅ Integrate with SessionManager

- ✅ Adaptive Context Strategy

  - ✅ Implement strategy selection based on conversation characteristics
  - ✅ Dynamically switch between strategies based on performance
  - ✅ Track and learn from optimization effectiveness

- ⏳ Cost Optimization Mode
  - ⏳ Implement aggressive token reduction for cost-sensitive applications
  - ⏳ Balance between quality and cost based on user preferences
  - ⏳ Provide cost estimates and savings metrics

### Phase 4: API Extensions and Host Integration ⏳

#### 4.1. Extend Public API ⏳

```
test: Add context management API endpoints ⏳
```

- **Add Management Methods** ✅:

  ```typescript
  // Context Management API
  setContextSettings(sessionId: string, settings: ContextSettings): void;
  optimizeContext(sessionId: string, strategy?: OptimizationStrategy): TokenMetrics;
  getSummarizationStatus(sessionId: string): SummarizationMetrics;
  ```

- **Create Configuration Options** ✅:
  - Expose detailed configuration for context management ✅
  - Add optimization strategy customization ✅
  - Create presets for different use cases (e.g., economy, quality, balanced) ⏳

#### 4.2. Add Monitoring and Alerting ⏳

```
test: Implement token usage webhooks and alerts ⏳
```

- **Implement Monitoring System** ⏳:

  - Create token usage events and webhooks ⏳
  - Add configurable alert thresholds ⏳
  - Implement real-time monitoring dashboard data ⏳

- **Design Alert System** ⏳:
  ```typescript
  interface TokenAlert {
    sessionId: string;
    threshold: number;
    currentUsage: number;
    timestamp: Date;
    recommendation: string;
  }
  ```

#### 4.3. Host Integration Utilities ⏳

```
test: Add host integration utilities for token management ⏳
```

- **Create Visualization Data** ⏳:

  - Implement token usage history export ⏳
  - Add visualization-ready data structures ⏳
  - Create session comparison utilities ⏳

- **Add Host Controls** ⏳:
  - Implement manual context management controls ⏳
  - Create user-facing settings interfaces ⏳
  - Add explanation utilities for optimization decisions ⏳

### Phase 5: Documentation and Examples ⏳

#### 5.1. Technical Documentation ⏳

```
docs: Add technical documentation for token management ⏳
```

- Document token counting methodology ✅
- Create API reference for new token management features ✅
- Add troubleshooting guides for context issues ⏳

#### 5.2. Host Integration Guide ⏳

```
docs: Create host integration guide for context optimization ⏳
```

- Add examples for implementing token monitoring UI ✅
- Create guides for context optimization configuration ✅
- Document best practices for different use cases ⏳

#### 5.3. End-User Facing Documentation ⏳

```
docs: Add user-facing documentation for token usage ⏳
```

- Create explanations of token usage for end users ⏳
- Add guidelines for optimizing prompt efficiency ⏳
- Document cost implications of different usage patterns ⏳

## Implementation Considerations

### Performance

- Token counting must be efficient and non-blocking ✅
- Summarization should happen asynchronously when possible ⏳
- Caching mechanisms for repeated token counting operations ⏳

### Accuracy

- Regular validation of token counting against actual API charges ⏳
- Testing summarization quality across different conversation types ⏳
- Verification of context coherence after optimization ✅

### Privacy

- Ensure summarization doesn't leak sensitive information ⏳
- Implement data minimization in token usage reports ✅
- Add controls for sensitive context handling ⏳

### User Experience

- Provide clear indicators of context optimization actions ✅
- Ensure conversation continuity despite context changes ✅
- Add transparency to cost optimization decisions ⏳

## Success Metrics

- Reduction in token usage while maintaining conversation quality ✅
- Decrease in context limit errors and issues ✅
- Positive user feedback on conversation continuity ⏳
- Accurate token usage reporting compared to actual billing ✅

## Timeline

| Phase                          | Estimated Time | Priority | Status      |
| ------------------------------ | -------------- | -------- | ----------- |
| Token Usage Tracking           | 2 weeks        | High     | ✅ COMPLETE |
| Context Window Management      | 2 weeks        | High     | ✅ COMPLETE |
| Intelligent Context Management | 3 weeks        | Medium   | ⏳ PARTIAL  |
| API Extensions                 | 1 week         | Medium   | ⏳ PARTIAL  |
| Documentation                  | 1 week         | Medium   | ⏳ PARTIAL  |

## Conclusion

This token usage monitoring and context optimization plan will enhance the TS-MCP-Client by providing visibility into token consumption, automatically managing context limitations, and intelligently optimizing conversations for both quality and cost-efficiency. The implementation will be done in phases, with each phase building on the foundation of the previous one to create a comprehensive solution.

**Current Status**: Phases 1 and 2 are now complete, providing accurate token tracking, cost estimation, and basic context window management. Phase 3 is progressing well with message relevance scoring and relevance-based pruning now implemented. These intelligent context optimization features allow the system to more selectively retain important messages during context window optimization, preserving key information like questions, tool results, and recent conversation turns while reducing token usage.
