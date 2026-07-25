/**
 * Automated Verification Suite for BATON-023: Post-Match Replay & Statistics Dashboard.
 * Tests MatchRecorder telemetry sampling, APM calculations, and leaderboard standings ranking.
 */

import { MatchRecorder } from '../public/src/match-recorder.js';

console.log('=== Terra BATON-023 Post-Match Replay & Statistics Verification ===\n');

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

// --- Test 1: MatchRecorder Initialization & Start ---
console.log('[Test 1] MatchRecorder Initialization');
const recorder = new MatchRecorder(1.0);
recorder.start();

assert(recorder.elapsedSeconds === 0, 'Initial elapsed seconds set to 0');
assert(recorder.timelineSamples.length === 0, 'Initial timeline samples array is empty');

// --- Test 2: Telemetry Sampling & APM Calculation ---
console.log('\n[Test 2] Time-Series Telemetry Sampling & APM Tracking');

const mockPlayers = [
  { id: 1, name: 'Commander', isHuman: true, balance: 1500, landCount: 200, isDead: false, color: '#00f2fe' },
  { id: 2, name: 'Bot 2', isHuman: false, balance: 800, landCount: 150, isDead: false, color: '#ff0055' },
  { id: 3, name: 'Bot 3', isHuman: false, balance: 300, landCount: 50, isDead: true, color: '#00ffaa' }
];

// Record user actions
recorder.recordUserAction();
recorder.recordUserAction();
recorder.recordUserAction();

// Sample at t = 1.0s
recorder.sample(1.0, mockPlayers, 1000);
// Sample at t = 2.0s
recorder.sample(2.0, mockPlayers, 1000);
// Sample at t = 60.0s (1 min)
recorder.recordUserAction(); // 4th action
recorder.sample(60.0, mockPlayers, 1000);

assert(recorder.timelineSamples.length === 3, 'Recorded 3 time-series snapshots across elapsed duration');
assert(recorder.getAPM() === 4, `APM correctly calculated as 4 APM over 60 seconds (Recorded: ${recorder.getAPM()})`);

// --- Test 3: Standings & Post-Match Summary Generation ---
console.log('\n[Test 3] Leaderboard Standings & Summary Compilation');

const summary = recorder.getSummary();

assert(summary.durationSeconds === 60, 'Summary reflects 60 seconds duration');
assert(summary.totalPlayers === 3, 'Summary includes 3 total players');
assert(summary.winner.name === 'Commander', `Winner correctly identified as highest land/survived player (Winner: ${summary.winner.name})`);
assert(summary.humanRank === 1, 'Human player ranked #1 in final standings');
assert(summary.standings[0].peakLandPct === 20.0, `Peak land percentage correctly calculated (20.0%)`);

// --- Summary ---
console.log(`\n--- BATON-023 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-023 PASSED: Post-Match Replay & Statistics Dashboard telemetry verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ BATON-023 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
