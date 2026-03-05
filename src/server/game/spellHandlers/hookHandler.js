import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER, PHYSICS } from '../../../shared/constants.js';

const { Body } = Matter;

function clampSpeed(speed) {
  return Math.min(20, Math.max(1, speed || 5));
}

export const hookHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const isPullSelf = stats.pullSelf || false;

    const baseSpeed = clampSpeed(stats.speed);
    const hookSpeed = isPullSelf ? baseSpeed * 1.5 : baseSpeed;
    const vx = (dx / dist) * hookSpeed;
    const vy = (dy / dist) * hookSpeed;

    const travelDist = Math.min(dist, stats.range || 300);
    const hookTargetX = originX + (dx / dist) * travelDist;
    const hookTargetY = originY + (dy / dist) * travelDist;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.HOOK,
      ownerId: playerId,
      x: originX,
      y: originY,
      vx, vy,
      radius: stats.radius || 10,
      damage: stats.damage || 5,
      pullForce: stats.pullForce || 0.04,
      pullSelf: isPullSelf,
      lifetime: stats.lifetime || 1500,
      range: stats.range || 300,
      elapsed: 0,
      active: true,
      hooked: false,
      hookedPlayerId: null,
      originX, originY,
      swingAngle: 0,
      swingElapsed: 0,
      swingDuration: stats.swingDuration || 600,
      orbitRadius: 0,
      released: false,
      hookTargetX, hookTargetY,
      travelDist,
      traveledDist: 0,
      anchorX: 0,
      anchorY: 0,
      pullSpeed: isPullSelf ? (stats.pullSpeed || 4) : 0,
      pullActive: false,
      pullStartX: 0,
      pullStartY: 0,
      releaseRequested: false,
      flightActive: false,
      flightElapsed: 0,
      flightDuration: isPullSelf ? (stats.flightDuration || 500) : 0,
      flightCollision: stats.flightCollision || false,
      flightDamage: stats.flightDamage || 0,
      flightKnockback: stats.flightKnockback || 0,
      flightHitIds: [],
      launchSpeedBonus: stats.launchSpeedBonus || 0,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    // --- Hook Branch A: Swing & Release ---
    if (spell.hooked && !spell.pullSelf && spell.hookedPlayerId && !spell.released) {
      const hookedBody = ctx.physics.playerBodies.get(spell.hookedPlayerId);
      const casterBody = ctx.physics.playerBodies.get(spell.ownerId);

      if (hookedBody && casterBody) {
        const dt = PHYSICS.TICK_MS / 1000;

        if (spell.swingElapsed === 0) {
          const dx = hookedBody.position.x - casterBody.position.x;
          const dy = hookedBody.position.y - casterBody.position.y;
          spell.swingAngle = Math.atan2(dy, dx);
          spell.orbitRadius = Math.min(Math.sqrt(dx * dx + dy * dy), 120);
          ctx.applyStatusEffect(spell.hookedPlayerId, 'stun', {
            until: now + spell.swingDuration + 100,
          });
        }

        spell.swingElapsed += PHYSICS.TICK_MS;

        if (spell.swingElapsed < spell.swingDuration) {
          const t = spell.swingElapsed / spell.swingDuration;
          const angularSpeed = 4 + t * 6;
          spell.swingAngle += angularSpeed * dt;
          const orbitX = casterBody.position.x + Math.cos(spell.swingAngle) * spell.orbitRadius;
          const orbitY = casterBody.position.y + Math.sin(spell.swingAngle) * spell.orbitRadius;
          Body.setPosition(hookedBody, { x: orbitX, y: orbitY });
          Body.setVelocity(hookedBody, { x: 0, y: 0 });
          spell.x = orbitX;
          spell.y = orbitY;
        } else {
          const tangentX = -Math.sin(spell.swingAngle);
          const tangentY = Math.cos(spell.swingAngle);
          const releaseForce = spell.pullForce * 2.5 * ctx.getKnockbackMultiplier(spell.ownerId);
          ctx.physics.applyKnockback(
            spell.hookedPlayerId,
            tangentX * releaseForce,
            tangentY * releaseForce,
            ctx.getDamageTaken(spell.hookedPlayerId),
            spell.ownerId,
          );
          spell.released = true;
          spell.lifetime = spell.elapsed + 300;
          spell.x = hookedBody.position.x;
          spell.y = hookedBody.position.y;
        }
      }
    }

    // --- Hook Branch B: Velocity-based grapple pull ---
    if (spell.hooked && spell.pullSelf && spell.pullActive && !spell.released) {
      const casterBody = ctx.physics.playerBodies.get(spell.ownerId);

      if (casterBody) {
        if (spell.pullStartX === 0 && spell.pullStartY === 0) {
          spell.pullStartX = casterBody.position.x;
          spell.pullStartY = casterBody.position.y;
        }

        ctx.physics.knockbackUntil.set(spell.ownerId, now + PHYSICS.TICK_MS * 3);
        spell.swingElapsed += PHYSICS.TICK_MS;

        const dx = spell.anchorX - casterBody.position.x;
        const dy = spell.anchorY - casterBody.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 20) {
          const nx = dx / dist;
          const ny = dy / dist;
          Body.setVelocity(casterBody, { x: nx * spell.pullSpeed, y: ny * spell.pullSpeed });
        }

        spell.x = casterBody.position.x;
        spell.y = casterBody.position.y;

        // Pull collision
        if (spell.flightCollision) {
          for (const [playerId, body] of ctx.physics.playerBodies) {
            if (playerId === spell.ownerId) continue;
            if (ctx.isEliminated(playerId)) continue;
            if (spell.flightHitIds.includes(playerId)) continue;
            const edx = body.position.x - casterBody.position.x;
            const edy = body.position.y - casterBody.position.y;
            const eDist = Math.sqrt(edx * edx + edy * edy);
            if (eDist < PLAYER.RADIUS * 2.5) {
              const enx = eDist > 0 ? edx / eDist : 0;
              const eny = eDist > 0 ? edy / eDist : 1;
              const pullKbMult = ctx.getKnockbackMultiplier(spell.ownerId);
              ctx.physics.applyKnockback(playerId,
                enx * (spell.flightKnockback || 0.02) * pullKbMult,
                eny * (spell.flightKnockback || 0.02) * pullKbMult,
                ctx.getDamageTaken(playerId),
                spell.ownerId,
              );
              if (spell.flightDamage > 0) {
                ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.flightDamage, spellId: spell.type });
              }
              spell.flightHitIds.push(playerId);
            }
          }
        }

        const reachedAnchor = dist <= 20;
        const shouldRelease = reachedAnchor || spell.releaseRequested || spell.swingElapsed >= 3000;

        if (shouldRelease) {
          const launchDx = spell.anchorX - spell.pullStartX;
          const launchDy = spell.anchorY - spell.pullStartY;
          const launchDist = Math.sqrt(launchDx * launchDx + launchDy * launchDy) || 1;
          const launchNx = launchDx / launchDist;
          const launchNy = launchDy / launchDist;
          const launchSpeed = Math.min(spell.pullSpeed + (spell.launchSpeedBonus || 0) + 2, 10);

          Body.setVelocity(casterBody, { x: launchNx * launchSpeed, y: launchNy * launchSpeed });
          ctx.physics.knockbackUntil.set(spell.ownerId, now + spell.flightDuration + 500);

          spell.released = true;
          spell.pullActive = false;
          spell.flightActive = true;
          spell.flightElapsed = 0;
          spell.flightHitIds = [];
          spell.lifetime = spell.elapsed + spell.flightDuration + 300;
        }
      }
    }

    // --- Hook Branch B: Post-launch flight collision ---
    if (spell.released && spell.pullSelf && spell.flightActive) {
      const casterBody = ctx.physics.playerBodies.get(spell.ownerId);
      if (casterBody) {
        spell.flightElapsed += PHYSICS.TICK_MS;
        spell.x = casterBody.position.x;
        spell.y = casterBody.position.y;

        if (spell.flightCollision) {
          for (const [playerId, body] of ctx.physics.playerBodies) {
            if (playerId === spell.ownerId) continue;
            if (ctx.isEliminated(playerId)) continue;
            if (spell.flightHitIds.includes(playerId)) continue;
            const dx = body.position.x - casterBody.position.x;
            const dy = body.position.y - casterBody.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < PLAYER.RADIUS * 2.5) {
              const nx = dist > 0 ? dx / dist : 0;
              const ny = dist > 0 ? dy / dist : 1;
              const flightKbMult = ctx.getKnockbackMultiplier(spell.ownerId);
              ctx.physics.applyKnockback(playerId,
                nx * (spell.flightKnockback || 0.02) * flightKbMult,
                ny * (spell.flightKnockback || 0.02) * flightKbMult,
                ctx.getDamageTaken(playerId),
                spell.ownerId,
              );
              if (spell.flightDamage > 0) {
                ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.flightDamage, spellId: spell.type });
              }
              spell.flightHitIds.push(playerId);
            }
          }
        }

        if (spell.flightElapsed >= spell.flightDuration) {
          spell.flightActive = false;
          spell.lifetime = spell.elapsed + 100;
        }
      }
    }

    // --- Hook projectile movement & grab ---
    if (spell.active && !spell.hooked) {
      spell.x += spell.vx;
      spell.y += spell.vy;

      if (ctx.checkObstacleHit(spell.x, spell.y, spell.radius)) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      const dx = spell.x - spell.originX;
      const dy = spell.y - spell.originY;
      const travelDist = Math.sqrt(dx * dx + dy * dy);
      if (travelDist > spell.range) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      if (!spell.pullSelf) {
        for (const [playerId, body] of ctx.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (ctx.isEliminated(playerId)) continue;
          const pdx = body.position.x - spell.x;
          const pdy = body.position.y - spell.y;
          const dist = Math.sqrt(pdx * pdx + pdy * pdy);

          if (dist < spell.radius + PLAYER.RADIUS) {
            spell.hooked = true;
            spell.hookedPlayerId = playerId;
            spell.swingElapsed = 0;
            ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
            spell.lifetime = spell.elapsed + spell.swingDuration + 500;
            break;
          }
        }
      } else {
        spell.traveledDist += Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy);
        if (spell.traveledDist >= spell.travelDist) {
          spell.x = spell.hookTargetX;
          spell.y = spell.hookTargetY;
          spell.hooked = true;
          spell.swingElapsed = 0;
          spell.pullActive = true;
          spell.anchorX = spell.x;
          spell.anchorY = spell.y;
          spell.lifetime = spell.elapsed + 3000 + spell.flightDuration + 500;
        }
      }
    }
  },
};
