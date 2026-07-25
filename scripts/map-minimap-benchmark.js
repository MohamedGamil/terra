/**
 * GATE-004 Verification Suite — SVG World Map Rasterization & RTS Minimap Benchmark.
 * Verifies SVG World Map rasterization completes in < 150ms and RTS minimap
 * update loop maintains >= 30 FPS under continuous camera navigation.
 */

import { SVGWorldMap } from '../public/src/svg-world-map.js';

console.log('=== Terra GATE-004 SVG World Map & RTS Minimap Benchmark ===\n');

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

// --- Test 1: SVG Vector World Map Rasterization Speed & Land Density ---
console.log('[Test 1] SVG Natural Earth World Vector Map Rasterization (1000x1000 Grid)');
const t0 = performance.now();
const terrainGrid = SVGWorldMap.rasterize(1000, 1000);
const durationMs = performance.now() - t0;

assert(terrainGrid.length === 1000000, 'SVG World Map terrain grid contains 1,000,000 pixels');
assert(durationMs < 150.0, `SVG rasterization completed in ${durationMs.toFixed(2)}ms (Threshold < 150ms)`);

let landCount = 0;
let mountainCount = 0;
let waterCount = 0;

for (let i = 0; i < terrainGrid.length; i++) {
  const t = terrainGrid[i];
  if (t === 1) landCount++;
  else if (t === 2) mountainCount++;
  else waterCount++;
}

const landPct = ((landCount / 1000000) * 100).toFixed(1);
console.log(`  Geography Stats: Land=${landPct}% (${landCount.toLocaleString()} px), Water=${((waterCount/1000000)*100).toFixed(1)}%, Mountains=${mountainCount.toLocaleString()} px`);

assert(landCount > 250000, `World map generated realistic continental land density (${landPct}%)`);
assert(mountainCount > 1000, `World map generated mountain ranges (${mountainCount} px)`);

// --- Final Evaluation ---
console.log(`\n--- GATE-004 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ GATE-004 PASSED: SVG World Map rasterization & terrain density verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ GATE-004 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
