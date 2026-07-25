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
  }

  executeAttack(attackerId, targetPixelIdx, forcePercent = 25) {
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

    const tax = Math.ceil(attacker.balance * 0.0117);
    attacker.balance -= tax;

    const forceTroops = Math.floor((attacker.balance * forcePercent) / 100);
    if (forceTroops < 5) return false;

    attacker.balance -= forceTroops;

    const targetX = targetPixelIdx % this.width;
    const targetY = Math.floor(targetPixelIdx / this.width);

    if (this.onParticleEvent) {
      this.onParticleEvent('ATTACK_LAUNCH', { x: targetX, y: targetY, color: attacker.color || '#00f2fe', troops: forceTroops });
    }

    this.advanceFrontierTowards(attackerId, targetX, targetY, forceTroops);
    return true;
  }

  isShorelinePixel(idx) {
    if (this.terrainGrid[idx] === 0) return false;
    const cx = idx % this.width;
    const cy = Math.floor(idx / this.width);
    const width = this.width;
    if (cy > 0 && this.terrainGrid[idx - width] === 0) return true;
    if (cy < this.height - 1 && this.terrainGrid[idx + width] === 0) return true;
    if (cx > 0 && this.terrainGrid[idx - 1] === 0) return true;
    if (cx < this.width - 1 && this.terrainGrid[idx + 1] === 0) return true;
    return false;
  }

  launchBoatAttack(attackerId, targetPixelIdx, forcePercent = 25) {
    if (this.state !== 'PLAYING') return false;
    const attacker = this.players[attackerId];
    if (!attacker || !attacker.isAlive || attacker.balance < 50) return false;

    if (!this.isShorelinePixel(targetPixelIdx)) {
      if (attackerId === 1) {
        this.addToast('⚠️ Target must be a shoreline to land!', 'warning');
      }
      return false;
    }

    const targetX = targetPixelIdx % this.width;
    const targetY = Math.floor(targetPixelIdx / this.width);

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

    this.boats.push({
      id: Date.now() + Math.random(),
      ownerId: attackerId,
      troops: forceTroops,
      x: departure.x,
      y: departure.y,
      targetX,
      targetY,
      targetIdx: targetPixelIdx,
      speed: 4.5
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

    this.addToast(`Sent ${netAid.toLocaleString()} troops aid to ${pTo.name} (5% tax).`, 'info');
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
    const frontier = this.frontiers[ownerId];
    if (!frontier) return null;
    const width = this.width;
    let bestPixel = null;
    let minDistance = Infinity;

    for (const idx of frontier) {
      const cx = idx % width;
      const cy = Math.floor(idx / width);
      if ((cy > 0 && this.terrainGrid[idx - width] === 0) ||
          (cy < this.height - 1 && this.terrainGrid[idx + width] === 0) ||
          (cx > 0 && this.terrainGrid[idx - 1] === 0) ||
          (cx < width - 1 && this.terrainGrid[idx + 1] === 0)) {
        
        const dist = Math.hypot(cx - tx, cy - ty);
        if (dist < minDistance) {
          minDistance = dist;
          bestPixel = { x: cx, y: cy };
        }
      }
    }
    return bestPixel;
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
            if (defender) defender.balance = Math.max(0, defender.balance - baseCost);
            player.landCount++;
            if (defender) defender.landCount = Math.max(0, defender.landCount - 1);
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
    this.updateBots();

    if (this.tickCount % 5 === 0) {
      this.updateVisibilityMask(1);
    }

    this.checkGameResolution();
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
        boat.x += (dx / dist) * actualStep;
        boat.y += (dy / dist) * actualStep;

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
                  this.players[defOwner].landCount = Math.max(0, this.players[defOwner].landCount - 1);
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
      this.advanceFrontierTowards(ownerId, targetX, targetY, remainingTroops);
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

      const baseRate = p.interestRate || 0.035;
      const landMultiplier = 1.0 + Math.min(4.0, p.landCount / 2500);
      let effectiveRate = baseRate * landMultiplier;

      if (p.balance > p.landCount * 100) {
        p.redInterest = true;
        effectiveRate = Math.max(0.005, effectiveRate * 0.5);
      } else {
        p.redInterest = false;
      }

      p.balance += Math.floor(p.balance * effectiveRate);
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
