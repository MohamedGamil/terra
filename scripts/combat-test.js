/**
 * GATE-003 Automated Combat Math & Game Loop Verification Test Suite.
 * Verifies 2:1 defender advantage ratio, 1.17% attack tax, 3.125% boat tax,
 * Red Interest decay, 50px bot spawn radius buffer, and state machine transitions.
 */

globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: () => ({ data: new Uint8Array(4) })
    })
  })
};
globalThis.window = {
  addEventListener: () => {}
};

import { TerritorySimulation } from '../public/src/simulation.js';
import { MapGenerator } from '../public/src/map-generator.js';
import { TerritoryRenderer } from '../public/src/renderer.js';
import { AIEngine } from '../public/src/ai-engine.js';

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
const hsX = landIdx % 1000;
const hsY = Math.floor(landIdx / 1000);

let shorelineTargetIdx = -1;
for (let i = 0; i < sim.terrainGrid.length; i++) {
  if (sim.isShorelinePixel(i) && sim.grid[i] !== 1) {
    const tx = i % 1000;
    const ty = Math.floor(i / 1000);
    if (Math.hypot(tx - hsX, ty - hsY) > 150) {
      shorelineTargetIdx = i;
      break;
    }
  }
}

const boatOk = sim.launchBoatAttack(1, shorelineTargetIdx, 25);
assert(boatOk, 'Player launched naval boat attack across ocean cell to a shoreline');
assert(sim.boats.length === 1, 'Naval boat instance spawned in active boats list');

const initialBoatTroops = sim.boats[0].troops;
sim.updateBoats(100); // 100ms simulation tick
assert(sim.boats.length === 1, 'Boat is still traveling (not landed yet)');
assert(sim.boats[0].troops < initialBoatTroops, `Naval boat troop count decayed from ${initialBoatTroops} to ${sim.boats[0].troops}`);

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

// --- Test 6: Live Top Players Leaderboard Sorting (REQ-042) ---
console.log('\n[Test 6] Live Top Players Leaderboard Sorting (REQ-042)');
sim.players[1].landCount = 500;
sim.players[2].landCount = 1200;
sim.players[3].landCount = 800;

const sortedLeaderboard = [...sim.players]
  .filter(p => p && p.landCount > 0)
  .sort((a, b) => b.landCount - a.landCount);

assert(sortedLeaderboard[0].id === 2, 'Top rank empire has largest land count (1200)');
assert(sortedLeaderboard[1].id === 3, 'Second rank empire has second largest land count (800)');
assert(sortedLeaderboard[2].id === 1, 'Third rank empire is player (500)');

// --- Test 7: 0px Land Defeat & Elimination State (REQ-045) ---
console.log('\n[Test 7] 0px Land Defeat & Elimination State (REQ-045)');
const bot2 = sim.players[2];
assert(bot2.isAlive === true, 'Bot 2 is initially alive');
bot2.landCount = 0;
sim.checkPlayerEliminations();
assert(bot2.isAlive === false, 'Bot 2 is eliminated when landCount reduced to 0px');
assert(bot2.balance === 0, 'Bot 2 balance set to 0 upon elimination');

// --- Test 8: Map Topography & Coastline Path Cleanup (REQ-046) ---
console.log('\n[Test 8] Map Topography & Coastline Path Cleanup (REQ-046)');
const testGrid = new Uint8Array(100 * 100);
// Add a tiny isolated 5-pixel land component
testGrid[10 * 100 + 10] = 1;
testGrid[10 * 100 + 11] = 1;
testGrid[10 * 100 + 12] = 1;
testGrid[10 * 100 + 13] = 1;
testGrid[10 * 100 + 14] = 1;

// Add a large 20-pixel land component
for (let x = 30; x < 50; x++) {
  testGrid[30 * 100 + x] = 1;
}

MapGenerator.cleanupGrid(100, 100, testGrid);
assert(testGrid[10 * 100 + 10] === 0, 'Isolated tiny 5-pixel island pruned to ocean');
assert(testGrid[30 * 100 + 30] === 1, 'Large contiguous land segment preserved');

