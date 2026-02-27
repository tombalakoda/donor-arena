import { SP } from '../../shared/constants.js';
import { SKILL_TREE, SPELL_SLOTS, computeSpellStats, getUpgradeCost, getMaxTier } from '../../shared/skillTreeData.js';

/**
 * Server-side progression tracker for a single player.
 * Manages SP balance, slot unlocks, branch choices, and tier upgrades.
 */
export class PlayerProgression {
  constructor(playerId) {
    this.playerId = playerId;
    this.sp = 0;
    this.totalSpEarned = 0;

    // Slot state: 'unlocked' or 'locked'
    this.slots = {
      Q: 'unlocked', // everyone starts with Q
      W: 'locked',
      E: 'locked',
      R: 'locked',
    };

    // Per-spell progression: branch choice and tier level
    this.spells = {
      fireball:  { branch: null, tier: 0 },
      blink:     { branch: null, tier: 0 },
      frostBolt: { branch: null, tier: 0 },
      hook:      { branch: null, tier: 0 },
    };

    // Damage tracking for SP calculation (reset each round)
    this.roundDamageDealt = 0;
  }

  // --- SP Management ---

  awardSP(amount) {
    this.sp += amount;
    this.totalSpEarned += amount;
  }

  /**
   * Award SP based on round performance.
   * @param {Object} stats - { damageDealt, ringOutKills, damageKills, survived, wonRound }
   */
  awardRoundSP(stats) {
    let earned = SP.BASE_PER_ROUND;

    // Damage SP: 1 SP per 25 damage dealt
    if (stats.damageDealt > 0) {
      earned += Math.floor(stats.damageDealt / 25) * SP.PER_DAMAGE_25;
    }

    // Kill SP
    earned += (stats.ringOutKills || 0) * SP.RING_OUT_KILL;
    earned += (stats.damageKills || 0) * SP.DAMAGE_KILL;

    // Survival & win
    if (stats.survived) earned += SP.SURVIVAL;
    if (stats.wonRound) earned += SP.ROUND_WIN;

    this.awardSP(earned);
    return earned;
  }

  resetRoundStats() {
    this.roundDamageDealt = 0;
  }

  // --- Slot Unlocks ---

  canUnlockSlot(slot) {
    if (this.slots[slot] !== 'locked') return false;
    return this.sp >= SP.SLOT_UNLOCK_COST;
  }

  unlockSlot(slot) {
    if (!this.canUnlockSlot(slot)) return false;
    this.sp -= SP.SLOT_UNLOCK_COST;
    this.slots[slot] = 'unlocked';
    return true;
  }

  // --- Branch Choice ---

  canChooseBranch(spellId, branch) {
    const spell = this.spells[spellId];
    if (!spell) return false;
    if (spell.branch !== null) return false; // already chosen

    // Slot must be unlocked
    const tree = SKILL_TREE[spellId];
    if (!tree) return false;
    if (this.slots[tree.slot] !== 'unlocked') return false;

    // Must have valid branch
    if (branch !== 'A' && branch !== 'B') return false;

    return this.sp >= SP.BRANCH_CHOICE_COST;
  }

  chooseBranch(spellId, branch) {
    if (!this.canChooseBranch(spellId, branch)) return false;
    this.sp -= SP.BRANCH_CHOICE_COST;
    this.spells[spellId].branch = branch;
    // Branch choice unlocks tier 1 automatically (first tier is the branch identity)
    this.spells[spellId].tier = 1;
    return true;
  }

  // --- Tier Upgrades ---

  canUpgradeTier(spellId) {
    const spell = this.spells[spellId];
    if (!spell || !spell.branch) return false;

    // Check slot is unlocked
    const tree = SKILL_TREE[spellId];
    if (!tree) return false;
    if (this.slots[tree.slot] !== 'unlocked') return false;

    // Check not at max tier
    const maxTier = getMaxTier(spellId, spell.branch);
    if (spell.tier >= maxTier) return false;

    // Check cost
    const cost = getUpgradeCost(spellId, spell.branch, spell.tier);
    if (cost === null) return false;

    return this.sp >= cost;
  }

  upgradeTier(spellId) {
    if (!this.canUpgradeTier(spellId)) return false;

    const spell = this.spells[spellId];
    const cost = getUpgradeCost(spellId, spell.branch, spell.tier);

    this.sp -= cost;
    spell.tier++;
    return true;
  }

  // --- Spell Stats ---

  /**
   * Get computed stats for a spell based on this player's progression.
   * Returns null if spell slot is locked.
   */
  getSpellStats(spellId) {
    const tree = SKILL_TREE[spellId];
    if (!tree) return null;
    if (this.slots[tree.slot] !== 'unlocked') return null;

    const spell = this.spells[spellId];
    return computeSpellStats(spellId, spell.branch, spell.tier);
  }

  /**
   * Check if a player can cast a specific spell (slot unlocked).
   */
  canCastSpell(spellId) {
    const tree = SKILL_TREE[spellId];
    if (!tree) return false;
    return this.slots[tree.slot] === 'unlocked';
  }

  // --- Serialization ---

  /**
   * Get state for client.
   */
  getState() {
    return {
      sp: this.sp,
      totalSpEarned: this.totalSpEarned,
      slots: { ...this.slots },
      spells: {
        fireball:  { ...this.spells.fireball },
        blink:     { ...this.spells.blink },
        frostBolt: { ...this.spells.frostBolt },
        hook:      { ...this.spells.hook },
      },
    };
  }
}
