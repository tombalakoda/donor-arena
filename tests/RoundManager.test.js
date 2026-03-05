import { describe, it, expect } from 'vitest';
import { RoundManager, PHASE } from '../src/server/game/RoundManager.js';
import { ARENA, ROUND, SANDBOX } from '../src/shared/constants.js';

/**
 * Advance time by calling update() in small increments.
 * Returns the first non-null event, or null if none triggered.
 */
function advanceMs(rm, totalMs, alive, total, tickMs = 50) {
  let remaining = totalMs;
  while (remaining > 0) {
    const dt = Math.min(tickMs, remaining);
    const event = rm.update(dt, alive, total);
    if (event) return event;
    remaining -= dt;
  }
  return null;
}

/**
 * Fast-forward through phases to reach PLAYING state.
 * Returns the RoundManager in PLAYING phase, round 1.
 */
function startPlaying(rm, alive = 2, total = 2) {
  // WAITING → COUNTDOWN
  rm.update(50, alive, total);
  // COUNTDOWN → PLAYING
  advanceMs(rm, ROUND.COUNTDOWN * 1000, alive, total);
  return rm;
}

describe('RoundManager', () => {
  // ═══════════════════════════════════════════════════════
  // Initial state
  // ═══════════════════════════════════════════════════════

  describe('initial state', () => {
    it('should start in WAITING phase with round 0', () => {
      const rm = new RoundManager();
      expect(rm.phase).toBe(PHASE.WAITING);
      expect(rm.currentRound).toBe(0);
    });

    it('should have ringRadius equal to ARENA.RADIUS', () => {
      const rm = new RoundManager();
      expect(rm.ringRadius).toBe(ARENA.RADIUS);
    });

    it('should have empty scores map', () => {
      const rm = new RoundManager();
      expect(rm.scores.size).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Phase transitions
  // ═══════════════════════════════════════════════════════

  describe('phase transitions', () => {
    it('should transition WAITING → COUNTDOWN when totalPlayers >= 1', () => {
      const rm = new RoundManager();
      const event = rm.update(50, 1, 1);
      expect(event).toEqual({ event: 'roundStart', round: 1 });
      expect(rm.phase).toBe(PHASE.COUNTDOWN);
    });

    it('should stay in WAITING when totalPlayers is 0', () => {
      const rm = new RoundManager();
      const event = rm.update(50, 0, 0);
      expect(event).toBeNull();
      expect(rm.phase).toBe(PHASE.WAITING);
    });

    it('should transition COUNTDOWN → PLAYING after ROUND.COUNTDOWN seconds', () => {
      const rm = new RoundManager();
      rm.update(50, 2, 2); // WAITING → COUNTDOWN

      // Just before threshold — should still be COUNTDOWN
      const beforeEvent = advanceMs(rm, ROUND.COUNTDOWN * 1000 - 100, 2, 2);
      expect(beforeEvent).toBeNull();
      expect(rm.phase).toBe(PHASE.COUNTDOWN);

      // Cross threshold
      const event = advanceMs(rm, 150, 2, 2);
      expect(event).toEqual({ event: 'countdownEnd' });
      expect(rm.phase).toBe(PHASE.PLAYING);
    });

    it('should transition PLAYING → ROUND_END when time expires', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      expect(rm.phase).toBe(PHASE.PLAYING);

      const event = advanceMs(rm, ROUND.DURATION * 1000, 2, 2);
      expect(event).toEqual({ event: 'roundEnd', round: 1, timeUp: true });
      expect(rm.phase).toBe(PHASE.ROUND_END);
    });

    it('should transition PLAYING → ROUND_END when <=1 alive with >=2 total', () => {
      const rm = new RoundManager();
      startPlaying(rm);

      // Simulate elimination: 1 alive out of 2
      const event = rm.update(50, 1, 2);
      expect(event).toEqual({ event: 'roundEnd', round: 1, timeUp: false });
      expect(rm.phase).toBe(PHASE.ROUND_END);
    });

    it('should NOT end round when totalPlayers < 2', () => {
      const rm = new RoundManager();
      startPlaying(rm, 1, 1);

      // Single player, 1 alive, 1 total — should NOT trigger elimination end
      const event = rm.update(50, 1, 1);
      expect(event).toBeNull();
      expect(rm.phase).toBe(PHASE.PLAYING);
    });

    it('should transition ROUND_END → SHOP after 3 seconds', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      rm.update(50, 1, 2); // PLAYING → ROUND_END

      const event = advanceMs(rm, 3000, 2, 2);
      expect(event).toEqual({ event: 'shopOpen' });
      expect(rm.phase).toBe(PHASE.SHOP);
    });

    it('should transition SHOP → COUNTDOWN after SHOP_DURATION seconds', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      rm.update(50, 1, 2); // ROUND_END
      advanceMs(rm, 3000, 2, 2); // SHOP

      const event = advanceMs(rm, ROUND.SHOP_DURATION * 1000, 2, 2);
      expect(event).toEqual({ event: 'roundStart', round: 2 });
      expect(rm.phase).toBe(PHASE.COUNTDOWN);
      expect(rm.currentRound).toBe(2);
    });

    it('should transition ROUND_END → MATCH_END after final round', () => {
      const rm = new RoundManager();
      // Force round to TOTAL_ROUNDS
      rm.currentRound = ROUND.TOTAL_ROUNDS;
      rm.phase = PHASE.ROUND_END;
      rm.phaseTimer = 0;

      const event = advanceMs(rm, 3000, 2, 2);
      expect(event).toEqual({ event: 'matchEnd' });
      expect(rm.phase).toBe(PHASE.MATCH_END);
    });

    it('should return null during MATCH_END (no further transitions)', () => {
      const rm = new RoundManager();
      rm.phase = PHASE.MATCH_END;
      const event = rm.update(50, 2, 2);
      expect(event).toBeNull();
      expect(rm.phase).toBe(PHASE.MATCH_END);
    });

    it('should return null during normal phase updates with no transition', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      // Mid-round, everyone alive
      const event = rm.update(50, 2, 2);
      expect(event).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════
  // Ring shrink
  // ═══════════════════════════════════════════════════════

  describe('ring shrink', () => {
    it('should shrink ring during PLAYING phase', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      const before = rm.ringRadius;
      rm.update(1000, 2, 2); // 1 second
      expect(rm.ringRadius).toBeLessThan(before);
    });

    it('should shrink faster in later rounds', () => {
      // Round 1
      const rm1 = new RoundManager();
      startPlaying(rm1);
      const before1 = rm1.ringRadius;
      rm1.update(1000, 2, 2);
      const shrink1 = before1 - rm1.ringRadius;

      // Round 10
      const rm10 = new RoundManager();
      rm10.currentRound = 10;
      rm10.phase = PHASE.PLAYING;
      rm10.phaseTimer = 0;
      rm10.ringRadius = ARENA.RADIUS;
      const before10 = rm10.ringRadius;
      rm10.update(1000, 2, 2);
      const shrink10 = before10 - rm10.ringRadius;

      expect(shrink10).toBeGreaterThan(shrink1);
    });

    it('should cap shrink rate at 6 px/sec', () => {
      const rm = new RoundManager();
      // Round 20: raw rate = 2.0 + 20 * 0.5 = 12.0, capped to 6
      rm.currentRound = 20;
      rm.phase = PHASE.PLAYING;
      rm.phaseTimer = 0;
      rm.ringRadius = ARENA.RADIUS;
      const before = rm.ringRadius;
      rm.update(1000, 2, 2); // 1 second
      const shrink = before - rm.ringRadius;
      expect(shrink).toBeCloseTo(6, 1);
    });

    it('should not shrink below MIN_RING_RADIUS', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      rm.ringRadius = ARENA.MIN_RING_RADIUS + 1;
      rm.update(2000, 2, 2); // enough to go below
      expect(rm.ringRadius).toBe(ARENA.MIN_RING_RADIUS);
    });

    it('should not shrink ring in sandbox mode', () => {
      const rm = new RoundManager();
      rm.setSandboxMode(true);
      startPlaying(rm, 1, 1);
      const before = rm.ringRadius;
      rm.update(5000, 1, 1); // 5 seconds
      expect(rm.ringRadius).toBe(before);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Scoring
  // ═══════════════════════════════════════════════════════

  describe('scoring', () => {
    it('should award 1 point for survival', () => {
      const rm = new RoundManager();
      rm.initPlayer('p1');
      rm.awardSurvival('p1');
      const scores = rm.getScores();
      expect(scores[0].points).toBe(1);
    });

    it('should award 1 point + 1 elimination for awardElimination', () => {
      const rm = new RoundManager();
      rm.initPlayer('p1');
      rm.awardElimination('p1');
      const scores = rm.getScores();
      expect(scores[0].points).toBe(1);
      expect(scores[0].eliminations).toBe(1);
    });

    it('should award 2 points + 1 roundsWon for awardRoundWin', () => {
      const rm = new RoundManager();
      rm.initPlayer('p1');
      rm.awardRoundWin('p1');
      const scores = rm.getScores();
      expect(scores[0].points).toBe(2);
      expect(scores[0].roundsWon).toBe(1);
    });

    it('should safely ignore unknown playerId', () => {
      const rm = new RoundManager();
      // Should not throw
      rm.awardSurvival('unknown');
      rm.awardElimination('unknown');
      rm.awardRoundWin('unknown');
      expect(rm.getScores()).toHaveLength(0);
    });

    it('should accumulate points across multiple awards', () => {
      const rm = new RoundManager();
      rm.initPlayer('p1');
      rm.awardSurvival('p1');     // +1
      rm.awardElimination('p1');   // +1
      rm.awardRoundWin('p1');      // +2
      const scores = rm.getScores();
      expect(scores[0].points).toBe(4);
      expect(scores[0].eliminations).toBe(1);
      expect(scores[0].roundsWon).toBe(1);
    });

    it('should sort getScores() by points descending', () => {
      const rm = new RoundManager();
      rm.initPlayer('p1');
      rm.initPlayer('p2');
      rm.awardRoundWin('p2'); // p2: 2 points
      rm.awardSurvival('p1'); // p1: 1 point
      const scores = rm.getScores();
      expect(scores[0].id).toBe('p2');
      expect(scores[1].id).toBe('p1');
    });
  });

  // ═══════════════════════════════════════════════════════
  // Time remaining helpers
  // ═══════════════════════════════════════════════════════

  describe('time remaining', () => {
    it('should return correct getRoundTimeRemaining during PLAYING', () => {
      const rm = new RoundManager();
      startPlaying(rm);
      rm.update(5000, 2, 2); // 5 seconds into PLAYING
      const remaining = rm.getRoundTimeRemaining();
      expect(remaining).toBeCloseTo(ROUND.DURATION - 5.05, 0); // 50ms from startPlaying
    });

    it('should return 0 for getRoundTimeRemaining when not PLAYING', () => {
      const rm = new RoundManager();
      expect(rm.getRoundTimeRemaining()).toBe(0);
    });

    it('should return correct getCountdownRemaining during COUNTDOWN', () => {
      const rm = new RoundManager();
      rm.update(50, 2, 2); // → COUNTDOWN
      rm.update(1000, 2, 2); // 1s into countdown
      const remaining = rm.getCountdownRemaining();
      expect(remaining).toBeCloseTo(ROUND.COUNTDOWN - 1.05, 0);
    });

    it('should return correct getShopTimeRemaining during SHOP', () => {
      const rm = new RoundManager();
      rm.phase = PHASE.SHOP;
      rm.phaseTimer = 0;
      rm.update(5000, 2, 2); // 5s into shop
      const remaining = rm.getShopTimeRemaining();
      expect(remaining).toBeCloseTo(ROUND.SHOP_DURATION - 5, 0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getState
  // ═══════════════════════════════════════════════════════

  describe('getState', () => {
    it('should return serializable state object', () => {
      const rm = new RoundManager();
      const state = rm.getState();
      expect(state).toHaveProperty('round', 0);
      expect(state).toHaveProperty('totalRounds', ROUND.TOTAL_ROUNDS);
      expect(state).toHaveProperty('phase', PHASE.WAITING);
      expect(state).toHaveProperty('ringRadius', ARENA.RADIUS);
      expect(state).toHaveProperty('timeRemaining');
      expect(state).toHaveProperty('countdownRemaining');
      expect(state).toHaveProperty('shopTimeRemaining');
    });
  });
});