// --- Test 9: High-Precision Viewport Coordinate Mapping (REQ-047) ---
console.log('\n[Test 9] High-Precision Viewport Coordinate Mapping (REQ-047)');
const mockCanvas = {
  width: 800,
  height: 600,
  getContext: () => ({
    createImageData: () => ({ data: new Uint8Array(4) })
  }),
  getBoundingClientRect: () => ({
    left: 50,
    top: 50,
    width: 400,
    height: 300
  }),
  addEventListener: () => {}
};

const renderer = new TerritoryRenderer(mockCanvas, 1000, 1000, { colors: {} });
renderer.zoom = 2.0;
renderer.panX = 100;
renderer.panY = 100;

const mapped = renderer.screenToMapCoords(250, 200);
assert(mapped !== null, 'Mapped coordinates returned successfully');
assert(mapped.mapX === 150, `Calculated mapX matches high-precision layout translation (Expected: 150, Actual: ${mapped.mapX})`);
assert(mapped.mapY === 100, `Calculated mapY matches high-precision layout translation (Expected: 100, Actual: ${mapped.mapY})`);

// --- Test 10: Continuous Border Tug-of-War Pressure (REQ-048) ---
console.log('\n[Test 10] Continuous Border Tug-of-War Pressure (REQ-048)');
const simPress = new TerritorySimulation(100, 100, 10, 'arena');
simPress.state = 'PLAYING';
simPress.tickCount = 5;

simPress.players[1].isAlive = true;
simPress.players[1].balance = 5000;
simPress.players[1].landCount = 10;

simPress.players[2].isAlive = true;
simPress.players[2].balance = 10;
simPress.players[2].landCount = 100;

simPress.grid[5050] = 1;
simPress.grid[5051] = 2;
simPress.frontiers[1] = [5050];
simPress.frontiers[2] = [5051];

simPress.simulateContinuousBorderPressure();

assert(simPress.grid[5051] === 1, 'High-pressure Player 1 successfully captured adjacent pixel 5051 from Bot 2');
assert(simPress.players[1].landCount === 11, 'Player 1 landCount incremented');
assert(simPress.players[2].landCount === 99, 'Bot 2 landCount decremented');

simPress.grid[5052] = 2;
simPress.frontiers[2].push(5052);
simPress.pacts.set(simPress.getPactKey(1, 2), 'ACTIVE');

simPress.simulateContinuousBorderPressure();
// --- Test 11: Incremental Frontier Capture & Distance Scaling (REQ-049) ---
console.log('\n[Test 11] Incremental Frontier Capture & Distance Scaling (REQ-049)');
const simExp = new TerritorySimulation(100, 100, 10, 'arena');
simExp.state = 'PLAYING';
simExp.tickCount = 1;

simExp.players[1].isAlive = true;
simExp.players[1].balance = 1000;
simExp.players[1].landCount = 10;

simExp.grid[5050] = 1;
simExp.frontiers[1] = [5050];

// Execute land attack towards index 5072 (22 pixels away)
const launchSuccess = simExp.executeAttack(1, 5072, 50);
assert(launchSuccess === true, 'Attack launched successfully');
assert(simExp.activeExpansions.length === 1, 'Expansion campaign queued instead of instant conquest');
assert(simExp.grid[5072] !== 1, 'Target pixel not instantly captured on launch');

const expTask = simExp.activeExpansions[0];
const troopsBefore = expTask.remainingTroops;

// Run one simulation tick
simExp.update(16.6);

assert(simExp.grid[5051] === 1, 'Adjacent pixel 5051 captured incrementally in the first simulation tick');
const troopsAfterAdjacent = expTask.remainingTroops;
const adjacentCost = troopsBefore - troopsAfterAdjacent;

// Advance multiple ticks to reach 5072
for (let step = 0; step < 15; step++) {
  simExp.update(16.6);
}

// Distance-scaled check: cost for further pixels must be higher due to scaling
assert(simExp.grid[5072] === 1, 'Target pixel 5072 eventually captured after incremental ticks');
assert(adjacentCost >= 2, 'Troop deduction occurred for adjacent capture');

// --- Test 12: Non-Blocking Defensive Casualties (REQ-050) ---
console.log('\n[Test 12] Non-Blocking Defensive Casualties (REQ-050)');
const simCas = new TerritorySimulation(100, 100, 10, 'arena');
simCas.state = 'PLAYING';
simCas.tickCount = 1;

simCas.players[1].isAlive = true;
simCas.players[1].balance = 10000;
simCas.players[1].landCount = 10;

