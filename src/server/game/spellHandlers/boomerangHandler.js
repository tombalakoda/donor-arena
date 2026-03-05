import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';

function clampSpeed(speed) {
  return Math.min(20, Math.max(1, speed || 5));
}

export const boomerangHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const clampedSpeed = clampSpeed(stats.speed);

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.BOOMERANG,
      ownerId: playerId,
      x: originX,
      y: originY,
      originX, originY,
      vx: nx * clampedSpeed,
      vy: ny * clampedSpeed,
      radius: stats.radius || 8,
      damage: stats.damage || 2,
      knockbackForce: stats.knockbackForce || 0.03,
      maxKnockbackForce: stats.maxKnockbackForce || 0.09,
      range: stats.range || 400,
      lifetime: stats.lifetime || 3000,
      elapsed: 0,
      active: true,
      returning: false,
      hitIds: [],
      hitsOnReturn: stats.hitsOnReturn || false,
      cooldownOnCatch: stats.cooldownOnCatch || 0,
      speed: clampedSpeed,
      maxDist: 0, // track max distance traveled (for KB scaling)
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    spell.x += spell.vx;
    spell.y += spell.vy;

    const dx = spell.x - spell.originX;
    const dy = spell.y - spell.originY;
    const distFromOrigin = Math.sqrt(dx * dx + dy * dy);
    spell.maxDist = Math.max(spell.maxDist, distFromOrigin);

    // Check if should reverse
    if (!spell.returning && distFromOrigin >= spell.range) {
      spell.returning = true;
      spell.hitIds = []; // Reset hit tracking for return trip if hitsOnReturn
    }

    // Steer back toward caster when returning
    if (spell.returning) {
      const casterBody = ctx.physics.playerBodies.get(spell.ownerId);
      if (casterBody) {
        const cx = casterBody.position.x - spell.x;
        const cy = casterBody.position.y - spell.y;
        const cDist = Math.sqrt(cx * cx + cy * cy) || 1;
        spell.vx = (cx / cDist) * spell.speed;
        spell.vy = (cy / cDist) * spell.speed;

        // Caught by caster
        if (cDist < PLAYER.RADIUS + spell.radius) {
          // Reduce cooldown on catch (T2)
          if (spell.cooldownOnCatch) {
            const cd = ctx.cooldowns.get(spell.ownerId);
            if (cd && cd[spell.type]) {
              cd[spell.type] = Math.max(0, cd[spell.type] + spell.cooldownOnCatch);
            }
          }
          spell.active = false;
          ctx.removeSpell(i);
          return 'continue';
        }
      }
    }

    // Player collision
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (spell.hitIds.includes(playerId)) continue; // Already hit this pass
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;

      // Skip return hits if hitsOnReturn not enabled
      if (spell.returning && !spell.hitsOnReturn) continue;

      const pdx = body.position.x - spell.x;
      const pdy = body.position.y - spell.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pDist < spell.radius + PLAYER.RADIUS) {
        // KB scales with distance traveled
        const distRatio = spell.maxDist / (spell.range || 400);
        const scaledKb = spell.knockbackForce + (spell.maxKnockbackForce - spell.knockbackForce) * Math.min(1, distRatio);

        const nx = pDist > 0 ? pdx / pDist : 0;
        const ny = pDist > 0 ? pdy / pDist : 1;
        const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
        ctx.physics.applyKnockback(playerId,
          nx * scaledKb * kbMult,
          ny * scaledKb * kbMult,
          ctx.getDamageTaken(playerId),
          spell.ownerId,
        );
        ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
        spell.hitIds.push(playerId);
      }
    }
  },
};
