/**
 * Terra Server Game Tick Engine.
 * Manages 500 active bot/player entities, interest cycles, and 2:1 combat mechanics.
 */

export class GameServerEngine {
  constructor(width = 1000, height = 1000, numPlayers = 500) {
    this.width = width;
    this.height = height;
    this.numPlayers = numPlayers;

    // Grid array storing owner ID for every pixel (0 = Unclaimed Neutral)
    this.grid = new Uint16Array(width * height);
    this.players = new Array(numPlayers + 1);
    this.frontiers = new Array(numPlayers + 1);

    // Delta tracking for network state sync
    this.modifiedPixels = []; // Array of { idx, owner }
    this.pacts = new Map();

    this.tickCount = 0;
    this.tickRateHz = 20; // 20 ticks/sec (50ms interval)
    this.interestIntervalTicks = 10; // 0.5 seconds
    this.incomeIntervalTicks = 100; // 5.0 seconds

    this.initMap();
  }

  initMap() {
    this.grid.fill(0);
    this.modifiedPixels = [];

    for (let id = 1; id <= this.numPlayers; id++) {
      this.players[id] = {
        id,
        balance: 500,
        landCount: 1,
        interestRate: 0.15,
        redInterest: false,
        isAlive: true
      };
      this.frontiers[id] = [];
    }

    const margin = 20;
    const innerW = this.width - margin * 2;
    const innerH = this.height - margin * 2;

    for (let id = 1; id <= this.numPlayers; id++) {
      const rx = margin + Math.floor(Math.random() * innerW);
      const ry = margin + Math.floor(Math.random() * innerH);
      const idx = ry * this.width + rx;

      this.grid[idx] = id;
      this.frontiers[id].push(idx);
      this.modifiedPixels.push({ idx, owner: id });
    }
  }

  /**
   * Execute 1 server tick.
   * Measures tick computation execution duration using high-resolution hrtime.
   * @returns {number} Execution duration in milliseconds
   */
  tick() {
    const hrStart = process.hrtime.bigint();
    this.tickCount++;
    this.modifiedPixels = []; // Reset per-tick delta buffer

    // 0.5s Interest Tick
    if (this.tickCount % this.interestIntervalTicks === 0) {
      this.processInterest();
    }

    // 5.0s Income Cycle
    if (this.tickCount % this.incomeIntervalTicks === 0) {
      this.processIncome();
    }

    // Process Bot Expansion & Combat Resolution
    this.processExpansions();

    const hrEnd = process.hrtime.bigint();
    return Number(hrEnd - hrStart) / 1e6; // Convert nanoseconds to milliseconds
  }

  processExpansions() {
    const width = this.width;
    const height = this.height;
    const maxIdx = width * height - 1;

    for (let id = 1; id <= this.numPlayers; id++) {
      const player = this.players[id];
      if (!player || !player.isAlive || player.balance < 10) continue;

      const frontier = this.frontiers[id];
      if (frontier.length === 0) continue;

      const expansionRate = Math.min(Math.floor(player.balance * 0.05), 25);
      let count = 0;

      for (let i = frontier.length - 1; i >= 0 && count < expansionRate; i--) {
        const currIdx = frontier[i];
        const cx = currIdx % width;
        const cy = Math.floor(currIdx / width);

        const neighbors = [
          cy > 0 ? currIdx - width : -1,
          cy < height - 1 ? currIdx + width : -1,
          cx > 0 ? currIdx - 1 : -1,
          cx < width - 1 ? currIdx + 1 : -1
        ];

        let expandedAny = false;

        for (const nIdx of neighbors) {
          if (nIdx < 0 || nIdx > maxIdx) continue;

          const targetOwner = this.grid[nIdx];

          // Annex Unclaimed Neutral Land
          if (targetOwner === 0) {
            const cost = 2;
            if (player.balance >= cost) {
              player.balance -= cost;
              player.landCount++;
              this.grid[nIdx] = id;
              frontier.push(nIdx);
              this.modifiedPixels.push({ idx: nIdx, owner: id });
              count++;
              expandedAny = true;
            }
          }
          // Combat Attack on Rival Territory (2:1 defender ratio)
          else if (targetOwner !== id) {
            if (this.hasPact(id, targetOwner)) continue;
            const defender = this.players[targetOwner];
            const cost = 5;
            if (player.balance >= cost * 2) {
              player.balance -= cost * 2;
              if (defender) defender.balance = Math.max(0, defender.balance - cost);
              player.landCount++;
              if (defender) defender.landCount = Math.max(0, defender.landCount - 1);
              this.grid[nIdx] = id;
              frontier.push(nIdx);
              this.modifiedPixels.push({ idx: nIdx, owner: id });
              count++;
              expandedAny = true;
            }
          }
        }

        if (!expandedAny && Math.random() < 0.25) {
          frontier.splice(i, 1);
        }
      }
    }
  }

  processInterest() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;

      // Red Interest Decay Check (balance > 100x land count)
      if (p.balance > p.landCount * 100) {
        p.redInterest = true;
        p.interestRate = Math.max(0.01, p.interestRate * 0.95);
      } else {
        p.redInterest = false;
      }

      p.balance += Math.floor(p.balance * p.interestRate);
    }
  }

  processIncome() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;
      p.balance += Math.floor(p.landCount * 1.5);
    }
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

  proposePact(id1, id2) {
    if (!this.players[id1] || !this.players[id2]) return false;
    this.pacts.set(this.getPactKey(id1, id2), 'ACTIVE');
    return true;
  }

  breakPact(id1, id2) {
    const key = this.getPactKey(id1, id2);
    if (this.pacts.get(key) !== 'ACTIVE') return false;
    this.pacts.delete(key);
    const breaker = this.players[id1];
    if (breaker) {
      breaker.balance = Math.floor(breaker.balance * 0.85); // 15% penalty
    }
    return true;
  }
}
