import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';
import { sweepTestHit } from './collisionUtils.js';

export const projectileHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const rawCount = stats.projectileCount || 1;
    const projectileCount = Math.min(10, Math.max(1, Math.floor(rawCount)));
    const coneAngle = stats.coneAngle || (projectileCount > 1 ? 0.52 : 0);
    const spreadAngle = projectileCount > 1 ? coneAngle / Math.max(1, projectileCount - 1) : 0;
    const clampedSpeed = ctx.clampSpeed(stats.speed);

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

    // Store previous position for swept collision test
    const prevX = spell.x;
    const prevY = spell.y;
    spell.x += spell.vx;
    spell.y += spell.vy;

    // Obstacle collision (includes temporary wall obstacles)
    const hitObs = ctx.checkObstacleHit(spell.x, spell.y, spell.radius);
    if (hitObs) {
      // Damage destructible obstacles (wall spells + breakable/explosive map obstacles)
      if (hitObs.hp !== undefined) {
        hitObs.hp -= (spell.damage || 1);
        // Destroy map obstacle when HP depleted
        if (hitObs.hp <= 0 && !hitObs.isTemporary) {
          if (hitObs.type === 'explosive') {
            ctx.handleObstacleExplosion(hitObs);
          }
          ctx.obstacleManager.queueDestroy(hitObs);
        }
      }

      if (spell.maxBounces > 0 && spell.bounceCount < spell.maxBounces) {
        // Bouncer: reflect velocity off obstacle surface
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

    // Check collision with players
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;

      if (isIntangible(ctx, playerId)) continue;

      // Swept line-circle test: catches fast projectiles that would tunnel
      const combinedRadius = spell.radius + PLAYER.RADIUS;
      if (!sweepTestHit(prevX, prevY, spell.x, spell.y,
            body.position.x, body.position.y, combinedRadius)) {
        continue;
      }

      // Shield: absorb hit instead of taking damage
      if (tryShieldAbsorb(ctx, playerId, spell.ownerId, spell.damage, spell.knockbackForce)) {
        if (!spell.piercing) {
          spell.active = false;
          ctx.removeSpell(i);
          return 'break';
        }
        continue;
      }

      {
        const dx = body.position.x - spell.x;
        const dy = body.position.y - spell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        let kbMult = ctx.getKnockbackMultiplier(spell.ownerId);

        // Item KB modifiers
        const attackerItems = ctx.getItemStats(spell.ownerId);
        if (attackerItems) {
          // KB bonus vs slowed targets (Santur + Buzul Hazine)
          if (attackerItems.kbBonusVsSlowed > 0) {
            const targetEffects = ctx.statusEffects.get(playerId);
            if (targetEffects && targetEffects.slow) {
              kbMult *= (1 + attackerItems.kbBonusVsSlowed);
            }
          }
          // First KB bonus (Sessiz Olum Hazine)
          if (attackerItems.firstKbBonusForce > 0) {
            const prog = attackerItems._getItemSystem ? attackerItems._getItemSystem() : null;
            if (prog && !prog.firstKbDealtThisRound) {
              kbMult *= (1 + attackerItems.firstKbBonusForce);
              prog.firstKbDealtThisRound = true;
            }
          }
          // Max speed KB bonus (Basmak: at max speed, spells deal +KB)
          if (attackerItems.maxSpeedKbBonus > 0) {
            const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
            if (ownerBody) {
              const speed = Math.sqrt(ownerBody.velocity.x ** 2 + ownerBody.velocity.y ** 2);
              const maxSpeed = PLAYER.SPEED * 0.05; // same as speed clamping
              if (speed >= maxSpeed * 0.9) { // 90% of max counts as "at max speed"
                kbMult *= (1 + attackerItems.maxSpeedKbBonus);
              }
            }
          }
          // KB at max range (Kudum + Isik Topu Hazine)
          if (attackerItems.kbBonusAtMaxRange > 0) {
            const travelDist = Math.sqrt(
              (spell.x - spell.originX) ** 2 + (spell.y - spell.originY) ** 2
            );
            const maxRange = spell.lifetime * Math.sqrt(spell.vx ** 2 + spell.vy ** 2) / 20; // approx max travel
            if (maxRange > 0 && travelDist / maxRange >= 0.7) {
              kbMult *= (1 + attackerItems.kbBonusAtMaxRange);
            }
          }
        }

        ctx.physics.applyKnockback(playerId,
          nx * spell.knockbackForce * kbMult,
          ny * spell.knockbackForce * kbMult,
          ctx.getDamageTaken(playerId),
          spell.ownerId,
        );

        ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });

        // Status effects
        if (spell.slowAmount > 0 && spell.slowDuration > 0) {
          let slowDur = spell.slowDuration;
          // Permafrost Hazine: attacker's slow effects last longer
          if (attackerItems && attackerItems.slowDurationMult && attackerItems.slowDurationMult !== 1.0) {
            slowDur *= attackerItems.slowDurationMult;
          }
          // Buz Kalesi Hazine: while sliding, slow-applying spells have bonus slow amount
          let slowAmt = spell.slowAmount;
          if (attackerItems && attackerItems.slidingSlowBonus > 0) {
            const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
            if (ownerBody) {
              const speed = Math.sqrt(ownerBody.velocity.x ** 2 + ownerBody.velocity.y ** 2);
              const maxSpeed = PLAYER.SPEED * 0.05;
              if (speed >= maxSpeed * 0.8) {
                slowAmt += attackerItems.slidingSlowBonus;
              }
            }
          }
          ctx.applyStatusEffect(playerId, 'slow', {
            amount: slowAmt,
            until: now + slowDur,
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
