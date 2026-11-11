process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { initDatabase } from '../src/db.js';
import { initSubscriptionsTable, probeSubscriptionCredentials } from '../src/subscriptions.js';
import { executeRoutedCompletion } from '../src/router.js';
import { JevEvaluation } from '../src/jev.js';
import { markProviderBudgetExceeded } from '../src/arbitrage.js';

async function testNextBestFallback() {
  console.log('🧪 Testing Next-Best Model & Provider Fallback on Token Exhaustion...\n');

  initDatabase();
  initSubscriptionsTable();
  await probeSubscriptionCredentials();

  // Mark Mammouth and OpenRouter as budget/quota exceeded to simulate complete credit exhaustion
  markProviderBudgetExceeded('mammouth');
  markProviderBudgetExceeded('openrouter');

  const codingEval: JevEvaluation = {
    intent: 'coding_complex',
    intentConfidence: 0.95,
    complexityScore: 4.2,
    complexityConfidence: 0.90,
    needsReasoner: 0.20,
    jevDurationMs: 85,
    isFallback: false,
    jevInputTokens: 400
  };

  const sampleBody = {
    model: 'auto',
    messages: [
      { role: 'user', content: 'Write a python function to compute Fibonacci numbers in 2 lines' }
    ]
  };

  console.log('--- 1. Testing Routing with Exhausted Paid Aggregators ---');
  const result = await executeRoutedCompletion(sampleBody, codingEval, false);

  console.log('• Execution Result Status:', result.providerResponse.status);
  console.log('• Execution Result OK:', result.providerResponse.ok);
  console.log('• Model Routed To:', result.selectedModel);
  console.log('• Provider Used:', result.selectedProvider);
  console.log('• Routing Reason:', result.routingReason);

  if (!result.providerResponse.ok) {
    throw new Error(`Expected fallback to find a working provider/model, but got error: ${result.providerResponse.error}`);
  }

  const completionContent = result.providerResponse.data?.choices?.[0]?.message?.content;
  console.log('• Completion Preview:', (completionContent || '').slice(0, 150));

  if (!completionContent) {
    throw new Error('Expected non-empty response content from recovered provider');
  }

  console.log('\n--- 2. Testing Explicit Model Request Failover (e.g. Claude 3.5 Sonnet) ---');
  const explicitClaudeBody = {
    model: 'anthropic/claude-3.5-sonnet',
    messages: [
      { role: 'user', content: 'Explain quicksort in 1 sentence' }
    ]
  };

  const explicitResult = await executeRoutedCompletion(explicitClaudeBody, codingEval, false);
  console.log('• Explicit Result Status:', explicitResult.providerResponse.status);
  console.log('• Explicit Result OK:', explicitResult.providerResponse.ok);
  console.log('• Model Routed To:', explicitResult.selectedModel);
  console.log('• Provider Used:', explicitResult.selectedProvider);
  console.log('• Routing Reason:', explicitResult.routingReason);

  if (!explicitResult.providerResponse.ok) {
    throw new Error(`Expected explicit model failover to find a working provider/model, but got error: ${explicitResult.providerResponse.error}`);
  }

  const explicitContent = explicitResult.providerResponse.data?.choices?.[0]?.message?.content;
  console.log('• Completion Preview:', (explicitContent || '').slice(0, 150));

  console.log('\n✅ NEXT-BEST RECOVERY TEST PASSED: Never-Fail Fallback successfully served the request!');
}

testNextBestFallback().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
