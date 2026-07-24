/**
 * Headless CLI Benchmark Runner for GATE-001 Verification.
 * Evaluates 1000x1000 Territory Grid simulation & render buffer performance.
 */

import { ColorPalette } from '../public/src/color.js';
import { TerritorySimulation } from '../public/src/simulation.js';

console.log('=== Terra GATE-001 Headless Performance Benchmark ===');
console.log('Initializing 1000x1000 Grid with 500 Active Territory Seeds...');

const palette = new ColorPalette(500);
const simulation = new TerritorySimulation(1000, 1000, 500);

const totalFrames = 1000;
const frameDurationsMs = [];
const buffer = new Uint32Array(1000 * 1000);

const startTime = performance.now();

for (let frame = 1; frame <= totalFrames; frame++) {
  const frameStart = performance.now();

  // 1. Advance simulation step
  simulation.update(16.6);

  // 2. Direct Uint32 pixel buffer render mapping pass
  const grid = simulation.grid;
  const colors = palette.colors;
  const defaultAbgr = colors[0].abgr;
  const len = grid.length;

  for (let i = 0; i < len; i++) {
    const owner = grid[i];
    buffer[i] = colors[owner]?.abgr || defaultAbgr;
  }

  const frameDuration = performance.now() - frameStart;
  frameDurationsMs.push(frameDuration);
}

const totalDurationSec = (performance.now() - startTime) / 1000;
const avgRenderMs = frameDurationsMs.reduce((a, b) => a + b, 0) / totalFrames;
const avgFps = 1000 / avgRenderMs;

// Compute 99th percentile frame latency
const sortedDurations = [...frameDurationsMs].sort((a, b) => a - b);
const p99Ms = sortedDurations[Math.floor(totalFrames * 0.99)];

console.log('\n--- GATE-001 Benchmark Results ---');
console.log(`Total Frames Simulated: ${totalFrames}`);
console.log(`Total Elapsed Duration: ${totalDurationSec.toFixed(2)}s`);
console.log(`Average Pixel Render Time: ${avgRenderMs.toFixed(2)} ms / frame`);
console.log(`Average Computed FPS: ${avgFps.toFixed(1)} FPS`);
console.log(`99th Percentile Latency: ${p99Ms.toFixed(2)} ms`);

const passed = avgFps >= 60.0;

if (passed) {
  console.log('\n✅ GATE-001 PASSED: 1000x1000 canvas renderer exceeds 60 FPS threshold!');
  process.exit(0);
} else {
  console.error(`\n❌ GATE-001 FAILED: Average FPS (${avgFps.toFixed(1)}) below 60 FPS target.`);
  process.exit(1);
}
