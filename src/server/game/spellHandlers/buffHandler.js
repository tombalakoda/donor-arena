import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { isIntangible } from './defenseUtils.js';

const { Body } = Matter;

export const buffHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY) {
    const now = Date.now();
    const effects = ctx.statusEffects.get(playerId);
    if (!effects) return null;

    const duration = stats.buffDuration || 2000;

    // Apply buff based on spell type
    if (stats.speedBoost) {
      effects.speedBoost = {
        amount: stats.speedBoost,
        until: now + duration,
        frictionReduction: stats.frictionReduction || 0,
      };
    }

    if (stats.intangible) {
      effects.intangible = {
        until: now + duration,
        speedBoost: stats.speedBoost || 0,
        // On-exit AoE push (Ghost T2: Poltergeist, T3: Ruhani)
        exitPushForce: stats.exitPushForce || 0,
        exitPushRadius: stats.exitPushRadius || 0,
        exitStunDuration: stats.exitStunDuration || 0, // T3: stun on exit
        ownerId: playerId,
      };
    }

    if (stats.shieldHits) {
      effects.shield = {
        hitsRemaining: stats.shieldHits,
        until: now + duration,
        reflectOnBreak: stats.reflectOnBreak || false,
        lastHitData: null, // stores last absorbed hit for reflect
        ownerId: playerId,
        // T3: explosion on break, force scales with absorbed hits
        shieldExplosionForce: stats.shieldExplosionForce || 0,
        shieldExplosionRadius: stats.shieldExplosionRadius || 0,
        forcePerAbsorb: stats.forcePerAbsorb || 0,
        absorbedCount: 0,
      };
    }

    // Sema: whirling push aura + projectile deflection
    if (stats.isSema) {
      effects.sema = {
        until: now + duration,
        pushRadius: stats.pushRadius || 50,
        pushForce: stats.pushForce || 0.012,
        pullEnemies: stats.pullEnemies || false, // T3: reverse to pull
        speedPenalty: stats.speedPenalty || 0,
        deflectsProjectiles: stats.deflectsProjectiles || false,
        burstPushForce: stats.burstPushForce || 0,
        ownerId: playerId,
      };
    }

    // Flash trail (T2: Blazing Trail)
    const leaveTrail = stats.leaveTrail || false;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.BUFF,
      ownerId: playerId,
      x: originX,
      y: originY,
      lifetime: duration + 100,
      elapsed: 0,
      active: true,
      buffType: stats.isSema ? 'sema' : stats.intangible ? 'ghost' : stats.shieldHits ? 'shield' : 'flash',
      pushRadius: stats.pushRadius || 0,
      pushForce: stats.pushForce || 0,
      pullEnemies: stats.pullEnemies || false, // T3: sema pulls instead of pushes
      leaveTrail,
      trailSlowAmount: stats.trailSlowAmount || 0,
      trailSlowDuration: stats.trailSlowDuration || 0,
      trailDamage: stats.trailDamage || 0,           // T3
      trailKnockback: stats.trailKnockback || 0,     // T3
      trailPositions: leaveTrail ? [] : null,
      trailHitTimestamps: leaveTrail ? {} : null,     // T3: per-player damage cooldown
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
    // Always update buff position for client rendering (all buff types)
    if (ownerBody) {
      spell.x = ownerBody.position.x;
      spell.y = ownerBody.position.y;
    }
    // Sema: push nearby enemies + deflect projectiles
    if (spell.buffType === 'sema' && ownerBody) {
      const pr = spell.pushRadius;
      const pf = spell.pushForce;

      // Push or pull nearby enemies (gentle force, NOT knockback)
      const forceDir = spell.pullEnemies ? -1 : 1; // T3: -1 = pull inward
      for (const [playerId, body] of ctx.physics.playerBodies) {
        if (playerId === spell.ownerId) continue;
        if (ctx.isEliminated(playerId)) continue;
        if (isIntangible(ctx, playerId)) continue;
        const dx = body.position.x - ownerBody.position.x;
        const dy = body.position.y - ownerBody.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < pr + PLAYER.RADIUS && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          Body.applyForce(body, body.position, { x: nx * pf * forceDir, y: ny * pf * forceDir });
        }
      }

      // Deflect enemy projectiles within push radius
      for (const activeSpell of ctx.activeSpells) {
        if (activeSpell === spell) continue;
        if (activeSpell.ownerId === spell.ownerId) continue;
        // Only deflect moving spell types
        const st = activeSpell.spellType;
        if (st !== SPELL_TYPES.PROJECTILE && st !== 'homing' && st !== 'swap' && st !== 'boomerang') continue;
        // Skip recently deflected
        if (activeSpell._deflectedAt && now - activeSpell._deflectedAt < 500) continue;
        const dx = activeSpell.x - ownerBody.position.x;
        const dy = activeSpell.y - ownerBody.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < pr) {
          activeSpell.vx = -activeSpell.vx;
          activeSpell.vy = -activeSpell.vy;
          activeSpell.ownerId = spell.ownerId;
          activeSpell._deflectedAt = now;
        }
      }
    }

    // Flash trail logic (only for trail-enabled buffs)
    if (spell.leaveTrail && spell.trailPositions && ownerBody) {
      spell.trailPositions.push({ x: ownerBody.position.x, y: ownerBody.position.y, time: now });
      // Clean old trail positions (older than trail slow duration)
      const trailTimeout = spell.trailSlowDuration || 1500;
      while (spell.trailPositions.length > 0 && spell.trailPositions[0].time < now - trailTimeout) {
        spell.trailPositions.shift();
      }
      // Check enemies crossing trail
      if (spell.trailSlowAmount > 0 || spell.trailDamage > 0) {
        for (const [playerId, body] of ctx.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (ctx.isEliminated(playerId)) continue;
          if (isIntangible(ctx, playerId)) continue;
          for (const tp of spell.trailPositions) {
            const dx = body.position.x - tp.x;
            const dy = body.position.y - tp.y;
            if (dx * dx + dy * dy < 20 * 20) { // 20px trail width
              if (spell.trailSlowAmount > 0) {
                ctx.applyStatusEffect(playerId, 'slow', {
                  amount: spell.trailSlowAmount,
                  until: now + 500,
                }, spell.type);
              }
              // T3: trail deals damage + KB (max once per 500ms per player)
              if (spell.trailDamage > 0) {
                const lastHit = spell.trailHitTimestamps[playerId] || 0;
                if (now - lastHit >= 500) {
                  ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.trailDamage, spellId: spell.type });
                  if (spell.trailKnockback > 0) {
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
                    ctx.physics.applyKnockback(playerId, nx * spell.trailKnockback * kbMult, ny * spell.trailKnockback * kbMult, ctx.getDamageTaken(playerId), spell.ownerId);
                  }
                  spell.trailHitTimestamps[playerId] = now;
                }
              }
              break;
            }
          }
        }
      }
    }
  },
};
