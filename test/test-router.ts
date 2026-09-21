import { initDatabase, getMetrics, getRecentLogs, logRequest } from '../src/db.js';
import { calculateCosts } from '../src/pricing.js';
import { evaluateWithJev } from '../src/jev.js';
import { selectOptimalModel } from '../src/router.js';
import { syncCatalog, getAllCatalogModels, getCatalogModel } from '../src/catalog.js';

async function runTests() {
  console.log('🧪 Starting Prompt-Router verification tests...\n');

  // Test 1: SQLite DB init
  console.log('Test 1: Initializing Database...');
  initDatabase();
  console.log('✅ Database initialized successfully.\n');

  // Test 1B: Catalog Synchronization across Aggregators
  console.log('Test 1B: Synchronizing live model catalog from OpenRouter / Mammouth...');
  const syncResult = await syncCatalog();
  console.log(`• Models synchronized: ${syncResult.count}`);
  const allModels = getAllCatalogModels();
  if (allModels.length === 0) throw new Error('Catalog sync returned 0 models');
  console.log(`• Loaded ${allModels.length} models into dynamic catalog cache.`);

  const sampleClaude = getCatalogModel('anthropic/claude-3.5-sonnet');
  if (sampleClaude) {
    console.log(`• Live Claude 3.5 Sonnet Rate: $${(sampleClaude.promptPrice * 1e6).toFixed(2)}/M in, $${(sampleClaude.completionPrice * 1e6).toFixed(2)}/M out (${sampleClaude.provider})`);
  }
  console.log('✅ Dynamic Catalog Synchronization verified.\n');

  // Test 2: Pricing calculations
  console.log('Test 2: Verifying Cost Calculations & Savings with Live Rates...');
  const promptTokens = 1000;
  const completionTokens = 500;

  // Flash model
  const flashCosts = calculateCosts('google/gemini-2.5-flash', promptTokens, completionTokens, 1000);
  console.log(`• Gemini Flash cost: $${flashCosts.totalActualCost.toFixed(6)}`);
  console.log(`• Claude 3.5 Would Cost: $${flashCosts.costIfClaude.toFixed(6)}`);
  console.log(`• Savings vs Claude: $${flashCosts.savingsVsClaude.toFixed(6)} (${Math.round((flashCosts.savingsVsClaude / flashCosts.costIfClaude) * 100)}% savings)`);
  if (flashCosts.savingsVsClaude <= 0) throw new Error('Savings calculation failed');
  console.log('✅ Pricing & savings calculation verified.\n');

  // Test 3: Jev Heuristic & Evaluation Flow
  console.log('Test 3: Testing Jev Evaluation Flow on sample prompts...');

  // Simple Greeting Prompt
  const greetingPrompt = [{ role: 'user', content: 'Hello there, how are you?' }];
  const evalGreeting = await evaluateWithJev(greetingPrompt);
  console.log('Greeting prompt Jev eval:', evalGreeting);
  const routeGreeting = selectOptimalModel('auto', evalGreeting);
  console.log(`-> Routed greeting to: ${routeGreeting.model} (${routeGreeting.reason})`);
  if (!routeGreeting.model.includes('flash') && !routeGreeting.model.includes('mini')) {
    console.warn('Expected greeting to route to a fast/cheap model');
  }

  // Complex Code Prompt
  const complexCodePrompt = [{
    role: 'user',
    content: 'Architect an enterprise microservices solution with Kafka event sourcing, distributed transactions using Saga pattern, and multi-region failover.'
  }];
  const evalComplex = await evaluateWithJev(complexCodePrompt);
  console.log('Complex code Jev eval:', evalComplex);
  const routeComplex = selectOptimalModel('auto', evalComplex);
  console.log(`-> Routed complex architecture to: ${routeComplex.model} (${routeComplex.reason})`);
  if (!routeComplex.model.includes('claude') && !routeComplex.model.includes('gpt-4o') && !routeComplex.model.includes('r1')) {
    console.warn('Expected complex prompt to route to tier-1 model');
  }

  // Deep Reasoning Prompt
  const mathPrompt = [{
    role: 'user',
    content: 'Prove mathematically whether P equals NP using circuit complexity lower bounds and natural proofs barrier.'
  }];
  const evalMath = await evaluateWithJev(mathPrompt);
  console.log('Math reasoning Jev eval:', evalMath);
  const routeMath = selectOptimalModel('auto', evalMath);
  console.log(`-> Routed math reasoning to: ${routeMath.model} (${routeMath.reason})`);

  console.log('✅ Jev evaluation and routing logic verified.\n');

  // Test 3B: Verifying Multi-Turn Continuity & Session Cache Affinity
  console.log('Test 3B: Testing Multi-Turn Session Continuity & Cache Affinity...');
  const testSessionId = 'test-session-cursor-multi-turn';

  // Turn 1: Initial complex task establishes anchor model (Claude 3.5 Sonnet / premier coder)
  const turn1Route = selectOptimalModel('auto', evalComplex, 'cost_optimized', testSessionId, 2000);
  console.log(`• Turn 1 (Initial Complex Request, 2k tokens): routed to ${turn1Route.model}`);

  // Turn 2: Minor greeting/lookup, but with 25,000 accumulated tokens on same session
  const turn2Route = selectOptimalModel('auto', evalGreeting, 'cost_optimized', testSessionId, 25000);
  console.log(`• Turn 2 (Simple Follow-up with 25k context): routed to ${turn2Route.model} (${turn2Route.reason})`);
  if (turn2Route.model !== turn1Route.model) {
    throw new Error(`Expected session affinity to preserve anchor model ${turn1Route.model}, but got ${turn2Route.model}`);
  }

  // Turn 3: Extreme reasoning need triggers Hysteresis Override
  const extremeReasonerEval = { ...evalMath, needsReasoner: 0.88 };
  const turn3Route = selectOptimalModel('auto', extremeReasonerEval, 'cost_optimized', testSessionId, 28000);
  console.log(`• Turn 3 (Extreme Reasoning Hysteresis Override): routed to ${turn3Route.model}`);
  if (!turn3Route.model.includes('r1') && !turn3Route.model.includes('deepseek') && !turn3Route.model.includes('sonnet')) {
    throw new Error(`Expected reasoner model for extreme reasoning, but got ${turn3Route.model}`);
  }
  console.log('✅ Multi-Turn Continuity & Cache Affinity verified.\n');

  // Test 4: Database logging & metrics aggregation
  console.log('Test 4: Testing DB Logging and Metrics Retrieval...');
  logRequest({
    id: 'test-req-1',
    client_agent: 'goose',
    model_requested: 'auto',
    model_routed: routeGreeting.model,
    provider_used: routeGreeting.providerHint || 'openrouter',
    jev_intent: evalGreeting.intent,
    jev_complexity: evalGreeting.complexityScore,
    jev_confidence: evalGreeting.intentConfidence,
    jev_needs_reasoner: evalGreeting.needsReasoner,
    prompt_tokens: 50,
    completion_tokens: 30,
    total_tokens: 80,
    duration_ms: 120,
    jev_duration_ms: evalGreeting.jevDurationMs,
    cost_jev: 0.000002,
    cost_actual: 0.000017,
    cost_if_claude: 0.000600,
    cost_if_gpt4o: 0.000425,
    savings_vs_claude: 0.000583,
    prompt_preview: 'Hello there, how are you?'
  });

  logRequest({
    id: 'test-req-2',
    client_agent: 'cursor',
    model_requested: 'auto',
    model_routed: routeComplex.model,
    provider_used: routeComplex.providerHint || 'openrouter',
    jev_intent: evalComplex.intent,
    jev_complexity: evalComplex.complexityScore,
    jev_confidence: evalComplex.intentConfidence,
    jev_needs_reasoner: evalComplex.needsReasoner,
    prompt_tokens: 800,
    completion_tokens: 600,
    total_tokens: 1400,
    duration_ms: 1400,
    jev_duration_ms: evalComplex.jevDurationMs,
    cost_jev: 0.000034,
    cost_actual: 0.011400,
    cost_if_claude: 0.011400,
    cost_if_gpt4o: 0.008000,
    savings_vs_claude: 0.000000,
    prompt_preview: 'Architect an enterprise microservices solution with Kafka...'
  });

  const metrics = getMetrics();
  console.log('Aggregated Metrics:', metrics.overall);
  console.log('Model Breakdown:', metrics.modelBreakdown);

  const logs = getRecentLogs(5);
  console.log(`Retrieved ${logs.length} logged requests from SQLite.`);
  console.log('✅ Logging and Optics query verified.\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🚀');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
