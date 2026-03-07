import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';

// Speed curve multipliers (applied to base spell.speed)
const OUTBOUND_MAX_SPEED_MULT = 1.8;   // throw: fast start
const OUTBOUND_MIN_SPEED_MULT = 0.15;  // apex: near-zero pause
const RETURN_MIN_SPEED_MULT = 0.15;    // just after apex: slow
const RETURN_MAX_SPEED_MULT = 2.0;     // arriving back: fast
const OVERSHOOT_INITIAL_MULT = 1.6;    // passes caster with momentum

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
      // t² curve: starts slow, accelerates sharply toward origin
      currentSpeed = spell.speed * (RETURN_MIN_SPEED_MULT
        + (RETURN_MAX_SPEED_MULT - RETURN_MIN_SPEED_MULT) * (t * t));

      // Steer toward cast origin (fixed point, not caster's live position)
      spell.vx = (cx / cDist) * currentSpeed;
      spell.vy = (cy / cDist) * currentSpeed;

      // Check if reached origin — pass through, don't stop
      if (cDist < spell.radius + 4) {
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
      // === OVERSHOOT: linear deceleration → stop ===
      const odx = spell.x - spell.casterPassX;
      const ody = spell.y - spell.casterPassY;
      const overshootDist = Math.sqrt(odx * odx + ody * ody);

      const t = Math.min(1, overshootDist / spell.overshootRange);
      currentSpeed = spell.speed * OVERSHOOT_INITIAL_MULT * (1 - t);

      if (overshootDist >= spell.overshootRange || currentSpeed < 0.1) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      // Maintain direction, scale speed
      const speed = Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy) || 1;
      spell.vx = (spell.vx / speed) * currentSpeed;
      spell.vy = (spell.vy / speed) * currentSpeed;
    }

    // Apply movement
    spell.x += spell.vx;
    spell.y += spell.vy;

    // Player collision
    for (const [playerId, body] of ctx.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (ctx.isEliminated(playerId)) continue;
      if (spell.hitIds.includes(playerId)) continue; // Already hit this pass
      const targetEffects = ctx.statusEffects.get(playerId);
      if (targetEffects && targetEffects.intangible) continue;

      // Skip return hits if hitsOnReturn not enabled (but always hit during overshoot)
      if (spell.returning && !spell.passedCaster && !spell.hitsOnReturn) continue;

      const pdx = body.position.x - spell.x;
      const pdy = body.position.y - spell.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pDist < spell.radius + PLAYER.RADIUS) {
        // KB scales with distance traveled
        const distRatio = spell.maxDist / (spell.range || 70);
        const scaledKb = spell.knockbackForce + (spell.maxKnockbackForce - spell.knockbackForce) * Math.min(1, distRatio);

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
      }
    }
  },
};
