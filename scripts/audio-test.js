/**
 * Automated Verification Suite for BATON-019: WebAudio Real-Time Sound Effects Engine.
 * Verifies SoundEngine state management, volume control, mute toggling, and non-blocking playback.
 */

import { SoundEngine } from '../public/src/audio.js';

console.log('=== Terra BATON-019 WebAudio Sound Engine Verification ===\n');

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

// --- Test 1: SoundEngine Initialization & Volume Controls ---
console.log('[Test 1] SoundEngine Initialization & Volume Controls');
const sound = new SoundEngine();

assert(sound.isMuted === false, 'Initial sound state is UNMUTED');
assert(sound.masterVolume === 0.3, 'Initial master volume is set to 0.3 (30%)');

const muted = sound.toggleMute();
assert(muted === true, 'toggleMute() returns true (MUTED)');
assert(sound.isMuted === true, 'isMuted property updated to true');

const unmuted = sound.toggleMute();
assert(unmuted === false, 'toggleMute() returns false (UNMUTED)');

sound.setVolume(0.8);
assert(sound.masterVolume === 0.8, 'setVolume(0.8) updated master volume to 0.8');

// --- Test 2: Safe Synthesis Method Invocations (Non-blocking / Headless Fallback) ---
console.log('\n[Test 2] Headless Safe Method Invocations');

let safeExecution = true;
try {
  sound.playClick();
  sound.playAttack();
  sound.playBoat();
  sound.playInterestChime();
  sound.playVictoryFanfare();
  sound.playDefeatStinger();
} catch (e) {
  safeExecution = false;
  console.error(e);
}

assert(safeExecution, 'All procedural sound synthesis methods execute safely without throwing exceptions');

// --- Summary ---
console.log(`\n--- BATON-019 Verification Summary ---`);
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✅ BATON-019 PASSED: WebAudio Sound Effects Engine verified successfully!');
  process.exit(0);
} else {
  console.error(`\n❌ BATON-019 FAILED: ${testsFailed} assertion errors detected.`);
  process.exit(1);
}
