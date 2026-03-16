import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { isIntangible } from './defenseUtils.js';
import { sweepTestHit } from './collisionUtils.js';

// Speed curve multipliers (applied to base spell.speed)
const OUTBOUND_MAX_SPEED_MULT = 1.8;   // throw: fast start
const OUTBOUND_MIN_SPEED_MULT = 0.15;  // apex: near-zero pause
const RETURN_MIN_SPEED_MULT = 0.8;     // just after apex: already moving
const RETURN_MAX_SPEED_MULT = 3.0;     // arriving back: fast
const OVERSHOOT_MAX_SPEED_MULT = 4.5;  // overshoot: keeps accelerating past caster
const HIT_DEFLECT_BLEND = 0.45;        // how much velocity deflects on hit (0=none, 1=full bounce)
const HIT_SPEED_DECAY = 0.6;           // each hit reduces speed to 60% (first hit strong, subsequent weaker)

export const boomerangHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const clampedSpeed = ctx.clampSpeed(stats.speed);

    // Initial velocity uses the outbound max multiplier (fast throw)
    const initialSpeed = clampedSpeed * OUTBOUND_MAX_SPEED_MULT;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.BOOMERANG,
      ownerId: playerId,
      x: originX,
      y: originY,
      originX, originY,
      vx: nx * initialSpeed,
      vy: ny * initialSpeed,
      radius: stats.radius || 8,
      damage: stats.damage || 2,
      knockbackForce: stats.knockbackForce || 0.03,
      maxKnockbackForce: stats.maxKnockbackForce || 0.09,
      range: stats.range || 70,
      lifetime: stats.lifetime || 4000,
      elapsed: 0,
      active: true,
      returning: false,
      hitIds: [],
      hitsOnReturn: stats.hitsOnReturn || false,
      cooldownOnCatch: stats.cooldownOnCatch || 0,
      speed: clampedSpeed,
      maxDist: 0, // track max distance traveled (for KB scaling)
      overshootRange: stats.overshootRange || 200,
      passedCaster: false,
      casterPassX: 0,
      casterPassY: 0,
      returnDist: 0, // captured when entering return phase
      // T3: mark on hit + homing to marked
      markOnHit: stats.markOnHit || false,
      markDuration: stats.markDuration || 4000,
      homingToMarked: stats.homingToMarked || false,
      markedKbBonus: stats.markedKbBonus || 0,
      _markedTargets: new Map(), // playerId → markUntil timestamp
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    // --- Compute current speed based on phase and progress ---
    const dx = spell.x - spell.originX;
    const dy = spell.y - spell.originY;
    const distFromOrigin = Math.sqrt(dx * dx + dy * dy);
    spell.maxDist = Math.max(spell.maxDist, distFromOrigin);

    let currentSpeed;

    if (!spell.returning) {
      // === OUTBOUND: ease-out (fast throw → slow apex) ===
      const t = Math.min(1, distFromOrigin / spell.range);
      // t² curve: decelerates gradually then sharply near apex
      currentSpeed = spell.speed * (OUTBOUND_MAX_SPEED_MULT
        + (OUTBOUND_MIN_SPEED_MULT - OUTBOUND_MAX_SPEED_MULT) * (t * t));

      // Update direction with new speed (direction unchanged from spawn)
      const speed = Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy) || 1;
      spell.vx = (spell.vx / speed) * currentSpeed;
      spell.vy = (spell.vy / speed) * currentSpeed;

      // Check if should reverse
      if (distFromOrigin >= spell.range) {
        spell.returning = true;
        spell.hitIds = []; // Reset hit tracking for return trip if hitsOnReturn
        spell.returnDist = distFromOrigin;
      }
    } else if (!spell.passedCaster) {
      // === RETURN: ease-in (slow apex → fast arrival) ===
      const cx = spell.originX - spell.x;
      const cy = spell.originY - spell.y;
      const cDist = Math.sqrt(cx * cx + cy * cy) || 1;

      // t goes 0 (at apex) → 1 (at origin)
      const t = 1 - Math.min(1, cDist / (spell.returnDist || spell.range));
      // t^1.3 curve: ramps up quickly after apex, still accelerates toward origin
      currentSpeed = spell.speed * (RETURN_MIN_SPEED_MULT
        + (RETURN_MAX_SPEED_MULT - RETURN_MIN_SPEED_MULT) * Math.pow(t, 1.3));

      // T3: if homingToMarked, steer toward nearest marked target instead of origin
      let steerX = cx / cDist;
      let steerY = cy / cDist;
      if (spell.homingToMarked && spell._markedTargets.size > 0) {
        let nearestMarkedDist = Infinity;
        const { now } = ctx;
        for (const [mid, markUntil] of spell._markedTargets) {
          if (markUntil < now) { spell._markedTargets.delete(mid); continue; }
          if (spell.hitIds.includes(mid)) continue; // already hit this pass
          const mb = ctx.physics.playerBodies.get(mid);
          if (!mb || ctx.isEliminated(mid)) continue;
          const mdx = mb.position.x - spell.x;
          const mdy = mb.position.y - spell.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mDist < nearestMarkedDist) {
            nearestMarkedDist = mDist;
            steerX = mdx / (mDist || 1);
            steerY = mdy / (mDist || 1);
          }
        }
      }
      spell.vx = steerX * currentSpeed;
      spell.vy = steerY * currentSpeed;

      // Check if reached origin or will pass through this tick — don't overshoot
      if (cDist < spell.radius + 4 || cDist <= currentSpeed) {
        spell.passedCaster = true;
        spell.casterPassX = spell.originX;
        spell.casterPassY = spell.originY;
        // Reduce cooldown on catch (T2)
        if (spell.cooldownOnCatch) {
          const cd = ctx.cooldowns.get(spell.ownerId);
          if (cd && cd[spell.type]) {
            cd[spell.type] = Math.max(0, cd[spell.type] + spell.cooldownOnCatch);
          }
        }
        // Keep going — do NOT deactivate
      }
    } else {
      // === OVERSHOOT: keeps accelerating past caster ===
      const odx = spell.x - spell.casterPassX;
      const ody = spell.y - spell.casterPassY;
      const overshootDist = Math.sqrt(odx * odx + ody * ody);

      if (overshootDist >= spell.overshootRange) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      // Continue accelerating through overshoot (never slows down)
      const t = Math.min(1, overshootDist / spell.overshootRange);
      currentSpeed = spell.speed * (RETURN_MAX_SPEED_MULT
        + (OVERSHOOT_MAX_SPEED_MULT - RETURN_MAX_SPEED_MULT) * t);

      // Maintain direction, scale speed
      const speed = Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy) || 1;
      spell.vx = (spell.vx / speed) * currentSpeed;
      spell.vy = (spell.vy / speed) * currentSpeed;
    }

    // Apply movement
    const prevX = spell.x;
    const prevY = spell.y;
    spell.x += spell.vx;
    spell.y += spell.vy;

    // Player collision
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (spell.hitIds.includes(playerId)) continue; // Already hit this pass
      if (isIntangible(ctx, playerId)) continue;

      // Skip return hits if hitsOnReturn not enabled (but always hit during overshoot)
      if (spell.returning && !spell.passedCaster && !spell.hitsOnReturn) continue;

      const combinedRadius = spell.radius + PLAYER.RADIUS;
      if (!sweepTestHit(prevX, prevY, spell.x, spell.y,
            body.position.x, body.position.y, combinedRadius)) {
        continue;
      }

      {
        // Direction from spell to player (for KB direction)
        const pdx = body.position.x - spell.x;
        const pdy = body.position.y - spell.y;
        const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

        // KB scales with current speed — faster = harder hit
        const curSpd = Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy) || 1;
        const maxPossibleSpeed = spell.speed * OVERSHOOT_MAX_SPEED_MULT;
        const speedRatio = Math.min(1, curSpd / maxPossibleSpeed);
        let scaledKb = spell.knockbackForce + (spell.maxKnockbackForce - spell.knockbackForce) * speedRatio;

        // T3: bonus KB on marked targets
        if (spell.markedKbBonus > 0 && spell._markedTargets.has(playerId)) {
          scaledKb += spell.markedKbBonus;
        }

        const nx = pDist > 0 ? pdx / pDist : 0;
        const ny = pDist > 0 ? pdy / pDist : 1;
        const kbMult = ctx.getKnockbackMultiplier(spell.ownerId);
        ctx.physics.applyKnockback(playerId,
          nx * scaledKb * kbMult,
          ny * scaledKb * kbMult,
          ctx.getDamageTaken(playerId),
          spell.ownerId,
        );
        ctx.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
        spell.hitIds.push(playerId);

        // T3: mark hit enemy
        if (spell.markOnHit) {
          spell._markedTargets.set(playerId, ctx.now + spell.markDuration);
        }

        // Deflect velocity on hit — bounce away from player (reuse curSpd from KB calc above)
        const dirX = spell.vx / curSpd;
        const dirY = spell.vy / curSpd;
        const bounceX = -nx; // away from player
        const bounceY = -ny;
        const blendX = dirX * (1 - HIT_DEFLECT_BLEND) + bounceX * HIT_DEFLECT_BLEND;
        const blendY = dirY * (1 - HIT_DEFLECT_BLEND) + bounceY * HIT_DEFLECT_BLEND;
        const blendLen = Math.sqrt(blendX * blendX + blendY * blendY) || 1;
        const reducedSpeed = curSpd * HIT_SPEED_DECAY;
        spell.vx = (blendX / blendLen) * reducedSpeed;
        spell.vy = (blendY / blendLen) * reducedSpeed;

        // Safety: deactivate spell if velocity became NaN
        if (isNaN(spell.vx) || isNaN(spell.vy)) {
          spell.active = false;
          ctx.removeSpell(i);
          return 'continue';
        }

        // Deflect acts as the turning point — enter overshoot (coast & fade)
        // Only set overshoot origin on first hit; subsequent hits just deflect/slow
        if (!spell.passedCaster) {
          spell.returning = true;
          spell.passedCaster = true;
          spell.casterPassX = spell.x;
          spell.casterPassY = spell.y;
        }
      }
    }
  },
};
