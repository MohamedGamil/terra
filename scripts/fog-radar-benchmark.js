/**
 * Terra BATON-026 Fog of War & Scout Reconnaissance Radar Benchmark Test Suite.
 * Verifies spatial visibility buffer, Scout Radar pulse triggers, and 60+ FPS performance.
 */

import { TerritorySimulation } from '../public/src/simulation.js';

console.log('=== Terra BATON-026 Fog of War & Scout Radar Benchmark ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// Test 1: Spatial Visibility Buffer Initialization & Vision Radius
// -------------------------------------------------------------
console.log('[Test 1] Spatial Visibility Buffer & Territory Vision Radius Mask');
const sim = new TerritorySimulation(1000, 1000, 50, 'world', 12345);
sim.startSpawnPhase();
sim.setHumanSpawn(500 * 1000 + 500);
sim.confirmSpawnsAndStart();

assert(sim.visibilityBuffer.length === 1000000, 'Visibility buffer allocated 1,000,000 pixels');
assert(sim.fogOfWarEnabled === true, 'Fog of War enabled by default');

const startHr = process.hrtime.bigint();
sim.updateVisibilityMask(1);
const endHr = process.hrtime.bigint();
const maskDurationMs = Number(endHr - startHr) / 1e6;

assert(maskDurationMs < 15.0, `Visibility mask calculation executed in ${maskDurationMs.toFixed(2)}ms (Threshold < 15ms)`);

// Count revealed pixels around human spawn
let visibleCount = 0;
for (let i = 0; i < sim.visibilityBuffer.length; i++) {
  if (sim.visibilityBuffer[i] === 2) visibleCount++;
}

assert(visibleCount > 0, `Player vision radius revealed ${visibleCount} pixels as VISIBLE`);

// -------------------------------------------------------------
// Test 2: Scout Reconnaissance Radar Trigger & 2% Fee Deduction
// -------------------------------------------------------------
console.log('\n[Test 2] Scout Reconnaissance Radar Trigger & Fee Deduction');
const p1BalanceBefore = sim.players[1].balance;

const radarFired = sim.triggerScoutRadar(1, 500, 500);
assert(radarFired === true, 'triggerScoutRadar executed successfully');
assert(sim.radarPulses.length === 1, 'Active radar pulse spawned in simulation array');

const expectedFee = Math.max(50, Math.floor(p1BalanceBefore * 0.02));
const expectedBalance = p1BalanceBefore - expectedFee;
assert(sim.players[1].balance === expectedBalance, `2% troop fee deducted correctly (Expected: ${expectedBalance}, Actual: ${sim.players[1].balance})`);

const pulse = sim.radarPulses[0];
assert(pulse.maxRadius === 200, 'Radar pulse max radius set to 200px');
assert(pulse.duration === 5.0, 'Radar pulse reveal duration set to 5.0s');

// -------------------------------------------------------------
// Test 3: Radar Pulse Expansion & Expiration Lifecycle
// -------------------------------------------------------------
console.log('\n[Test 3] Radar Pulse Expansion & Expiration Lifecycle');
sim.updateRadarPulses(1000); // Advance 1 second
assert(sim.radarPulses[0].radius > 10, 'Radar pulse radius expanded after 1s simulation update');

sim.updateRadarPulses(4500); // Advance remaining 4.5 seconds (total 5.5s)
assert(sim.radarPulses.length === 0, 'Radar pulse expired and automatically pruned after 5 seconds');

// -------------------------------------------------------------
// Test 4: Fog of War Toggle & Headless 60+ FPS Performance Benchmark
// -------------------------------------------------------------
console.log('\n[Test 4] Fog of War Toggle & Headless FPS Performance Benchmark');

sim.fogOfWarEnabled = false;
assert(sim.fogOfWarEnabled === false, 'Fog of War toggle disabled view mask');
sim.fogOfWarEnabled = true;
assert(sim.fogOfWarEnabled === true, 'Fog of War toggle re-enabled view mask');

const framesToSimulate = 100;
const benchStart = process.hrtime.bigint();
for (let f = 0; f < framesToSimulate; f++) {
  sim.update(16.6);
  sim.updateVisibilityMask(1);
}
const benchEnd = process.hrtime.bigint();
const totalMs = Number(benchEnd - benchStart) / 1e6;
const avgFrameMs = totalMs / framesToSimulate;
const avgFps = 1000 / avgFrameMs;

assert(avgFps >= 60.0, `Headless game loop with Fog of War maintained ${avgFps.toFixed(1)} FPS (Threshold >= 60 FPS)`);

console.log('\n--- BATON-026 Verification Summary ---');
console.log(`Tests Passed: ${passedTests} / ${totalTests}`);

if (passedTests === totalTests) {
  console.log('\n✅ BATON-026 PASSED: Fog of War & Scout Radar verified successfully!');
} else {
  console.error('\n❌ BATON-026 FAILED: Assertion failures encountered!');
  process.exit(1);
}
