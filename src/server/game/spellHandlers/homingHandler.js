import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';
import { sweepTestHit } from './collisionUtils.js';

// Diminishing returns: each subsequent swarm hit on the same target
// applies this multiplier to KB (0.7 = 30% less per hit)
const SWARM_KB_DECAY = 0.7;

export const homingHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const baseAngle = Math.atan2(dy, dx);

    const missileCount = Math.min(10, Math.max(1, stats.missileCount || 1));
    const isSwarm = stats.isSwarm || missileCount > 1;
    const clampedSpeed = ctx.clampSpeed(stats.speed);

    // Shared state for swarm KB diminishing returns + distributed targeting
    const swarmState = isSwarm ? { hitCounts: {}, targetAssignments: {} } : null;

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
        // Swarm diminishing returns (shared among all missiles in one cast)
        swarmState,
      };

      ctx.activeSpells.push(spell);
      spells.push(spell);
    }

    return spells.length === 1 ? spells[0] : spells;
  },

  update(ctx, spell, i) {
    // --- Target acquisition ---
    let targetBody = null;

    if (spell.swarmState) {
      // Swarm: distributed targeting — spread missiles across all enemies in range
      const validTargets = [];
      for (const [playerId, body] of ctx.physics.playerBodies) {
        if (playerId === spell.ownerId) continue;
        if (ctx.isEliminated(playerId)) continue;
        if (isIntangible(ctx, playerId)) continue;
        const dx = body.position.x - spell.x;
        const dy = body.position.y - spell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < spell.trackingRange) {
          validTargets.push({ playerId, body, dist });
        }
      }

      if (validTargets.length > 0) {
        // Count how many swarm missiles are assigned to each target
        const assignCounts = {};
        for (const t of validTargets) assignCounts[t.playerId] = 0;
        for (const [, tid] of Object.entries(spell.swarmState.targetAssignments)) {
          if (assignCounts[tid] !== undefined) assignCounts[tid]++;
        }
        // Don't count this missile's own current assignment (it's re-evaluating)
        const currentTarget = spell.swarmState.targetAssignments[spell.id];
        if (currentTarget && assignCounts[currentTarget] !== undefined) {
          assignCounts[currentTarget]--;
        }

        // Pick target with fewest assigned missiles (break ties by distance)
        validTargets.sort((a, b) => {
          const countDiff = (assignCounts[a.playerId] || 0) - (assignCounts[b.playerId] || 0);
          if (countDiff !== 0) return countDiff;
          return a.dist - b.dist;
        });
        const chosen = validTargets[0];
        targetBody = chosen.body;
        spell.swarmState.targetAssignments[spell.id] = chosen.playerId;
      } else {
        // No targets in range — clear assignment
        delete spell.swarmState.targetAssignments[spell.id];
      }
    } else {
      // Non-swarm (single homing missile): keep existing nearest-target behavior
      let nearestDist = spell.trackingRange;
      for (const [playerId, body] of ctx.physics.playerBodies) {
        if (playerId === spell.ownerId) continue;
        if (ctx.isEliminated(playerId)) continue;
        if (isIntangible(ctx, playerId)) continue;
        const dx = body.position.x - spell.x;
        const dy = body.position.y - spell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          targetBody = body;
        }
      }
    }

    // Steer toward target
    if (targetBody) {
      const dx = targetBody.position.x - spell.x;
      const dy = targetBody.position.y - spell.y;
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
    const prevX = spell.x;
    const prevY = spell.y;
    spell.x += spell.vx;
    spell.y += spell.vy;

    // Obstacle collision
    const hitObs = ctx.checkObstacleHit(spell.x, spell.y, spell.radius);
    if (hitObs) {
      // Damage destructible obstacles (breakable/explosive map obstacles)
      if (hitObs.hp !== undefined) {
        hitObs.hp -= (spell.damage || 1);
        if (hitObs.hp <= 0 && !hitObs.isTemporary) {
          if (hitObs.type === 'explosive') {
            ctx.handleObstacleExplosion(hitObs);
          }
          ctx.obstacleManager.queueDestroy(hitObs);
        }
      }
      if (spell.swarmState) delete spell.swarmState.targetAssignments[spell.id];
      spell.active = false;
      ctx.removeSpell(i);
      return 'continue';
    }

    // Player collision (swept test for fast missiles)
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (isIntangible(ctx, playerId)) continue;

      const combinedRadius = spell.radius + PLAYER.RADIUS;
      if (!sweepTestHit(prevX, prevY, spell.x, spell.y,
            body.position.x, body.position.y, combinedRadius)) {
        continue;
      }

      // Shield absorption
      if (tryShieldAbsorb(ctx, playerId, spell.ownerId, spell.damage, spell.knockbackForce)) {
        if (spell.swarmState) delete spell.swarmState.targetAssignments[spell.id];
        spell.active = false;
        ctx.removeSpell(i);
        return 'break';
      }

      {
        const dx = body.position.x - spell.x;
        const dy = body.position.y - spell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);

        // Swarm diminishing returns: each subsequent hit on same target decays KB
        let effectiveKB = spell.knockbackForce;
        if (spell.swarmState) {
          const hitIndex = spell.swarmState.hitCounts[playerId] || 0;
          effectiveKB *= Math.pow(SWARM_KB_DECAY, hitIndex);
          spell.swarmState.hitCounts[playerId] = hitIndex + 1;
        }

        ctx.physics.applyKnockback(playerId,
          nx * effectiveKB * kbMult,
          ny * effectiveKB * kbMult,
          ctx.getDamageTaken(playerId),
          spell.ownerId,
        );
        ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });

        // Explosion on impact (Warhead T2)
        if (spell.explosionRadius > 0) {
          ctx.handleExplosion(spell, body.position.x, body.position.y, playerId);
        }

        if (spell.swarmState) delete spell.swarmState.targetAssignments[spell.id];
        spell.active = false;
        ctx.removeSpell(i);
        return 'break';
      }
    }
  },
};
