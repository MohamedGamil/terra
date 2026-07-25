/**
 * Unit Test Suite for BATON-029 Player ELO Rating & Local Progression
 */
import assert from 'assert';
import { PlayerProgressionManager } from '../public/src/progression.js';

console.log('=== Terra BATON-029 ELO & Progression Test Suite ===');

// Mock localStorage for node environment
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; }
};

const pm = new PlayerProgressionManager();

console.log('[Test 1] Initial Progression State & Tier');
assert.strictEqual(pm.state.elo, 1200, 'Default ELO rating initialized to 1200');
assert.strictEqual(pm.getRankTier(1200), 'Gold', 'Initial 1200 ELO mapped to Gold tier');

console.log('\n[Test 2] ELO Delta Calculation');
const winDelta = pm.calculateEloDelta(1, 100, 'medium');
assert(winDelta > 0, `1st place victory yields positive ELO delta (+${winDelta})`);

const lossDelta = pm.calculateEloDelta(100, 100, 'medium');
assert(lossDelta < 0, `100th place defeat yields negative ELO delta (${lossDelta})`);

console.log('\n[Test 3] Record Match Result & State Persistence');
const res = pm.recordMatchResult(1, 100, 4500, 'hard');
assert(pm.state.matchesPlayed === 1, 'Matches played incremented');
assert(pm.state.wins === 1, 'Wins count incremented for 1st place');
assert(pm.state.totalLandConquered === 4500, 'Total land conquered updated');
assert(pm.state.history.length === 1, 'Match history recorded');

console.log('\n--- BATON-029 Verification Summary ---');
console.log('Tests Passed: All ELO rating & progression assertions passed successfully!');
