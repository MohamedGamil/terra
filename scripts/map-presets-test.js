/**
 * Automated Verification Suite for BATON-020: Procedural & Preset Map Generator Controls.
 * Verifies PRNG seed reproducibility, regional preset crops, and generation speed.
 */

import { MapGenerator } from '../public/src/map-generator.js';

console.log('=== Terra BATON-020 Map Generator & Preset Verification ===\n');

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

// --- Test 1: PRNG Seed Reproducibility ---
console.log('[Test 1] PRNG Seed Reproducibility (Same Seed -> Same Terrain Grid)');

const grid1 = MapGenerator.generate('archipelago', 1000, 1000, 'terra-seed-99');
const grid2 = MapGenerator.generate('archipelago', 1000, 1000, 'terra-seed-99');

let identical = true;
for (let i = 0; i < grid1.length; i++) {
  if (grid1[i] !== grid2[i]) {
    identical = false;
    break;
  }
}

assert(grid1.length === 1000000, 'Terrain grid size is 1,000,000 pixels');
assert(identical, 'Identical seed ("terra-seed-99") generates 100% byte-identical terrain grid');

// --- Test 2: All 6 Map Presets Generation & Land Check ---
console.log('\n[Test 2] Map Presets (World, Europe, Asia, Archipelago, Ring of Fire, Arena)');

const presets = ['world', 'europe', 'asia', 'archipelago', 'ring_of_fire', 'arena'];

for (const preset of presets) {
  const t0 = performance.now();
  const terrain = MapGenerator.generate(preset, 1000, 1000, 12345);
  const durationMs = performance.now() - t0;

  let landCount = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === 1) landCount++;
  }
  const landPct = ((landCount / 1000000) * 100).toFixed(1);

  assert(terrain.length === 1000000, `Preset "${preset}" generated 1,000,000 pixels in ${durationMs.toFixed(2)}ms`);
  assert(landCount > 50000, `Preset "${preset}" contains land pixels (${landPct}%)`);
}

// --- Summary ---
console.log(`\n--- BATON-020 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-020 PASSED: Procedural & Preset Map Generator Controls verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ BATON-020 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
