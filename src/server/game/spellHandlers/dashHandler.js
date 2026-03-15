import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { getPassive } from '../../../shared/characterPassives.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';

const { Body } = Matter;

export const dashHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const dashPassive = getPassive(ctx.getCharacterId(playerId));
    const maxRange = (stats.range || 140) * (1 + (dashPassive.mobilityRangeBonus || 0));
    let dashDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;

    // Check obstacle collision along dash path
    if (ctx.obstacleManager) {
      for (const obs of ctx.obstacleManager.getObstacles()) {
        const opx = obs.x - originX;
        const opy = obs.y - originY;
        const t = Math.max(0, (opx * nx + opy * ny));
        if (t > dashDist) continue;
        const closestX = originX + nx * t;
        const closestY = originY + ny * t;
        const cdx = obs.x - closestX;
        const cdy = obs.y - closestY;
        const closestDist = Math.sqrt(cdx * cdx + cdy * cdy);
        const clearance = obs.radius + PLAYER.RADIUS + 2;
        if (closestDist < clearance) {
          const stopT = Math.max(0, t - clearance);
          if (stopT < dashDist) {
            dashDist = stopT;
          }
        }
      }
    }

    const destX = originX + nx * dashDist;
    const destY = originY + ny * dashDist;

    // Check for enemy collisions along the dash path
    const hits = [];
    const dashWidth = stats.dashWidth || 30;
    for (const [id, body] of ctx.physics.playerBodies) {
      if (id === playerId) continue;
      if (ctx.isEliminated(id)) continue;
      if (isIntangible(ctx, id)) continue;

      const px = body.position.x - originX;
      const py = body.position.y - originY;
      const t = Math.max(0, Math.min(1, (px * nx + py * ny) / dashDist));
      const closestX = originX + nx * dashDist * t;
      const closestY = originY + ny * dashDist * t;
      const ddx = body.position.x - closestX;
      const ddy = body.position.y - closestY;
      const distToPath = Math.sqrt(ddx * ddx + ddy * ddy);

      if (distToPath < dashWidth + PLAYER.RADIUS) {
        if (tryShieldAbsorb(ctx, id, playerId, stats.dashDamage || 3, stats.dashKnockback || 0.02)) {
          continue;
        }
        const knockback = (stats.dashKnockback || 0.02) * ctx.getKnockbackMultiplier(playerId);
        const hitNx = ddx / (distToPath || 1);
        const hitNy = ddy / (distToPath || 1);
        ctx.physics.applyKnockback(id,
          (hitNx * 0.6 + nx * 0.4) * knockback,
          (hitNy * 0.6 + ny * 0.4) * knockback,
          ctx.getDamageTaken(id),
          playerId,
        );
        hits.push({ id, damage: stats.dashDamage || 3 });
      }
    }

    const body = ctx.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
      Body.setVelocity(body, { x: nx * 3, y: ny * 3 });
    }

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.DASH,
      ownerId: playerId,
      x: originX,
      y: originY,
      targetX: destX,
      targetY: destY,
      lifetime: 400,
      elapsed: 0,
      active: true,
      hits,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  // No update needed — dash resolves instantly, spell exists only for client visual
};
