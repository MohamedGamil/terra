/**
 * Headless Server Engine Benchmark Runner for GATE-002 Verification.
 * Measures Node.js server tick execution duration and delta network encoding performance.
 */

import { GameServerEngine } from '../src/server/game-engine.js';
import { DeltaEncoder } from '../src/server/delta-encoder.js';

console.log('=== Terra GATE-002 Server Tick Engine & Network Benchmark ===');
console.log('Initializing 500-Bot Server Tick Instance on 1000x1000 Grid...');

const engine = new GameServerEngine(1000, 1000, 500);
const totalTicks = 1000; // 1,000 server ticks (50 seconds simulated game time at 20Hz)
const tickDurationsMs = [];
const packetSizesBytes = [];

const startTime = performance.now();

for (let tick = 1; tick <= totalTicks; tick++) {
  // Execute 1 server game tick
  const tickDurationMs = engine.tick();
  tickDurationsMs.push(tickDurationMs);

  // Encode binary delta packet
  const deltaPacket = DeltaEncoder.encodeDelta(engine.tickCount, engine.modifiedPixels);
  packetSizesBytes.push(deltaPacket.byteLength);
}

const totalDurationSec = (performance.now() - startTime) / 1000;
const avgTickMs = tickDurationsMs.reduce((a, b) => a + b, 0) / totalTicks;
const maxTickMs = Math.max(...tickDurationsMs);

// Compute 99th percentile tick latency
const sortedDurations = [...tickDurationsMs].sort((a, b) => a - b);
const p99TickMs = sortedDurations[Math.floor(totalTicks * 0.99)];

// Network Bandwidth metrics
const avgPacketSizeBytes = packetSizesBytes.reduce((a, b) => a + b, 0) / totalTicks;
const throughputKbps = (avgPacketSizeBytes * 20) / 1024; // 20 ticks/sec in KB/s

console.log('\n--- GATE-002 Server Benchmark Results ---');
console.log(`Total Ticks Simulated: ${totalTicks}`);
console.log(`Total Elapsed Execution Time: ${totalDurationSec.toFixed(2)}s`);
console.log(`Average Tick Execution Duration: ${avgTickMs.toFixed(3)} ms / tick`);
console.log(`Max Tick Execution Duration: ${maxTickMs.toFixed(3)} ms`);
console.log(`99th Percentile Tick Latency: ${p99TickMs.toFixed(3)} ms`);
console.log(`Average Delta Packet Payload: ${avgPacketSizeBytes.toFixed(1)} bytes / tick`);
console.log(`Network Throughput per Client: ${throughputKbps.toFixed(2)} KB/s (at 20Hz)`);

// GATE-002 Evaluation: Pass if average tick duration < 15.0ms
const passedGate002 = avgTickMs < 15.0;

if (passedGate002) {
  console.log('\n✅ GATE-002 PASSED: Server tick engine executes 500-bot ticks in < 15ms target threshold!');
  process.exit(0);
} else {
  console.error(`\n❌ GATE-002 FAILED: Average tick duration (${avgTickMs.toFixed(3)}ms) exceeded 15.0ms target.`);
  process.exit(1);
}
