/**
 * Authentic Territorial.io Engine Simulation.
 * Implements LOBBY -> SPAWN_PICK -> PLAYING -> GAME_OVER state machine,
 * 1.17% attack tax, 3.125% boat deployment tax, 2:1 defender combat advantage,
 * circular spawn blob seeding (radius 6px), and 50-pixel bot spawn separation buffer.
 */

import { MapGenerator } from './map-generator.js';
import { AIEngine } from './ai-engine.js';

export class TerritorySimulation {
  constructor(width = 1000, height = 1000, numPlayers = 100, mapType = 'world', seed = 12345, customMapData = null) {
    this.width = width;
    this.height = height;
    this.numPlayers = numPlayers;
    this.mapType = mapType;
    this.seed = seed;
    this.customMapData = customMapData;

    this.state = 'LOBBY';

    this.terrainGrid = MapGenerator.generate(mapType, width, height, seed, customMapData);
    
    let landCount = 0;
    for (let i = 0; i < this.terrainGrid.length; i++) {
      if (this.terrainGrid[i] === 1) landCount++;
    }
    this.totalLandToConquer = landCount || (width * height);
    this.numContinents = this.detectIsolatedLandmasses();
    const baseCap = this.totalLandToConquer * 200000;
    const multiplier = 1.0 + (this.numContinents * 0.15);
    this.maxTroopsLimit = Math.min(2000000000, Math.floor(baseCap * multiplier));

    this.grid = new Uint16Array(width * height);
    this.aiEngine = new AIEngine(numPlayers);

    this.players = new Array(numPlayers + 1);
    this.frontiers = new Array(numPlayers + 1);
    for (let id = 1; id <= numPlayers; id++) {
      this.players[id] = {
        id,
        name: id === 1 ? 'Commander' : `Bot ${id}`,
        balance: 500,
        landCount: 0,
        peakTroops: 500,
        interestRate: 0.15,
        redInterest: false,
        isAlive: true
      };
      this.frontiers[id] = [];
    }

    this.boats = [];
    this.activeExpansions = [];
    this.spawnTimer = 10.0;
    this.humanSpawnIdx = null;

    this.pacts = new Map();
    this.pactLockTimers = new Map();
    this.jointTargets = new Map();
    this.toastNotifications = [];

    this.fogOfWarEnabled = true;
    this.visibilityBuffer = new Uint8Array(width * height);
    this.radarPulses = [];

    this.interestTimer = 0;
    this.incomeTimer = 0;
    this.tickCount = 0;

    this.gameResult = null;
    this.onParticleEvent = null;
  }

  startSpawnPhase() {
    this.state = 'SPAWN_PICK';
    this.spawnTimer = 10.0;
    this.grid.fill(0);
    this.visibilityBuffer.fill(0);
    this.boats = [];
    this.radarPulses = [];
    this.humanSpawnIdx = null;
    this.pacts.clear();
    this.pactLockTimers.clear();
    this.jointTargets.clear();
    this.toastNotifications = [];

    for (let id = 1; id <= this.numPlayers; id++) {
      this.players[id] = {
        id,
        name: id === 1 ? 'Commander' : `Bot ${id}`,
        balance: 500,
        landCount: 0,
        peakTroops: 500,
        interestRate: 0.15,
        redInterest: false,
        isAlive: true
      };
      this.frontiers[id] = [];
    }
  }

  setHumanSpawn(pixelIdx) {
    if (this.state !== 'SPAWN_PICK') return false;
    if (this.terrainGrid[pixelIdx] !== 1) return false;

    this.humanSpawnIdx = pixelIdx;
    return true;
  }

