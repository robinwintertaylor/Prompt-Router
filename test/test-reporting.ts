import { initDatabase, logRequest, getDetailedReport, getLogById } from '../src/db.js';

console.log('🧪 Starting Detailed Reporting Tests...');

// 1. Initialize DB
initDatabase();
console.log('✅ DB initialized.');

// 2. Insert sample records with thought process and telemetry
const testLog1 = {
  id: 'rep-test-001',
  client_agent: 'goose',
  model_requested: 'auto',
  model_routed: 'deepseek/deepseek-r1',
  provider_used: 'openrouter',
  jev_intent: 'deep_reasoning',
  jev_complexity: 4.8,
  jev_confidence: 0.96,
  jev_needs_reasoner: 0.90,
  prompt_tokens: 450,
  completion_tokens: 820,
  total_tokens: 1270,
  duration_ms: 1850,
  jev_duration_ms: 118,
  cost_jev: 0.00002,
  cost_actual: 0.0028,
  cost_if_claude: 0.0245,
  cost_if_gpt4o: 0.0195,
  savings_vs_claude: 0.0217,
  prompt_preview: 'Solve the Byzantine Generals Problem with formal verification.',
  routing_reason: 'Jev detected frontier reasoning (score: 4.8, reasoner prob: 90%). Routed to DeepSeek R1 for chain-of-thought verification.',
  response_preview: 'Here is the step-by-step mathematical proof of Byzantine Fault Tolerance...'
};

const testLog2 = {
  id: 'rep-test-002',
  client_agent: 'cursor',
  model_requested: 'auto',
  model_routed: 'google/gemini-2.5-flash',
  provider_used: 'mammouth',
  jev_intent: 'coding_simple',
  jev_complexity: 1.5,
  jev_confidence: 0.98,
  jev_needs_reasoner: 0.05,
  prompt_tokens: 120,
  completion_tokens: 65,
  total_tokens: 185,
  duration_ms: 320,
  jev_duration_ms: 110,
  cost_jev: 0.000005,
  cost_actual: 0.000045,
  cost_if_claude: 0.0032,
  cost_if_gpt4o: 0.0028,
  savings_vs_claude: 0.003155,
  prompt_preview: 'Write a helper function to format currency in EUR.',
  routing_reason: 'Jev detected lightweight coding task (score: 1.5). Routed to Gemini 2.5 Flash for sub-350ms execution.',
  response_preview: 'function formatEUR(amount) { return new Intl.NumberFormat(...); }'
};

logRequest(testLog1);
logRequest(testLog2);
console.log('✅ Sample reporting logs recorded.');

// 3. Test getLogById
const retrieved1 = getLogById('rep-test-001');
if (!retrieved1 || retrieved1.model_routed !== 'deepseek/deepseek-r1') {
  throw new Error('Failed to retrieve test log 1 by ID');
}
if (!retrieved1.routing_reason || !retrieved1.routing_reason.includes('DeepSeek R1')) {
  throw new Error('Routing reason missing on test log 1');
}
console.log('✅ getLogById verified with routing reason:', retrieved1.routing_reason);

// 4. Test getDetailedReport unfiltered
const repAll = getDetailedReport();
if (!repAll.summary || repAll.summary.total_requests < 2) {
  throw new Error('Expected at least 2 requests in report summary');
}
console.log('✅ Unfiltered report: total requests =', repAll.summary.total_requests);

// 5. Test filtered by provider
const repMammouth = getDetailedReport({ provider: 'mammouth' });
if (!repMammouth.logs.every((l: any) => l.provider_used === 'mammouth')) {
  throw new Error('Provider filter failed');
}
console.log('✅ Provider filter verified.');

// 6. Test filtered by search
const repSearch = getDetailedReport({ search: 'Byzantine' });
if (repSearch.logs.length === 0 || !repSearch.logs[0].id.includes('rep-test-001')) {
  throw new Error('Search query filter failed');
}
console.log('✅ Search query filter verified.');

// 7. Verify model & provider breakdowns
if (!repAll.modelBreakdown || repAll.modelBreakdown.length === 0) {
  throw new Error('Model breakdown missing');
}
if (!repAll.providerBreakdown || repAll.providerBreakdown.length === 0) {
  throw new Error('Provider breakdown missing');
}
console.log('✅ Model & Provider breakdowns verified.');

console.log('🎉 ALL REPORTING TESTS PASSED SUCCESSFULLY!');
