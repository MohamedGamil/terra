/**
 * Synthetic 500-Territory Expansion Simulation Engine.
 * Simulates real-time territorial expansion, interest ticks (0.5s), and combat (2:1 ratio).
 */

export class TerritorySimulation {
  constructor(width = 1000, height = 1000, numPlayers = 500) {
    this.width = width;
    this.height = height;
    this.numPlayers = numPlayers;

    // Grid array storing owner ID for every pixel (0 = Unclaimed Neutral)
    this.grid = new Uint16Array(width * height);

    // Player state tracking
    this.players = new Array(numPlayers + 1);
    this.frontiers = new Array(numPlayers + 1);

    this.tickCount = 0;
    this.interestTimer = 0;
    this.incomeTimer = 0;

    this.initMap();
  }

  initMap() {
    this.grid.fill(0);

    for (let id = 1; id <= this.numPlayers; id++) {
      this.players[id] = {
        id,
        balance: 500,           // Initial troop count
        landCount: 1,           // Controlled pixels
        interestRate: 0.15,     // Initial interest 15%
        redInterest: false,     // True if balance > 100x land
        isAlive: true
      };
      this.frontiers[id] = [];
    }

    // Seed 500 initial spawn points evenly across 1000x1000 grid
    const margin = 20;
    const innerW = this.width - margin * 2;
    const innerH = this.height - margin * 2;

    for (let id = 1; id <= this.numPlayers; id++) {
      const rx = margin + Math.floor(Math.random() * innerW);
      const ry = margin + Math.floor(Math.random() * innerH);
      const idx = ry * this.width + rx;

      this.grid[idx] = id;
      this.frontiers[id].push(idx);
    }
  }

  /**
   * Advance simulation by 1 frame / tick.
   * Expands frontier pixels into adjacent neutral or enemy cells.
   */
  update(deltaTimeMs = 16.6) {
    this.tickCount++;

    // 0.5s Interest Tick (approx 30 frames at 60 FPS)
    this.interestTimer += deltaTimeMs;
    if (this.interestTimer >= 500) {
      this.interestTimer = 0;
      this.processInterestTick();
    }

    // 5.0s Income Cycle (approx 300 frames)
    this.incomeTimer += deltaTimeMs;
    if (this.incomeTimer >= 5000) {
      this.incomeTimer = 0;
      this.processIncomeCycle();
    }

    // Expand frontiers for all 500 players
    const width = this.width;
    const height = this.height;
    const maxPixelIdx = width * height - 1;

    for (let id = 1; id <= this.numPlayers; id++) {
      const player = this.players[id];
      if (!player || !player.isAlive || player.balance < 10) continue;

      const frontier = this.frontiers[id];
      if (frontier.length === 0) continue;

      // Expand up to N frontier cells based on available balance
      const expansionRate = Math.min(Math.floor(player.balance * 0.05), 30);
      let expansions = 0;

      for (let i = frontier.length - 1; i >= 0 && expansions < expansionRate; i--) {
        const currIdx = frontier[i];
        const cx = currIdx % width;
        const cy = Math.floor(currIdx / width);

        // Check 4-neighbor directions
        const neighbors = [
          cy > 0 ? currIdx - width : -1,
          cy < height - 1 ? currIdx + width : -1,
          cx > 0 ? currIdx - 1 : -1,
          cx < width - 1 ? currIdx + 1 : -1
        ];

        let expandedAny = false;

        for (const nIdx of neighbors) {
          if (nIdx < 0 || nIdx > maxPixelIdx) continue;

          const targetOwner = this.grid[nIdx];

          // Annex Unclaimed Neutral Land
          if (targetOwner === 0) {
            const cost = 2; // Annex cost
            if (player.balance >= cost) {
              player.balance -= cost;
              player.landCount++;
              this.grid[nIdx] = id;
              frontier.push(nIdx);
              expansions++;
              expandedAny = true;
            }
          }
          // Combat Attack on Rival Land (2:1 defender ratio)
          else if (targetOwner !== id) {
            const defender = this.players[targetOwner];
            const cost = 5; // Attack cost
            if (player.balance >= cost * 2) {
              player.balance -= cost * 2;
              if (defender) defender.balance = Math.max(0, defender.balance - cost);
              player.landCount++;
              if (defender) defender.landCount = Math.max(0, defender.landCount - 1);
              this.grid[nIdx] = id;
              frontier.push(nIdx);
              expansions++;
              expandedAny = true;
            }
          }
        }

        // If all neighbors are claimed by self, trim from active frontier
        if (!expandedAny && Math.random() < 0.3) {
          frontier.splice(i, 1);
        }
      }
    }
  }

  processInterestTick() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;

      // Red interest check: balance > 100x land count
      if (p.balance > p.landCount * 100) {
        p.redInterest = true;
        p.interestRate = Math.max(0.01, p.interestRate * 0.95);
      } else {
        p.redInterest = false;
      }

      p.balance += Math.floor(p.balance * p.interestRate);
    }
  }

  processIncomeCycle() {
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = this.players[id];
      if (!p || !p.isAlive) continue;
      // Land income proportional to land area
      p.balance += Math.floor(p.landCount * 1.5);
    }
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

    return {
      activePlayers,
      totalLandClaimed,
      percentClaimed: ((totalLandClaimed / (this.width * this.height)) * 100).toFixed(1)
    };
  }
}