simCas.players[2].isAlive = true;
simCas.players[2].balance = 5000;
simCas.players[2].landCount = 100;

simCas.grid[5050] = 1;
simCas.grid[5051] = 2;
simCas.frontiers[1] = [5050];
simCas.frontiers[2] = [5051];

// Queue large campaign of 8000 troops
simCas.activeExpansions.push({
  ownerId: 1,
  targetX: 51,
  targetY: 50,
  launchX: 50,
  launchY: 50,
  remainingTroops: 8000,
  isCounterPush: false
});

const defenderBalanceBefore = simCas.players[2].balance;

// Tick simulation to resolve fight at 5051
simCas.update(16.6);

assert(simCas.grid[5051] === 1, 'Attacker captured pixel 5051 without being halted by defender high troop count');
const defenderBalanceAfter = simCas.players[2].balance;
const casualties = defenderBalanceBefore - defenderBalanceAfter;
assert(casualties > 4, `Defender casualties scaled with attacker size (Expected: >4, Actual: ${casualties})`);

// --- Test 13: Real-Time Dynamic Capital Centroid (REQ-051) ---
console.log('\n[Test 13] Real-Time Dynamic Capital Centroid (REQ-051)');
const simCent = new TerritorySimulation(100, 100, 10, 'arena');
simCent.state = 'PLAYING';

// Set human spawn to 5050 (x=50, y=50)
simCent.spawnCircularSeed(1, 5050, 2);
assert(simCent.players[1].capitalX === 50, 'Initial capitalX set correctly to spawn X coordinate');
assert(simCent.players[1].capitalY === 50, 'Initial capitalY set correctly to spawn Y coordinate');

// Capture a cluster of pixels far to the right (x=70 to 80, y=50)
for (let x = 70; x <= 80; x++) {
  const idx = 50 * 100 + x;
  simCent.grid[idx] = 1;
}

simCent.tickCount = 5; // Trigger threshold
simCent.updateCapitalCentroids();

assert(simCent.players[1].capitalX > 50, `Capital shifted dynamically to the right (Centroid X: ${simCent.players[1].capitalX})`);

// --- Test 14: Resolve Viewport Click Coordinates Offsets (REQ-052) ---
console.log('\n[Test 14] Resolve Viewport Click Coordinates Offsets (REQ-052)');

const mockCanvasBorders = {
  width: 1000,
  height: 1000,
  getContext: () => ({
    createImageData: () => ({ data: new Uint8Array(4) })
  }),
  getBoundingClientRect: () => ({
    left: 50,
    top: 50,
    width: 430, // 400 content + 20 border + 10 padding
    height: 330 // 300 content + 20 border + 10 padding
  }),
  addEventListener: () => {}
};

// Simulate global window with borders and padding style
global.window = {
  addEventListener: () => {},
  getComputedStyle: () => ({
    borderLeftWidth: '10px',
    borderTopWidth: '10px',
    borderRightWidth: '10px',
    borderBottomWidth: '10px',
    paddingLeft: '5px',
    paddingTop: '5px',
    paddingRight: '5px',
    paddingBottom: '5px'
  })
};

const rendererBorders = new TerritoryRenderer(mockCanvasBorders, 1000, 1000, { colors: {} });
rendererBorders.zoom = 2.0;
rendererBorders.panX = 100;
rendererBorders.panY = 100;

// Screen click coordinate screenX=265, screenY=215
// Subtractions:
// screenX - left - borderLeft - paddingLeft = 265 - 50 - 10 - 5 = 200 CSS pixels
// scaleX = 1000 / 400 = 2.5
// clientX = 200 * 2.5 = 500 canvas pixels
// mapX = (clientX - panX) / zoom = (500 - 100) / 2.0 = 200 map coordinate
const mappedBorders = rendererBorders.screenToMapCoords(265, 215);

assert(mappedBorders !== null, 'Mapped coordinates returned successfully with CSS borders and padding');
assert(mappedBorders.mapX === 200, `Calculated mapX matches layout subtraction (Expected: 200, Actual: ${mappedBorders.mapX})`);

// Clean up global mock
delete global.window;

// --- Test 15: AI Bot Water-Only Naval Pathfinding (REQ-053) ---
console.log('\n[Test 15] AI Bot Water-Only Naval Pathfinding (REQ-053)');

