import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';

const { Body } = Matter;

/**
 * Tether handler — Kement (Lasso).
 *
 * Phase 1 (flight): projectile travels toward target direction.
 *   - Anchors to obstacle on contact, or ground at max range.
 * Phase 2 (tethered): pendulum physics.
 *   - Player is tethered to anchor point.
 *   - KB is converted from radial (away from anchor) to tangential (orbit).
 *   - Soft elastic pull-back if player exceeds tether length.
 */
export const tetherHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const clampedSpeed = ctx.clampSpeed(stats.speed);

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.TETHER,
      ownerId: playerId,
      x: originX,
      y: originY,
      vx: nx * clampedSpeed,
      vy: ny * clampedSpeed,
      radius: stats.radius || 8,
      lifetime: stats.lifetime || 1500,
      elapsed: 0,
      active: true,
      // Tether-specific
      phase: 'flight',
      anchorX: 0,
      anchorY: 0,
      tetherLength: stats.tetherLength || 140,
      tetherDuration: stats.tetherDuration || 3500,
      pullStrength: stats.pullStrength || 0.002,
      tetherElapsed: 0,
      // Direction for max range fallback
      dirX: nx,
      dirY: ny,
      maxRange: stats.range || 200,
      originX,
      originY,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    // ── Flight phase: move toward target, check obstacle/range ──
    if (spell.phase === 'flight') {
      spell.x += spell.vx;
      spell.y += spell.vy;

      // Check obstacle collision → anchor to obstacle
      const hitObs = ctx.checkObstacleHit(spell.x, spell.y, spell.radius);
      if (hitObs) {
        spell.anchorX = hitObs.x;
        spell.anchorY = hitObs.y;
        spell.phase = 'tethered';
        spell.lifetime = spell.elapsed + spell.tetherDuration;
        spell.vx = 0;
        spell.vy = 0;
        return;
      }

      // Check max range → anchor to ground
      const travelDx = spell.x - spell.originX;
      const travelDy = spell.y - spell.originY;
      const travelDist = Math.sqrt(travelDx * travelDx + travelDy * travelDy);
      if (travelDist >= spell.maxRange) {
        spell.anchorX = spell.originX + spell.dirX * spell.maxRange;
        spell.anchorY = spell.originY + spell.dirY * spell.maxRange;
        spell.phase = 'tethered';
        spell.lifetime = spell.elapsed + spell.tetherDuration;
        spell.vx = 0;
        spell.vy = 0;
        return;
      }
      return;
    }

    // ── Tethered phase: pendulum swing physics ──
    if (spell.phase === 'tethered') {
      const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
      if (!ownerBody || ctx.isEliminated(spell.ownerId)) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      // Track spell position at owner for visual chain endpoint
      spell.x = ownerBody.position.x;
      spell.y = ownerBody.position.y;

      // Calculate distance from owner to anchor
      const dx = ownerBody.position.x - spell.anchorX;
      const dy = ownerBody.position.y - spell.anchorY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > spell.tetherLength && dist > 0) {
        // Radial unit vector (anchor → player)
        const radX = dx / dist;
        const radY = dy / dist;

        // Current velocity
        const vel = ownerBody.velocity;

        // Decompose velocity into radial and tangential components
        // radialComponent = dot(velocity, radialUnit)
        const radialDot = vel.x * radX + vel.y * radY;

        // Only intervene if radial component is OUTWARD (positive dot = moving away from anchor)
        if (radialDot > 0) {
          // Tangential component = velocity - radial * radialUnit
          const tangX = vel.x - radialDot * radX;
          const tangY = vel.y - radialDot * radY;

          // Dampen radial (rope absorbs outward energy): keep 30%
          const dampedRadialX = radialDot * radX * 0.3;
          const dampedRadialY = radialDot * radY * 0.3;

          // Boost tangential with converted energy
          // Add 70% of the removed radial energy as tangential boost
          const tangMag = Math.sqrt(tangX * tangX + tangY * tangY);
          const energyTransfer = radialDot * 0.7;

          let newTangX = tangX;
          let newTangY = tangY;
          if (tangMag > 0.01) {
            // Boost existing tangential direction
            const tangNx = tangX / tangMag;
            const tangNy = tangY / tangMag;
            newTangX = tangX + tangNx * energyTransfer;
            newTangY = tangY + tangNy * energyTransfer;
          } else {
            // No tangential direction — pick perpendicular to radial
            // Choose the perpendicular that matches the cross product sign
            newTangX = -radY * energyTransfer;
            newTangY = radX * energyTransfer;
          }

          // Final velocity = dampened radial + boosted tangential
          Body.setVelocity(ownerBody, {
            x: dampedRadialX + newTangX,
            y: dampedRadialY + newTangY,
          });
        }

        // Soft elastic pull toward anchor (proportional to overshoot)
        const overshoot = dist - spell.tetherLength;
        const pullForce = overshoot * spell.pullStrength;
        Body.applyForce(ownerBody, ownerBody.position, {
          x: -radX * pullForce,
          y: -radY * pullForce,
        });
      }
    }
  },
};