  confirmSpawnsAndStart() {
    if (this.state !== 'SPAWN_PICK') return;
    this.state = 'PLAYING';

    const width = this.width;
    const height = this.height;

    // Default human spawn if not set by user
    if (!this.humanSpawnIdx) {
      let rIdx = 0;
      do {
        rIdx = Math.floor(Math.random() * (width * height));
      } while (this.terrainGrid[rIdx] !== 1);
      this.humanSpawnIdx = rIdx;
    }

    // Seed Human Player Spawn Blob (radius 6px)
    this.spawnCircularSeed(1, this.humanSpawnIdx, 6);

    const humanX = this.humanSpawnIdx % width;
    const humanY = Math.floor(this.humanSpawnIdx / width);
    const minBufferSq = 56 * 56;

    // Seed AI Bots (radius 6px) avoiding 50-pixel buffer from human spawn
    for (let id = 2; id <= this.numPlayers; id++) {
      let botIdx = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 200) {
        attempts++;
        botIdx = Math.floor(Math.random() * (width * height));
        if (this.terrainGrid[botIdx] !== 1 || this.grid[botIdx] !== 0) continue;

        const bx = botIdx % width;
        const by = Math.floor(botIdx / width);
        const distSq = (bx - humanX) * (bx - humanX) + (by - humanY) * (by - humanY);

        if (distSq >= minBufferSq) {
          valid = true;
        }
      }

      if (valid) {
        this.spawnCircularSeed(id, botIdx, 6);
      } else {
        this.players[id].isAlive = false;
      }
    }
  }

  /**
   * Helper: Spawn circular territory blob of radius R around center pixel.
   */
  spawnCircularSeed(ownerId, centerIdx, radius = 6) {
    const width = this.width;
    const height = this.height;
    const cx = centerIdx % width;
    const cy = Math.floor(centerIdx / width);
    const rSq = radius * radius;

    let count = 0;
    this.frontiers[ownerId] = [];

    for (let dy = -radius; dy <= radius; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= height) continue;

      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= width) continue;

        if (dx * dx + dy * dy <= rSq) {
          const idx = ny * width + nx;
          if (this.terrainGrid[idx] === 1 && (this.grid[idx] === 0 || this.grid[idx] === ownerId)) {
            this.grid[idx] = ownerId;
            this.frontiers[ownerId].push(idx);
            count++;
          }
        }
      }
    }

    this.players[ownerId].landCount = count;
    this.players[ownerId].balance = 500;
    this.players[ownerId].capitalX = cx;
    this.players[ownerId].capitalY = cy;
  }

  executeAttack(attackerId, targetPixelIdx, forcePercent = 25, isTargeted = true) {
    if (this.state !== 'PLAYING') return false;
    const attacker = this.players[attackerId];
    if (!attacker || !attacker.isAlive || attacker.balance < 20) return false;

    // Land attack target must be land (terrain !== 0)
    if (this.terrainGrid[targetPixelIdx] === 0) {
      if (attackerId === 1) {
        this.addToast('⚠️ Cannot launch land attack across ocean! Launch a Naval Attack instead.', 'warning');
      }
      return false;
    }

    const targetX = targetPixelIdx % this.width;
    const targetY = Math.floor(targetPixelIdx / this.width);

    // Check for existing active expansion targeting the same area to reinforce it
    const existing = this.activeExpansions.find(e => 
      e.ownerId === attackerId && 
      Math.hypot(e.targetX - targetX, e.targetY - targetY) <= 8
    );

    if (existing) {
      const tax = Math.ceil(attacker.balance * 0.0117);
      if (attacker.balance >= tax + 5) {
        attacker.balance -= tax;
        const forceTroops = Math.floor((attacker.balance * forcePercent) / 100);
        if (forceTroops >= 5) {
          attacker.balance -= forceTroops;
          existing.remainingTroops += forceTroops;
          existing.targetReached = false; // Reset target reached flag to resume path push
          const targetOwner = this.grid[targetPixelIdx];
          existing.targetOwner = targetOwner;
          existing.isRivalAttack = (targetOwner > 0 && targetOwner !== attackerId);
          if (this.onParticleEvent) {
            this.onParticleEvent('ATTACK_LAUNCH', { x: targetX, y: targetY, color: attacker.color || '#00f2fe', troops: forceTroops });
          }
          return true;
        }
      }
      return false;
    }

    const tax = Math.ceil(attacker.balance * 0.0117);
    attacker.balance -= tax;

    const forceTroops = Math.floor((attacker.balance * forcePercent) / 100);
    if (forceTroops < 5) return false;

    attacker.balance -= forceTroops;

    if (this.onParticleEvent) {
      this.onParticleEvent('ATTACK_LAUNCH', { x: targetX, y: targetY, color: attacker.color || '#00f2fe', troops: forceTroops });
    }

    let launchIdx = -1;
    const width = this.width;
    const height = this.height;

    // BFS starting from targetPixelIdx to find the closest land-connected attacker pixel
    const queue = new Int32Array(20000);
    let head = 0;
    let tail = 0;
    queue[tail++] = targetPixelIdx;

    const visited = new Uint8Array(width * height);
    visited[targetPixelIdx] = 1;

    const maxBfsIterations = 15000;
    let bfsIterations = 0;

    while (head < tail && bfsIterations++ < maxBfsIterations) {
      const curr = queue[head++];
      if (this.grid[curr] === attackerId) {
        launchIdx = curr;
        break;
      }

      const cx = curr % width;
      const cy = Math.floor(curr / width);

      const neighbors = [
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1,
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1
      ];

      for (const n of neighbors) {
        if (n >= 0 && visited[n] === 0 && this.terrainGrid[n] !== 0 && this.terrainGrid[n] !== 2) {
          visited[n] = 1;
          if (tail < queue.length) {
            queue[tail++] = n;
          }
        }
      }
    }

    // If no land-connected frontier pixel was found, fall back to simple closest distance
    if (launchIdx === -1) {
      const frontier = this.frontiers[attackerId];
      if (frontier && frontier.length > 0) {
        let minDist = Infinity;
        for (let i = 0; i < frontier.length; i++) {
          const idx = frontier[i];
          const fx = idx % width;
          const fy = Math.floor(idx / width);
          const dist = Math.hypot(fx - targetX, fy - targetY);
          if (dist < minDist) {
            minDist = dist;
            launchIdx = idx;
          }
        }
      } else {
        launchIdx = targetPixelIdx;
      }
    }

    const path = this.findLandPath(launchIdx, targetPixelIdx);
    if (!path) {
      attacker.balance += tax + forceTroops;
      return this.launchBoatAttack(attackerId, targetPixelIdx, forcePercent);
    }

    const launchX = launchIdx % width;
    const launchY = Math.floor(launchIdx / width);

    const targetOwner = this.grid[targetPixelIdx];
    const isRivalAttack = (targetOwner > 0 && targetOwner !== attackerId);

    if (targetOwner === 0 && !isTargeted) {
      const capX = attacker.capitalX !== undefined ? attacker.capitalX : launchX;
      const capY = attacker.capitalY !== undefined ? attacker.capitalY : launchY;
      const initialRadius = Math.hypot(launchX - capX, launchY - capY);
      const maxRadius = initialRadius + Math.sqrt(forceTroops) * 1.5;

      this.activeExpansions.push({
        ownerId: attackerId,
        targetX: capX,
        targetY: capY,
        launchX: capX,
        launchY: capY,
        remainingTroops: forceTroops,
        isCounterPush: false,
        path: null,
        isRivalAttack: false,
        targetOwner: 0,
        currentRadius: initialRadius,
        maxRadius: maxRadius
      });
      return true;
    }

    this.activeExpansions.push({
      ownerId: attackerId,
      targetX: targetX,
      targetY: targetY,
      launchX: launchX,
      launchY: launchY,
      remainingTroops: forceTroops,
      isCounterPush: false,
      path: path,
      isRivalAttack: isRivalAttack,
      targetOwner: targetOwner
    });
    return true;
  }

  isShorelinePixel(idx) {
    if (this.terrainGrid[idx] === 0) return false;
    const cx = idx % this.width;
    const cy = Math.floor(idx / this.width);
    const width = this.width;
    const height = this.height;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (this.terrainGrid[nIdx] === 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  launchBoatAttack(attackerId, targetPixelIdx, forcePercent = 25) {
    if (this.state !== 'PLAYING') return false;
    const attacker = this.players[attackerId];
    if (!attacker || !attacker.isAlive || attacker.balance < 50) return false;

    let landingIdx = targetPixelIdx;

    if (!this.isShorelinePixel(landingIdx)) {
      const startX = targetPixelIdx % this.width;
      const startY = Math.floor(targetPixelIdx / this.width);
      let bestShorelineIdx = -1;
      let minSearchDist = Infinity;

      for (let idx = 0; idx < this.grid.length; idx++) {
        if (this.terrainGrid[idx] === 0 || this.terrainGrid[idx] === 2) continue;
        if (this.isShorelinePixel(idx)) {
          const sx = idx % this.width;
          const sy = Math.floor(idx / this.width);
          const d = Math.hypot(sx - startX, sy - startY);
          if (d < minSearchDist) {
            minSearchDist = d;
            bestShorelineIdx = idx;
          }
        }
      }

      if (bestShorelineIdx !== -1) {
        landingIdx = bestShorelineIdx;
      } else {
        if (attackerId === 1) {
          this.addToast('⚠️ Target must be a shoreline to land!', 'warning');
        }
        return false;
      }
    }

    const targetX = landingIdx % this.width;
    const targetY = Math.floor(landingIdx / this.width);

    const departure = this.findClosestCoastalPixelTo(attackerId, targetX, targetY);
    if (!departure) {
      if (attackerId === 1) {
        this.addToast('⚠️ You need an accessible shoreline to launch a naval attack!', 'warning');
      }
      return false;
    }

    const tax = Math.ceil(attacker.balance * 0.03125);
    attacker.balance -= tax;

    const forceTroops = Math.floor((attacker.balance * forcePercent) / 100);
    if (forceTroops < 10) return false;

    attacker.balance -= forceTroops;

    if (this.onParticleEvent) {
      this.onParticleEvent('BOAT_LAUNCH', { x: departure.x, y: departure.y, color: attacker.color || '#00f2fe', troops: forceTroops });
    }

    const totalDistance = Math.hypot(targetX - departure.x, targetY - departure.y);
    const distanceThreshold = Math.max(this.width, this.height) * 0.15;
    const speedScale = Math.max(0.2, distanceThreshold / Math.max(distanceThreshold, totalDistance));

    this.boats.push({
      id: Date.now() + Math.random(),
      ownerId: attackerId,
      troops: forceTroops,
      x: departure.x,
      y: departure.y,
      targetX,
      targetY,
      targetIdx: targetPixelIdx,
      speed: 4.5 * speedScale
    });

    return true;
  }

  getPactKey(id1, id2) {
    const minId = Math.min(id1, id2);
    const maxId = Math.max(id1, id2);
    return `${minId}-${maxId}`;
  }

  hasPact(id1, id2) {
    if (!id1 || !id2 || id1 === id2) return false;
    return this.pacts.get(this.getPactKey(id1, id2)) === 'ACTIVE';
  }

  proposePact(fromId, toId) {
    if (this.state !== 'PLAYING') return false;
    const pFrom = this.players[fromId];
    const pTo = this.players[toId];
    if (!pFrom || !pTo || !pFrom.isAlive || !pTo.isAlive) return false;
    if (this.hasPact(fromId, toId)) return false;

    // AI evaluate proposal if target is bot
    if (toId !== 1 && this.aiEngine) {
      const accepted = this.aiEngine.evaluateDiplomaticProposal(this, toId, fromId, 'NAP');
      if (accepted) {
        this.pacts.set(this.getPactKey(fromId, toId), 'ACTIVE');
        this.addToast(`${pTo.name} accepted your Non-Aggression Pact!`, 'success');
        return true;
      } else {
        this.addToast(`${pTo.name} declined your Non-Aggression Pact proposal.`, 'warning');
        return false;
      }
    }

    // Direct pact formation for multiplayer/bots
    this.pacts.set(this.getPactKey(fromId, toId), 'ACTIVE');
    this.addToast(`Non-Aggression Pact established with ${pTo.name}!`, 'success');
    return true;
  }

  breakPact(fromId, toId) {
    const key = this.getPactKey(fromId, toId);
    if (this.pacts.get(key) !== 'ACTIVE') return false;

    this.pacts.delete(key);
    const breaker = this.players[fromId];
    const target = this.players[toId];

    if (breaker) {
      // 15% troop balance penalty & 10s interest lock
      breaker.balance = Math.floor(breaker.balance * 0.85);
      this.pactLockTimers.set(fromId, 10.0);
    }

    const breakerName = breaker ? breaker.name : `Player ${fromId}`;
    const targetName = target ? target.name : `Player ${toId}`;
    this.addToast(`${breakerName} BROKE Non-Aggression Pact with ${targetName}!`, 'error');
    return true;
  }

  sendAid(fromId, toId, percent = 10) {
    if (!this.hasPact(fromId, toId)) return false;
    const pFrom = this.players[fromId];
    const pTo = this.players[toId];
    if (!pFrom || !pTo || !pFrom.isAlive || !pTo.isAlive || pFrom.balance < 50) return false;

    const rawAid = Math.floor((pFrom.balance * percent) / 100);
    const tax = Math.ceil(rawAid * 0.05); // 5% transfer tax
    const netAid = rawAid - tax;

    pFrom.balance -= rawAid;
    pTo.balance += netAid;

    this.addToast(`Sent ${TerritorySimulation.formatTroops(netAid)} troops aid to ${pTo.name} (5% tax).`, 'info');
    return true;
  }

  setJointTarget(fromId, targetId) {
    if (targetId === fromId) return false;
    this.jointTargets.set(fromId, targetId);
    const target = this.players[targetId];
    if (target) {
      this.addToast(`Designated ${target.name} as Joint Target for allies!`, 'info');
    }
    return true;
  }

  addToast(message, type = 'info') {
    this.toastNotifications.push({
      id: Date.now() + Math.random(),
      message,
      type,
      timestamp: Date.now()
    });
    if (this.toastNotifications.length > 5) {
      this.toastNotifications.shift();
    }
  }

  getActivePactsForPlayer(playerId) {
    const active = [];
    for (let id = 1; id <= this.numPlayers; id++) {
      if (id !== playerId && this.hasPact(playerId, id)) {
        active.push(id);
      }
    }
    return active;
  }

  updateVisibilityMask(playerId = 1) {
    if (!this.fogOfWarEnabled) return;

    this.visibilityBuffer.fill(1);

    const width = this.width;
    const height = this.height;
    const visionRadius = 25;
    const visionSq = visionRadius * visionRadius;

    const frontier = this.frontiers[playerId];
    if (frontier && frontier.length > 0) {
      const step = Math.max(1, Math.floor(frontier.length / 60));
      for (let i = 0; i < frontier.length; i += step) {
        const idx = frontier[i];
        const cx = idx % width;
        const cy = Math.floor(idx / width);

        for (let dy = -visionRadius; dy <= visionRadius; dy += 3) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -visionRadius; dx <= visionRadius; dx += 3) {
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy <= visionSq) {
              this.visibilityBuffer[ny * width + nx] = 2;
            }
          }
        }
      }
    }

    for (const boat of this.boats) {
      if (boat.ownerId === playerId) {
        const cx = Math.floor(boat.x);
        const cy = Math.floor(boat.y);
        const bRadius = 30;
        const bSq = bRadius * bRadius;
        for (let dy = -bRadius; dy <= bRadius; dy += 2) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -bRadius; dx <= bRadius; dx += 2) {
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy <= bSq) {
              this.visibilityBuffer[ny * width + nx] = 2;
            }
          }
        }
      }
    }

    for (const pulse of this.radarPulses) {
      if (pulse.ownerId === playerId && pulse.elapsed < pulse.duration) {
        const cx = Math.floor(pulse.x);
        const cy = Math.floor(pulse.y);
        const pRad = Math.floor(pulse.radius);
        const pSq = pRad * pRad;

        for (let dy = -pRad; dy <= pRad; dy += 3) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -pRad; dx <= pRad; dx += 3) {
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy <= pSq) {
              this.visibilityBuffer[ny * width + nx] = 2;
            }
          }
        }
      }
    }
  }

  triggerScoutRadar(playerId = 1, targetX = null, targetY = null) {
    if (this.state !== 'PLAYING') return false;
    const player = this.players[playerId];
    if (!player || !player.isAlive || player.balance < 50) return false;

    const fee = Math.max(50, Math.floor(player.balance * 0.02));
    player.balance -= fee;

    let px = targetX;
    let py = targetY;

    if (px === null || py === null) {
      const frontier = this.frontiers[playerId];
      if (frontier && frontier.length > 0) {
        const centerIdx = frontier[Math.floor(frontier.length / 2)];
        px = centerIdx % this.width;
        py = Math.floor(centerIdx / this.width);
      } else {
        px = Math.floor(this.width / 2);
        py = Math.floor(this.height / 2);
      }
    }

    this.radarPulses.push({
      id: Date.now() + Math.random(),
      ownerId: playerId,
      x: px,
      y: py,
      radius: 10,
      maxRadius: 200,
      speed: 120,
      duration: 5.0,
      elapsed: 0
    });

    this.addToast('📡 Scout Reconnaissance Radar launched! Sweeping 200px radius.', 'info');
    return true;
  }

  updateRadarPulses(deltaTimeMs) {
    const dtSec = deltaTimeMs / 1000;
    for (let i = this.radarPulses.length - 1; i >= 0; i--) {
      const p = this.radarPulses[i];
      p.elapsed += dtSec;

      if (p.radius < p.maxRadius) {
        p.radius = Math.min(p.maxRadius, p.radius + p.speed * dtSec);
      }

      if (p.elapsed >= p.duration) {
        this.radarPulses.splice(i, 1);
      }
    }
  }

  findClosestCoastalPixelTo(ownerId, tx, ty) {
    const width = this.width;
    const height = this.height;
    const frontier = this.frontiers[ownerId];
    if (!frontier || frontier.length === 0) return null;

    let bestClearPixel = null;
    let minClearDistance = Infinity;

    for (let i = 0; i < frontier.length; i++) {
      const idx = frontier[i];
      if (this.grid[idx] !== ownerId) continue;

      const cx = idx % width;
      const cy = Math.floor(idx / width);

      let isCoast = false;
      if (
        (cy > 0 && this.terrainGrid[idx - width] === 0) ||
        (cy < height - 1 && this.terrainGrid[idx + width] === 0) ||
        (cx > 0 && this.terrainGrid[idx - 1] === 0) ||
        (cx < width - 1 && this.terrainGrid[idx + 1] === 0)
      ) {
        isCoast = true;
      }

      if (isCoast) {
        const dist = Math.hypot(cx - tx, cy - ty);
        const hasClearPath = this.aiEngine.isWaterPath(cx, cy, tx, ty, this.terrainGrid, width, height);

        if (hasClearPath) {
          if (dist < minClearDistance) {
            minClearDistance = dist;
            bestClearPixel = { x: cx, y: cy };
          }
        }
      }
    }

    return bestClearPixel;
  }

  findLandPath(startIdx, endIdx) {
    if (startIdx === endIdx) return [startIdx];
    const width = this.width;
    const height = this.height;

    const targetX = endIdx % width;
    const targetY = Math.floor(endIdx / width);

    // Min-Heap implementation for priority queue
    const heap = [];
    const heapPush = (item) => {
      heap.push(item);
      let idx = heap.length - 1;
      while (idx > 0) {
        const pIdx = (idx - 1) >> 1;
        if (heap[idx].f >= heap[pIdx].f) break;
        const tmp = heap[idx];
        heap[idx] = heap[pIdx];
        heap[pIdx] = tmp;
        idx = pIdx;
      }
    };
    const heapPop = () => {
      if (heap.length === 0) return null;
      const top = heap[0];
      const bottom = heap.pop();
      if (heap.length > 0) {
        heap[0] = bottom;
        let idx = 0;
        const len = heap.length;
        while (true) {
          let left = (idx << 1) + 1;
          let right = left + 1;
          let smallest = idx;
          if (left < len && heap[left].f < heap[smallest].f) smallest = left;
          if (right < len && heap[right].f < heap[smallest].f) smallest = right;
          if (smallest === idx) break;
          const tmp = heap[idx];
          heap[idx] = heap[smallest];
          heap[smallest] = tmp;
          idx = smallest;
        }
      }
      return top;
    };

    // Typed arrays for visited/cost/parent to optimize memory and GC overhead
    const gScore = new Float32Array(width * height);
    gScore.fill(Infinity);
    gScore[startIdx] = 0;

    const parent = new Int32Array(width * height);
    parent.fill(-1);

    // Heuristic: Manhattan distance is fast and sufficient for grids
    const h = (idx) => {
      const x = idx % width;
      const y = Math.floor(idx / width);
      return Math.abs(x - targetX) + Math.abs(y - targetY);
    };

    heapPush({ idx: startIdx, f: h(startIdx) });

    let found = false;
    let iterations = 0;
    const maxIterations = 25000;

    while (heap.length > 0 && iterations++ < maxIterations) {
      const curr = heapPop();
      if (!curr) break;
      const currIdx = curr.idx;

      if (currIdx === endIdx) {
        found = true;
        break;
      }

      const cx = currIdx % width;
      const cy = Math.floor(currIdx / width);

      const neighbors = [
        cy > 0 ? currIdx - width : -1,
        cy < height - 1 ? currIdx + width : -1,
        cx > 0 ? currIdx - 1 : -1,
        cx < width - 1 ? currIdx + 1 : -1
      ];

      const currentG = gScore[currIdx];

      for (const n of neighbors) {
        if (n >= 0) {
          const terrain = this.terrainGrid[n];
          if (terrain !== 0 && terrain !== 2) { // Land only
            const tentativeG = currentG + 1;
            if (tentativeG < gScore[n]) {
              gScore[n] = tentativeG;
              parent[n] = currIdx;
              heapPush({ idx: n, f: tentativeG + h(n) });
            }
          }
        }
      }
    }

    if (!found) return null;

    const path = [];
    let curr = endIdx;
    while (curr !== -1) {
      path.push(curr);
      curr = parent[curr];
    }
    return path.reverse();
  }

  updateExpansions(deltaTimeMs) {
    const width = this.width;
    const height = this.height;

    for (let idx = this.activeExpansions.length - 1; idx >= 0; idx--) {
      const exp = this.activeExpansions[idx];
      const player = this.players[exp.ownerId];

      if (!player || !player.isAlive || exp.remainingTroops <= 2) {
        if (player && player.isAlive && exp.remainingTroops > 0) {
          player.balance += exp.remainingTroops;
        }
        this.activeExpansions.splice(idx, 1);
        continue;
      }

      const frontier = this.frontiers[exp.ownerId];
      if (!frontier || frontier.length === 0) {
        if (player && player.isAlive && exp.remainingTroops > 0) {
          player.balance += exp.remainingTroops;
        }
        this.activeExpansions.splice(idx, 1);
        continue;
      }

      const frontierSet = new Set(frontier);
      let stepCount = 0;
      const stepLimit = 20;
      let expandedAny = false;

      // Fallback path if it's missing (e.g. from legacy state or bots in tests)
      if (!exp.path || exp.path.length === 0) {
        let startIdx = frontier[0];
        const targetIdx = Math.floor(exp.targetY) * width + Math.floor(exp.targetX);
        let minDist = Infinity;
        for (const fIdx of frontier) {
          const fx = fIdx % width;
          const fy = Math.floor(fIdx / width);
          const dist = Math.hypot(fx - exp.targetX, fy - exp.targetY);
          if (dist < minDist) {
            minDist = dist;
            startIdx = fIdx;
          }
        }
      }

      if (exp.currentRadius === undefined) {
        exp.currentRadius = 1.0;
        exp.maxRadius = exp.isRivalAttack ? 1000.0 : Math.hypot(exp.targetX - exp.launchX, exp.targetY - exp.launchY);
      }

      // Check if target coordinate has been captured to switch to square area expansion mode
      const targetIdx = Math.floor(exp.targetY) * width + Math.floor(exp.targetX);
      if (this.grid[targetIdx] === exp.ownerId && exp.path !== null) {
        exp.targetReached = true;
      }

      const totalDistance = Math.hypot(exp.targetX - exp.launchX, exp.targetY - exp.launchY);
      const distanceThreshold = Math.max(width, height) * 0.1;
      const expansionSpeed = Math.max(1.0, 3.0 * (distanceThreshold / Math.max(distanceThreshold, totalDistance)));

      if (exp.targetReached) {
        exp.squareSize = (exp.squareSize || 0.0) + expansionSpeed;
      } else {
        exp.currentRadius = Math.min(exp.maxRadius, exp.currentRadius + expansionSpeed);
      }

      // Initialize validFrontier for centroid-outward expansions to ensure we only select border pixels adjacent to neutral land.
      let validFrontier = [];
      if (exp.path === null) {
        for (let i = 0; i < frontier.length; i++) {
          const fIdx = frontier[i];
          const cx = fIdx % width;
          const cy = Math.floor(fIdx / width);
          
          const hasNeutralNeighbor = 
            (cy > 0 && this.grid[fIdx - width] === 0 && this.terrainGrid[fIdx - width] !== 0 && this.terrainGrid[fIdx - width] !== 2) ||
            (cy < height - 1 && this.grid[fIdx + width] === 0 && this.terrainGrid[fIdx + width] !== 0 && this.terrainGrid[fIdx + width] !== 2) ||
            (cx > 0 && this.grid[fIdx - 1] === 0 && this.terrainGrid[fIdx - 1] !== 0 && this.terrainGrid[fIdx - 1] !== 2) ||
            (cx < width - 1 && this.grid[fIdx + 1] === 0 && this.terrainGrid[fIdx + 1] !== 0 && this.terrainGrid[fIdx + 1] !== 2);

          if (hasNeutralNeighbor) {
            validFrontier.push(fIdx);
          }
        }
      }

      const excludedFrontierIndices = new Set();

      let maxSteps = 1000;
      while (exp.remainingTroops > 2 && stepCount < stepLimit && maxSteps-- > 0) {
        let bestIdx = -1;
        let minDist = Infinity;
        let bestArrayIdx = -1;

        if (exp.path !== null) {
          for (let i = frontier.length - 1; i >= 0; i--) {
            const fIdx = frontier[i];
            if (excludedFrontierIndices.has(fIdx)) continue;
            const fx = fIdx % width;
            const fy = Math.floor(fIdx / width);
            const distSq = (fx - exp.targetX) * (fx - exp.targetX) + (fy - exp.targetY) * (fy - exp.targetY);
            if (distSq < minDist) {
              minDist = distSq;
              bestIdx = fIdx;
              bestArrayIdx = i;
            }
          }
        } else {
          const availableFrontier = validFrontier.filter(fIdx => !excludedFrontierIndices.has(fIdx));
          if (availableFrontier.length > 0) {
            bestIdx = availableFrontier[Math.floor(Math.random() * availableFrontier.length)];
            bestArrayIdx = validFrontier.indexOf(bestIdx);
          }
        }

        if (bestIdx < 0) break;

        const cx = bestIdx % width;
        const cy = Math.floor(bestIdx / width);

        const neighbors = [
          cy > 0 ? bestIdx - width : -1,
          cy < height - 1 ? bestIdx + width : -1,
          cx > 0 ? bestIdx - 1 : -1,
          cx < width - 1 ? bestIdx + 1 : -1
        ];

        let localExpanded = false;

        for (const nIdx of neighbors) {
          if (nIdx < 0) continue;
          if (this.terrainGrid[nIdx] === 0 || this.terrainGrid[nIdx] === 2) continue;

          const defenderOwner = this.grid[nIdx];
          if (defenderOwner === exp.ownerId) continue;

          // Neutral expansions cannot capture rival owned territory
          if (exp.isRivalAttack === false && defenderOwner !== 0) continue;

          const nx = nIdx % width;
          const ny = Math.floor(nIdx / width);

          if (exp.targetReached) {
            const dx = Math.abs(nx - exp.targetX);
            const dy = Math.abs(ny - exp.targetY);
            if (Math.max(dx, dy) > exp.squareSize) continue;
          } else {
            const distFromLaunch = Math.hypot(nx - exp.launchX, ny - exp.launchY);
            if (exp.path !== null && distFromLaunch > exp.currentRadius) continue;

            if (!exp.isRivalAttack) {
              let distToPath = Infinity;
              if (exp.path) {
                for (let i = 0; i < exp.path.length; i++) {
                  const px = exp.path[i] % width;
                  const py = Math.floor(exp.path[i] / width);
                  const d = Math.hypot(nx - px, ny - py);
                  if (d < distToPath) {
                    distToPath = d;
                  }
                  if (distToPath <= 3.0) break;
                }
              }
              if (exp.path && distToPath > 3.0) continue;
            }
          }

          if (defenderOwner === 0) {
            const distToLaunch = Math.hypot(nx - exp.launchX, ny - exp.launchY);
            const scaleMultiplier = 1.0 + (distToLaunch * 0.002);
            const cost = Math.ceil(2 * scaleMultiplier);

            if (exp.remainingTroops >= cost) {
              exp.remainingTroops -= cost;
              player.landCount++;
              this.grid[nIdx] = exp.ownerId;

              if (!frontierSet.has(nIdx) && this.aiEngine.isBorderPixel(nIdx, this.grid, this.terrainGrid, this.width, this.height, exp.ownerId)) {
                frontier.push(nIdx);
                frontierSet.add(nIdx);
              }

              if (exp.path === null) {
                // nIdx is a new border pixel, check if it has neutral neighbors to add to validFrontier
                const ncx = nIdx % width;
                const ncy = Math.floor(nIdx / width);
                const nHasNeutral =
                  (ncy > 0 && this.grid[nIdx - width] === 0 && this.terrainGrid[nIdx - width] !== 0 && this.terrainGrid[nIdx - width] !== 2) ||
                  (ncy < height - 1 && this.grid[nIdx + width] === 0 && this.terrainGrid[nIdx + width] !== 0 && this.terrainGrid[nIdx + width] !== 2) ||
                  (ncx > 0 && this.grid[nIdx - 1] === 0 && this.terrainGrid[nIdx - 1] !== 0 && this.terrainGrid[nIdx - 1] !== 2) ||
                  (ncx < width - 1 && this.grid[nIdx + 1] === 0 && this.terrainGrid[nIdx + 1] !== 0 && this.terrainGrid[nIdx + 1] !== 2);
                if (nHasNeutral) {
                  validFrontier.push(nIdx);
                }

                // Check if bestIdx still has neutral neighbors; if not, remove it from validFrontier
                const bcx = bestIdx % width;
                const bcy = Math.floor(bestIdx / width);
                const bHasNeutral =
                  (bcy > 0 && this.grid[bestIdx - width] === 0 && this.terrainGrid[bestIdx - width] !== 0 && this.terrainGrid[bestIdx - width] !== 2) ||
                  (bcy < height - 1 && this.grid[bestIdx + width] === 0 && this.terrainGrid[bestIdx + width] !== 0 && this.terrainGrid[bestIdx + width] !== 2) ||
                  (bcx > 0 && this.grid[bestIdx - 1] === 0 && this.terrainGrid[bestIdx - 1] !== 0 && this.terrainGrid[bestIdx - 1] !== 2) ||
                  (bcx < width - 1 && this.grid[bestIdx + 1] === 0 && this.terrainGrid[bestIdx + 1] !== 0 && this.terrainGrid[bestIdx + 1] !== 2);
                if (!bHasNeutral) {
                  validFrontier.splice(bestArrayIdx, 1);
                }
              }

              localExpanded = true;
              stepCount++;
              expandedAny = true;
            }
          } else {
            if (this.hasPact(exp.ownerId, defenderOwner)) continue;
            const defender = this.players[defenderOwner];

            if (defender) {
              const defenseThreshold = Math.max(10, Math.floor(defender.balance * 0.20));
              if (exp.remainingTroops < defenseThreshold) {
                exp.remainingTroops = Math.max(0, exp.remainingTroops - 5);
                continue;
              }
            }

            const distToLaunch = Math.hypot(nx - exp.launchX, ny - exp.launchY);
            const scaleMultiplier = 1.0 + (distToLaunch * 0.002);

            const baseCost = 4;
            const fortBonus = (defender && defender.balance > player.balance * 0.5) ? 2 : 0;
            const totalCost = Math.ceil((baseCost * 2 + fortBonus) * scaleMultiplier);

            if (exp.remainingTroops >= totalCost) {
              exp.remainingTroops -= totalCost;
              if (defender) {
                const defenderCasualties = Math.min(defender.balance, Math.ceil(baseCost * (1.0 + exp.remainingTroops * 0.0005)));
                defender.balance = Math.max(0, defender.balance - defenderCasualties);
              }
              player.landCount++;
              if (defender) {
                defender.landCount = Math.max(0, defender.landCount - 1);
                if (this.frontiers[defenderOwner]) {
                  const fIdx = this.frontiers[defenderOwner].indexOf(nIdx);
                  if (fIdx !== -1) {
                    this.frontiers[defenderOwner].splice(fIdx, 1);
                  }
                }
              }
              this.grid[nIdx] = exp.ownerId;

              if (!frontierSet.has(nIdx) && this.aiEngine.isBorderPixel(nIdx, this.grid, this.terrainGrid, this.width, this.height, exp.ownerId)) {
                frontier.push(nIdx);
                frontierSet.add(nIdx);
              }
              localExpanded = true;
              stepCount++;
              expandedAny = true;

              if (!exp.isCounterPush && defender && defender.isAlive && defender.balance > 300 && Math.random() < 0.2) {
                const counterTroops = Math.min(Math.floor(defender.balance * 0.1), 500);
                if (counterTroops > 20) {
                  defender.balance -= counterTroops;
                  this.activeExpansions.push({
                    ownerId: defenderOwner,
                    targetX: cx,
                    targetY: cy,
                    launchX: nx,
                    launchY: ny,
                    remainingTroops: counterTroops,
                    isCounterPush: true
                  });
                }
              }
            }
          }
        }

        if (!this.aiEngine.isBorderPixel(bestIdx, this.grid, this.terrainGrid, this.width, this.height, exp.ownerId)) {
          frontierSet.delete(bestIdx);
          if (exp.path !== null) {
            frontier.splice(bestArrayIdx, 1);
          } else {
            const fIndex = frontier.indexOf(bestIdx);
            if (fIndex !== -1) {
              frontier.splice(fIndex, 1);
            }
          }
        }

        if (!localExpanded) {
          excludedFrontierIndices.add(bestIdx);
          continue;
        }
      }

      for (let i = frontier.length - 1; i >= 0; i--) {
        const fIdx = frontier[i];
        if (!this.aiEngine.isBorderPixel(fIdx, this.grid, this.terrainGrid, this.width, this.height, exp.ownerId)) {
          frontier.splice(i, 1);
        }
      }

      const isFinished = (exp.remainingTroops <= 2 || frontier.length === 0 || (exp.targetReached && exp.squareSize >= exp.maxRadius) || (!exp.targetReached && exp.path !== null && exp.currentRadius >= exp.maxRadius && !expandedAny));
      if (isFinished) {
        if (player && player.isAlive && exp.remainingTroops > 0) {
          player.balance += exp.remainingTroops;
        }
        this.activeExpansions.splice(idx, 1);
      }
    }
  }

  advanceFrontierTowards(ownerId, targetX, targetY, troops, isCounterPush = false) {
    const width = this.width;
    const height = this.height;
    const frontier = this.frontiers[ownerId];
    const player = this.players[ownerId];
    let remainingTroops = troops;

    if (!frontier || frontier.length === 0) return;

    const frontierSet = new Set(frontier);
    let maxSteps = 2000;

    while (remainingTroops > 2 && frontier.length > 0 && maxSteps-- > 0) {
      let bestIdx = -1;
      let minDist = Infinity;
      let bestArrayIdx = -1;

      for (let i = frontier.length - 1; i >= 0; i--) {
        const fIdx = frontier[i];
        const fx = fIdx % width;
        const fy = Math.floor(fIdx / width);
        const distSq = (fx - targetX) * (fx - targetX) + (fy - targetY) * (fy - targetY);
        if (distSq < minDist) {
          minDist = distSq;
          bestIdx = fIdx;
          bestArrayIdx = i;
        }
      }

      if (bestIdx < 0) break;

      const cx = bestIdx % width;
      const cy = Math.floor(bestIdx / width);

      const neighbors = [
        cy > 0 ? bestIdx - width : -1,
        cy < height - 1 ? bestIdx + width : -1,
        cx > 0 ? bestIdx - 1 : -1,
        cx < width - 1 ? bestIdx + 1 : -1
      ];

      let expandedAny = false;

      for (const nIdx of neighbors) {
        if (nIdx < 0) continue;
        if (this.terrainGrid[nIdx] === 0 || this.terrainGrid[nIdx] === 2) continue;

        const defenderOwner = this.grid[nIdx];

        if (defenderOwner === 0) {
          const cost = 2;
          if (remainingTroops >= cost) {
            remainingTroops -= cost;
            player.landCount++;
            this.grid[nIdx] = ownerId;
            if (!frontierSet.has(nIdx) && this.aiEngine.isBorderPixel(nIdx, this.grid, this.terrainGrid, this.width, this.height, ownerId)) {
              frontier.push(nIdx);
              frontierSet.add(nIdx);
            }
            expandedAny = true;
          }
        }
        else if (defenderOwner !== ownerId) {
          if (this.hasPact(ownerId, defenderOwner)) continue;
          const defender = this.players[defenderOwner];
          const baseCost = 4;
          const fortBonus = (defender && defender.balance > player.balance * 0.5) ? 2 : 0;
          const totalCost = baseCost * 2 + fortBonus;

          if (remainingTroops >= totalCost) {
            remainingTroops -= totalCost;
            if (defender) {
              const defenderCasualties = Math.min(defender.balance, Math.ceil(baseCost * (1.0 + remainingTroops * 0.0005)));
              defender.balance = Math.max(0, defender.balance - defenderCasualties);
            }
            player.landCount++;
            if (defender) {
              defender.landCount = Math.max(0, defender.landCount - 1);
              if (this.frontiers[defenderOwner]) {
                const fIdx = this.frontiers[defenderOwner].indexOf(nIdx);
                if (fIdx !== -1) {
                  this.frontiers[defenderOwner].splice(fIdx, 1);
                }
              }
            }
            this.grid[nIdx] = ownerId;
            if (!frontierSet.has(nIdx) && this.aiEngine.isBorderPixel(nIdx, this.grid, this.terrainGrid, this.width, this.height, ownerId)) {
              frontier.push(nIdx);
              frontierSet.add(nIdx);
            }
            expandedAny = true;

            // Defender front-line counter-push retaliation (prevent recursive call stack loop)
            if (!isCounterPush && defender && defender.isAlive && defender.balance > 300 && Math.random() < 0.2) {
              const counterTroops = Math.min(Math.floor(defender.balance * 0.1), 500);
              if (counterTroops > 20) {
                defender.balance -= counterTroops;
                this.advanceFrontierTowards(defenderOwner, cx, cy, counterTroops, true);
              }
            }
          }
        }
      }

      if (!expandedAny || !this.aiEngine.isBorderPixel(bestIdx, this.grid, this.terrainGrid, this.width, this.height, ownerId)) {
        frontierSet.delete(bestIdx);
        frontier.splice(bestArrayIdx, 1);
      }
    }
  }

  detectIsolatedLandmasses() {
    const width = this.width;
    const height = this.height;
    const visited = new Uint8Array(width * height);
    let continentCount = 0;

    for (let i = 0; i < this.terrainGrid.length; i++) {
      if (this.terrainGrid[i] === 0 || visited[i] === 1) continue;

      let size = 0;
      const queue = [i];
      visited[i] = 1;
      let head = 0;

      while (head < queue.length) {
        const curr = queue[head++];
        size++;

        const cx = curr % width;
        const cy = Math.floor(curr / width);

        const neighbors = [
          cy > 0 ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1
        ];

        for (const n of neighbors) {
          if (n >= 0 && visited[n] === 0 && this.terrainGrid[n] !== 0) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }

      if (size >= 50) {
        continentCount++;
      }
    }

    return continentCount || 1;
  }

  static formatTroops(value) {
    if (isNaN(value) || value === undefined || value === null) return '0';
    if (value >= 1e9) {
      return (value / 1e9).toFixed(1) + 'B';
    }
    if (value >= 1e6) {
      return (value / 1e6).toFixed(1) + 'M';
    }
    if (value >= 1e3) {
      return (value / 1e3).toFixed(1) + 'K';
    }
    return Math.floor(value).toString();
  }

  pruneAllFrontiers() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const frontier = this.frontiers[id];
      if (!frontier || frontier.length === 0) continue;
      this.frontiers[id] = frontier.filter(idx => 
        this.aiEngine.isBorderPixel(idx, this.grid, this.terrainGrid, this.width, this.height, id)
      );
    }
  }

  update(deltaTimeMs = 16.6) {
    if (this.state === 'SPAWN_PICK') {
      this.spawnTimer -= deltaTimeMs / 1000;
      if (this.spawnTimer <= 0) {
        this.confirmSpawnsAndStart();
      }
      return;
    }

    if (this.state !== 'PLAYING') return;

    this.tickCount++;

    if (this.tickCount % 10 === 0) {
      this.processInterest();
    }

    if (this.tickCount % 100 === 0) {
      this.processIncome();
    }

    if (this.tickCount % 200 === 0) {
      this.pruneAllFrontiers();
    }

    this.updateBoats(deltaTimeMs);
    this.updateRadarPulses(deltaTimeMs);
    this.checkPlayerEliminations();
    this.simulateContinuousBorderPressure();
    this.updateExpansions(deltaTimeMs);
    this.updateCapitalCentroids();
    this.updateBots();

    if (this.tickCount % 5 === 0) {
      this.updateVisibilityMask(1);
    }

    this.checkGameResolution();

    // Clamp player balances to prevent NaN or extreme values
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.isAlive) {
        if (isNaN(p.balance) || p.balance < 0) {
          p.balance = 500;
        } else if (p.balance > this.maxTroopsLimit) {
          p.balance = this.maxTroopsLimit;
        }
      }
    }
  }

  updateCapitalCentroids() {
    if (this.tickCount % 5 !== 0) return;

    const width = this.width;
    const sumsX = new Float64Array(this.numPlayers + 1);
    const sumsY = new Float64Array(this.numPlayers + 1);
    const counts = new Uint32Array(this.numPlayers + 1);

    for (let idx = 0; idx < this.grid.length; idx++) {
      const ownerId = this.grid[idx];
      if (ownerId > 0) {
        sumsX[ownerId] += idx % width;
        sumsY[ownerId] += Math.floor(idx / width);
        counts[ownerId]++;
      }
    }

    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.isAlive && counts[id] > 0) {
        p.capitalX = Math.round(sumsX[id] / counts[id]);
        p.capitalY = Math.round(sumsY[id] / counts[id]);
      }
    }
  }

  simulateContinuousBorderPressure() {
    if (this.tickCount % 5 !== 0) return;

    const width = this.width;
    const height = this.height;

    // Calculate troop density (pressure) for each active player
    const pressures = new Float32Array(this.numPlayers + 1);
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.isAlive && p.landCount > 0) {
        pressures[id] = p.balance / p.landCount;
      }
    }

    // Process border pressure pushes
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive || p.balance < 15) continue;

      const frontier = this.frontiers[id];
      if (!frontier || frontier.length === 0) continue;

      const pPressure = pressures[id];

      // Safe copy to iterate while updating frontier lists
      const frontierCopy = [...frontier];
      for (let i = 0; i < frontierCopy.length; i++) {
        const idx = frontierCopy[i];
        const cx = idx % width;
        const cy = Math.floor(idx / width);

        const neighbors = [
          cy > 0 ? idx - width : -1,
          cy < height - 1 ? idx + width : -1,
          cx > 0 ? idx - 1 : -1,
          cx < width - 1 ? idx + 1 : -1
        ];

        for (const nIdx of neighbors) {
          if (nIdx < 0) continue;

          if (this.terrainGrid[nIdx] === 0 || this.terrainGrid[nIdx] === 2) continue;

          const neighborOwner = this.grid[nIdx];
          if (neighborOwner > 0 && neighborOwner !== id) {
            // Non-Aggression Pact check
            if (this.hasPact(id, neighborOwner)) continue;

            const nPressure = pressures[neighborOwner];

            // Push border if attacker density significantly exceeds defender density (15% gap)
            if (pPressure > nPressure * 1.15 && p.balance > 10) {
              const defender = this.players[neighborOwner];

              this.grid[nIdx] = id;
              p.landCount++;
              if (defender) defender.landCount = Math.max(0, defender.landCount - 1);

              p.balance = Math.max(0, p.balance - 1);
              if (defender) defender.balance = Math.max(0, defender.balance - 1);

              if (!this.frontiers[id].includes(nIdx)) {
                this.frontiers[id].push(nIdx);
              }
            }
          }
        }
      }
    }
  }

  checkPlayerEliminations() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.isAlive) {
        if (p.landCount <= 0) {
          p.isAlive = false;
          p.balance = 0;
          this.frontiers[id] = [];
          if (id === 1) {
            this.addToast('💀 You have been defeated!', 'danger');
            this.state = 'GAME_OVER';
          } else {
            this.addToast(`💀 Bot ${p.name || id} has been eliminated!`, 'info');
          }
        }
      }
    }
  }

  updateBoats(deltaTimeMs) {
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const boat = this.boats[i];
      if (!boat) {
        this.boats.splice(i, 1);
        continue;
      }
      const dx = boat.targetX - boat.x;
      const dy = boat.targetY - boat.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 8) {
        const owner = this.players[boat.ownerId];
        if (owner && owner.isAlive && boat.troops >= 1) {
          this.resolveNavalLanding(boat.ownerId, boat.targetX, boat.targetY, boat.troops);
        }
        this.boats.splice(i, 1);
      } else {
        const step = (boat.speed * deltaTimeMs) / 16.6;
        const actualStep = Math.min(dist, step);
        const nextX = boat.x + (dx / dist) * actualStep;
        const nextY = boat.y + (dy / dist) * actualStep;

        if (boat.startX === undefined) {
          boat.startX = boat.x;
          boat.startY = boat.y;
        }

        const nextXInt = Math.floor(nextX);
        const nextYInt = Math.floor(nextY);
        if (nextXInt >= 0 && nextXInt < this.width && nextYInt >= 0 && nextYInt < this.height) {
          const stepDist = Math.hypot(nextX - boat.x, nextY - boat.y);
          const stepsToCheck = Math.ceil(stepDist);
          let collided = false;
          for (let s = 1; s <= stepsToCheck; s++) {
            const t = s / stepsToCheck;
            const px = Math.round(boat.x + (nextX - boat.x) * t);
            const py = Math.round(boat.y + (nextY - boat.y) * t);
            if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
              const checkIdx = py * this.width + px;
              const distToTarget = Math.hypot(boat.targetX - px, boat.targetY - py);
              const distFromStart = Math.hypot(px - boat.startX, py - boat.startY);
              if (distToTarget >= 8 && distFromStart >= 2 && this.terrainGrid[checkIdx] !== 0) {
                collided = true;
                break;
              }
            }
          }
          if (collided) {
            if (boat.ownerId === 1) {
              this.addToast('⛵ A naval transport boat ran aground and sank!', 'danger');
            }
            this.boats.splice(i, 1);
            continue;
          }
        }

        boat.x = nextX;
        boat.y = nextY;

        // Apply sea travel attrition decay (0.0015 per pixel)
        boat.troops = Math.max(0, boat.troops - boat.troops * 0.0015 * actualStep);
        if (boat.troops < 1) {
          if (boat.ownerId === 1) {
            this.addToast('⛵ A naval transport boat sank due to sea attrition!', 'warning');
          }
          this.boats.splice(i, 1);
        }
      }
    }
  }

  resolveNavalLanding(ownerId, targetX, targetY, troops) {
    const owner = this.players[ownerId];
    if (!owner || !owner.isAlive) return;

    const width = this.width;
    const height = this.height;
    let landingIdx = Math.floor(targetY) * width + Math.floor(targetX);

    if (this.terrainGrid[landingIdx] !== 1) {
      let closestLand = -1;
      let minLandDist = Infinity;
      const tx = Math.floor(targetX);
      const ty = Math.floor(targetY);

      for (let dy = -10; dy <= 10; dy++) {
        const ny = ty + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -10; dx <= 10; dx++) {
          const nx = tx + dx;
          if (nx < 0 || nx >= width) continue;
          const idx = ny * width + nx;
          if (this.terrainGrid[idx] === 1) {
            const dSq = dx * dx + dy * dy;
            if (dSq < minLandDist) {
              minLandDist = dSq;
              closestLand = idx;
            }
          }
        }
      }

      if (closestLand >= 0) landingIdx = closestLand;
    }

    if (this.terrainGrid[landingIdx] !== 1) return;

    const landingOwner = this.grid[landingIdx];
    const cx = landingIdx % width;
    const cy = Math.floor(landingIdx / width);
    const radius = 4;
    const rSq = radius * radius;

    if (!this.frontiers[ownerId]) this.frontiers[ownerId] = [];
    const frontier = this.frontiers[ownerId];
    const frontierSet = new Set(frontier);
    let remainingTroops = troops;

    for (let dy = -radius; dy <= radius; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= width) continue;

        if (dx * dx + dy * dy <= rSq) {
          const idx = ny * width + nx;
          if (this.terrainGrid[idx] === 1) {
            const defOwner = this.grid[idx];
            if (defOwner !== ownerId) {
              const cost = defOwner === 0 ? 2 : 8;
              if (remainingTroops >= cost) {
                remainingTroops -= cost;
                this.grid[idx] = ownerId;
                owner.landCount++;
                if (defOwner > 0 && this.players[defOwner]) {
                  const defender = this.players[defOwner];
                  defender.landCount = Math.max(0, defender.landCount - 1);
                  // Inflict casualties on defender
                  const casualties = Math.min(defender.balance, Math.ceil(4 * (1.0 + remainingTroops * 0.0005)));
                  defender.balance = Math.max(0, defender.balance - casualties);
                  // Prune defender's frontier list
                  if (this.frontiers[defOwner]) {
                    const fIdx = this.frontiers[defOwner].indexOf(idx);
                    if (fIdx !== -1) {
                      this.frontiers[defOwner].splice(fIdx, 1);
                    }
                  }
                }

                if (!frontierSet.has(idx)) {
                  frontier.push(idx);
                  frontierSet.add(idx);
                }
              }
            }
          }
        }
      }
    }

    if (ownerId === 1) {
      this.addToast('⛵ Naval landing successful! Established foothold on island territory.', 'success');
    }

    if (remainingTroops > 10) {
      const isRivalAttack = (landingOwner > 0 && landingOwner !== ownerId);
      this.activeExpansions.push({
        ownerId: ownerId,
        targetX: cx,
        targetY: cy,
        launchX: cx,
        launchY: cy,
        remainingTroops: remainingTroops,
        isCounterPush: false,
        path: null,
        isRivalAttack: isRivalAttack,
        targetOwner: landingOwner
      });
    }
  }

  updateBots() {
    this.aiEngine.updateBots(
      this,
      this.frontiers,
      this.terrainGrid,
      this.grid,
      this.boats,
      this.width,
      this.height,
      this.botDifficulty || 'easy'
    );
  }

  processInterest() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;

      const landProportion = p.landCount / this.totalLandToConquer;
      let rate = Math.max(0.001, 0.015 * (1.0 - landProportion));

      if (p.balance > p.landCount * 100) {
        p.redInterest = true;
        rate = Math.max(0.0005, rate * 0.5);
      } else {
        p.redInterest = false;
      }

      p.interestRate = rate;
      p.balance += Math.floor(p.balance * rate);
      p.peakTroops = Math.max(p.peakTroops, p.balance);
    }
  }

  processIncome() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;
      p.balance += Math.floor(p.landCount * 1.5);
    }
  }

  checkGameResolution() {
    const player = this.players[1];
    if (!player) return;

    if (player.landCount === 0 && this.tickCount > 100) {
      this.state = 'GAME_OVER';
      this.gameResult = {
        outcome: 'DEFEAT',
        finalLandPct: '0.0%',
        peakTroops: player.peakTroops,
        botsKilled: this.countEliminatedBots()
      };
      return;
    }

    let totalLandClaimed = 0;
    const totalLandAvailable = this.width * this.height;

    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.landCount > 0) totalLandClaimed += p.landCount;
    }

    if (player.landCount > 0 && player.landCount >= totalLandClaimed * 0.95 && this.tickCount > 200) {
      this.state = 'GAME_OVER';
      this.gameResult = {
        outcome: 'VICTORY',
        finalLandPct: `${((player.landCount / totalLandAvailable) * 100).toFixed(1)}%`,
        peakTroops: player.peakTroops,
        botsKilled: this.countEliminatedBots()
      };
    }
  }

  countEliminatedBots() {
    let count = 0;
    for (let id = 2; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.landCount === 0) count++;
    }
    return count;
  }

  getStats() {
    let activePlayers = 0;
    let totalLandClaimed = 0;

    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (p && p.landCount > 0) {
        activePlayers++;
        totalLandClaimed += p.landCount;
      }
    }

    const human = this.players[1] || { balance: 0, landCount: 0 };

    return {
      activePlayers,
      totalLandClaimed,
      percentClaimed: ((totalLandClaimed / (this.width * this.height)) * 100).toFixed(1),
      playerBalance: human.balance,
      playerLandCount: human.landCount,
      redInterest: human.redInterest
    };
  }
}
