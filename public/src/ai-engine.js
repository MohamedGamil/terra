/**
 * Multi-Personality AI Strategy Engine for Terra (Territorial.io clone).
 * Manages 4 distinct bot behavioral archetypes (RUSHER, DEFENDER, EXPANSIONIST, ADAPTIVE)
 * with tactical target selection and autonomous naval boat invasions.
 */

export class AIEngine {
  constructor(numPlayers = 100) {
    this.numPlayers = numPlayers;
    this.botProfiles = new Map();
    this.initBotProfiles();
  }

  initBotProfiles() {
    this.botProfiles.clear();
    const archetypes = ['RUSHER', 'DEFENDER', 'EXPANSIONIST', 'ADAPTIVE'];

    for (let id = 2; id <= this.numPlayers; id++) {
      // Evenly distribute archetypes (25% each)
      const archetype = archetypes[(id - 2) % archetypes.length];

      let config = {
        archetype,
        attackRatio: 0.12,
        expansionChance: 0.8,
        reserveRatio: 0.2,
        boatChance: 0.05
      };

      if (archetype === 'RUSHER') {
        config.attackRatio = 0.18;
        config.expansionChance = 0.95;
        config.reserveRatio = 0.1;
        config.boatChance = 0.08;
      } else if (archetype === 'DEFENDER') {
        config.attackRatio = 0.05;
        config.expansionChance = 0.5;
        config.reserveRatio = 0.65;
        config.boatChance = 0.02;
      } else if (archetype === 'EXPANSIONIST') {
        config.attackRatio = 0.14;
        config.expansionChance = 0.98;
        config.reserveRatio = 0.15;
        config.boatChance = 0.30; // Frequently colonizes islands
      } else if (archetype === 'ADAPTIVE') {
        config.attackRatio = 0.15;
        config.expansionChance = 0.85;
        config.reserveRatio = 0.25;
        config.boatChance = 0.12;
      }

      this.botProfiles.set(id, config);
    }
  }

  /**
   * Main bot tick routine executing multi-personality strategy logic.
   */
  updateBots(simOrPlayers, frontiers, terrainGrid, grid, boats, width, height, difficulty = 'easy') {
    const simulation = (simOrPlayers && simOrPlayers.players) ? simOrPlayers : null;
    const players = simulation ? simulation.players : simOrPlayers;

    // Difficulty multipliers
    const diffMult = difficulty === 'impossible' ? 1.5 : (difficulty === 'hard' ? 1.2 : 1.0);

    // Identify current leader (player with most land)
    let leaderId = 1;
    let maxLand = 0;
    for (let id = 1; id <= this.numPlayers; id++) {
      const p = players[id];
      if (p && p.landCount > maxLand) {
        maxLand = p.landCount;
        leaderId = id;
      }
    }

    // Tick cooldown per difficulty (Easy = 8 ticks [400ms], Hard = 5 ticks [250ms], Impossible = 2 ticks [100ms])
    const tickCooldown = difficulty === 'impossible' ? 2 : (difficulty === 'hard' ? 5 : 8);

    for (let id = 2; id <= this.numPlayers; id++) {
      const bot = players[id];
      if (!bot || !bot.isAlive || bot.balance < 20) continue;

      // Action throttling
      bot.actionCooldown = (bot.actionCooldown || 0) + 1;
      if (bot.actionCooldown < tickCooldown) continue;
      bot.actionCooldown = 0;

      const profile = this.botProfiles.get(id);
      if (!profile) continue;

      const frontier = frontiers[id];
      if (!frontier || frontier.length === 0) continue;

      // Reserve check for DEFENDER profile
      if (profile.archetype === 'DEFENDER') {
        const minReserve = Math.floor(bot.landCount * 5 * profile.reserveRatio);
        if (bot.balance < minReserve) continue;
      }

      // Determine expansion rate per tick based on profile & difficulty
      const baseRate = Math.floor(bot.balance * profile.attackRatio * diffMult);
      const expansionRate = Math.min(Math.max(1, baseRate), 15);
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
          const terrain = terrainGrid[nIdx];
          if (terrain === 0 || terrain === 2) continue; // Skip water & mountain

          const targetOwner = grid[nIdx];

          // 1. Neutral Land Expansion
          if (targetOwner === 0) {
            const baseCost = 2;
            const attackTax = Math.ceil(bot.balance * 0.0117);
            const totalCost = baseCost + attackTax;

            if (bot.balance >= totalCost && Math.random() < profile.expansionChance) {
              bot.balance -= totalCost;
              bot.landCount++;
              grid[nIdx] = id;
              if (!frontier.includes(nIdx) && this.isBorderPixel(nIdx, grid, terrainGrid, width, height, id)) {
                frontier.push(nIdx);
              }
              count++;
              expanded = true;
            }
          } 
          // 2. Rival Territory Attack (Neutral Targeting)
          else if (targetOwner !== id) {
            if (simulation && simulation.hasPact(id, targetOwner)) continue;
            const targetPlayer = players[targetOwner];
            let shouldAttack = false;

            if (profile.archetype === 'RUSHER') {
              shouldAttack = Math.random() < 0.6; // Rushers attack rivals
            } else if (profile.archetype === 'ADAPTIVE' && targetOwner === leaderId) {
              shouldAttack = Math.random() < 0.7; // Target leader
            } else {
              shouldAttack = Math.random() < 0.2; // Fair neutral attack chance
            }

            if (shouldAttack && targetPlayer && targetPlayer.landCount > 0) {
              const baseCost = 6;
              const attackTax = Math.ceil(bot.balance * 0.0117);
              const totalCost = baseCost + attackTax;

              if (bot.balance >= totalCost) {
                bot.balance -= totalCost;
                targetPlayer.landCount = Math.max(0, targetPlayer.landCount - 1);
                bot.landCount++;
                grid[nIdx] = id;
                if (!frontier.includes(nIdx) && this.isBorderPixel(nIdx, grid, terrainGrid, width, height, id)) {
                  frontier.push(nIdx);
                }
                count++;
                expanded = true;

                if (targetPlayer.landCount === 0) {
                  targetPlayer.isAlive = false;
                }
              }
            }
          }
        }

        // Prune inland frontier pixels immediately
        if (!this.isBorderPixel(fIdx, grid, terrainGrid, width, height, id)) {
          frontier.splice(i, 1);
        }
      }

