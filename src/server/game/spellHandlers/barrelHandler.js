import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER, PHYSICS } from '../../../shared/constants.js';

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
      knockbackForce: stats.knockbackForce || 0.06,
      range: stats.range || 350,
      lifetime: stats.lifetime || 3500,
      elapsed: 0,
      active: true,
      speed: clampedSpeed,
      pushSpeed: stats.pushSpeed || 4.5,
      hitIds: [],                          // damage dealt once per player
      destroysObstacles: stats.destroysObstacles || false,
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
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;

      const pdx = body.position.x - spell.x;
      const pdy = body.position.y - spell.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pDist < spell.radius + PLAYER.RADIUS) {
        // First contact: deal damage + initial knockback for kill credit
        if (!spell.hitIds.includes(playerId)) {
          const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
          ctx.physics.applyKnockback(playerId,
            dirX * spell.knockbackForce * kbMult,
            dirY * spell.knockbackForce * kbMult,
            ctx.getDamageTaken(playerId),
            spell.ownerId,
          );
          ctx.pendingHits.push({
            attackerId: spell.ownerId,
            targetId: playerId,
            damage: spell.damage,
            spellId: spell.type,
          });
          spell.hitIds.push(playerId);
        }

        // Continuous push: override velocity in barrel direction
        Body.setVelocity(body, {
          x: dirX * spell.pushSpeed,
          y: dirY * spell.pushSpeed,
        });
        // Block player input while being pushed
        ctx.physics.knockbackUntil.set(playerId, ctx.now + PHYSICS.TICK_MS * 2);
      }
    }
  },
};
