import { spawn } from 'child_process';
import WebSocket from 'ws';
import { GeoJSONWorldMap } from '../public/src/geojson-world-map.js';

console.log('=== Terra Multiplayer WebSocket Server Integration Test ===\n');

let serverProcess = null;
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

function decodeStateTick(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const type = view.getUint8(0);
  const numPlayers = view.getUint8(1);
  
  const players = [];
  let offset = 2;
  for (let i = 0; i < numPlayers; i++) {
    const id = view.getUint32(offset, true);
    const balance = view.getUint32(offset + 4, true);
    const landCount = view.getUint32(offset + 8, true);
    players.push({ id, balance, landCount });
    offset += 12;
  }
  
  const numExpansions = view.getUint16(offset, true);
  offset += 2;
  
  const expansions = [];
  for (let i = 0; i < numExpansions; i++) {
    const ownerId = view.getUint32(offset, true);
    const x = view.getUint32(offset + 4, true);
    const y = view.getUint32(offset + 8, true);
    const remainingTroops = view.getUint32(offset + 12, true);
    expansions.push({ ownerId, x, y, remainingTroops });
    offset += 16;
  }
  
  return { type, players, expansions };
}

async function runTests() {
  // Find two valid land coordinates that are far apart
  const grid = GeoJSONWorldMap.rasterize(1000, 1000);
  let spawn1 = null;
  let spawn2 = null;

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) {
      const x = i % 1000;
      const y = Math.floor(i / 1000);
      if (!spawn1) {
        spawn1 = { x, y, idx: i };
      } else {
        const dist = Math.hypot(x - spawn1.x, y - spawn1.y);
        if (dist > 150) {
          spawn2 = { x, y, idx: i };
          break;
        }
      }
    }
  }

  assert(spawn1 !== null && spawn2 !== null, `Found two valid land spawn coordinates: spawn1=(${spawn1.x}, ${spawn1.y}), spawn2=(${spawn2.x}, ${spawn2.y})`);

  // 1. Spin up WebSocket server
  serverProcess = spawn('node', ['src/server/index.js'], { stdio: 'pipe' });

  // Wait for server to start
  await new Promise((resolve) => {
    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('running on port')) {
        resolve();
      }
    });
  });

  console.log('Server started successfully.');

  try {
    // 2. Connect Client 1 (Host)
    const ws1 = new WebSocket('ws://localhost:3001');
    let roomCode = null;

    const hostCreatedPromise = new Promise((resolve) => {
      ws1.on('open', () => {
        ws1.send(JSON.stringify({
          type: 'CREATE_ROOM',
          playerName: 'HostCommander',
          playerColor: '#00f2fe'
        }));
      });

      ws1.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'ROOM_CREATED') {
            assert(msg.roomCode.length === 6, 'Room code has 6 characters');
            assert(msg.playerId === 1, 'Host player assigned ID 1');
            assert(msg.players.length === 1 && msg.players[0].name === 'HostCommander', 'Lobby contains HostCommander');
            roomCode = msg.roomCode;
            resolve();
          }
        }
      });
    });

    await hostCreatedPromise;

    // 3. Connect Client 2
    const ws2 = new WebSocket('ws://localhost:3001');

    const joinPromises = new Promise((resolve) => {
      let client2Joined = false;
      let hostNotified = false;

      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          type: 'JOIN_ROOM',
          roomCode: roomCode,
          playerName: 'RivalInvader',
          playerColor: '#ff0055'
        }));
      });

      ws2.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'ROOM_JOINED') {
            assert(msg.roomCode === roomCode, 'Client 2 joined correct room code');
            assert(msg.playerId === 2, 'Second client assigned ID 2');
            assert(msg.players.length === 2 && msg.players[1].name === 'RivalInvader', 'Lobby player list updated for joined player');
            client2Joined = true;
            if (client2Joined && hostNotified) resolve();
          }
        }
      });

      ws1.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'PLAYER_JOINED') {
            assert(msg.players.length === 2 && msg.players[1].name === 'RivalInvader', 'Host notified of player join');
            hostNotified = true;
            if (client2Joined && hostNotified) resolve();
          }
        }
      });
    });

    await joinPromises;

    // 4. Test Lobby Match Start Transition
    const matchStartPromises = new Promise((resolve) => {
      let hostMatchStarted = false;
      let clientMatchStarted = false;

      ws1.removeAllListeners('message');
      ws2.removeAllListeners('message');

      ws1.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'MATCH_STARTED') {
            assert(msg.mapType === 'world', 'Host received MATCH_STARTED with world mapType');
            assert(msg.seed === 12345, 'Host received MATCH_STARTED with correct seed');
            hostMatchStarted = true;
            if (hostMatchStarted && clientMatchStarted) resolve();
          }
        }
      });

      ws2.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'MATCH_STARTED') {
            assert(msg.mapType === 'world', 'Client 2 received MATCH_STARTED with world mapType');
            assert(msg.seed === 12345, 'Client 2 received MATCH_STARTED with correct seed');
            clientMatchStarted = true;
            if (hostMatchStarted && clientMatchStarted) resolve();
          }
        }
      });

      ws1.send(JSON.stringify({
        type: 'START_MATCH',
        mapType: 'world',
        seed: 12345
      }));
    });

    await matchStartPromises;

    // 5. Test Synchronized Spawn Selection
    const spawnLockPromises = new Promise((resolve) => {
      let hostSpawnsLocked = false;
      let clientSpawnsLocked = false;

      ws1.removeAllListeners('message');
      ws2.removeAllListeners('message');

      ws1.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'SPAWNS_LOCKED') {
            assert(msg.spawns.length === 2, 'Host received SPAWNS_LOCKED with 2 spawn positions');
            assert(msg.spawns[0].x === spawn1.x && msg.spawns[0].y === spawn1.y, 'Host spawn coordinates correct');
            assert(msg.spawns[1].x === spawn2.x && msg.spawns[1].y === spawn2.y, 'Client spawn coordinates correct');
            hostSpawnsLocked = true;
            if (hostSpawnsLocked && clientSpawnsLocked) resolve();
          }
        }
      });

      ws2.on('message', (message, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'SPAWNS_LOCKED') {
            assert(msg.spawns.length === 2, 'Client 2 received SPAWNS_LOCKED with 2 spawn positions');
            assert(msg.spawns[0].x === spawn1.x && msg.spawns[0].y === spawn1.y, 'Host spawn coordinates correct in Client 2');
            assert(msg.spawns[1].x === spawn2.x && msg.spawns[1].y === spawn2.y, 'Client spawn coordinates correct in Client 2');
            clientSpawnsLocked = true;
            if (hostSpawnsLocked && clientSpawnsLocked) resolve();
          }
        }
      });

      ws1.send(JSON.stringify({ type: 'SELECT_SPAWN', x: spawn1.x, y: spawn1.y }));
      ws2.send(JSON.stringify({ type: 'SELECT_SPAWN', x: spawn2.x, y: spawn2.y }));
    });

    await spawnLockPromises;

    // 6. Test 20Hz Binary Tick Stream
    const binaryTickPromise = new Promise((resolve) => {
      let ticksReceived = 0;

      ws1.removeAllListeners('message');
      ws1.on('message', (data, isBinary) => {
        if (isBinary) {
          const state = decodeStateTick(data);
          
          assert(state.type === 1, `Received binary state tick update (Type: ${state.type})`);
          assert(state.players.length === 2, `State contains 2 active players`);
          assert(state.players[0].balance > 0, `Player 1 balance is non-zero`);
          assert(state.players[0].landCount > 0, `Player 1 has non-zero landCount from circular seed`);

          ticksReceived++;
          if (ticksReceived >= 3) {
            resolve();
          }
        }
      });
    });

    await binaryTickPromise;

    // 7. Test Client Attacks and Expansion Sync
    const attackSyncPromise = new Promise((resolve) => {
      ws1.removeAllListeners('message');
      
      // Let's send an attack command targeting a nearby pixel in our own neighborhood
      // Find a neighbor index to attack
      const targetIdx = spawn1.idx + 10;
      ws1.send(JSON.stringify({
        type: 'EXECUTE_ATTACK',
        targetIdx: targetIdx,
        percent: 50
      }));

      ws1.on('message', (data, isBinary) => {
        if (isBinary) {
          const state = decodeStateTick(data);
          
          if (state.expansions.length > 0) {
            assert(state.expansions[0].ownerId === 1, 'Expansions list contains Player 1 attack');
            assert(state.expansions[0].remainingTroops > 0, 'Expansion has non-zero remaining troops');
            resolve();
          }
        }
      });
    });

    await attackSyncPromise;

    // 8. Close connections
    ws1.close();
    ws2.close();

    console.log('\nAll WebSocket actions executed.');

  } catch (err) {
    console.error('Test execution failed:', err);
    testsFailed++;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  console.log(`\n--- Multiplayer Verification Summary ---`);
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n✅ MULTIPLAYER PASSED: WebSocket server lobby, spawn, and 20Hz ticks verified successfully!');
    process.exit(0);
  } else {
    console.error(`\n❌ MULTIPLAYER FAILED: ${testsFailed} errors detected.`);
    process.exit(1);
  }
}

runTests();
