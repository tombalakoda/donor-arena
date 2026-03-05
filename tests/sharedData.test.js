import { describe, it, expect } from 'vitest';
import { SKILL_TREES, computeSpellStats, getUpgradeCost, getMaxTier } from '../src/shared/skillTreeData.js';
import { getPassive, CHARACTER_PASSIVES } from '../src/shared/characterPassives.js';
import { SPELLS, SLOT_SPELLS, SPELL_TO_SLOT } from '../src/shared/spellData.js';

// ═══════════════════════════════════════════════════════
// computeSpellStats
// ═══════════════════════════════════════════════════════

describe('computeSpellStats', () => {
  it('should return base stats at tier 0', () => {
    const stats = computeSpellStats('fireball-focus', 0);
    const base = SKILL_TREES['fireball-focus'].base;
    expect(stats).toEqual(base);
  });

  it('should apply additive numeric mods at tier 1', () => {
    const stats = computeSpellStats('fireball-focus', 1);
    const base = SKILL_TREES['fireball-focus'].base;
    // Tier 0 mods: range: +60, speed: +1
    expect(stats.range).toBe(base.range + 60);
    expect(stats.speed).toBe(base.speed + 1);
    // Unmodified stats stay the same
    expect(stats.damage).toBe(base.damage);
  });

  it('should apply boolean mods as overrides', () => {
    // fireball-focus tier 3 (index 2) adds piercing: true
    const stats = computeSpellStats('fireball-focus', 3);
    expect(stats.piercing).toBe(true);
  });

  it('should apply all tiers cumulatively', () => {
    // fireball-focus at tier 4 (all tiers applied)
    const stats = computeSpellStats('fireball-focus', 4);
    const base = SKILL_TREES['fireball-focus'].base;
    // range: +60 (T1) + 80 (T4) = +140
    expect(stats.range).toBe(base.range + 60 + 80);
    // speed: +1 (T1) + 1 (T4) = +2
    expect(stats.speed).toBe(base.speed + 1 + 1);
    // knockbackForce: +0.02 (T2) + 0.02 (T4) = +0.04
    expect(stats.knockbackForce).toBeCloseTo(base.knockbackForce + 0.02 + 0.02, 4);
    expect(stats.piercing).toBe(true);
  });

  it('should not mutate the SKILL_TREES base object', () => {
    const baseBefore = SKILL_TREES['fireball-focus'].base.range;
    computeSpellStats('fireball-focus', 4);
    expect(SKILL_TREES['fireball-focus'].base.range).toBe(baseBefore);
  });

  it('should return null for unknown spellId', () => {
    expect(computeSpellStats('nonexistent-spell', 0)).toBeNull();
  });

  it('should clamp to available tiers if tierLevel exceeds max', () => {
    // fireball-focus has 4 tiers — requesting tier 10 should apply all 4
    const stats10 = computeSpellStats('fireball-focus', 10);
    const stats4 = computeSpellStats('fireball-focus', 4);
    expect(stats10).toEqual(stats4);
  });

  it('should create new stat fields from mods that do not exist in base', () => {
    // fireball-power tier 2 (index 1) adds explosionRadius: 40 (not in base)
    const stats = computeSpellStats('fireball-power', 2);
    expect(stats.explosionRadius).toBe(40); // 0 + 40
  });
});

// ═══════════════════════════════════════════════════════
// getUpgradeCost / getMaxTier
// ═══════════════════════════════════════════════════════

describe('getUpgradeCost', () => {
  it('should return correct cost for each tier level', () => {
    expect(getUpgradeCost('fireball-focus', 0)).toBe(3); // T1 cost
    expect(getUpgradeCost('fireball-focus', 1)).toBe(3); // T2 cost
    expect(getUpgradeCost('fireball-focus', 2)).toBe(4); // T3 cost
    expect(getUpgradeCost('fireball-focus', 3)).toBe(5); // T4 cost
  });

  it('should return null at max tier', () => {
    expect(getUpgradeCost('fireball-focus', 4)).toBeNull();
  });

  it('should return null for unknown spellId', () => {
    expect(getUpgradeCost('nonexistent', 0)).toBeNull();
  });
});

describe('getMaxTier', () => {
  it('should return 4 for Q spells', () => {
    for (const spellId of SLOT_SPELLS.Q) {
      expect(getMaxTier(spellId)).toBe(4);
    }
  });

  it('should return 2 for W/E/R spells', () => {
    for (const slot of ['W', 'E', 'R']) {
      for (const spellId of SLOT_SPELLS[slot]) {
        expect(getMaxTier(spellId)).toBe(2);
      }
    }
  });

  it('should return 0 for unknown spellId', () => {
    expect(getMaxTier('nonexistent')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// characterPassives
// ═══════════════════════════════════════════════════════

describe('getPassive', () => {
  it('should return passive data for each known character', () => {
    for (const charId of Object.keys(CHARACTER_PASSIVES)) {
      const passive = getPassive(charId);
      expect(passive).toHaveProperty('id');
      expect(passive).toHaveProperty('name');
      expect(passive).toHaveProperty('description');
    }
  });

  it('should return empty object for unknown character', () => {
    expect(getPassive('nonexistent')).toEqual({});
  });

  it('should include expected passive fields for specific characters', () => {
    expect(getPassive('knight')).toHaveProperty('damageReduction', 0.20);
    expect(getPassive('boy')).toHaveProperty('cdReduction', 0.15);
    expect(getPassive('demon-red')).toHaveProperty('bonusHp', 20);
    expect(getPassive('eskimo')).toHaveProperty('frostResist', 0.40);
    expect(getPassive('mask-racoon')).toHaveProperty('knockbackBonus', 0.15);
  });
});

// ═══════════════════════════════════════════════════════
// Cross-module data integrity
// ═══════════════════════════════════════════════════════

describe('data integrity', () => {
  it('should have a SPELLS entry for every spell in SLOT_SPELLS', () => {
    for (const [slot, spells] of Object.entries(SLOT_SPELLS)) {
      for (const spellId of spells) {
        expect(SPELLS[spellId], `Missing SPELLS entry: ${spellId}`).toBeDefined();
      }
    }
  });

  it('should have a SKILL_TREES entry for every spell in SLOT_SPELLS', () => {
    for (const [slot, spells] of Object.entries(SLOT_SPELLS)) {
      for (const spellId of spells) {
        expect(SKILL_TREES[spellId], `Missing SKILL_TREES entry: ${spellId}`).toBeDefined();
      }
    }
  });

  it('should have correct SPELL_TO_SLOT reverse mapping', () => {
    for (const [slot, spells] of Object.entries(SLOT_SPELLS)) {
      for (const spellId of spells) {
        expect(SPELL_TO_SLOT[spellId]).toBe(slot);
      }
    }
  });
});
