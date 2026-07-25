/**
 * Automated Verification Suite for BATON-022: Dynamic Visual Juiciness & Particle Systems.
 * Verifies ParticleSystem object pool allocation, recycling, animation math, and decay.
 */

import { ParticleSystem } from '../public/src/particles.js';

console.log('=== Terra BATON-022 Visual Juiciness & Particle System Verification ===\n');

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

// --- Test 1: Object Pool Allocation & Recycling ---
console.log('[Test 1] Object Pool Pre-Allocation & Zero-GC Recycling');
const system = new ParticleSystem(500);

assert(system.pool.length === 500, 'Particle pool pre-allocated with 500 items');
assert(system.activeParticles.length === 0, 'Initial active particles array is empty');

// Spawn 10 particles
for (let i = 0; i < 10; i++) {
  system.spawnShockwave(500, 500, '#00f2fe');
}

assert(system.activeParticles.length === 10, '10 active shockwave particles spawned');
assert(system.pool.length === 490, 'Pool decreased by 10');

// --- Test 2: Animation Update & Decay Math ---
console.log('\n[Test 2] Particle Update & Lifetime Decay Math');

system.update(0.1); // Update 100ms
assert(system.activeParticles[0].radius > 2, 'Shockwave radius expanded after 100ms update');
assert(system.activeParticles[0].alpha < 1.0, 'Particle opacity decayed over time');

system.update(0.3); // Advance past 350ms maxLife
assert(system.activeParticles.length === 0, 'All 10 particles decayed and returned to pool');
assert(system.pool.length === 500, 'Pool restored to full capacity of 500 items');

// --- Test 3: Kinetic Sparks & Floating Text Spawning ---
console.log('\n[Test 3] Kinetic Sparks & Floating Text Spawning');

system.spawnSpark(100, 100, '#ff0055', 50, -20);
system.spawnFloatingText(200, 200, '-250', '#ffffff');

assert(system.activeParticles.length === 2, 'Kinetic spark and floating text spawned');
system.update(0.1);
assert(system.activeParticles.find(p => p.type === 'TEXT').y < 200, 'Floating text floated upward (-vy)');

// --- Summary ---
console.log(`\n--- BATON-022 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-022 PASSED: Dynamic Visual Juiciness & Particle Systems verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ BATON-022 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
