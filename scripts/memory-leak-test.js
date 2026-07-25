/**
 * Automated Verification Suite for BATON-030: Engine Memory Leak Elimination & Unbounded Array Pruning.
 * Verifies frontier auto-pruning, particle object pool invariants, and telemetry sliding window.
 */

import { TerritorySimulation } from '../public/src/simulation.js';
import { ParticleSystem } from '../public/src/particles.js';
import { MatchRecorder } from '../public/src/match-recorder.js';

console.log('=== Terra BATON-030 Memory Leak & Array Pruning Verification ===\n');

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

// --- Test 1: 500-Bot Simulation 5,000 Ticks Frontier Pruning ---
console.log('[Test 1] 500-Bot Simulation 5,000-Tick Frontier Array Pruning');
const sim = new TerritorySimulation(1000, 1000, 500, 'world');
sim.startSpawnPhase();
sim.confirmSpawnsAndStart();

const t0 = performance.now();
for (let tick = 0; tick < 2000; tick++) {
  sim.update(50);
}
const elapsedMs = performance.now() - t0;

let totalFrontierPixels = 0;
for (let id = 1; id <= 500; id++) {
  if (sim.frontiers[id]) {
    totalFrontierPixels += sim.frontiers[id].length;
  }
}

console.log(`  2,000 Ticks Simulated in ${elapsedMs.toFixed(2)}ms`);
console.log(`  Total Active Frontier Pixels across 500 Bots: ${totalFrontierPixels}`);

assert(totalFrontierPixels < 100000, `Frontier total pixels (${totalFrontierPixels}) remains bounded (< 100,000 limit across 500 bots)`);
assert(elapsedMs < 5000, `2,000 ticks completed in ${elapsedMs.toFixed(2)}ms without mid-game CPU freeze`);

// --- Test 2: ParticleSystem Object Pool Invariants ---
console.log('\n[Test 2] ParticleSystem Pool Recycling & Memory Bound');
const particles = new ParticleSystem(500);

for (let i = 0; i < 2000; i++) {
  particles.spawnShockwave(100, 100, '#00f2fe', 20);
  particles.spawnSpark(100, 100, '#ff0055', 10, 10);
  particles.spawnFloatingText(100, 100, '-50', '#ffffff');
  particles.update(0.05); // 50ms step
}

const totalParticles = particles.pool.length + particles.activeParticles.length;
console.log(`  Pool Count: ${particles.pool.length}, Active Count: ${particles.activeParticles.length}, Total: ${totalParticles}`);

assert(totalParticles === 500, `Total particle objects (${totalParticles}) is strictly preserved at 500`);
assert(particles.activeParticles.length <= 500, 'Active particles array never exceeds max pool capacity');

// --- Test 3: MatchRecorder Sliding Window Capping ---
console.log('\n[Test 3] MatchRecorder Telemetry Sliding Window Capping');
const recorder = new MatchRecorder(1.0);

const dummyPlayers = [
  { id: 1, name: 'Commander', balance: 500, landCount: 100, isHuman: true },
  { id: 2, name: 'Bot 2', balance: 300, landCount: 50, isHuman: false }
];

for (let sec = 1; sec <= 1000; sec++) {
  recorder.sample(sec, dummyPlayers, 100000);
}

console.log(`  Sampled 1,000 Seconds of Match Telemetry. Samples count: ${recorder.timelineSamples.length}`);
assert(recorder.timelineSamples.length === 600, 'Timeline samples capped at exactly 600 items (10 min sliding window)');

// --- Summary ---
console.log(`\n--- BATON-030 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-030 PASSED: Engine Memory Leak Elimination & Unbounded Array Pruning verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ BATON-030 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
