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
        // T3 Rocketswarm: convergence on hit
        convergenceOnHit: stats.convergenceOnHit || false,
        // T3 Homing: dual missile merge
        dualMissile: stats.dualMissile || false,
        mergeExplosionRadius: stats.mergeExplosionRadius || 0,
        mergeExplosionForce: stats.mergeExplosionForce || 0,
        _dualState: null, // shared between the two dual missiles
      };

      ctx.activeSpells.push(spell);
      spells.push(spell);
    }

    // T3 Homing: dualMissile — spawn a second missile with mirrored angle
    if (stats.dualMissile && !isSwarm && spells.length === 1) {
      const dualState = { merged: false };
      spells[0]._dualState = dualState;

      const mirrorAngle = baseAngle - 0.5; // wide spread opposite direction
      const spell2 = {
        ...spells[0],
        id: ctx.nextSpellId(),
        angle: mirrorAngle,
        vx: Math.cos(mirrorAngle) * clampedSpeed,
        vy: Math.sin(mirrorAngle) * clampedSpeed,
        _dualState: dualState,
      };
      // Fix: first missile gets positive offset
      spells[0].angle = baseAngle + 0.5;
      spells[0].vx = Math.cos(baseAngle + 0.5) * clampedSpeed;
      spells[0].vy = Math.sin(baseAngle + 0.5) * clampedSpeed;

      dualState.ids = [spells[0].id, spell2.id];
      ctx.activeSpells.push(spell2);
      spells.push(spell2);
    }

    return spells.length === 1 ? spells[0] : spells;
  },

  update(ctx, spell, i) {
    // --- Target acquisition ---
    let targetBody = null;

    if (spell.swarmState) {
      // T3 Rocketswarm: convergence override — all missiles target the first-hit enemy
      if (spell.swarmState.convergeTarget) {
        const convergeBody = ctx.physics.playerBodies.get(spell.swarmState.convergeTarget);
        if (convergeBody && !ctx.isEliminated(spell.swarmState.convergeTarget)) {
          targetBody = convergeBody;
          // Skip normal distributed targeting
        }
      }

      if (!targetBody) {
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
      } // end if (!targetBody)
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

    // T3 Homing: dual missile merge detection
    if (spell._dualState && !spell._dualState.merged && spell.mergeExplosionRadius > 0) {
      const partnerId = spell._dualState.ids.find(id => id !== spell.id);
      const partner = ctx.activeSpells.find(s => s.id === partnerId && s.active);
      if (partner) {
        const mdx = partner.x - spell.x;
        const mdy = partner.y - spell.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        // Merge when close + past initial separation phase (elapsed > 500ms)
        if (mDist < 25 && spell.elapsed > 500) {
          spell._dualState.merged = true;
          const mergeX = (spell.x + partner.x) / 2;
          const mergeY = (spell.y + partner.y) / 2;
          // AoE explosion at merge point
          for (const [pid, pbody] of ctx.physics.playerBodies) {
            if (pid === spell.ownerId) continue;
            if (ctx.isEliminated(pid)) continue;
            if (isIntangible(ctx, pid)) continue;
            const edx = pbody.position.x - mergeX;
            const edy = pbody.position.y - mergeY;
            const eDist = Math.sqrt(edx * edx + edy * edy);
            if (eDist < spell.mergeExplosionRadius + PLAYER.RADIUS) {
              const enx = eDist > 0 ? edx / eDist : 0;
              const eny = eDist > 0 ? edy / eDist : 1;
              const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
              ctx.physics.applyKnockback(pid,
                enx * spell.mergeExplosionForce * kbMult,
                eny * spell.mergeExplosionForce * kbMult,
                ctx.getDamageTaken(pid), spell.ownerId,
              );
              ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: pid, damage: spell.damage * 2, spellId: spell.type });
            }
          }
          // Deactivate both missiles
          spell.active = false;
          partner.active = false;
          ctx.removeSpell(i);
          return 'continue';
        }
      }
    }

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

        // T3 Rocketswarm: on hit, all other missiles converge to this target
        if (spell.convergenceOnHit && spell.swarmState && !spell.swarmState.convergeTarget) {
          spell.swarmState.convergeTarget = playerId;
        }

        if (spell.swarmState) delete spell.swarmState.targetAssignments[spell.id];
        spell.active = false;
        ctx.removeSpell(i);
        return 'break';
      }
    }
  },
};