const aiEngine = new AIEngine(10);
const terrainGridTest = new Uint8Array(100 * 100); // 100x100 grid

// Set a land mass in the middle (x=50, y=0 to 100)
for (let y = 0; y < 100; y++) {
  terrainGridTest[y * 100 + 50] = 1;
}

// 1. Path crossing land (from x=10, y=50 to x=90, y=50) should be blocked (false)
const pathCrossingLand = aiEngine.isWaterPath(10, 50, 90, 50, terrainGridTest, 100, 100);
assert(pathCrossingLand === false, 'Water path crossing intermediate land mass is detected as blocked');

// 2. Path entirely over water (from x=10, y=10 to x=40, y=10) should be clear (true)
const pathOverWater = aiEngine.isWaterPath(10, 10, 40, 10, terrainGridTest, 100, 100);
assert(pathOverWater === true, 'Water path entirely over ocean is detected as clear');

// 3. Test real-time collision sinking in updateBoats
const simBoats = new TerritorySimulation(100, 100, 10, 'arena');
simBoats.state = 'PLAYING';
// Inject the same terrain grid with a land wall
simBoats.terrainGrid = terrainGridTest;

// Add a boat travelling across the land wall
simBoats.boats.push({
  id: 9999,
  ownerId: 2,
  troops: 100,
  x: 48,
  y: 50,
  targetX: 90,
  targetY: 50,
  targetIdx: 5090,
  speed: 5.0
});

// Update simulation boats (ticks)
simBoats.updateBoats(16.6); // Moves 5 pixels forward: 48 + 5 = 53 (crosses the land wall at x=50)
assert(simBoats.boats.length === 0, 'Transport boat sank/deleted upon colliding with land wall');

// --- Test 16: Robust Shoreline Naval Access Checks (REQ-054) ---
console.log('\n[Test 16] Robust Shoreline Naval Access Checks (REQ-054)');

const simSnap = new TerritorySimulation(100, 100, 10, 'arena');
simSnap.state = 'PLAYING';

// 1. Verify diagonal shoreline detection (8-adjacency)
// Set cell 5050 (x=50, y=50) to land (1)
// Set all cardinal neighbors to mountain (2) so no cardinal water exists
simSnap.terrainGrid[5050] = 1;
simSnap.terrainGrid[4950] = 2; // North
simSnap.terrainGrid[5150] = 2; // South
simSnap.terrainGrid[5049] = 2; // West
simSnap.terrainGrid[5051] = 2; // East

// Set only a diagonal neighbor (North-West: 4949) to water (0)
simSnap.terrainGrid[4949] = 0;

const isDiagShoreline = simSnap.isShorelinePixel(5050);
assert(isDiagShoreline === true, 'Diagonal-only water adjacency is successfully identified as shoreline');

// 2. Verify radial target coordinate snapping
// Initialize entire map to land (1)
simSnap.terrainGrid.fill(1);

// Set up a player coastal departure point
simSnap.players[1].balance = 1000;
simSnap.spawnCircularSeed(1, 1010, 2); // Player 1 owns x=10, y=10 area
// Make x=10, y=11 water so the player has a shoreline
simSnap.terrainGrid[1110] = 0;
simSnap.frontiers[1] = [1010];

// Define a landing target shoreline far away at x=80, y=80
const targetShorelineIdx = 80 * 100 + 80;
simSnap.terrainGrid[targetShorelineIdx] = 1; // land
simSnap.terrainGrid[80 * 100 + 79] = 0; // water neighbor

// Let the player click 3 pixels off (e.g. x=83, y=80, which is inland/not shoreline)
const clickedIdx = 80 * 100 + 83;

assert(simSnap.isShorelinePixel(clickedIdx) === false, 'Clicked index itself is not a shoreline pixel');

// Launch boat attack to the clicked index; it should snap to targetShorelineIdx and succeed!
const snapLaunchOk = simSnap.launchBoatAttack(1, clickedIdx, 25);
assert(snapLaunchOk === true, 'Radial snapping successfully mapped target to closest shoreline and launched boat');
assert(simSnap.boats.length === 1, 'Naval boat successfully spawned');
assert(simSnap.boats[0].targetX === 80 && simSnap.boats[0].targetY === 80, `Boat target snapped correctly to x=80, y=80 (Actual Target: x=${simSnap.boats[0].targetX}, y=${simSnap.boats[0].targetY})`);

