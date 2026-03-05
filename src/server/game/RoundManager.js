import { ROUND, ARENA, PHYSICS, SANDBOX } from '../../shared/constants.js';

const PHASE = {
  WAITING: 'waiting',     // Waiting for enough players
  COUNTDOWN: 'countdown', // Pre-round countdown
  PLAYING: 'playing',     // Active gameplay
  ROUND_END: 'roundEnd',  // Brief pause after round ends
  SHOP: 'shop',           // Between-round shop phase
  MATCH_END: 'matchEnd',  // Match is over
};

export { PHASE };

export class RoundManager {
  constructor() {
    this.currentRound = 0;
    this.phase = PHASE.WAITING;
    this.phaseTimer = 0;        // ms elapsed in current phase
    this.ringRadius = ARENA.RADIUS;

    // Scoring
    this.scores = new Map();    // playerId -> { points, eliminations, roundsWon }

    // Sandbox mode
    this.sandboxMode = false;

    // Cached per-round ring shrink rate (avoids recalculating every tick)
    this.cachedShrinkRate = 0;
  }

  setSandboxMode(enabled) {
    this.sandboxMode = enabled;
  }

  initPlayer(playerId) {
    if (!this.scores.has(playerId)) {
      this.scores.set(playerId, { points: 0, eliminations: 0, roundsWon: 0 });
    }
  }

  removePlayer(playerId) {
    this.scores.delete(playerId);
  }

  startMatch() {
    this.currentRound = 0;
    this.phase = PHASE.WAITING;
    this.phaseTimer = 0;
  }

  startNextRound() {
    this.currentRound++;
    this.phase = PHASE.COUNTDOWN;
    this.phaseTimer = 0;
    this.ringRadius = ARENA.RADIUS;
    this._updateShrinkRate();
  }

  _updateShrinkRate() {
    const rawRate = ARENA.RING_SHRINK_BASE + this.currentRound * ARENA.RING_SHRINK_SCALE;
    this.cachedShrinkRate = Math.min(rawRate, 6);
  }

  update(deltaMs, alivePlayers, totalPlayers) {
    this.phaseTimer += deltaMs;

    switch (this.phase) {
      case PHASE.WAITING:
        // Auto-start when we have players
        if (totalPlayers >= 1) {
          this.startNextRound();
          return { event: 'roundStart', round: this.currentRound };
        }
        break;

      case PHASE.COUNTDOWN:
        if (this.phaseTimer >= ROUND.COUNTDOWN * 1000) {
          this.phase = PHASE.PLAYING;
          this.phaseTimer = 0;
          this._updateShrinkRate();
          return { event: 'countdownEnd' };
        }
        break;

      case PHASE.PLAYING: {
        // Shrink ring (disabled in sandbox)
        if (!this.sandboxMode) {
          // Lazy-init if phase was set directly (e.g. tests)
          if (this.cachedShrinkRate === 0 && this.currentRound > 0) {
            this._updateShrinkRate();
          }
          this.ringRadius -= this.cachedShrinkRate * (deltaMs / 1000);
          if (this.ringRadius < ARENA.MIN_RING_RADIUS) {
            this.ringRadius = ARENA.MIN_RING_RADIUS;
          }
        }

        // Check round end conditions
        const elapsed = this.phaseTimer / 1000;
        const duration = this.sandboxMode ? SANDBOX.ROUND_DURATION : ROUND.DURATION;
        // In sandbox, don't end on elimination (dummies dying shouldn't end round)
        const eliminationEnd = !this.sandboxMode && totalPlayers >= 2 && alivePlayers <= 1;
        if (elapsed >= duration || eliminationEnd) {
          this.phase = PHASE.ROUND_END;
          this.phaseTimer = 0;
          return { event: 'roundEnd', round: this.currentRound, timeUp: elapsed >= duration };
        }
        break;
      }

      case PHASE.ROUND_END:
        if (this.phaseTimer >= 3000) { // 3s pause to show results
          if (this.currentRound >= ROUND.TOTAL_ROUNDS) {
            this.phase = PHASE.MATCH_END;
            this.phaseTimer = 0;
            return { event: 'matchEnd' };
          }
          // Transition to shop phase
          this.phase = PHASE.SHOP;
          this.phaseTimer = 0;
          return { event: 'shopOpen' };
        }
        break;

      case PHASE.SHOP:
        if (this.phaseTimer >= ROUND.SHOP_DURATION * 1000) {
          this.startNextRound();
          return { event: 'roundStart', round: this.currentRound };
        }
        break;

      case PHASE.MATCH_END:
        // Match is over, do nothing
        break;
    }
    return null;
  }

  awardSurvival(playerId) {
    const s = this.scores.get(playerId);
    if (s) s.points += 1;
  }

  awardElimination(eliminatorId) {
    const s = this.scores.get(eliminatorId);
    if (s) {
      s.points += 1;
      s.eliminations += 1;
    }
  }

  awardRoundWin(playerId) {
    const s = this.scores.get(playerId);
    if (s) {
      s.points += 2;
      s.roundsWon += 1;
    }
  }

  getRoundTimeRemaining() {
    if (this.phase !== PHASE.PLAYING) return 0;
    const duration = this.sandboxMode ? SANDBOX.ROUND_DURATION : ROUND.DURATION;
    return Math.max(0, duration - this.phaseTimer / 1000);
  }

  getCountdownRemaining() {
    if (this.phase !== PHASE.COUNTDOWN) return 0;
    return Math.max(0, ROUND.COUNTDOWN - this.phaseTimer / 1000);
  }

  getShopTimeRemaining() {
    if (this.phase !== PHASE.SHOP) return 0;
    return Math.max(0, ROUND.SHOP_DURATION - this.phaseTimer / 1000);
  }

  getState() {
    return {
      round: this.currentRound,
      totalRounds: ROUND.TOTAL_ROUNDS,
      phase: this.phase,
      ringRadius: this.ringRadius,
      timeRemaining: this.getRoundTimeRemaining(),
      countdownRemaining: this.getCountdownRemaining(),
      shopTimeRemaining: this.getShopTimeRemaining(),
    };
  }

  getScores() {
    const result = [];
    for (const [id, s] of this.scores) {
      result.push({ id, ...s });
    }
    return result.sort((a, b) => b.points - a.points);
  }
}
