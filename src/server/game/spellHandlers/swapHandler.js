import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';

const { Body } = Matter;

export const swapHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const clampedSpeed = ctx.clampSpeed(stats.speed);
    const vx = nx * clampedSpeed;
    const vy = ny * clampedSpeed;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.SWAP,
      ownerId: playerId,
      x: originX,
      y: originY,
      originX, originY,
      vx, vy,
      radius: stats.radius || 7,
      lifetime: stats.lifetime || 1800,
      elapsed: 0,
      active: true,
      swapStunDuration: stats.swapStunDuration || 0,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    spell.x += spell.vx;
    spell.y += spell.vy;

    // Obstacle collision
    if (ctx.checkObstacleHit(spell.x, spell.y, spell.radius)) {
      spell.active = false;
      ctx.removeSpell(i);
      return 'continue';
    }

    // Player collision: swap positions
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;

      const dx = body.position.x - spell.x;
      const dy = body.position.y - spell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < spell.radius + PLAYER.RADIUS) {
        // Swap positions
        const casterBody = ctx.physics.playerBodies.get(spell.ownerId);
        if (casterBody) {
          const casterPos = { x: casterBody.position.x, y: casterBody.position.y };
          const targetPos = { x: body.position.x, y: body.position.y };
          Body.setPosition(casterBody, targetPos);
          Body.setPosition(body, casterPos);
          // Reset velocities
          Body.setVelocity(casterBody, { x: 0, y: 0 });
          Body.setVelocity(body, { x: 0, y: 0 });

          // Stun the swapped enemy (T2) — clamped to 3s max
          const stunDur = Math.min(spell.swapStunDuration || 0, 3000);
          if (stunDur > 0) {
            ctx.applyStatusEffect(playerId, 'stun', {
              until: now + stunDur,
            });
          }
        }
        spell.active = false;
        ctx.removeSpell(i);
        return 'break';
      }
    }
  },
};
