import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';

export const homingHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const baseAngle = Math.atan2(dy, dx);

    const missileCount = Math.min(10, Math.max(1, stats.missileCount || 1));
    const isSwarm = stats.isSwarm || missileCount > 1;
    const clampedSpeed = ctx.clampSpeed(stats.speed);

    const spells = [];
    for (let i = 0; i < missileCount; i++) {
      // Spread initial angles for swarm
      let angle = baseAngle;
      if (isSwarm && missileCount > 1) {
        const spread = 0.4; // total spread in radians
        angle += (i - (missileCount - 1) / 2) * (spread / (missileCount - 1));
      }

      const vx = Math.cos(angle) * clampedSpeed;
      const vy = Math.sin(angle) * clampedSpeed;

      const spell = {
        id: ctx.nextSpellId(),
        type: spellId,
        spellType: SPELL_TYPES.HOMING,
        ownerId: playerId,
        x: originX,
        y: originY,
        originX, originY,
        vx, vy,
        angle,
        radius: stats.radius || 7,
        damage: stats.damage || 3,
        knockbackForce: stats.knockbackForce || 0.06,
        lifetime: stats.lifetime || 4000,
        elapsed: 0,
        active: true,
        turnRate: stats.turnRate || 0.08,
        trackingRange: stats.trackingRange || 400,
        speed: clampedSpeed,
        // Warhead T2: explosion on impact
        explosionRadius: stats.explosionRadius || 0,
      };

      ctx.activeSpells.push(spell);
      spells.push(spell);
    }

    return spells.length === 1 ? spells[0] : spells;
  },

  update(ctx, spell, i) {
    // Find nearest target
    let nearestDist = spell.trackingRange;
    let nearestBody = null;
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;
      const dx = body.position.x - spell.x;
      const dy = body.position.y - spell.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBody = body;
      }
    }

    // Steer toward target
    if (nearestBody) {
      const dx = nearestBody.position.x - spell.x;
      const dy = nearestBody.position.y - spell.y;
      const targetAngle = Math.atan2(dy, dx);
      let angleDiff = targetAngle - spell.angle;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      // Clamp turn rate
      const maxTurn = spell.turnRate || 0.08;
      spell.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
    }

    spell.vx = Math.cos(spell.angle) * spell.speed;
    spell.vy = Math.sin(spell.angle) * spell.speed;
    spell.x += spell.vx;
    spell.y += spell.vy;

    // Obstacle collision
    if (ctx.checkObstacleHit(spell.x, spell.y, spell.radius)) {
      spell.active = false;
      ctx.removeSpell(i);
      return 'continue';
    }

    // Player collision
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;

      // Shield absorption
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
          spell.active = false;
          ctx.removeSpell(i);
          return 'break';
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

        // Explosion on impact (Warhead T2)
        if (spell.explosionRadius > 0) {
          ctx.handleExplosion(spell, body.position.x, body.position.y, playerId);
        }

        spell.active = false;
        ctx.removeSpell(i);
        return 'break';
      }
    }
  },
};
