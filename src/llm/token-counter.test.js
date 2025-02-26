/**
 * Simple test for our token counter
 */
import * as tokenCounter from './token-counter.js';

// Test token counting
const shortText = 'This is a test sentence.';
const longText =
  'This is a longer text that should have more tokens. It includes some technical terms like tokenization, context window, and LLM capabilities.';

console.log('Token counting tests:');
console.log(
  `"${shortText}" has approximately ${tokenCounter.estimateTokenCount(
    shortText
  )} tokens`
);
console.log(
  `"${longText}" has approximately ${tokenCounter.estimateTokenCount(
    longText
  )} tokens`
);

// Test model detection
const models = [
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20241022',
  'claude-3-7-sonnet-20250219',
  'unknown-model',
];

console.log('\nModel capability detection tests:');
for (const model of models) {
  console.log(`Model: ${model}`);
  console.log(`  Context limit: ${tokenCounter.getContextLimit(model)} tokens`);
  console.log(`  Supports thinking: ${tokenCounter.supportsThinking(model)}`);
  console.log(
    `  Default thinking budget: ${tokenCounter.getDefaultThinkingBudget(
      model
    )} tokens`
  );
}