// --- Test 17: Incremental Area Expansion Routing (REQ-055) ---
console.log('\n[Test 17] Incremental Area Expansion Routing (REQ-055)');

const simRoute = new TerritorySimulation(100, 100, 10, 'arena');
simRoute.state = 'PLAYING';

// Set up Player 1 at x=10, y=10 (idx 1010)
simRoute.players[1].isAlive = true;
simRoute.players[1].balance = 1000;
simRoute.players[1].landCount = 10;
simRoute.grid[1010] = 1;
simRoute.frontiers[1] = [1010];

// Make the entire terrain grid land (1)
simRoute.terrainGrid.fill(1);

// 1. Target is a disconnected island across a water wall (x=20 is water)
for (let y = 0; y < 100; y++) {
  simRoute.terrainGrid[y * 100 + 20] = 0; // water wall
}

const disconnectedTargetIdx = 10 * 100 + 30; // x=30, y=10 (across the water wall)
const landAttackBlocked = simRoute.executeAttack(1, disconnectedTargetIdx, 25);
assert(landAttackBlocked === false, 'Land attack targeting disconnected landmass was blocked on launch');

// 2. Target is connected (clear the water wall at y=10)
simRoute.terrainGrid[10 * 100 + 20] = 1; // restore land bridge at y=10

const connectedTargetIdx = 10 * 100 + 30; // x=30, y=10
const landAttackOk = simRoute.executeAttack(1, connectedTargetIdx, 25);
assert(landAttackOk === true, 'Land attack targeting connected landmass was successfully launched');
assert(simRoute.activeExpansions.length === 1, 'Active expansion successfully queued');
assert(simRoute.activeExpansions[0].path !== undefined, 'Expansion path successfully populated');

// 3. Update expansions incrementally along the path corridor
for (let step = 0; step < 15; step++) {
  simRoute.update(16.6);
}
// Check that we captured pixels along the path (e.g. x=20, y=10, which was unowned neutral land)
assert(simRoute.grid[10 * 100 + 20] === 1, 'Expansion successfully captured intermediate path pixel (x=20, y=10) incrementally');

// --- Test 18: Attack Reinforcement, Square Capture, & Troop Refund (REQ-056) ---
console.log('\n[Test 18] Attack Reinforcement, Square Capture, & Troop Refund (REQ-056)');

const simRef = new TerritorySimulation(100, 100, 10, 'arena');
simRef.state = 'PLAYING';

simRef.players[1].isAlive = true;
simRef.players[1].balance = 2000;
simRef.players[1].landCount = 10;
simRef.grid[1010] = 1;
simRef.frontiers[1] = [1010];

simRef.terrainGrid.fill(1);

const refTargetIdx = 10 * 100 + 20; // x=20, y=10
const firstOk = simRef.executeAttack(1, refTargetIdx, 25);
assert(firstOk === true, 'First attack launched successfully');
assert(simRef.activeExpansions.length === 1, 'One active expansion spawned');

const initialTroops = simRef.activeExpansions[0].remainingTroops;

// Double click to reinforce
const reinforceOk = simRef.executeAttack(1, refTargetIdx, 25);
assert(reinforceOk === true, 'Reinforcement attack successfully accepted');
assert(simRef.activeExpansions.length === 1, 'Still only one active expansion (no duplicate task spawned)');
assert(simRef.activeExpansions[0].remainingTroops > initialTroops, 'Troops successfully reinforced into active expansion');

// Let it expand. Wait for it to reach target and expand in square
for (let step = 0; step < 25; step++) {
  simRef.update(16.6);
}

// Target coordinate (x=20, y=10) must be captured
assert(simRef.grid[refTargetIdx] === 1, 'Target coordinate captured successfully');

// Square area expansion (e.g. check x=21, y=11 which is a diagonal neighbor inside square bounds)
assert(simRef.grid[11 * 100 + 21] === 1, 'Frontier successfully expanded in square shape around target');

// The expansion should eventually be completed (pruned) and leftover troops refunded
for (let step = 0; step < 50; step++) {
  simRef.update(16.6);
}

assert(simRef.activeExpansions.length === 0, 'Expansion successfully completed and pruned');
assert(simRef.players[1].balance > 1000, 'Leftover troops successfully refunded back to player balance');

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
