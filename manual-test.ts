// Manual test script for tool continuation
// Usage: npx ts-node manual-test.ts

import { SessionManager } from './src/llm/session.ts';
import * as dotenv from 'dotenv';

dotenv.config();

// Define types for test
interface EventData {
  seq: number;
  type: string;
  content?: string;
}

async function testContinuity() {
  // For testing purposes - we'll use a fake API key if none is provided
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No API key found in .env, using test key');
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test123'; // Will fail API calls but allows testing the flow
  }

  console.log('Creating session manager...');
  const sessionManager = new SessionManager();

  const config = {
    type: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    api_key: process.env.ANTHROPIC_API_KEY,
    system_prompt: 'You are a helpful assistant. Use tools when appropriate.',
    servers: {
      filesystem: {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '--base-path', '.'],
      },
    },
  };

  try {
    console.log('Initializing session...');
    const session = await sessionManager.initializeSession(config);
    console.log(`Session created with ID: ${session.id}`);

    console.log('Sending message to trigger tool usage...');
    console.log('Streaming response:');

    // Track sequence of events
    let seq = 0;
    const events: EventData[] = [];

    for await (const chunk of sessionManager.sendMessageStream(
      session.id,
      'List the files in the current directory and tell me what you found.'
    )) {
      seq++;
      events.push({ seq, type: chunk.type, content: chunk.content });
      console.log(`[${seq}] ${chunk.type}: ${chunk.content || ''}`);

      // For tool_result, print full JSON
      if (chunk.type === 'tool_result' && chunk.content) {
        console.log(
          'TOOL RESULT:',
          JSON.stringify(JSON.parse(chunk.content), null, 2)
        );
      }
    }

    // Analyze the events
    const toolResultEvent = events.find(e => e.type === 'tool_result');
    const toolResultSeq = toolResultEvent ? toolResultEvent.seq : 0;

    const contentEventsAfterToolResult = events.filter(
      e => e.seq > toolResultSeq && e.type === 'content'
    );

    console.log('\n--- TEST ANALYSIS ---');
    console.log(`Tool result received: ${!!toolResultEvent}`);
    console.log(
      `Content events after tool result: ${contentEventsAfterToolResult.length}`
    );

    if (contentEventsAfterToolResult.length > 0) {
      console.log('\n✅ PASS: Conversation continued after tool execution');
    } else if (!toolResultEvent) {
      console.log('\n⚠️ INCONCLUSIVE: No tool was executed');
    } else {
      console.log('\n❌ FAIL: No content received after tool execution');
    }

    // Show full conversation history
    console.log('\n--- CONVERSATION HISTORY ---');
    session.messages.forEach((msg, i) => {
      console.log(
        `[${i}] ${msg.role}: ${
          msg.isToolResult ? 'TOOL RESULT' : msg.content.substring(0, 100)
        }`
      );
    });
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testContinuity().catch(console.error);
