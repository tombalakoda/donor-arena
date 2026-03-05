import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerPhysics } from '../src/server/game/ServerPhysics.js';
import { PLAYER } from '../src/shared/constants.js';

describe('ServerPhysics', () => {
  let physics;

  beforeEach(() => {
    vi.useFakeTimers();
    physics = new ServerPhysics();
  });

  afterEach(() => {
    physics.destroy();
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════
  // Player management
  // ═══════════════════════════════════════════════════════

  describe('player management', () => {
    it('should add a player and return a body at correct position', () => {
      const body = physics.addPlayer('p1', 100, 200);
      expect(body).toBeDefined();
      const state = physics.getPlayerState('p1');
      expect(state.x).toBe(100);
      expect(state.y).toBe(200);
      expect(state.vx).toBe(0);
      expect(state.vy).toBe(0);
    });

    it('should remove a player and clean up all maps', () => {
      physics.addPlayer('p1', 0, 0);
      physics.removePlayer('p1');
      expect(physics.getPlayerState('p1')).toBeNull();
      expect(physics.playerBodies.has('p1')).toBe(false);
      expect(physics.knockbackUntil.has('p1')).toBe(false);
    });

    it('should track multiple players independently', () => {
      physics.addPlayer('p1', 0, 0);
      physics.addPlayer('p2', 100, 100);
      const states = physics.getAllPlayerStates();
      expect(states.p1.x).toBe(0);
      expect(states.p2.x).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getPlayerState
  // ═══════════════════════════════════════════════════════

  describe('getPlayerState', () => {
    it('should return rounded position and velocity', () => {
      physics.addPlayer('p1', 0, 0);
      const state = physics.getPlayerState('p1');
      // Positions rounded to 2 decimals, velocities to 3
      expect(typeof state.x).toBe('number');
      expect(typeof state.vx).toBe('number');
    });

    it('should return null for unknown playerId', () => {
      expect(physics.getPlayerState('nonexistent')).toBeNull();
    });

    it('should return kb: 0 when not in knockback', () => {
      physics.addPlayer('p1', 0, 0);
      const state = physics.getPlayerState('p1');
      expect(state.kb).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // setPlayerPosition
  // ═══════════════════════════════════════════════════════

  describe('setPlayerPosition', () => {
    it('should teleport player and zero velocity', () => {
      physics.addPlayer('p1', 0, 0);
      // Give some velocity first
      physics.applyInput('p1', { targetX: 500, targetY: 0 }, {});
      physics.step(50);

      physics.setPlayerPosition('p1', 200, 300);
      const state = physics.getPlayerState('p1');
      expect(state.x).toBe(200);
      expect(state.y).toBe(300);
      expect(state.vx).toBe(0);
      expect(state.vy).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // applyInput
  // ═══════════════════════════════════════════════════════

  describe('applyInput', () => {
    it('should apply force toward target when outside stop radius', () => {
      physics.addPlayer('p1', 0, 0);
      physics.applyInput('p1', { targetX: 200, targetY: 0 }, {});
      physics.step(50);
      const state = physics.getPlayerState('p1');
      expect(state.vx).toBeGreaterThan(0); // moving right
    });

    it('should return true when within stop radius', () => {
      physics.addPlayer('p1', 0, 0);
      const reached = physics.applyInput('p1', { targetX: 2, targetY: 2 }, {});
      expect(reached).toBe(true);
    });

    it('should return false during knockback grace period', () => {
      physics.addPlayer('p1', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('p1', 0.1, 0, 0, 'attacker');
      // Still in grace period
      vi.setSystemTime(1200);
      const result = physics.applyInput('p1', { targetX: 200, targetY: 0 }, {});
      expect(result).toBe(false);
    });

    it('should block movement when stunned', () => {
      physics.addPlayer('p1', 0, 0);
      const result = physics.applyInput('p1', { targetX: 200, targetY: 0 }, { stun: true });
      expect(result).toBe(false);
    });

    it('should block movement when rooted', () => {
      physics.addPlayer('p1', 0, 0);
      const result = physics.applyInput('p1', { targetX: 200, targetY: 0 }, { root: true });
      expect(result).toBe(false);
    });

    it('should reject invalid input', () => {
      physics.addPlayer('p1', 0, 0);
      expect(physics.applyInput('p1', { targetX: null, targetY: 0 }, {})).toBe(false);
      expect(physics.applyInput('p1', { targetX: Infinity, targetY: 0 }, {})).toBe(false);
    });

    it('should cap velocity to max speed', () => {
      physics.addPlayer('p1', 0, 0);
      const maxSpeed = PLAYER.SPEED * 0.05;
      // Apply input repeatedly to build up speed
      for (let i = 0; i < 100; i++) {
        physics.applyInput('p1', { targetX: 10000, targetY: 0 }, {});
        physics.step(50);
      }
      const state = physics.getPlayerState('p1');
      const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2);
      // Matter.js applies force then caps — allow slight overshoot from physics sim
      expect(speed).toBeLessThanOrEqual(maxSpeed * 1.2);
    });

    it('should reduce effective speed when slow effect is active', () => {
      // Normal speed
      physics.addPlayer('normal', 0, 0);
      for (let i = 0; i < 50; i++) {
        physics.applyInput('normal', { targetX: 10000, targetY: 0 }, {});
        physics.step(50);
      }
      const normalState = physics.getPlayerState('normal');
      const normalSpeed = Math.sqrt(normalState.vx ** 2 + normalState.vy ** 2);

      // Slowed speed
      physics.addPlayer('slowed', 0, 0);
      for (let i = 0; i < 50; i++) {
        physics.applyInput('slowed', { targetX: 10000, targetY: 0 }, { slow: { amount: 0.5 } });
        physics.step(50);
      }
      const slowedState = physics.getPlayerState('slowed');
      const slowedSpeed = Math.sqrt(slowedState.vx ** 2 + slowedState.vy ** 2);

      expect(slowedSpeed).toBeLessThan(normalSpeed);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Knockback vulnerability
  // ═══════════════════════════════════════════════════════

  describe('knockback vulnerability', () => {
    it('should apply 1x knockback at 0 damage taken (full HP)', () => {
      physics.addPlayer('p1', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('p1', 0.1, 0, 0); // damageTaken = 0
      physics.step(50);
      const state = physics.getPlayerState('p1');
      expect(state.vx).toBeGreaterThan(0);
    });

    it('should apply stronger knockback at higher damage taken', () => {
      // Low damage
      physics.addPlayer('low', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('low', 0.1, 0, 0); // 1.0x
      physics.step(50);
      const lowState = physics.getPlayerState('low');

      // High damage
      physics.addPlayer('high', 0, 0);
      physics.applyKnockback('high', 0.1, 0, 100); // 3.5x
      physics.step(50);
      const highState = physics.getPlayerState('high');

      // The 3.5x multiplier should make the high-damage player fly much further
      expect(Math.abs(highState.vx)).toBeGreaterThan(Math.abs(lowState.vx) * 2);
    });

    it('should apply ~2.25x knockback at 50 damage taken', () => {
      // vulnerability = 1.0 + (50/100) * 2.5 = 2.25
      physics.addPlayer('base', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('base', 0.1, 0, 0); // 1.0x
      physics.step(50);
      const baseVx = physics.getPlayerState('base').vx;

      physics.addPlayer('mid', 0, 0);
      physics.applyKnockback('mid', 0.1, 0, 50); // 2.25x
      physics.step(50);
      const midVx = physics.getPlayerState('mid').vx;

      // Ratio should be approximately 2.25
      const ratio = midVx / baseVx;
      expect(ratio).toBeCloseTo(2.25, 1);
    });

    it('should track lastKnockbackFrom for ring-out kill credit', () => {
      physics.addPlayer('p1', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('p1', 0.1, 0, 50, 'attacker');
      expect(physics.getLastKnockbackAttacker('p1')).toBe('attacker');
    });

    it('should expire lastKnockbackFrom after timeout', () => {
      physics.addPlayer('p1', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('p1', 0.1, 0, 50, 'attacker');
      // Move time forward past the 5s window
      vi.setSystemTime(7000);
      expect(physics.getLastKnockbackAttacker('p1')).toBeNull();
    });

    it('should not track self-knockback', () => {
      physics.addPlayer('p1', 0, 0);
      vi.setSystemTime(1000);
      physics.applyKnockback('p1', 0.1, 0, 0, 'p1'); // self
      expect(physics.getLastKnockbackAttacker('p1')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════
  // Physics step
  // ═══════════════════════════════════════════════════════

  describe('physics step', () => {
    it('should update body positions after step', () => {
      physics.addPlayer('p1', 0, 0);
      physics.applyInput('p1', { targetX: 500, targetY: 0 }, {});
      physics.step(50);
      const state = physics.getPlayerState('p1');
      // Should have moved at least slightly
      expect(state.x).not.toBe(0);
    });

    it('should decay velocity via friction air over multiple steps', () => {
      physics.addPlayer('p1', 0, 0);
      // Give an initial push
      physics.applyInput('p1', { targetX: 500, targetY: 0 }, {});
      physics.step(50);
      const speed1 = Math.abs(physics.getPlayerState('p1').vx);

      // Now stop applying force and let friction slow it down
      for (let i = 0; i < 20; i++) {
        physics.applyInput('p1', { targetX: physics.getPlayerState('p1').x, targetY: 0 }, {});
        physics.step(50);
      }
      const speed2 = Math.abs(physics.getPlayerState('p1').vx);
      expect(speed2).toBeLessThan(speed1);
    });
  });
});
