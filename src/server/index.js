import { WebSocketServer } from 'ws';
import { TerritorySimulation } from '../../public/src/simulation.js';

const port = process.env.PORT || 3001;
const wss = new WebSocketServer({ port });

// Map of roomCode -> { players: Array<{ id, name, color, ws, isHost, spawn: { x, y } | null }>, state: 'LOBBY' | 'SPAWN_PICK' | 'PLAYING', mapType: string, seed: number, sim: TerritorySimulation | null, tickInterval: NodeJS.Timeout | null }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function encodeStateTick(players, expansions) {
  // Compute buffer size: 
  // 1 byte msgType + 1 byte numPlayers + (players.length * 12 bytes [4B id, 4B balance, 4B landCount])
  // + 2 bytes numExpansions + (expansions.length * 16 bytes [4B ownerId, 4B x, 4B y, 4B remainingTroops])
  const buffer = new ArrayBuffer(2 + players.length * 12 + 2 + expansions.length * 16);
  const view = new DataView(buffer);
  
  // Byte 0: Msg Type (1 = State Tick)
  view.setUint8(0, 1);
  // Byte 1: Num Players
  view.setUint8(1, players.length);
  
  let offset = 2;
  players.forEach(p => {
    view.setUint32(offset, p.id, true);
    view.setUint32(offset + 4, p.balance, true);
    view.setUint32(offset + 8, p.landCount, true);
    offset += 12;
  });
  
  // Num Expansions
  view.setUint16(offset, expansions.length, true);
  offset += 2;
  
  expansions.forEach(exp => {
    view.setUint32(offset, exp.ownerId, true);
    view.setUint32(offset + 4, exp.x, true);
    view.setUint32(offset + 8, exp.y, true);
    view.setUint32(offset + 12, exp.remainingTroops, true);
    offset += 16;
  });
  
  return new Uint8Array(buffer);
}

