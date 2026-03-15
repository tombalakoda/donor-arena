import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER, PHYSICS } from '../../../shared/constants.js';
import { isIntangible } from './defenseUtils.js';

const { Body } = Matter;

export const barrelHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const clampedSpeed = ctx.clampSpeed(stats.speed);

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.BARREL,
      ownerId: playerId,
      x: originX,
      y: originY,
      originX, originY,
      vx: nx * clampedSpeed,
      vy: ny * clampedSpeed,
      radius: stats.radius || 16,
      damage: stats.damage || 4,
      knockbackForce: stats.knockbackForce || 0.08,
      range: stats.range || 1050,
      lifetime: stats.lifetime || 10500,
      elapsed: 0,
      active: true,
      speed: clampedSpeed,
      hitIds: [],                          // damage dealt once per player
      destroysObstacles: stats.destroysObstacles || false,
      slowAmount: stats.slowAmount || 0,
      slowDuration: stats.slowDuration || 0,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    // --- Move barrel ---
    spell.x += spell.vx;
    spell.y += spell.vy;

    // --- Range check ---
    const dx = spell.x - spell.originX;
    const dy = spell.y - spell.originY;
    const distFromOrigin = Math.sqrt(dx * dx + dy * dy);
    if (distFromOrigin > spell.range) {
      spell.active = false;
      ctx.removeSpell(i);
      return 'continue';
    }

    // --- Obstacle collision ---
    const hitObs = ctx.checkObstacleHit(spell.x, spell.y, spell.radius);
    if (hitObs) {
      if (spell.destroysObstacles && hitObs.hp !== undefined) {
        // T2: damage destructible obstacles
        hitObs.hp -= (spell.damage || 1);
        if (hitObs.hp <= 0 && !hitObs.isTemporary) {
          if (hitObs.type === 'explosive') {
            ctx.handleObstacleExplosion(hitObs);
          }
          ctx.obstacleManager.queueDestroy(hitObs);
        }
        // Barrel keeps going after destroying breakable obstacles
      } else {
        // Barrel breaks on obstacle contact
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }
    }

    // --- Player collision (snowplow) ---
    const barrelSpeed = Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy) || 1;
    const dirX = spell.vx / barrelSpeed;
    const dirY = spell.vy / barrelSpeed;

    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (isIntangible(ctx, playerId)) continue;

      const pdx = body.position.x - spell.x;
      const pdy = body.position.y - spell.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pDist < spell.radius + PLAYER.RADIUS) {
        // First contact: deal damage + set kill credit (no impulse — barrel drags, not throws)
        if (!spell.hitIds.includes(playerId)) {
          ctx.pendingHits.push({
            attackerId: spell.ownerId,
            targetId: playerId,
            damage: spell.damage,
            spellId: spell.type,
          });
          // Set kill credit for ring-out tracking (without applying force impulse)
          ctx.physics.lastKnockbackFrom.set(playerId, { attackerId: spell.ownerId, timestamp: ctx.now });
          spell.hitIds.push(playerId);

          // Apply slow effect on first contact so enemies can't escape
          if (spell.slowAmount > 0 && spell.slowDuration > 0) {
            ctx.applyStatusEffect(playerId, 'slow', {
              amount: spell.slowAmount,
              until: ctx.now + spell.slowDuration,
            }, spell.type);
          }
        }

        // Continuous drag: override velocity to match barrel speed (player rides with barrel)
        Body.setVelocity(body, {
          x: dirX * spell.speed,
          y: dirY * spell.speed,
        });
        // Block player input while being dragged
        ctx.physics.knockbackUntil.set(playerId, ctx.now + PHYSICS.TICK_MS * 2);
      }
    }
  },
};
