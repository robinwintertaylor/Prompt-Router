import { evaluateWithJev } from '../src/jev.js';
import { selectOptimalModel } from '../src/router.js';
import { initDatabase, setSetting } from '../src/db.js';
import { syncCatalog } from '../src/catalog.js';

async function run() {
  initDatabase();
  await syncCatalog();

  // Explicitly clear TYPESAFE_API_KEY in both settings and env to simulate a clean clone
  setSetting('TYPESAFE_API_KEY', '');
  process.env.TYPESAFE_API_KEY = '';

  console.log('--- 1. Testing Greeting in Heuristic Mode ---');
  const e1 = await evaluateWithJev([{ role: 'user', content: 'hello how are you' }]);
  const r1 = selectOptimalModel('auto', e1);
  console.log('Greeting:', { intent: e1.intent, complexity: e1.complexityScore, isFallback: e1.isFallback });
  console.log('Routed to:', r1.model, 'Reason:', r1.reason);

  console.log('\n--- 2. Testing Simple Code in Heuristic Mode ---');
  const e2 = await evaluateWithJev([{ role: 'user', content: 'write a function to add two numbers in typescript' }]);
  const r2 = selectOptimalModel('auto', e2);
  console.log('Simple Code:', { intent: e2.intent, complexity: e2.complexityScore, isFallback: e2.isFallback });
  console.log('Routed to:', r2.model, 'Reason:', r2.reason);

  console.log('\n--- 3. Testing Complex Architecture in Heuristic Mode ---');
  const e3 = await evaluateWithJev([{ role: 'user', content: 'architect a distributed microservices consensus engine with kafka and raft' }]);
  const r3 = selectOptimalModel('auto', e3);
  console.log('Complex Architecture:', { intent: e3.intent, complexity: e3.complexityScore, isFallback: e3.isFallback });
  console.log('Routed to:', r3.model, 'Reason:', r3.reason);

  console.log('\n--- 4. Testing Deep Math Reasoning in Heuristic Mode ---');
  const e4 = await evaluateWithJev([{ role: 'user', content: 'prove the theorem that every prime p > 3 is of form 6k±1' }]);
  const r4 = selectOptimalModel('auto', e4);
  console.log('Deep Reasoning:', { intent: e4.intent, complexity: e4.complexityScore, isFallback: e4.isFallback });
  console.log('Routed to:', r4.model, 'Reason:', r4.reason);

  console.log('\n✅ ALL HEURISTIC FALLBACK TESTS COMPLETED SUCCESSFULLY!');
}

run().catch(console.error);

