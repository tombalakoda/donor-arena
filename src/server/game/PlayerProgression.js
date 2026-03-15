import { SP } from '../../shared/constants.js';
import { SKILL_TREES, computeSpellStats, getUpgradeCost, getMaxTier } from '../../shared/skillTreeData.js';
import { SLOT_SPELLS, SPELL_TO_SLOT } from '../../shared/spellData.js';

/**
 * Server-side progression tracker for a single player.
 * Manages SP balance, slot unlocks, spell choices, and tier upgrades.
 *
 * NEW state shape:
 *   slots: { Q: 'unlocked', W: 'locked', E: 'locked', R: 'locked' }
 *   spells: {
 *     Q: { chosenSpell: 'fireball-focus', tier: 1 },
 *     W: { chosenSpell: null, tier: 0 },    // slot unlocked but no spell chosen
 *     E: null,                                // slot locked
 *     R: null,                                // slot locked
 *   }
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

    // Per-slot spell progression
    // null = slot locked, { chosenSpell: null, tier: 0 } = unlocked but no spell chosen
    this.spells = {
      Q: { chosenSpell: 'fireball-focus', tier: 0, autoEquipped: true },  // Q auto-equipped with basic fireball
      W: null,
      E: null,
      R: null,
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

  /**
   * Auto-unlock a slot (free, triggered by round milestone).
   * Called by Room when the round matches SLOT_UNLOCK_ROUNDS.
   */
  autoUnlockSlot(slot) {
    if (slot === 'Q') return false;
    if (this.slots[slot] !== 'locked') return false;
    this.slots[slot] = 'unlocked';
    this.spells[slot] = { chosenSpell: null, tier: 0 };
    return true;
  }

  canUnlockSlot(/* slot */) {
    // Slots are now auto-unlocked at round milestones — manual unlock disabled
    return false;
  }

  unlockSlot(/* slot */) {
    // Slots are now auto-unlocked at round milestones — manual unlock disabled
    return false;
  }

  // --- Spell Choice ---

  /**
   * Check if a spell can be chosen for a slot.
   * @param {string} slot - Q/W/E/R
   * @param {string} spellId - e.g. 'fireball-focus', 'blink', etc.
   */
  canChooseSpell(slot, spellId) {
    // Slot must be unlocked
    if (this.slots[slot] !== 'unlocked') return false;
    // Spell state must exist
    const spellState = this.spells[slot];
    if (!spellState) return false;

    // Spell must belong to this slot
    const validSpells = SLOT_SPELLS[slot];
    if (!validSpells || !validSpells.includes(spellId)) return false;

    // Spell must exist in skill trees
    if (!SKILL_TREES[spellId]) return false;

    // If already chosen the same spell, can't re-choose
    if (spellState.chosenSpell === spellId) return false;

    // If switching spells (already have one chosen and not auto-equipped), it's free but resets tier
    if (spellState.chosenSpell !== null && !spellState.autoEquipped) return true;

    // First-time choice (or first active choice after auto-equip) costs SP
    return this.sp >= SP.SPELL_CHOICE_COST;
  }

  /**
   * Choose a spell for a slot. If switching from another spell, tier resets to 0.
   */
  chooseSpell(slot, spellId) {
    if (!this.canChooseSpell(slot, spellId)) return false;

    const spellState = this.spells[slot];

    // Same spell already chosen — no-op (don't reset tier)
    if (spellState.chosenSpell === spellId && !spellState.autoEquipped) {
      return false;
    }

    const isSwitch = spellState.chosenSpell !== null && !spellState.autoEquipped;

    if (!isSwitch) {
      // First-time choice (or first active choice after auto-equip) costs SP
      this.sp -= SP.SPELL_CHOICE_COST;
    }

    // Clear auto-equip flag after first active choice
    if (spellState.autoEquipped) {
      spellState.autoEquipped = false;
    }

    // Set the chosen spell — reset tier only when switching to a different spell
    spellState.chosenSpell = spellId;
    if (isSwitch) {
      spellState.tier = 0;
    }
    return true;
  }

  // --- Tier Upgrades ---

  canUpgradeTier(slot) {
    const spellState = this.spells[slot];
    if (!spellState || !spellState.chosenSpell) return false;

    // Slot must be unlocked
    if (this.slots[slot] !== 'unlocked') return false;

    const spellId = spellState.chosenSpell;

    // Check not at max tier
    const maxTier = getMaxTier(spellId);
    if (spellState.tier >= maxTier) return false;

    // Check cost
    const cost = getUpgradeCost(spellId, spellState.tier);
    if (cost === null) return false;

    return this.sp >= cost;
  }

  upgradeTier(slot) {
    if (!this.canUpgradeTier(slot)) return false;

    const spellState = this.spells[slot];
    const cost = getUpgradeCost(spellState.chosenSpell, spellState.tier);

    this.sp -= cost;
    spellState.tier++;
    return true;
  }

  // --- Spell Stats ---

  /**
   * Get computed stats for the spell chosen in a given slot.
   * Returns null if slot is locked or no spell chosen.
   */
  getSpellStatsForSlot(slot) {
    if (this.slots[slot] !== 'unlocked') return null;
    const spellState = this.spells[slot];
    if (!spellState || !spellState.chosenSpell) return null;

    return computeSpellStats(spellState.chosenSpell, spellState.tier);
  }

  /**
   * Get computed stats for a specific spell ID based on this player's progression.
   * Looks up which slot the spell belongs to and returns stats based on current tier.
   */
  getSpellStats(spellId) {
    const slot = SPELL_TO_SLOT[spellId];
    if (!slot) return null;
    if (this.slots[slot] !== 'unlocked') return null;

    const spellState = this.spells[slot];
    if (!spellState || spellState.chosenSpell !== spellId) return null;

    return computeSpellStats(spellId, spellState.tier);
  }

  /**
   * Check if a player can cast a specific spell.
   * Must have the slot unlocked AND have chosen that specific spell.
   */
  canCastSpell(spellId) {
    const slot = SPELL_TO_SLOT[spellId];
    if (!slot) return false;
    if (this.slots[slot] !== 'unlocked') return false;

    const spellState = this.spells[slot];
    if (!spellState || spellState.chosenSpell !== spellId) return false;

    return true;
  }

  /**
   * Check if a player can cast from a given slot (any spell chosen in that slot).
   * Returns the spellId if castable, null otherwise.
   */
  getSlotSpellId(slot) {
    if (this.slots[slot] !== 'unlocked') return null;
    const spellState = this.spells[slot];
    if (!spellState || !spellState.chosenSpell) return null;
    return spellState.chosenSpell;
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
        Q: this.spells.Q ? { ...this.spells.Q } : null,
        W: this.spells.W ? { ...this.spells.W } : null,
        E: this.spells.E ? { ...this.spells.E } : null,
        R: this.spells.R ? { ...this.spells.R } : null,
      },
    };
  }
}
