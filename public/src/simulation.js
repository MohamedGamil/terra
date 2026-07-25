/**
 * Authentic Territorial.io Engine Simulation.
 * Implements LOBBY -> SPAWN_PICK -> PLAYING -> GAME_OVER state machine,
 * 1.17% attack tax, 3.125% boat deployment tax, 2:1 defender combat advantage,
 * circular spawn blob seeding (radius 6px), and 50-pixel bot spawn separation buffer.
 */

import { MapGenerator } from './map-generator.js';

export class TerritorySimulation {
  constructor(width = 1000, height = 1000, numPlayers = 100, mapType = 'world') {
    this.width = width;
    this.height = height;
    this.numPlayers = numPlayers;
    this.mapType = mapType;

    this.state = 'LOBBY';

    this.terrainGrid = MapGenerator.generate(mapType, width, height);
    this.grid = new Uint16Array(width * height);

    this.players = new Array(numPlayers + 1);
    this.frontiers = new Array(numPlayers + 1);
    this.boats = [];

    this.spawnTimer = 10.0;
    this.humanSpawnIdx = null;

    this.interestTimer = 0;
    this.incomeTimer = 0;
    this.tickCount = 0;

    this.gameResult = null;
  }

  startSpawnPhase() {
    this.state = 'SPAWN_PICK';
    this.spawnTimer = 10.0;
    this.grid.fill(0);
    this.boats = [];
    this.humanSpawnIdx = null;

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
    const minBufferSq = 50 * 50;

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

    const tax = Math.ceil(attacker.balance * 0.0117);
    attacker.balance -= tax;

    const forceTroops = Math.floor((attacker.balance * forcePercent) / 100);
    if (forceTroops < 5) return false;

    attacker.balance -= forceTroops;

    const targetX = targetPixelIdx % this.width;
    const targetY = Math.floor(targetPixelIdx / this.width);

    this.advanceFrontierTowards(attackerId, targetX, targetY, forceTroops);
    return true;
  }

  launchBoatAttack(attackerId, targetPixelIdx, forcePercent = 25) {
    if (this.state !== 'PLAYING') return false;
    const attacker = this.players[attackerId];
    if (!attacker || !attacker.isAlive || attacker.balance < 50) return false;

    const tax = Math.ceil(attacker.balance * 0.03125);
    attacker.balance -= tax;

    const forceTroops = Math.floor((attacker.balance * forcePercent) / 100);
    if (forceTroops < 10) return false;

    attacker.balance -= forceTroops;

    const targetX = targetPixelIdx % this.width;
    const targetY = Math.floor(targetPixelIdx / this.width);

    const departure = this.findClosestCoastalPixel(attackerId);
    if (!departure) return false;

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

  findClosestCoastalPixel(ownerId) {
    const frontier = this.frontiers[ownerId];
    const width = this.width;
    for (const idx of frontier) {
      const cx = idx % width;
      const cy = Math.floor(idx / width);
      if ((cy > 0 && this.terrainGrid[idx - width] === 0) ||
          (cy < this.height - 1 && this.terrainGrid[idx + width] === 0) ||
          (cx > 0 && this.terrainGrid[idx - 1] === 0) ||
          (cx < width - 1 && this.terrainGrid[idx + 1] === 0)) {
        return { x: cx, y: cy };
      }
    }
    return null;
  }

  advanceFrontierTowards(ownerId, targetX, targetY, troops) {
    const width = this.width;
    const height = this.height;
    const frontier = this.frontiers[ownerId];
    const player = this.players[ownerId];
    let remainingTroops = troops;

    while (remainingTroops > 2 && frontier.length > 0) {
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
            frontier.push(nIdx);
            expandedAny = true;
          }
        }
        else if (defenderOwner !== ownerId) {
          const defender = this.players[defenderOwner];
          const cost = 4;
          if (remainingTroops >= cost * 2) {
            remainingTroops -= cost * 2;
            if (defender) defender.balance = Math.max(0, defender.balance - cost);
            player.landCount++;
            if (defender) defender.landCount = Math.max(0, defender.landCount - 1);
            this.grid[nIdx] = ownerId;
            frontier.push(nIdx);
            expandedAny = true;
          }
        }
      }

      if (!expandedAny) {
        frontier.splice(bestArrayIdx, 1);
      }
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

    this.updateBoats(deltaTimeMs);
    this.updateBots();
    this.checkGameResolution();
  }

  updateBoats(deltaTimeMs) {
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const boat = this.boats[i];
      const dx = boat.targetX - boat.x;
      const dy = boat.targetY - boat.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 8) {
        this.advanceFrontierTowards(boat.ownerId, boat.targetX, boat.targetY, boat.troops);
        this.boats.splice(i, 1);
      } else {
        const step = (boat.speed * deltaTimeMs) / 16.6;
        boat.x += (dx / dist) * step;
        boat.y += (dy / dist) * step;
      }
    }
  }

  updateBots() {
    const width = this.width;
    const height = this.height;

    for (let id = 2; id <= this.numPlayers; id++) {
      const bot = this.players[id];
      if (!bot || !bot.isAlive || bot.balance < 20) continue;

      const frontier = this.frontiers[id];
      if (frontier.length === 0) continue;

      const expansionRate = Math.min(Math.floor(bot.balance * 0.04), 15);
      let count = 0;

      for (let i = frontier.length - 1; i >= 0 && count < expansionRate; i--) {
        const fIdx = frontier[i];
        const cx = fIdx % width;
        const cy = Math.floor(fIdx / width);

        const neighbors = [
          cy > 0 ? fIdx - width : -1,
          cy < height - 1 ? fIdx + width : -1,
          cx > 0 ? fIdx - 1 : -1,
          cx < width - 1 ? fIdx + 1 : -1
        ];

        let expanded = false;
        for (const nIdx of neighbors) {
          if (nIdx < 0) continue;
          if (this.terrainGrid[nIdx] === 0 || this.terrainGrid[nIdx] === 2) continue;

          const targetOwner = this.grid[nIdx];
          if (targetOwner === 0) {
            const cost = 2;
            if (bot.balance >= cost) {
              bot.balance -= cost;
              bot.landCount++;
              this.grid[nIdx] = id;
              frontier.push(nIdx);
              count++;
              expanded = true;
            }
          }
        }

        if (!expanded && Math.random() < 0.2) {
          frontier.splice(i, 1);
        }
      }
    }
  }

  processInterest() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;

      if (p.balance > p.landCount * 100) {
        p.redInterest = true;
        p.interestRate = Math.max(0.01, p.interestRate * 0.95);
      } else {
        p.redInterest = false;
      }

      p.balance += Math.floor(p.balance * p.interestRate);
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
