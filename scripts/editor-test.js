/**
 * Verification Suite for BATON-028: Interactive Map Editor & Custom Territory Designer.
 */

import { MapEditor } from '../public/src/map-editor.js';
import { TerritorySimulation } from '../public/src/simulation.js';

console.log('=== Terra BATON-028 Interactive Map Editor Verification ===\n');

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

// --- Test 1: MapEditor Initialization & Painting ---
console.log('[Test 1] MapEditor Initialization & Brush Painting');
const editor = new MapEditor(1000, 1000);
assert(editor.width === 1000 && editor.height === 1000, 'MapEditor initializes 1000x1000 grid');
assert(editor.terrainGrid.every(v => v === 0), 'Initial terrain grid is 100% ocean water');

editor.setTool('land');
editor.setBrushRadius(10);
editor.paintAt(500, 500);

const stats1 = editor.getStatistics();
console.log(`  Painted Land Pixels: ${stats1.landCount} (${stats1.landPct}%)`);
assert(stats1.landCount > 250, 'Land brush successfully painted circular land region');

// --- Test 2: Flood Fill Bucket Tool ---
console.log('\n[Test 2] Flood Fill Bucket Tool');
editor.setTool('fill');
editor.paintAt(100, 100); // Flood fill ocean at (100,100) with land

const stats2 = editor.getStatistics();
console.log(`  After Flood Fill Land Pixels: ${stats2.landCount} (${stats2.landPct}%)`);
assert(stats2.landCount === 1000000, 'Flood fill bucket filled entire connected land area to 100%');

// --- Test 3: Spawn Point Markers ---
console.log('\n[Test 3] Custom Spawn Point Markers');
editor.setTool('spawn');
editor.paintAt(200, 200);
editor.paintAt(800, 800);

assert(editor.customSpawns.length === 2, 'Custom spawn markers placed at (200,200) and (800,800)');
assert(editor.customSpawns[0].x === 200 && editor.customSpawns[0].y === 200, 'Spawn point 1 coordinates stored accurately');

// --- Test 4: Custom Map JSON Serialization & Deserialization ---
console.log('\n[Test 4] JSON Export & Import Integrity');
const exportedJSON = editor.exportToJSON('Testing Island Map');
assert(exportedJSON.name === 'Testing Island Map', 'Exported JSON contains map name');
assert(exportedJSON.terrainGrid.length === 1000000, 'Exported JSON contains 1,000,000 grid cells');
assert(exportedJSON.customSpawns.length === 2, 'Exported JSON preserves 2 custom spawns');

const newEditor = new MapEditor(1000, 1000);
newEditor.importFromJSON(exportedJSON);
const statsImported = newEditor.getStatistics();
assert(statsImported.landCount === 1000000, 'Imported JSON restored land terrain grid accurately');
assert(newEditor.customSpawns.length === 2, 'Imported JSON restored custom spawn markers');

// --- Test 5: Game Simulation Integration ---
console.log('\n[Test 5] TerritorySimulation Custom Map Integration');
const customSim = new TerritorySimulation(1000, 1000, 50, 'custom', 12345, exportedJSON);
assert(customSim.terrainGrid[500000] === 1, 'TerritorySimulation loaded custom terrain grid');

customSim.startSpawnPhase();
customSim.confirmSpawnsAndStart();
assert(customSim.state === 'PLAYING', 'TerritorySimulation launched match successfully using custom map');

// --- Summary ---
console.log(`\n--- BATON-028 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-028 PASSED: Interactive Map Editor & Custom Territory Designer verified successfully!');
  process.exit(0);
} else {
  console.error('\n❌ BATON-028 FAILED: Assertion errors detected.');
  process.exit(1);
}
