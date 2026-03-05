import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER, PHYSICS } from '../../../shared/constants.js';

function clampSpeed(speed) {
  return Math.min(20, Math.max(1, speed || 5));
}

export const projectileHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const rawCount = stats.projectileCount || 1;
    const projectileCount = Math.min(5, Math.max(1, Math.floor(rawCount)));
    const spreadAngle = projectileCount > 1 ? 0.15 : 0;
    const clampedSpeed = clampSpeed(stats.speed);

    const spells = [];
    for (let i = 0; i < projectileCount; i++) {
      let angle = Math.atan2(ny, nx);
      if (projectileCount > 1) {
        const offset = (i - (projectileCount - 1) / 2) * spreadAngle;
        angle += offset;
      }

      const vx = Math.cos(angle) * clampedSpeed;
      const vy = Math.sin(angle) * clampedSpeed;

      const spell = {
        id: ctx.nextSpellId(),
        type: spellId,
        spellType: SPELL_TYPES.PROJECTILE,
        ownerId: playerId,
        x: originX,
        y: originY,
        originX, originY,
        vx, vy,
        radius: stats.radius || 8,
        damage: stats.damage || 0,
        knockbackForce: stats.knockbackForce || 0,
        lifetime: stats.lifetime || 2000,
        piercing: stats.piercing || false,
        elapsed: 0,
        active: true,
        // Status effect data
        slowAmount: stats.slowAmount || 0,
        slowDuration: stats.slowDuration || 0,
        rootDuration: stats.rootDuration || 0,
        // Explosion data
        explosionRadius: stats.explosionRadius || 0,
        stunDuration: stats.stunDuration || 0,
        // Bouncer data
        maxBounces: stats.maxBounces || 0,
        bounceCount: 0,
        destroysSpells: stats.destroysSpells || false,
        kbPerBounce: stats.kbPerBounce || 0,
      };

      ctx.activeSpells.push(spell);
      spells.push(spell);
    }

    return spells;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    spell.x += spell.vx;
    spell.y += spell.vy;

    // Bouncer: bounce off obstacles instead of being destroyed
    const hitObs = ctx.checkObstacleHit(spell.x, spell.y, spell.radius);
    if (hitObs) {
      if (spell.maxBounces > 0 && spell.bounceCount < spell.maxBounces) {
        // Reflect velocity off obstacle surface
        const dx = spell.x - hitObs.x;
        const dy = spell.y - hitObs.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const dot = spell.vx * nx + spell.vy * ny;
        spell.vx -= 2 * dot * nx;
        spell.vy -= 2 * dot * ny;
        // Push out of obstacle
        spell.x = hitObs.x + nx * (hitObs.radius + spell.radius + 1);
        spell.y = hitObs.y + ny * (hitObs.radius + spell.radius + 1);
        spell.bounceCount++;
        // Grow knockback per bounce (Bouncer T2)
        if (spell.kbPerBounce) {
          spell.knockbackForce += spell.kbPerBounce;
        }
      } else {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }
    }

    // Check wall collision
    const hitWall = ctx.checkWallHit(spell.x, spell.y, spell.radius, spell.ownerId);
    if (hitWall) {
      // Damage the wall
      hitWall.wallHp -= (spell.damage || 1);
      spell.active = false;
      ctx.removeSpell(i);
      return 'continue';
    }

    // Check collision with players
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;

      // Intangible players: projectiles pass through
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;

      // Shield: absorb hit instead of taking damage
      if (targetEffects && targetEffects.shield && targetEffects.shield.hitsRemaining > 0) {
        const dx = body.position.x - spell.x;
        const dy = body.position.y - spell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < spell.radius + PLAYER.RADIUS) {
          targetEffects.shield.hitsRemaining--;
          targetEffects.shield.lastHitData = {
            attackerId: spell.ownerId,
            damage: spell.damage,
            knockbackForce: spell.knockbackForce,
          };
          if (!spell.piercing) {
            spell.active = false;
            ctx.removeSpell(i);
            return 'break';
          }
          continue;
        }
      }

      const dx = body.position.x - spell.x;
      const dy = body.position.y - spell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < spell.radius + PLAYER.RADIUS) {
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
        ctx.physics.applyKnockback(playerId,
          nx * spell.knockbackForce * kbMult,
          ny * spell.knockbackForce * kbMult,
          ctx.getDamageTaken(playerId),
          spell.ownerId,
        );

        ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });

        // Status effects
        if (spell.slowAmount > 0 && spell.slowDuration > 0) {
          ctx.applyStatusEffect(playerId, 'slow', {
            amount: spell.slowAmount,
            until: now + spell.slowDuration,
          }, spell.type);
        }
        if (spell.rootDuration > 0) {
          ctx.applyStatusEffect(playerId, 'root', {
            until: now + spell.rootDuration,
          }, spell.type);
        }
        if (spell.stunDuration > 0) {
          ctx.applyStatusEffect(playerId, 'stun', {
            until: now + spell.stunDuration,
          });
        }

        // Explosion on impact
        if (spell.explosionRadius > 0) {
          ctx.handleExplosion(spell, body.position.x, body.position.y, playerId);
        }

        if (!spell.piercing) {
          spell.active = false;
          ctx.removeSpell(i);
          return 'break';
        }
      }
    }
  },
};