      // Autonomous Bot Naval Invasions across ocean
      if (bot.balance > 400 && Math.random() < profile.boatChance * 0.1) {
        const departurePoint = this.findBotCoastalPixel(id, frontier, terrainGrid, width, height);
        if (departurePoint) {
          // Target random land pixel across water
          const targetX = Math.floor((0.1 + Math.random() * 0.8) * width);
          const targetY = Math.floor((0.1 + Math.random() * 0.8) * height);
          const targetIdx = targetY * width + targetX;

          if (terrainGrid[targetIdx] === 1 && grid[targetIdx] !== id) {
            const force = Math.floor(bot.balance * 0.25);
            bot.balance -= force;
            boats.push({
              id: Date.now() + Math.random(),
              ownerId: id,
              troops: force,
              x: departurePoint.x,
              y: departurePoint.y,
              targetX,
              targetY,
              targetIdx,
              speed: 4.5
            });
          }
        }
      }
    }
  }

  findBotCoastalPixel(ownerId, frontier, terrainGrid, width, height) {
    for (let i = 0; i < Math.min(20, frontier.length); i++) {
      const idx = frontier[i];
      const cx = idx % width;
      const cy = Math.floor(idx / width);

      if ((cy > 0 && terrainGrid[idx - width] === 0) ||
          (cy < height - 1 && terrainGrid[idx + width] === 0) ||
          (cx > 0 && terrainGrid[idx - 1] === 0) ||
          (cx < width - 1 && terrainGrid[idx + 1] === 0)) {
        return { x: cx, y: cy };
      }
    }
    return null;
  }

  isBorderPixel(idx, grid, terrainGrid, width, height, ownerId) {
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
      if (terrainGrid[nIdx] === 1 && grid[nIdx] !== ownerId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluates diplomatic proposal directed at botId based on archetype profile.
   */
  evaluateDiplomaticProposal(simulation, botId, proposerId, proposalType = 'NAP') {
    const profile = this.botProfiles.get(botId);
    if (!profile) return false;

    const pBot = simulation.players[botId];
    const pProp = simulation.players[proposerId];
    if (!pBot || !pProp) return false;

    const archetype = profile.archetype;

    if (archetype === 'RUSHER') {
      // Rushers dislike alliances (15% acceptance chance)
      return Math.random() < 0.15;
    } else if (archetype === 'DEFENDER') {
      // Defenders love peaceful NAPs (85% acceptance chance)
      return Math.random() < 0.85;
    } else if (archetype === 'EXPANSIONIST') {
      // Accepts if proposer balance is strong (> 70% of bot balance)
      return pProp.balance >= pBot.balance * 0.7;
    } else if (archetype === 'ADAPTIVE') {
      // Evaluates balance ratio and leader status
      if (proposerId === 1) {
        // Human player proposal: 75% acceptance if human is reasonably strong
        return pProp.balance >= pBot.balance * 0.5;
      }
      return Math.random() < 0.6;
    }

    return true;
  }
}
