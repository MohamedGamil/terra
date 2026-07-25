/**
 * Automated Verification Suite for BATON-021: Multi-Personality AI Strategy Engine.
 * Verifies bot archetype assignment, strategy execution, and tick performance.
 */

import { AIEngine } from '../public/src/ai-engine.js';
import { TerritorySimulation } from '../public/src/simulation.js';

console.log('=== Terra BATON-021 Multi-Personality AI Strategy Engine Verification ===\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

// --- Test 1: Archetype Distribution ---
console.log('[Test 1] Bot Personality Archetype Distribution (100 Bots)');
const aiEngine = new AIEngine(100);

const counts = { RUSHER: 0, DEFENDER: 0, EXPANSIONIST: 0, ADAPTIVE: 0 };
for (let id = 2; id <= 100; id++) {
  const profile = aiEngine.botProfiles.get(id);
  if (profile) counts[profile.archetype]++;
}

assert(counts.RUSHER === 25, `Rusher archetype count = 25 (Recorded: ${counts.RUSHER})`);
assert(counts.DEFENDER === 25, `Defender archetype count = 25 (Recorded: ${counts.DEFENDER})`);
assert(counts.EXPANSIONIST === 25, `Expansionist archetype count = 25 (Recorded: ${counts.EXPANSIONIST})`);
assert(counts.ADAPTIVE === 24, `Adaptive archetype count = 24 (Recorded: ${counts.ADAPTIVE})`);

// --- Test 2: AI Execution in 500-Bot Simulation ---
console.log('\n[Test 2] 500-Bot Simulation Execution & Tick Latency');
const sim = new TerritorySimulation(1000, 1000, 500, 'world');
sim.startSpawnPhase();
sim.confirmSpawnsAndStart();

const t0 = performance.now();
for (let tick = 0; tick < 50; tick++) {
  sim.update(50);
}
const elapsedMs = performance.now() - t0;
const avgTickMs = elapsedMs / 50;

console.log(`  50 Ticks Simulated in ${elapsedMs.toFixed(2)}ms (Avg ${avgTickMs.toFixed(3)}ms / tick)`);
assert(avgTickMs < 10.0, `500-Bot AI tick latency (${avgTickMs.toFixed(3)}ms) is well under 10.0ms threshold`);

let activeBots = 0;
for (let id = 2; id <= 500; id++) {
  if (sim.players[id] && sim.players[id].landCount > 0) activeBots++;
}
assert(activeBots > 400, `Active AI bots expanding across map (${activeBots} active)`);

// --- Summary ---
console.log(`\n--- BATON-021 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-021 PASSED: Multi-Personality AI Strategy Engine verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ BATON-021 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
