/**
 * Player ELO Rating & Persistent Local Progression System for Terra.
 * Calculates post-match ELO gains/losses and persists progression state in localStorage.
 */

export class PlayerProgressionManager {
  constructor() {
    this.storageKey = 'terra_player_progression';
    this.state = this.loadState();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {}

    return {
      elo: 1200,
      peakElo: 1200,
      matchesPlayed: 0,
      wins: 0,
      totalLandConquered: 0,
      rankTier: 'Gold',
      history: []
    };
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {}
  }

  getRankTier(elo) {
    if (elo >= 2000) return 'Grandmaster';
    if (elo >= 1700) return 'Diamond';
    if (elo >= 1400) return 'Platinum';
    if (elo >= 1100) return 'Gold';
    if (elo >= 800) return 'Silver';
    return 'Bronze';
  }

  /**
   * Calculates post-match ELO delta based on final match placement rank.
   */
  calculateEloDelta(rank, totalPlayers, botDifficulty = 'easy') {
    const K = 32;
    const diffMultiplier = botDifficulty === 'hard' ? 1.5 : botDifficulty === 'medium' ? 1.2 : 1.0;
    
    // Performance ratio: 1.0 for 1st place, 0.0 for last place
    const actualScore = (totalPlayers - rank) / Math.max(1, totalPlayers - 1);
    const expectedScore = 0.5; // Baseline vs equal field

    const delta = Math.round(K * (actualScore - expectedScore) * diffMultiplier);
    return delta;
  }

  recordMatchResult(rank, totalPlayers, landCount = 0, botDifficulty = 'easy') {
    const delta = this.calculateEloDelta(rank, totalPlayers, botDifficulty);
    this.state.elo = Math.max(100, this.state.elo + delta);
    this.state.peakElo = Math.max(this.state.peakElo, this.state.elo);
    this.state.matchesPlayed++;
    if (rank === 1) this.state.wins++;
    this.state.totalLandConquered += landCount;
    this.state.rankTier = this.getRankTier(this.state.elo);

    const matchEntry = {
      timestamp: Date.now(),
      rank,
      totalPlayers,
      delta,
      eloAfter: this.state.elo,
      landCount
    };

    this.state.history.push(matchEntry);
    if (this.state.history.length > 50) this.state.history.shift();

    this.saveState();
    return { elo: this.state.elo, delta, rankTier: this.state.rankTier };
  }
}
