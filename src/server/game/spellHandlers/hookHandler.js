import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER, PHYSICS } from '../../../shared/constants.js';

const { Body } = Matter;

export const hookHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const isPullSelf = stats.pullSelf || false;

    const baseSpeed = ctx.clampSpeed(stats.speed);
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
      pullSelf: isPullSelf,
      lifetime: stats.lifetime || 1500,
      range: stats.range || 300,
      elapsed: 0,
      active: true,
      hooked: false,
      hookedPlayerId: null,
      originX, originY,
      released: false,
      hookTargetX, hookTargetY,
      travelDist,
      traveledDist: 0,

      // --- Hook (pull-and-throw) fields ---
      phase: isPullSelf ? null : 'flight',
      pullElapsed: 0,
      pullDuration: isPullSelf ? 0 : (stats.pullDuration || 300),
      pullSpeed: isPullSelf ? (stats.pullSpeed || 4) : (stats.pullSpeed || 3.5),
      throwForce: stats.throwForce || 0.08,
      throwGrace: stats.throwGrace || 200,
      hookOriginX: 0,
      hookOriginY: 0,

      // --- Grappling (pull-self) fields ---
      pullForce: stats.pullForce || 0.04,
      swingElapsed: 0,
      anchorX: 0,
      anchorY: 0,
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

    // ═══════════════════════════════════════════════════════════════
    // HOOK (Pull-and-Throw) — phase-based state machine
    // ═══════════════════════════════════════════════════════════════

    // --- Pull phase: reel enemy toward caster ---
    if (spell.phase === 'pull' && !spell.pullSelf) {
      const hookedBody = ctx.physics.playerBodies.get(spell.hookedPlayerId);
      const casterBody = ctx.physics.playerBodies.get(spell.ownerId);

      if (!hookedBody || !casterBody) {
        // Target or caster disconnected — clean up
        spell.phase = 'done';
        spell.released = true;
        spell.lifetime = spell.elapsed + 100;
        return;
      }

      spell.pullElapsed += PHYSICS.TICK_MS;

      // Direction from enemy toward caster (updated each tick for dynamic pull)
      const dx = casterBody.position.x - hookedBody.position.x;
      const dy = casterBody.position.y - hookedBody.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const arrived = dist < 40;
      const expired = spell.pullElapsed >= spell.pullDuration;

      if (!arrived && !expired) {
        // Pull: set velocity toward caster each tick
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        Body.setVelocity(hookedBody, {
          x: nx * spell.pullSpeed,
          y: ny * spell.pullSpeed,
        });
        // Block enemy input during pull (same pattern as grappling line 133)
        ctx.physics.knockbackUntil.set(spell.hookedPlayerId, now + PHYSICS.TICK_MS * 3);
      } else {
        // Transition to throw
        spell.phase = 'throw';
      }

      // Track enemy position for visuals
      spell.x = hookedBody.position.x;
      spell.y = hookedBody.position.y;
    }

    // --- Throw phase: launch enemy past caster ---
    if (spell.phase === 'throw' && !spell.pullSelf) {
      const hookedBody = ctx.physics.playerBodies.get(spell.hookedPlayerId);
      const casterBody = ctx.physics.playerBodies.get(spell.ownerId);

      if (hookedBody && casterBody) {
        // Direction: from where enemy was hooked → through caster's current position
        // This sends the enemy "past" the caster to the other side
        const throwDx = casterBody.position.x - spell.hookOriginX;
        const throwDy = casterBody.position.y - spell.hookOriginY;
        const throwDist = Math.sqrt(throwDx * throwDx + throwDy * throwDy) || 1;
        const throwNx = throwDx / throwDist;
        const throwNy = throwDy / throwDist;

        const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
        ctx.physics.applyKnockback(
          spell.hookedPlayerId,
          throwNx * spell.throwForce * kbMult,
          throwNy * spell.throwForce * kbMult,
          ctx.getDamageTaken(spell.hookedPlayerId),
          spell.ownerId,
        );

        // Caster recoil — pushed opposite to throw direction ("heavy throw" feel)
        ctx.physics.applyKnockback(
          spell.ownerId,
          -throwNx * spell.throwForce * 0.4,
          -throwNy * spell.throwForce * 0.4,
          0,
          null,
        );

        spell.x = hookedBody.position.x;
        spell.y = hookedBody.position.y;
      }

      spell.phase = 'done';
      spell.released = true;
      spell.lifetime = spell.elapsed + 400;
    }

    // ═══════════════════════════════════════════════════════════════
    // GRAPPLING (Pull-Self) — velocity-based self-pull (unchanged)
    // ═══════════════════════════════════════════════════════════════

    // --- Grappling: Velocity-based grapple pull ---
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

    // --- Grappling: Post-launch flight collision ---
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

    // ═══════════════════════════════════════════════════════════════
    // SHARED: Projectile movement & grab detection
    // ═══════════════════════════════════════════════════════════════

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
        // --- Hook: grab enemy on contact ---
        for (const [playerId, body] of ctx.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (ctx.isEliminated(playerId)) continue;
          const pdx = body.position.x - spell.x;
          const pdy = body.position.y - spell.y;
          const dist = Math.sqrt(pdx * pdx + pdy * pdy);

          if (dist < spell.radius + PLAYER.RADIUS) {
            spell.hooked = true;
            spell.hookedPlayerId = playerId;
            spell.phase = 'pull';
            spell.pullElapsed = 0;
            spell.hookOriginX = body.position.x;
            spell.hookOriginY = body.position.y;

            // Damage on hit
            ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });

            // Stun enemy for entire pull + throw + grace duration
            const totalStunDuration = spell.pullDuration + spell.throwGrace + 100;
            ctx.applyStatusEffect(playerId, 'stun', {
              until: now + totalStunDuration,
            });

            // Extend lifetime to cover pull + throw + cleanup
            spell.lifetime = spell.elapsed + spell.pullDuration + 600;
            break;
          }
        }
      } else {
        // --- Grappling: anchor at target location ---
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