wss.on('connection', (ws) => {
  let currentRoomCode = null;
  let currentPlayerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'CREATE_ROOM') {
        const roomCode = generateRoomCode();
        currentPlayerId = 1;
        const hostPlayer = {
          id: currentPlayerId,
          name: data.playerName || 'Commander',
          color: data.playerColor || '#00f2fe',
          isHost: true,
          spawn: null
        };

        rooms.set(roomCode, {
          players: [{ ...hostPlayer, ws }],
          state: 'LOBBY',
          mapType: 'world',
          seed: 12345,
          sim: null,
          tickInterval: null
        });

        currentRoomCode = roomCode;

        ws.send(JSON.stringify({
          type: 'ROOM_CREATED',
          roomCode,
          playerId: currentPlayerId,
          players: [hostPlayer]
        }));
        
        console.log(`[Server] Room created: ${roomCode} by ${hostPlayer.name}`);
      }
      
      else if (data.type === 'JOIN_ROOM') {
        const roomCode = data.roomCode;
        const room = rooms.get(roomCode);

        if (!room) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found.' }));
          return;
        }

        if (room.state !== 'LOBBY') {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Match already in progress.' }));
          return;
        }

        if (room.players.length >= 100) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Room is full.' }));
          return;
        }

        currentPlayerId = room.players.length + 1;
        const newPlayer = {
          id: currentPlayerId,
          name: data.playerName || `Player ${currentPlayerId}`,
          color: data.playerColor || '#00f2fe',
          isHost: false,
          spawn: null
        };

        const serializedPlayers = room.players.map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }));
        serializedPlayers.push(newPlayer);

        room.players.forEach(p => {
          p.ws.send(JSON.stringify({
            type: 'PLAYER_JOINED',
            players: serializedPlayers
          }));
        });

        room.players.push({ ...newPlayer, ws });
        currentRoomCode = roomCode;

        ws.send(JSON.stringify({
          type: 'ROOM_JOINED',
          roomCode,
          playerId: currentPlayerId,
          players: serializedPlayers
        }));

        console.log(`[Server] Player ${newPlayer.name} joined room: ${roomCode}`);
      }

      else if (data.type === 'START_MATCH') {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === currentPlayerId);
        if (!player || !player.isHost) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Only the host can start the match.' }));
          return;
        }

        room.state = 'SPAWN_PICK';
        room.mapType = data.mapType || 'world';
        room.seed = data.seed || 12345;

        room.players.forEach(p => p.spawn = null);

        room.players.forEach(p => {
          p.ws.send(JSON.stringify({
            type: 'MATCH_STARTED',
            mapType: room.mapType,
            seed: room.seed
          }));
        });

        console.log(`[Server] Room ${currentRoomCode} transitioned to SPAWN_PICK`);
      }

      else if (data.type === 'SELECT_SPAWN') {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.state !== 'SPAWN_PICK') return;

        const player = room.players.find(p => p.id === currentPlayerId);
        if (!player) return;

        player.spawn = { x: data.x, y: data.y };
        console.log(`[Server] Room ${currentRoomCode}: Player ${player.name} selected spawn (${data.x}, ${data.y})`);

        const allSpawned = room.players.every(p => p.spawn !== null);
        if (allSpawned) {
          room.state = 'PLAYING';
          const spawnPositions = room.players.map(p => ({
            playerId: p.id,
            x: p.spawn.x,
            y: p.spawn.y
          }));

          room.players.forEach(p => {
            p.ws.send(JSON.stringify({
              type: 'SPAWNS_LOCKED',
              spawns: spawnPositions
            }));
          });

          // Initialize Server-Side simulation for active players
          const sim = new TerritorySimulation(1000, 1000, room.players.length, room.mapType, room.seed);
          sim.state = 'PLAYING';

          room.players.forEach(p => {
            const spawnIdx = p.spawn.y * 1000 + p.spawn.x;
            sim.players[p.id].isAlive = true;
            sim.players[p.id].name = p.name;
            sim.players[p.id].color = p.color;
            sim.players[p.id].balance = 500;
            sim.players[p.id].landCount = 0;

            sim.spawnCircularSeed(p.id, spawnIdx, 6);
            sim.players[p.id].landCount = sim.frontiers[p.id].length;
          });

          room.sim = sim;

          // Start 20Hz Tick Broadcast
          room.tickInterval = setInterval(() => {
            if (!rooms.has(currentRoomCode) || room.state !== 'PLAYING') {
              clearInterval(room.tickInterval);
              return;
            }

            // Run simulation tick step
            room.sim.update(16.6);

            const activePlayers = room.players.map(p => ({
              id: p.id,
              balance: room.sim.players[p.id].balance,
              landCount: room.sim.players[p.id].landCount
            }));

            const expansions = room.sim.activeExpansions.map(exp => ({
              ownerId: exp.ownerId,
              x: exp.x,
              y: exp.y,
              remainingTroops: exp.remainingTroops
            }));

            // Broadcast binary delta packet
            const binaryPacket = encodeStateTick(activePlayers, expansions);
            room.players.forEach(p => {
              p.ws.send(binaryPacket);
            });

            // Check game end conditions
            const alivePlayers = room.players.filter(p => room.sim.players[p.id].isAlive && room.sim.players[p.id].landCount > 0);
            if (alivePlayers.length <= 1 && room.players.length > 1) {
              const winner = alivePlayers[0] || room.players[0];
              room.state = 'GAME_OVER';
              room.players.forEach(p => {
                p.ws.send(JSON.stringify({
                  type: 'GAME_OVER',
                  winnerId: winner.id
                }));
              });
              clearInterval(room.tickInterval);
              console.log(`[Server] Game Over in Room ${currentRoomCode}. Winner: Player ${winner.id}`);
            }
          }, 50);

          console.log(`[Server] Room ${currentRoomCode} transitioned to PLAYING; 20Hz simulation started.`);
        }
      }

      else if (data.type === 'EXECUTE_ATTACK') {
        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.state !== 'PLAYING') return;

        const ok = room.sim.executeAttack(currentPlayerId, data.targetIdx, data.percent);
        console.log(`[Server] Room ${currentRoomCode}: Player ${currentPlayerId} executed attack: ${ok}`);
      }
    } catch (err) {
      console.error('[Server] Message handling error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.players = room.players.filter(p => p.id !== currentPlayerId);
        
        if (room.players.length === 0) {
          if (room.tickInterval) clearInterval(room.tickInterval);
          rooms.delete(currentRoomCode);
          console.log(`[Server] Room empty, deleted: ${currentRoomCode}`);
        } else {
          if (currentPlayerId === 1 && room.players.length > 0) {
            room.players[0].isHost = true;
          }

          const serializedPlayers = room.players.map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }));
          room.players.forEach(p => {
            p.ws.send(JSON.stringify({
              type: 'PLAYER_LEFT',
              players: serializedPlayers
            }));
          });
          console.log(`[Server] Player left room: ${currentRoomCode}`);
        }
      }
    }
  });
});

console.log(`[Server] Terra WebSocket server running on port ${port}`);
