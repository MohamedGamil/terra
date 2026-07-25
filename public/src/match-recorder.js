/**
 * Match Telemetry & Statistics Recorder Engine for Terra.
 * Records tick-by-tick time-series data (territory %, troop balance, APM, combat stats)
 * for post-match replay graphs and leaderboard analysis.
 */

export class MatchRecorder {
  constructor(sampleIntervalSeconds = 1.0) {
    this.sampleIntervalSeconds = sampleIntervalSeconds;
    this.reset();
  }

  reset() {
    this.matchStartTime = 0;
    this.matchEndTime = 0;
    this.elapsedSeconds = 0;
    this.lastSampleTime = -1;
    this.userActionCount = 0;
    
    // Time-series samples: { timestamp: number, players: Map<id, { landPct: number, troops: number }> }
    this.timelineSamples = [];
    
    // Aggregate player stats: Map<id, { id: number, name: string, color: string, isHuman: boolean, peakLandPct: number, peakTroops: number, totalKilled: number, totalLost: number, eliminationTime: number | null }>
    this.playerStats = new Map();
  }

  start(timestamp = performance.now()) {
    this.reset();
    this.matchStartTime = timestamp;
    this.lastSampleTime = 0;
  }

  recordUserAction() {
    this.userActionCount++;
  }

  /**
   * Sample simulation state at current match tick.
   * @param {number} elapsedSec Elapsed match time in seconds
   * @param {Array} players Array of player objects from Simulation
   * @param {number} totalLandPixels Total land pixels on current map
   */
  sample(elapsedSec, players, totalLandPixels) {
    this.elapsedSeconds = elapsedSec;

    // Check if it's time to capture a time-series snapshot
    if (this.lastSampleTime < 0 || (elapsedSec - this.lastSampleTime) >= this.sampleIntervalSeconds) {
      this.lastSampleTime = elapsedSec;

      const snapshotPlayers = [];

      for (const p of players) {
        if (!p) continue;
        const landPct = totalLandPixels > 0 ? (p.landCount / totalLandPixels) * 100 : 0;
        const troops = p.balance || 0;

        // Initialize or update aggregate player stats
        let stats = this.playerStats.get(p.id);
        if (!stats) {
          stats = {
            id: p.id,
            name: p.name || `Bot ${p.id}`,
            color: p.color || '#ff0055',
            isHuman: !!p.isHuman,
            peakLandPct: landPct,
            peakTroops: troops,
            totalKilled: 0,
            totalLost: 0,
            eliminationTime: null
          };
          this.playerStats.set(p.id, stats);
        }

        // Track peaks
        if (landPct > stats.peakLandPct) stats.peakLandPct = landPct;
        if (troops > stats.peakTroops) stats.peakTroops = troops;

        // Track elimination timestamp
        if (p.isDead && stats.eliminationTime === null) {
          stats.eliminationTime = elapsedSec;
        }

        snapshotPlayers.push({
          id: p.id,
          name: p.name,
          color: p.color,
          isHuman: !!p.isHuman,
          isDead: !!p.isDead,
          landPct: parseFloat(landPct.toFixed(2)),
          troops: Math.floor(troops)
        });
      }

      this.timelineSamples.push({
        timestamp: parseFloat(elapsedSec.toFixed(1)),
        players: snapshotPlayers
      });
    }
  }

  recordCasualties(attackerId, defenderId, troopsKilled) {
    if (this.playerStats.has(attackerId)) {
      this.playerStats.get(attackerId).totalKilled += troopsKilled;
    }
    if (this.playerStats.has(defenderId)) {
      this.playerStats.get(defenderId).totalLost += troopsKilled;
    }
  }

  /**
   * Calculates Actions Per Minute (APM) for human player.
   */
  getAPM() {
    if (this.elapsedSeconds <= 0) return 0;
    const minutes = this.elapsedSeconds / 60;
    return Math.round(this.userActionCount / minutes);
  }

  /**
   * Compiles final post-match summary report and leaderboard standings.
   */
  getSummary() {
    const standings = Array.from(this.playerStats.values()).sort((a, b) => {
      // Survived longer = higher rank; if both alive/dead, compare peak land
      if (a.eliminationTime !== null && b.eliminationTime !== null) {
        return b.eliminationTime - a.eliminationTime;
      }
      if (a.eliminationTime !== null) return 1;
      if (b.eliminationTime !== null) return -1;
      return b.peakLandPct - a.peakLandPct;
    });

    const winner = standings[0] || null;
    const humanStats = Array.from(this.playerStats.values()).find(p => p.isHuman) || null;
    const humanRank = humanStats ? standings.findIndex(p => p.id === humanStats.id) + 1 : null;

    return {
      durationSeconds: Math.round(this.elapsedSeconds),
      humanAPM: this.getAPM(),
      totalActions: this.userActionCount,
      winner: winner ? { name: winner.name, color: winner.color, isHuman: winner.isHuman } : null,
      humanRank: humanRank,
      totalPlayers: standings.length,
      standings: standings.map((s, idx) => ({
        rank: idx + 1,
        ...s,
        peakLandPct: parseFloat(s.peakLandPct.toFixed(1)),
        peakTroops: Math.round(s.peakTroops)
      })),
      timeline: this.timelineSamples
    };
  }
}
