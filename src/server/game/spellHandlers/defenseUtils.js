/**
 * Shared defense check utilities for spell handlers.
 *
 * Centralises the intangible and shield absorption logic that was previously
 * duplicated across 8+ spell handlers. Every damage-dealing spell should
 * call these before applying damage/knockback.
 */

/**
 * Check if a target is intangible (Ghost buff — spells pass through).
 * @param {Object} ctx - spell handler context
 * @param {string} playerId - target player ID
 * @returns {boolean} true if intangible (caller should skip this target)
 */
export function isIntangible(ctx, playerId) {
  const effects = ctx.statusEffects.get(playerId);
  return !!(effects && effects.intangible);
}

/**
 * Try to absorb a hit with the target's shield.
 * Decrements shield hits and stores hit data for reflect-on-break.
 *
 * @param {Object} ctx - spell handler context
 * @param {string} targetId - target player ID
 * @param {string} attackerId - who fired the spell
 * @param {number} damage - damage that would have been dealt
 * @param {number} knockbackForce - KB force that would have been applied
 * @returns {boolean} true if shield absorbed the hit (caller should skip damage)
 */
export function tryShieldAbsorb(ctx, targetId, attackerId, damage, knockbackForce) {
  const effects = ctx.statusEffects.get(targetId);
  if (!effects || !effects.shield || effects.shield.hitsRemaining <= 0) return false;

  effects.shield.hitsRemaining--;
  effects.shield.lastHitData = { attackerId, damage, knockbackForce };
  return true;
}
