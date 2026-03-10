import { describe, it, expect } from 'vitest';
import { PlayerProgression } from '../src/server/game/PlayerProgression.js';
import { SP } from '../src/shared/constants.js';
import { SLOT_SPELLS } from '../src/shared/spellData.js';
import { getMaxTier, getUpgradeCost } from '../src/shared/skillTreeData.js';

describe('PlayerProgression', () => {
  // ═══════════════════════════════════════════════════════
  // Initial state
  // ═══════════════════════════════════════════════════════

  describe('initial state', () => {
    it('should start with 0 SP and Q slot unlocked', () => {
      const prog = new PlayerProgression('p1');
      expect(prog.sp).toBe(0);
      expect(prog.totalSpEarned).toBe(0);
      expect(prog.slots.Q).toBe('unlocked');
    });

    it('should have W/E/R slots locked', () => {
      const prog = new PlayerProgression('p1');
      expect(prog.slots.W).toBe('locked');
      expect(prog.slots.E).toBe('locked');
      expect(prog.slots.R).toBe('locked');
    });

    it('should have Q auto-equipped with fireball-focus at tier 0', () => {
      const prog = new PlayerProgression('p1');
      expect(prog.spells.Q).toEqual({ chosenSpell: 'fireball-focus', tier: 0, autoEquipped: true });
    });

    it('should have null spell state for locked slots', () => {
      const prog = new PlayerProgression('p1');
      expect(prog.spells.W).toBeNull();
      expect(prog.spells.E).toBeNull();
      expect(prog.spells.R).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════
  // SP Management
  // ═══════════════════════════════════════════════════════

  describe('SP management', () => {
    it('should add SP via awardSP and track totalSpEarned', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(10);
      expect(prog.sp).toBe(10);
      expect(prog.totalSpEarned).toBe(10);
      prog.awardSP(5);
      expect(prog.sp).toBe(15);
      expect(prog.totalSpEarned).toBe(15);
    });

    it('should award BASE_PER_ROUND even with zero stats', () => {
      const prog = new PlayerProgression('p1');
      const earned = prog.awardRoundSP({ damageDealt: 0, ringOutKills: 0, damageKills: 0, survived: false, wonRound: false });
      expect(earned).toBe(SP.BASE_PER_ROUND);
      expect(prog.sp).toBe(SP.BASE_PER_ROUND);
    });

    it('should award 1 SP per 25 damage dealt (floored)', () => {
      const prog = new PlayerProgression('p1');
      // 24 damage = floor(24/25) * 1 = 0 bonus
      const earned24 = prog.awardRoundSP({ damageDealt: 24 });
      expect(earned24).toBe(SP.BASE_PER_ROUND);

      const prog2 = new PlayerProgression('p2');
      // 25 damage = floor(25/25) * 1 = 1 bonus
      const earned25 = prog2.awardRoundSP({ damageDealt: 25 });
      expect(earned25).toBe(SP.BASE_PER_ROUND + 1);

      const prog3 = new PlayerProgression('p3');
      // 74 damage = floor(74/25) * 1 = 2 bonus
      const earned74 = prog3.awardRoundSP({ damageDealt: 74 });
      expect(earned74).toBe(SP.BASE_PER_ROUND + 2);
    });

    it('should correctly combine all round SP categories', () => {
      const prog = new PlayerProgression('p1');
      const earned = prog.awardRoundSP({
        damageDealt: 50,      // floor(50/25) * 1 = 2
        ringOutKills: 2,      // 2 * 7 = 14
        damageKills: 1,       // 1 * 1 = 1
        survived: true,       // 2
        wonRound: true,        // 4
      });
      const expected = SP.BASE_PER_ROUND + 2 + 14 + 1 + SP.SURVIVAL + SP.ROUND_WIN;
      expect(earned).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Slot Unlocks
  // ═══════════════════════════════════════════════════════

  describe('slot unlocks', () => {
    it('should allow unlocking W when SP >= SLOT_UNLOCK_COST', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SLOT_UNLOCK_COST);
      expect(prog.canUnlockSlot('W')).toBe(true);
      expect(prog.unlockSlot('W')).toBe(true);
      expect(prog.slots.W).toBe('unlocked');
      expect(prog.sp).toBe(0);
    });

    it('should reject unlocking Q (always unlocked)', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(100);
      expect(prog.canUnlockSlot('Q')).toBe(false);
    });

    it('should reject unlocking when SP is insufficient', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SLOT_UNLOCK_COST - 1);
      expect(prog.canUnlockSlot('W')).toBe(false);
      expect(prog.unlockSlot('W')).toBe(false);
    });

    it('should reject unlocking an already-unlocked slot', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(20);
      prog.unlockSlot('W');
      expect(prog.canUnlockSlot('W')).toBe(false);
    });

    it('should initialize spell state on unlock', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SLOT_UNLOCK_COST);
      prog.unlockSlot('W');
      expect(prog.spells.W).toEqual({ chosenSpell: null, tier: 0 });
    });
  });

  // ═══════════════════════════════════════════════════════
  // Spell Choice
  // ═══════════════════════════════════════════════════════

  describe('spell choice', () => {
    it('should charge SPELL_CHOICE_COST on first active Q choice (auto-equipped)', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SPELL_CHOICE_COST);
      // Q starts auto-equipped — first active choice costs SP
      expect(prog.canChooseSpell('Q', 'fireball-speed')).toBe(true);
      expect(prog.chooseSpell('Q', 'fireball-speed')).toBe(true);
      expect(prog.spells.Q.chosenSpell).toBe('fireball-speed');
      expect(prog.sp).toBe(0); // 3 SP deducted
      expect(prog.spells.Q.autoEquipped).toBe(false);
    });

    it('should reject Q spell change with 0 SP when auto-equipped', () => {
      const prog = new PlayerProgression('p1');
      // 0 SP, cannot afford first active choice
      expect(prog.canChooseSpell('Q', 'fireball-speed')).toBe(false);
    });

    it('should allow free Q switch after first active choice', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SPELL_CHOICE_COST);
      prog.chooseSpell('Q', 'fireball-speed'); // costs 3 SP, clears autoEquipped
      expect(prog.sp).toBe(0);
      // Now switch again — this should be free
      expect(prog.canChooseSpell('Q', 'fireball-power')).toBe(true);
      expect(prog.chooseSpell('Q', 'fireball-power')).toBe(true);
      expect(prog.sp).toBe(0); // still 0, free switch
    });

    it('should deduct SPELL_CHOICE_COST on first choice for W slot', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SLOT_UNLOCK_COST + 10);
      prog.unlockSlot('W');
      const spBefore = prog.sp;
      prog.chooseSpell('W', 'blink');
      expect(prog.sp).toBe(spBefore - SP.SPELL_CHOICE_COST);
    });

    it('should allow free switch to different spell in W slot', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SLOT_UNLOCK_COST + 10);
      prog.unlockSlot('W');
      prog.chooseSpell('W', 'blink'); // costs SP
      const spAfterFirst = prog.sp;
      prog.chooseSpell('W', 'dash'); // free switch
      expect(prog.sp).toBe(spAfterFirst); // no SP deducted
    });

    it('should reset tier to 0 on spell switch', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(50);
      // Q already has fireball-focus, upgrade it
      prog.upgradeTier('Q'); // tier 1
      prog.upgradeTier('Q'); // tier 2
      expect(prog.spells.Q.tier).toBe(2);

      prog.chooseSpell('Q', 'fireball-speed'); // first active choice (costs 3 SP), resets tier
      expect(prog.spells.Q.tier).toBe(0);
      expect(prog.spells.Q.chosenSpell).toBe('fireball-speed');
    });

    it('should reject spell for wrong slot', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(10);
      // 'blink' is a W spell, not Q
      expect(prog.canChooseSpell('Q', 'blink')).toBe(false);
    });

    it('should reject choosing same spell already chosen', () => {
      const prog = new PlayerProgression('p1');
      // Q already has fireball-focus
      expect(prog.canChooseSpell('Q', 'fireball-focus')).toBe(false);
    });

    it('should reject choosing in a locked slot', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(10);
      // W is locked
      expect(prog.canChooseSpell('W', 'blink')).toBe(false);
    });

    it('should reject choosing when insufficient SP for first choice in W', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(SP.SLOT_UNLOCK_COST + SP.SPELL_CHOICE_COST - 1);
      prog.unlockSlot('W');
      // Not enough SP remaining for first choice
      expect(prog.canChooseSpell('W', 'blink')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Tier Upgrades
  // ═══════════════════════════════════════════════════════

  describe('tier upgrades', () => {
    it('should allow upgrade when SP >= tier cost', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(50);
      // Q already has fireball-focus
      expect(prog.canUpgradeTier('Q')).toBe(true);
      expect(prog.upgradeTier('Q')).toBe(true);
      expect(prog.spells.Q.tier).toBe(1);
    });

    it('should deduct correct tier cost', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(50);
      // Q already has fireball-focus
      const spBefore = prog.sp;
      const cost = getUpgradeCost('fireball-focus', 0);
      prog.upgradeTier('Q');
      expect(prog.sp).toBe(spBefore - cost);
    });

    it('should reject upgrade at max tier', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(200);
      // Q already has fireball-focus — upgrade all 4 tiers
      for (let i = 0; i < 4; i++) {
        prog.upgradeTier('Q');
      }
      expect(prog.spells.Q.tier).toBe(4);
      expect(prog.canUpgradeTier('Q')).toBe(false);
      expect(prog.upgradeTier('Q')).toBe(false);
    });

    it('should reject upgrade when no spell is chosen in W slot', () => {
      const prog = new PlayerProgression('p1');
      prog.awardSP(50);
      prog.unlockSlot('W');
      // W is unlocked but no spell chosen
      expect(prog.canUpgradeTier('W')).toBe(false);
    });

    it('should reject upgrade when SP is insufficient', () => {
      const prog = new PlayerProgression('p1');
      const firstTierCost = getUpgradeCost('fireball-focus', 0);
      prog.awardSP(firstTierCost - 1); // not enough for upgrade
      // Q already has fireball-focus
      expect(prog.canUpgradeTier('Q')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Spell Stats & Casting
  // ═══════════════════════════════════════════════════════

  describe('spell stats and casting', () => {
    it('should return computed stats for auto-equipped Q spell', () => {
      const prog = new PlayerProgression('p1');
      // Q already has fireball-focus at tier 0
      const stats = prog.getSpellStats('fireball-focus');
      expect(stats).not.toBeNull();
      expect(stats.type).toBe('projectile');
      expect(stats.damage).toBe(3); // unified base damage
    });

    it('should return null stats for locked slot via getSpellStatsForSlot', () => {
      const prog = new PlayerProgression('p1');
      expect(prog.getSpellStatsForSlot('W')).toBeNull();
    });

    it('should return null for unchosen spell via getSpellStats', () => {
      const prog = new PlayerProgression('p1');
      // fireball-speed is NOT the chosen Q spell (fireball-focus is)
      expect(prog.getSpellStats('fireball-speed')).toBeNull();
    });

    it('should report canCastSpell correctly', () => {
      const prog = new PlayerProgression('p1');
      // Q auto-equipped with fireball-focus
      expect(prog.canCastSpell('fireball-focus')).toBe(true);
      expect(prog.canCastSpell('fireball-speed')).toBe(false);
      expect(prog.canCastSpell('blink')).toBe(false); // W not unlocked
    });

    it('should return chosen spell via getSlotSpellId', () => {
      const prog = new PlayerProgression('p1');
      // Q auto-equipped
      expect(prog.getSlotSpellId('Q')).toBe('fireball-focus');
      expect(prog.getSlotSpellId('W')).toBeNull(); // locked
    });
  });

  // ═══════════════════════════════════════════════════════
  // getState serialization
  // ═══════════════════════════════════════════════════════

  describe('getState', () => {
    it('should return serializable state object', () => {
      const prog = new PlayerProgression('p1');
      const state = prog.getState();
      expect(state).toHaveProperty('sp');
      expect(state).toHaveProperty('totalSpEarned');
      expect(state).toHaveProperty('slots');
      expect(state).toHaveProperty('spells');
      expect(state.spells.Q).toEqual({ chosenSpell: 'fireball-focus', tier: 0, autoEquipped: true });
    });
  });

  // ═══════════════════════════════════════════════════════
  // Full flow integration
  // ═══════════════════════════════════════════════════════

  describe('full progression flow', () => {
    it('should support complete flow: earn → unlock → choose → upgrade → verify', () => {
      const prog = new PlayerProgression('p1');

      // Earn SP from a good round
      prog.awardRoundSP({
        damageDealt: 75,       // +3
        ringOutKills: 1,       // +7
        damageKills: 0,
        survived: true,        // +2
        wonRound: true,         // +4
      });
      // Expected: 2 (base) + 3 + 7 + 2 + 4 = 18
      expect(prog.sp).toBe(18);

      // Switch Q spell to fireball-power (first active choice, costs 3 SP)
      prog.chooseSpell('Q', 'fireball-power');
      expect(prog.sp).toBe(15); // 18 - 3 = 15

      // Upgrade Q tier 1 (costs 3)
      prog.upgradeTier('Q');
      expect(prog.sp).toBe(12);
      expect(prog.spells.Q.tier).toBe(1);

      // Unlock W slot (costs 5)
      prog.unlockSlot('W');
      expect(prog.sp).toBe(7);

      // Choose W spell (costs 3)
      prog.chooseSpell('W', 'blink');
      expect(prog.sp).toBe(4);

      // Upgrade W tier 1 (costs 3)
      prog.upgradeTier('W');
      expect(prog.sp).toBe(1);

      // Verify stats reflect upgrades
      const qStats = prog.getSpellStatsForSlot('Q');
      expect(qStats.damage).toBe(4); // unified base 3 + T1 mod 1
      const wStats = prog.getSpellStatsForSlot('W');
      expect(wStats.range).toBe(280); // blink base 220 + T1 mod 60
    });
  });
});
