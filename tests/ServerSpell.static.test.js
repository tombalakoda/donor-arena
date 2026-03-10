import { describe, it, expect } from 'vitest';
import { ServerSpell } from '../src/server/game/ServerSpell.js';

// ═══════════════════════════════════════════════════════
// clampSpeed
// ═══════════════════════════════════════════════════════

describe('ServerSpell.clampSpeed', () => {
  it('should return speed unchanged when within [1, 20]', () => {
    expect(ServerSpell.clampSpeed(1)).toBe(1);
    expect(ServerSpell.clampSpeed(10)).toBe(10);
    expect(ServerSpell.clampSpeed(20)).toBe(20);
  });

  it('should clamp to 1 when speed < 1', () => {
    expect(ServerSpell.clampSpeed(0.5)).toBe(1);
    expect(ServerSpell.clampSpeed(-5)).toBe(1);
  });

  it('should clamp to 20 when speed > 20', () => {
    expect(ServerSpell.clampSpeed(25)).toBe(20);
    expect(ServerSpell.clampSpeed(100)).toBe(20);
  });

  it('should default to 5 when speed is falsy (0, null, undefined)', () => {
    expect(ServerSpell.clampSpeed(0)).toBe(5);
    expect(ServerSpell.clampSpeed(null)).toBe(5);
    expect(ServerSpell.clampSpeed(undefined)).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════
// clampCooldown
// ═══════════════════════════════════════════════════════

describe('ServerSpell.clampCooldown', () => {
  it('should return cooldown unchanged when within [100, 30000]', () => {
    expect(ServerSpell.clampCooldown(100)).toBe(100);
    expect(ServerSpell.clampCooldown(5000)).toBe(5000);
    expect(ServerSpell.clampCooldown(30000)).toBe(30000);
  });

  it('should clamp to 100 when cooldown < 100', () => {
    expect(ServerSpell.clampCooldown(50)).toBe(100);
    expect(ServerSpell.clampCooldown(-100)).toBe(100);
  });

  it('should clamp to 30000 when cooldown > 30000', () => {
    expect(ServerSpell.clampCooldown(50000)).toBe(30000);
  });

  it('should default to 3000 when cooldown is falsy', () => {
    expect(ServerSpell.clampCooldown(0)).toBe(3000);
    expect(ServerSpell.clampCooldown(null)).toBe(3000);
    expect(ServerSpell.clampCooldown(undefined)).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════
// serializeForClient
// ═══════════════════════════════════════════════════════

describe('ServerSpell.serializeForClient', () => {
  const mockSpell = {
    id: 42,
    type: 'fireball-focus',
    spellType: 'projectile',
    ownerId: 'player-1',
    x: 123.456,
    y: 789.012,
    vx: 5.5,
    vy: -3.2,
    radius: 7,
    elapsed: 500,
    lifetime: 2200,
    active: true,
    targetX: 200,
    targetY: 300,
  };

  it('should include all expected fields', () => {
    const result = ServerSpell.serializeForClient(mockSpell);
    const expectedKeys = [
      'id', 'type', 'spellType', 'ownerId', 'x', 'y', 'vx', 'vy',
      'radius', 'width', 'height', 'angle', 'elapsed', 'lifetime', 'active',
      'targetX', 'targetY', 'pullSelf', 'hooked', 'hookedPlayerId',
      'released', 'anchorX', 'anchorY', 'swingElapsed', 'swingDuration',
      'pullActive', 'flightActive', 'returning', 'isMeteor', 'impactDelay',
      'impactTriggered', 'buffType', 'wallRadius', 'wallHp', 'maxWallHp',
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  it('should round x/y to 1 decimal when roundPos is true', () => {
    const result = ServerSpell.serializeForClient(mockSpell, true);
    expect(result.x).toBe(123.5);
    expect(result.y).toBe(789.0);
  });

  it('should preserve exact x/y when roundPos is false', () => {
    const result = ServerSpell.serializeForClient(mockSpell, false);
    expect(result.x).toBe(123.456);
    expect(result.y).toBe(789.012);
  });

  it('should default missing optional fields to 0/null/false', () => {
    const result = ServerSpell.serializeForClient(mockSpell);
    expect(result.hookedPlayerId).toBeNull();
    expect(result.released).toBe(false);
    expect(result.anchorX).toBe(0);
    expect(result.anchorY).toBe(0);
    expect(result.isMeteor).toBe(false);
    expect(result.buffType).toBeNull();
    expect(result.wallRadius).toBe(0);
  });
});
