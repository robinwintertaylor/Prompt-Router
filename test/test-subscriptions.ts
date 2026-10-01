import { initDatabase } from '../src/db.js';
import {
  initSubscriptionsTable,
  getAllSubscriptions,
  getSubscription,
  updateSubscription,
  recordSubscriptionUsage,
  resetExpiredSubscriptionQuotas,
  probeSubscriptionCredentials
} from '../src/subscriptions.js';
import { selectOptimalModel } from '../src/router.js';
import { calculateCosts } from '../src/pricing.js';
import { JevEvaluation } from '../src/jev.js';

async function runSubscriptionTests() {
  console.log('🧪 Starting Subscription & Free Token Routing Tests...\n');

  // 1. Initialize DB and Subscriptions
  initDatabase();
  initSubscriptionsTable();

  const subs = getAllSubscriptions();
  console.log(`• Subscriptions initialized: ${subs.length} active configurations`);
  if (subs.length < 3) throw new Error('Expected at least 3 subscriptions');

  const claude = getSubscription('claude_subscription');
  if (!claude) throw new Error('claude_subscription not found');
  console.log(`• Found ${claude.name}, initial quota: ${claude.quota_remaining_pct}%`);

  // 2. Test Environment Probe
  console.log('\n--- 1. Testing Credential & CLI Probe ---');
  const probe = probeSubscriptionCredentials();
  console.log('• Probe results:', probe);
  console.log('✅ Probe executed successfully.');

  // 3. Test Jev Routing with Active Claude Subscription (> 15% Quota)
  console.log('\n--- 2. Testing Jev Decision with Abundant Subscription Quota (100%) ---');
  updateSubscription('claude_subscription', {
    enabled: true,
    connected: true,
    quota_remaining_pct: 100.0,
    quota_used_tokens: 0
  });

  const complexEval: JevEvaluation = {
    intent: 'coding_complex',
    intentConfidence: 0.95,
    complexityScore: 4.5,
    complexityConfidence: 0.92,
    needsReasoner: 0.15,
    jevDurationMs: 95,
    isFallback: false,
    jevInputTokens: 500
  };

  const routeComplex = selectOptimalModel('auto', complexEval, 'cost_optimized');
  console.log(`• Complex prompt routed to: ${routeComplex.model}`);
  console.log(`• Routing reason: ${routeComplex.reason}`);
  console.log(`• Is Subscription: ${routeComplex.isSubscription}`);

  if (!routeComplex.isSubscription || !routeComplex.model.includes('claude')) {
    throw new Error('Expected complex task to utilize Claude subscription free tokens');
  }

  // Cost calculation verification
  const costComplex = calculateCosts(routeComplex.model, 2000, 500, 500, routeComplex.isSubscription);
  console.log(`• Subscription model cost: $${costComplex.modelCost.toFixed(6)} (Actual Total: $${costComplex.totalActualCost.toFixed(6)})`);
  console.log(`• Savings vs Claude Frontier API: $${costComplex.savingsVsClaude.toFixed(6)}`);
  if (costComplex.modelCost !== 0) throw new Error('Expected model cost to be $0.00 for subscription tokens');
  console.log('✅ $0.00 Subscription Free Token Pricing verified.');

  // 4. Test Usage Recording and Deduction
  console.log('\n--- 3. Testing Token Usage Recording & Deduction ---');
  recordSubscriptionUsage('claude_subscription', 50000);
  const updatedSub = getSubscription('claude_subscription')!;
  console.log(`• Recorded 50,000 tokens used. Remaining quota: ${updatedSub.quota_remaining_pct.toFixed(1)}%`);
  if (updatedSub.quota_used_tokens !== 50000) throw new Error('Usage recording failed');
  console.log('✅ Quota deduction verified.');

  // 5. Test Quota Conservation Mode (< 15% Quota)
  console.log('\n--- 4. Testing Quota Conservation Mode (< 15% Quota Remaining) ---');
  updateSubscription('claude_subscription', {
    quota_remaining_pct: 12.0,
    resets_at: Date.now() + 2 * 60 * 60 * 1000 // resets in 2 hours
  });

  const simpleEval: JevEvaluation = {
    intent: 'coding_simple',
    intentConfidence: 0.90,
    complexityScore: 2.7,
    complexityConfidence: 0.88,
    needsReasoner: 0.05,
    jevDurationMs: 80,
    isFallback: false,
    jevInputTokens: 300
  };

  const routeSimpleConserve = selectOptimalModel('auto', simpleEval, 'cost_optimized');
  console.log(`• Simple prompt under low quota routed to: ${routeSimpleConserve.model}`);
  console.log(`• Routing reason: ${routeSimpleConserve.reason}`);

  if (routeSimpleConserve.model.includes('claude')) {
    throw new Error('Expected simple task to be diverted away from Claude to conserve low subscription quota');
  }
  if (!routeSimpleConserve.reason.includes('Quota Conservation Mode')) {
    throw new Error('Expected Quota Conservation Mode reason');
  }
  console.log('✅ Quota Conservation Mode verified (conserved Claude for high-value tasks).');

  // Critical complex task still gets Claude even in conservation mode
  const routeComplexConserve = selectOptimalModel('auto', complexEval, 'cost_optimized');
  console.log(`• Critical complex task under low quota still gets: ${routeComplexConserve.model}`);
  if (!routeComplexConserve.model.includes('claude') || !routeComplexConserve.isSubscription) {
    throw new Error('Expected critical complex task to still receive Claude subscription in conservation mode');
  }
  console.log('✅ Critical task prioritized in conservation mode.');

  // 6. Test Quota Exhausted Fallback (0% Quota)
  console.log('\n--- 5. Testing Quota Exhausted Fallback (0% Quota Remaining) ---');
  updateSubscription('claude_subscription', {
    quota_remaining_pct: 0.0,
    resets_at: Date.now() + 45 * 60 * 1000 // resets in 45 mins
  });

  const routeExhausted = selectOptimalModel('auto', complexEval, 'cost_optimized');
  console.log(`• Exhausted subscription complex prompt routed to: ${routeExhausted.model}`);
  console.log(`• Routing reason: ${routeExhausted.reason}`);
  console.log(`• Is Subscription: ${routeExhausted.isSubscription}`);

  if (routeExhausted.isSubscription) {
    throw new Error('Expected exhausted subscription to NOT be marked as active subscription');
  }
  console.log('✅ Exhausted Quota Fallback verified.');

  // 7. Test Automatic Quota Window Reset
  console.log('\n--- 6. Testing Window Reset Expiration ---');
  updateSubscription('claude_subscription', {
    quota_remaining_pct: 0.0,
    quota_used_tokens: 180000,
    resets_at: Date.now() - 1000 // window reset time in past
  });

  resetExpiredSubscriptionQuotas();
  const resetSub = getSubscription('claude_subscription')!;
  console.log(`• After reset check, quota_remaining_pct: ${resetSub.quota_remaining_pct}%, used: ${resetSub.quota_used_tokens}`);
  if (resetSub.quota_remaining_pct !== 100.0 || resetSub.quota_used_tokens !== 0) {
    throw new Error('Expected expired quota window to reset back to 100% and 0 tokens used');
  }
  console.log('✅ Automatic Window Reset verified.');

  console.log('\n🎉 ALL SUBSCRIPTION & FREE TOKEN ROUTING TESTS PASSED SUCCESSFULLY!\n');
}

runSubscriptionTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
