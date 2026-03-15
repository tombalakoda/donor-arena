import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER, PHYSICS } from '../../../shared/constants.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';

const { Body } = Matter;

export const zoneHandler = {
  spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY) {
    const isMeteor = stats.isMeteor || false;

    // Clamp placement within cast range (same pattern as wallHandler)
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const maxRange = stats.range || 200;
    const placeDist = Math.min(dist, maxRange);
    const placeX = originX + (dx / dist) * placeDist;
    const placeY = originY + (dy / dist) * placeDist;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.ZONE,
      ownerId: playerId,
      x: placeX,
      y: placeY,
      radius: stats.zoneRadius || stats.impactRadius || stats.radius || 60,
      damage: stats.zoneDamage || stats.damage || 0,
      knockbackForce: stats.knockbackForce || 0,
      slowAmount: stats.slowAmount || 0,
      slowDuration: stats.slowDuration || 1000,
      lifetime: stats.zoneDuration || stats.lifetime || 4000,
      elapsed: 0,
      active: true,
      // Meteor-specific
      isMeteor,
      impactDelay: isMeteor ? (stats.impactDelay || 1000) : 0,
      impactTriggered: false,
      burnZoneDuration: stats.burnZoneDuration || 0,
      burnSlowAmount: stats.burnSlowAmount || 0,
      // Gravity well (Çekim)
      pullForce: stats.pullForce || 0,
      isGravityWell: stats.isGravityWell || false,
      burstPushForce: stats.burstPushForce || 0,
      burstPushRadius: stats.burstPushRadius || 0,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    // Meteor: delayed impact
    if (spell.isMeteor && !spell.impactTriggered) {
      if (spell.elapsed >= spell.impactDelay) {
        spell.impactTriggered = true;
        // AoE push on impact
        for (const [playerId, body] of ctx.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (ctx.isEliminated(playerId)) continue;
          if (isIntangible(ctx, playerId)) continue;
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < spell.radius + PLAYER.RADIUS) {
            if (tryShieldAbsorb(ctx, playerId, spell.ownerId, spell.damage, spell.knockbackForce)) {
              continue;
            }
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 1;
            const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
            const force = spell.knockbackForce * (1 - dist / (spell.radius + PLAYER.RADIUS));
            ctx.physics.applyKnockback(playerId,
              nx * Math.max(force, spell.knockbackForce * 0.3) * kbMult,
              ny * Math.max(force, spell.knockbackForce * 0.3) * kbMult,
              ctx.getDamageTaken(playerId),
              spell.ownerId,
            );
            ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
          }
        }
        // If meteor has burn zone, extend lifetime for afterburn
        if (spell.burnZoneDuration > 0) {
          spell.lifetime = spell.elapsed + spell.burnZoneDuration;
          spell.isBurning = true;
        }
      }
      return 'continue'; // Skip normal zone tick during delay
    }

    // Normal zone tick (Blizzard) or meteor afterburn
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (isIntangible(ctx, playerId)) continue;
      const dx = body.position.x - spell.x;
      const dy = body.position.y - spell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < spell.radius) {
        if (tryShieldAbsorb(ctx, playerId, spell.ownerId,
            spell.isBurning ? 1 : spell.damage, spell.knockbackForce || 0)) {
          continue;
        }
        // Apply slow
        const slowAmt = spell.isBurning ? (spell.burnSlowAmount || 0) : spell.slowAmount;
        if (slowAmt > 0) {
          ctx.applyStatusEffect(playerId, 'slow', {
            amount: slowAmt,
            until: now + (spell.slowDuration || 500),
          }, spell.type);
        }
        // Zone damage per tick
        const tickDmg = spell.isBurning ? 1 : spell.damage;
        if (tickDmg > 0) {
          const tickDamage = tickDmg * (PHYSICS.TICK_MS / 1000);
          ctx.pendingHits.push({
            attackerId: spell.ownerId,
            targetId: playerId,
            damage: tickDamage,
            spellId: spell.type,
          });
        }

        // Gravity well: pull toward center (soft force, NOT knockback)
        if (spell.pullForce > 0) {
          const pullNx = dist > 0 ? -dx / dist : 0;
          const pullNy = dist > 0 ? -dy / dist : 0;
          Body.applyForce(body, body.position, {
            x: pullNx * spell.pullForce,
            y: pullNy * spell.pullForce,
          });
        }
      }
    }
  },

  /**
   * Called when a gravity well zone expires — burst push outward (T2: Kara Delik).
   */
  onExpire(ctx, spell) {
    if (!spell.burstPushForce || spell.burstPushForce <= 0) return;
    const burstRadius = spell.burstPushRadius || spell.radius;
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (isIntangible(ctx, playerId)) continue;
      const dx = body.position.x - spell.x;
      const dy = body.position.y - spell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < burstRadius + PLAYER.RADIUS) {
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
        const force = spell.burstPushForce * (1 - dist / (burstRadius + PLAYER.RADIUS));
        ctx.physics.applyKnockback(playerId,
          nx * Math.max(force, spell.burstPushForce * 0.3) * kbMult,
          ny * Math.max(force, spell.burstPushForce * 0.3) * kbMult,
          ctx.getDamageTaken(playerId),
          spell.ownerId,
        );
      }
    }
  },
};
