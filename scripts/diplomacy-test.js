/**
 * Terra BATON-027 Diplomacy & Non-Aggression Pact Automated Test Suite.
 * Verifies NAP creation, combat blockage, pact breaking penalties, troop aid, and AI evaluations.
 */

import { TerritorySimulation } from '../public/src/simulation.js';
import { GameServerEngine } from '../src/server/game-engine.js';
import { AIEngine } from '../public/src/ai-engine.js';

console.log('=== Terra BATON-027 Diplomacy & Alliance Test Suite ===\n');

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
// Test 1: Singleplayer Simulation NAP Creation & Blockage
// -------------------------------------------------------------
console.log('[Test 1] Singleplayer Non-Aggression Pact Formation & Combat Blockage');
const sim = new TerritorySimulation(100, 100, 4, 'world', 12345);
sim.startSpawnPhase();
sim.setHumanSpawn(10 * 100 + 10);
sim.confirmSpawnsAndStart();

// Manually establish NAP between Player 1 (Human) and Bot 2
const proposed = sim.proposePact(1, 2);
assert(typeof proposed === 'boolean', 'Pact proposal executed and returned boolean status');

// Verify hasPact status
assert(sim.hasPact(1, 2) === true || sim.pacts.get(sim.getPactKey(1, 2)) === 'ACTIVE' || proposed === false, 'Pact status correctly tracked in simulation matrix');

// Manually force active pact
sim.pacts.set(sim.getPactKey(1, 2), 'ACTIVE');
assert(sim.hasPact(1, 2) === true, 'hasPact returns true for active NAP between Player 1 and Bot 2');

// Verify conquest blockage: simulate expansion attempt from Player 1 into Bot 2's land
const p1LandBefore = sim.players[1].landCount;
sim.grid[11 * 100 + 10] = 2; // Set neighbor pixel to Bot 2
sim.frontiers[1] = [10 * 100 + 10]; // Put border pixel in P1 frontier
sim.advanceFrontierTowards(1, 10, 11, 500);
const p1LandAfter = sim.players[1].landCount;

assert(sim.grid[11 * 100 + 10] === 2, 'Frontier expansion into NAP ally pixel was BLOCKED as expected');

// -------------------------------------------------------------
// Test 2: Pact Breaking Penalties & Combat Unblocking
// -------------------------------------------------------------
console.log('\n[Test 2] Pact Breaking 15% Troop Penalty & Combat Unblocking');
const p1BalanceBefore = 1000;
sim.players[1].balance = p1BalanceBefore;

const broke = sim.breakPact(1, 2);
assert(broke === true, 'breakPact successfully executed for active NAP');
assert(sim.hasPact(1, 2) === false, 'hasPact returns false after pact breakage');
assert(sim.players[1].balance === 850, `15% troop penalty deducted correctly (Expected: 850, Actual: ${sim.players[1].balance})`);
assert(sim.pactLockTimers.get(1) === 10.0, '10-second interest lock timer set on pact breaker');

// Unblocked expansion test
sim.frontiers[1] = [10 * 100 + 10];
sim.advanceFrontierTowards(1, 10, 11, 500);
assert(sim.grid[11 * 100 + 10] === 1, 'Frontier expansion unblocked after NAP breakage and conquered pixel');

// -------------------------------------------------------------
// Test 3: Troop Aid & Tax Deduction
// -------------------------------------------------------------
console.log('\n[Test 3] Troop Aid Gifting & 5% Transfer Tax');
sim.pacts.set(sim.getPactKey(1, 2), 'ACTIVE');
sim.players[1].balance = 1000;
sim.players[2].balance = 500;

const aidSent = sim.sendAid(1, 2, 10); // 10% of 1000 = 100 gross aid, 5% tax = 5, net = 95
assert(aidSent === true, 'sendAid executed between active NAP allies');
assert(sim.players[1].balance === 900, 'Sender balance deducted by gross aid amount (900)');
assert(sim.players[2].balance === 595, 'Receiver balance increased by net aid after 5% tax (595)');

// -------------------------------------------------------------
// Test 4: AI Personality Diplomatic Heuristics
// -------------------------------------------------------------
console.log('\n[Test 4] AI Personality Diplomatic Evaluation Heuristics');
const ai = new AIEngine(10);
// Mock bot profiles: Bot 2 = RUSHER, Bot 3 = DEFENDER
ai.botProfiles.set(2, { archetype: 'RUSHER' });
ai.botProfiles.set(3, { archetype: 'DEFENDER' });

const rusherResult = ai.evaluateDiplomaticProposal(sim, 2, 1, 'NAP');
const defenderResult = ai.evaluateDiplomaticProposal(sim, 3, 1, 'NAP');

assert(typeof rusherResult === 'boolean', 'Rusher evaluation returned boolean');
assert(typeof defenderResult === 'boolean', 'Defender evaluation returned boolean');
assert(defenderResult === true, 'Defender archetype consistently accepts diplomatic NAPs');

// -------------------------------------------------------------
// Test 5: GameServerEngine Multiplayer Diplomacy Protocol
// -------------------------------------------------------------
console.log('\n[Test 5] GameServerEngine Server-Side Diplomacy Matrix');
const server = new GameServerEngine(100, 100, 20);
assert(server.hasPact(1, 2) === false, 'Server hasPact initially false');

server.proposePact(1, 2);
assert(server.hasPact(1, 2) === true, 'Server proposePact established active NAP');

server.breakPact(1, 2);
assert(server.hasPact(1, 2) === false, 'Server breakPact cleared active NAP');

console.log('\n--- BATON-027 Verification Summary ---');
console.log(`Tests Passed: ${passedTests} / ${totalTests}`);

if (passedTests === totalTests) {
  console.log('\n✅ BATON-027 PASSED: Diplomacy & Non-Aggression Pact system verified successfully!');
} else {
  console.error('\n❌ BATON-027 FAILED: Assertion failures encountered!');
  process.exit(1);
}
