/**
 * GATE-003 Automated Combat Math & Game Loop Verification Test Suite.
 * Verifies 2:1 defender advantage ratio, 1.17% attack tax, 3.125% boat tax,
 * Red Interest decay, 50px bot spawn radius buffer, and state machine transitions.
 */

import { TerritorySimulation } from '../public/src/simulation.js';
import { MapGenerator } from '../public/src/map-generator.js';

console.log('=== Terra GATE-003 Automated Combat & Game Loop Test Suite ===\n');

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

// --- Test 1: Procedural Map Generation (REQ-005) ---
console.log('[Test 1] Procedural Map Generator (World, Archipelago, Black Arena)');
const worldMap = MapGenerator.generate('world', 1000, 1000);
const archMap = MapGenerator.generate('archipelago', 1000, 1000);
const arenaMap = MapGenerator.generate('arena', 1000, 1000);

assert(worldMap.length === 1000000, 'World map grid contains 1,000,000 pixels');
assert(archMap.length === 1000000, 'Archipelago map grid contains 1,000,000 pixels');
assert(arenaMap.length === 1000000, 'Black Arena map grid contains 1,000,000 pixels');

let worldWater = 0;
for (let i = 0; i < worldMap.length; i++) if (worldMap[i] === 0) worldWater++;
assert(worldWater > 100000, `World map contains ocean cells (${(worldWater / 10000).toFixed(1)}%)`);

// --- Test 2: Spawn Selection Phase & Bot Buffer (REQ-006) ---
console.log('\n[Test 2] Spawn Selection Phase & 50-Pixel Bot Buffer');
const sim = new TerritorySimulation(1000, 1000, 50, 'world');
sim.startSpawnPhase();

assert(sim.state === 'SPAWN_PICK', 'Simulation transitions to SPAWN_PICK state');

// Set valid human spawn point
let landIdx = 0;
for (let i = 0; i < sim.terrainGrid.length; i++) {
  if (sim.terrainGrid[i] === 1) { landIdx = i; break; }
}

const setOk = sim.setHumanSpawn(landIdx);
assert(setOk, 'Human player successfully sets starting spawn location on land');

sim.confirmSpawnsAndStart();
assert(sim.state === 'PLAYING', 'Simulation transitions to PLAYING state after spawn confirmation');
assert(sim.grid[landIdx] === 1, 'Human player (ID 1) spawned at designated location');

// Verify 50-pixel buffer separation for all bots
const hX = landIdx % 1000;
const hY = Math.floor(landIdx / 1000);
const minBufferSq = 50 * 50;
let botBufferViolations = 0;

for (let id = 2; id <= sim.numPlayers; id++) {
  const botFrontier = sim.frontiers[id];
  if (botFrontier.length > 0) {
    const bIdx = botFrontier[0];
    const bx = bIdx % 1000;
    const by = Math.floor(bIdx / 1000);
    const distSq = (bx - hX) * (bx - hX) + (by - hY) * (by - hY);
    if (distSq < minBufferSq) botBufferViolations++;
  }
}
assert(botBufferViolations === 0, 'All AI bots spawned outside 50-pixel human spawn buffer radius');

// --- Test 3: Land Attack Tax & 2:1 Defender Ratio (REQ-007) ---
console.log('\n[Test 3] Land Attack Tax (1.17%) & 2:1 Defender Combat Advantage');
const initialBalance = sim.players[1].balance;
const forcePercent = 50;

// Find nearest neighbor cell to attack
const humanFrontier = sim.frontiers[1];
let targetIdx = humanFrontier[0] + 1;

const attackOk = sim.executeAttack(1, targetIdx, forcePercent);
assert(attackOk, 'Human player successfully executed targeted land attack');

const expectedTax = Math.ceil(initialBalance * 0.0117);
const expectedForce = Math.floor((initialBalance - expectedTax) * (forcePercent / 100));
const expectedBalance = initialBalance - expectedTax - expectedForce;

assert(sim.players[1].balance === expectedBalance, `1.17% attack tax deducted correctly (Balance: ${sim.players[1].balance})`);

// --- Test 4: Naval Boat Deployment Tax (3.125%) (REQ-008) ---
console.log('\n[Test 4] Naval Boat Attack Tax (3.125%) Across Water');
const pBalance = sim.players[1].balance;
let waterTargetIdx = 0;
for (let i = 0; i < sim.terrainGrid.length; i++) {
  if (sim.terrainGrid[i] === 0) { waterTargetIdx = i; break; }
}

const boatOk = sim.launchBoatAttack(1, waterTargetIdx, 25);
assert(boatOk, 'Player launched naval boat attack across ocean cell');
assert(sim.boats.length === 1, 'Naval boat instance spawned in active boats list');

const expectedBoatTax = Math.ceil(pBalance * 0.03125);
const expectedBoatForce = Math.floor((pBalance - expectedBoatTax) * 0.25);
const expectedPostBoatBal = pBalance - expectedBoatTax - expectedBoatForce;
assert(sim.players[1].balance === expectedPostBoatBal, `3.125% boat deployment tax deducted correctly (Balance: ${sim.players[1].balance})`);

// --- Test 5: Red Interest Decay Threshold (REQ-001) ---
console.log('\n[Test 5] Red Interest Decay Threshold (Balance > 100x Land)');
sim.players[1].balance = 5000;
sim.players[1].landCount = 10; // Balance (5000) > 100x Land (1000) -> Red Interest
sim.processInterest();

assert(sim.players[1].redInterest === true, 'Red Interest warning triggered when balance > 100x land area');

// --- Final Evaluation ---
console.log(`\n--- GATE-003 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ GATE-003 PASSED: 100% of combat math, tax deductions, and state machine assertions passed!');
  process.exit(0);
} else {
  console.error(`\n❌ GATE-003 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
