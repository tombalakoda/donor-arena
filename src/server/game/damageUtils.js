import { getPassive } from '../../shared/characterPassives.js';

/**
 * Apply damage to a target with character passive reductions.
 * Returns the final damage applied.
 */
export function applyDamage(target, damage, spellId) {
  const targetPassive = getPassive(target.characterId);
  let finalDamage = damage;

  if (targetPassive.damageReduction) {
    finalDamage *= (1 - targetPassive.damageReduction);
  }
  if (targetPassive.fireResist && spellId && spellId.startsWith('fireball')) {
    finalDamage *= (1 - targetPassive.fireResist);
  }

  // Floor at 1 HP — spell damage can never kill, only ring damage can
  target.hp = Math.max(1, target.hp - finalDamage);
  return finalDamage;
}
