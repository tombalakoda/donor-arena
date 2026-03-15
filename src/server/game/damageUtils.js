import { getPassive } from '../../shared/characterPassives.js';

/**
 * Apply damage to a target with character passive reductions AND item modifiers.
 * Returns the final damage applied.
 *
 * @param {object} target - player object with hp, characterId, maxHp
 * @param {number} damage - raw damage
 * @param {string} spellId - spell type string
 * @param {object|null} attackerItems - attacker's computed item stats (from ItemSystem)
 * @param {object|null} targetItems - target's computed item stats
 */
export function applyDamage(target, damage, spellId, attackerItems = null, targetItems = null) {
  const targetPassive = getPassive(target.characterId);
  let finalDamage = damage;

  // --- Attacker item modifiers ---
  if (attackerItems) {
    // Flat damage multiplier (Organ, Korg, etc.)
    if (attackerItems.damageDealtMult && attackerItems.damageDealtMult !== 1.0) {
      finalDamage *= attackerItems.damageDealtMult;
    }

    // First-hit bonus damage (Theremin: first spell hit each round deals +40% damage)
    if (attackerItems.firstHitBonusDamage > 0 && attackerItems._firstHitCheck) {
      const check = attackerItems._firstHitCheck();
      if (check) {
        finalDamage *= (1 + attackerItems.firstHitBonusDamage);
      }
    }

    // Low HP damage bonus (Berserker Hazine: below threshold, +damage)
    if (attackerItems.lowHpDamageBonus > 0 && attackerItems._attackerHpCheck) {
      const { hp, maxHp } = attackerItems._attackerHpCheck();
      if (hp / maxHp <= (attackerItems.lowHpThreshold || 0.4)) {
        finalDamage *= (1 + attackerItems.lowHpDamageBonus);
      }
    }

    // Slow bonus damage (Piyano: spells that slow also deal +1 bonus damage)
    if (attackerItems.slowBonusDamage > 0 && attackerItems._targetIsSlowed) {
      if (attackerItems._targetIsSlowed()) {
        finalDamage += attackerItems.slowBonusDamage;
      }
    }
  }

  // --- Character passive reductions ---
  if (targetPassive.damageReduction) {
    finalDamage *= (1 - targetPassive.damageReduction);
  }
  if (targetPassive.fireResist && spellId && spellId.startsWith('fireball')) {
    finalDamage *= (1 - targetPassive.fireResist);
  }

  // --- Target item modifiers ---
  if (targetItems) {
    // Flat damage taken multiplier
    if (targetItems.damageTakenMult && targetItems.damageTakenMult !== 1.0) {
      finalDamage *= targetItems.damageTakenMult;
    }

    // General damage reduction from equipped items (Celik Serhad)
    // (damageTakenMult already handles this via multiplicative stat merge)

    // Low HP damage reduction (Ampul: below 30% HP, gain 15% damage reduction)
    if (targetItems.lowHpDamageReduction > 0) {
      const hpPct = target.hp / target.maxHp;
      if (hpPct <= (targetItems.lowHpThreshold || 0.3)) {
        finalDamage *= (1 - targetItems.lowHpDamageReduction);
      }
    }

    // Kale Hazine: scaling damage reduction per round survived
    if (targetItems.roundDamageReduction > 0) {
      finalDamage *= (1 - targetItems.roundDamageReduction);
    }
  }

  // Floor at 1 HP — spell damage can never kill, only ring damage can
  target.hp = Math.max(1, target.hp - finalDamage);
  return finalDamage;
}
