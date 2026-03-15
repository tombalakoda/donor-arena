import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { isIntangible } from './defenseUtils.js';
import { sweepTestHit } from './collisionUtils.js';

const { Body } = Matter;

/**
 * Apply pendulum constraint to a single body relative to an anchor point.
 * Converts outward radial velocity into tangential (orbital) motion.
 *
 * @param {Body} body - Matter.js body to constrain
 * @param {number} anchorX - anchor point X
 * @param {number} anchorY - anchor point Y
 * @param {number} tetherLength - max allowed distance
 * @param {number} pullStrength - elastic pull-back force multiplier
 */
function applyTetherConstraint(body, anchorX, anchorY, tetherLength, pullStrength) {
  const dx = body.position.x - anchorX;
  const dy = body.position.y - anchorY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= tetherLength || dist === 0) return;

  // Radial unit vector (anchor → body)
  const radX = dx / dist;
  const radY = dy / dist;

  const vel = body.velocity;
  // radialComponent = dot(velocity, radialUnit)
  const radialDot = vel.x * radX + vel.y * radY;

  // Only intervene if moving OUTWARD (positive dot = away from anchor)
  if (radialDot > 0) {
    const tangX = vel.x - radialDot * radX;
    const tangY = vel.y - radialDot * radY;

    // Dampen radial (rope absorbs outward energy): keep 30%
    const dampedRadialX = radialDot * radX * 0.3;
    const dampedRadialY = radialDot * radY * 0.3;

    // Convert 70% of removed radial energy to tangential boost
    const tangMag = Math.sqrt(tangX * tangX + tangY * tangY);
    const energyTransfer = radialDot * 0.7;

    let newTangX = tangX;
    let newTangY = tangY;
    if (tangMag > 0.01) {
      const tangNx = tangX / tangMag;
      const tangNy = tangY / tangMag;
      newTangX = tangX + tangNx * energyTransfer;
      newTangY = tangY + tangNy * energyTransfer;
    } else {
      // No tangential direction — pick perpendicular to radial
      newTangX = -radY * energyTransfer;
      newTangY = radX * energyTransfer;
    }

    Body.setVelocity(body, {
      x: dampedRadialX + newTangX,
      y: dampedRadialY + newTangY,
    });
  }

  // Soft elastic pull toward anchor (proportional to overshoot)
  const overshoot = dist - tetherLength;
  const pullForce = overshoot * pullStrength;
  Body.applyForce(body, body.position, {
    x: -radX * pullForce,
    y: -radY * pullForce,
  });
}

/**
 * Apply drag constraint between two player bodies connected by a rope.
 * When the rope goes taut, the body moving away gets slowed and the
 * other body gets dragged along in the same direction.
 *
 * Unlike the pendulum constraint (for obstacles), this does NOT convert
 * radial energy to tangential. It simply transfers momentum — both
 * players move together like objects connected by a rope on ice.
 */
function applyDragConstraint(bodyA, bodyB, tetherLength, pullStrength) {
  const dx = bodyA.position.x - bodyB.position.x;
  const dy = bodyA.position.y - bodyB.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= tetherLength || dist === 0) return;

  // Rope axis unit vector (B → A)
  const axisX = dx / dist;
  const axisY = dy / dist;

  // Decompose each body's velocity along the rope axis
  const velA = bodyA.velocity;
  const velB = bodyB.velocity;
  const radialA = velA.x * axisX + velA.y * axisY; // positive = A moving away from B
  const radialB = velB.x * (-axisX) + velB.y * (-axisY); // positive = B moving away from A

  // Only intervene if they're moving apart (sum of outward radial > 0)
  const separatingSpeed = radialA + radialB;
  if (separatingSpeed > 0) {
    // Average the radial components — both share the momentum
    // A's outward velocity is reduced, B gets dragged in A's direction
    const avgRadial = (radialA - radialB) * 0.5;

    // A: reduce outward radial to averaged value
    const newRadialA = avgRadial * 0.5; // dampen further (rope absorbs some energy)
    const diffA = newRadialA - radialA;
    Body.setVelocity(bodyA, {
      x: velA.x + diffA * axisX,
      y: velA.y + diffA * axisY,
    });

    // B: add drag in A's direction (along the rope axis toward A)
    const dragB = Math.max(0, radialA) * 0.5; // B gets dragged by A's outward motion
    Body.setVelocity(bodyB, {
      x: velB.x + dragB * axisX,
      y: velB.y + dragB * axisY,
    });
  }

  // Elastic pull toward each other (proportional to overshoot)
  const overshoot = dist - tetherLength;
  const pullForce = overshoot * pullStrength;
  Body.applyForce(bodyA, bodyA.position, { x: -axisX * pullForce, y: -axisY * pullForce });
  Body.applyForce(bodyB, bodyB.position, { x: axisX * pullForce, y: axisY * pullForce });
}

/**
 * Tether handler — Kement (Lasso).
 *
 * Phase 1 (flight): projectile travels toward target direction.
 *   - Anchors to obstacle on contact (fixed anchor, only caster constrained).
 *   - Anchors to enemy player on contact (rope between two players, both constrained).
 *   - Fizzles (expires) if it reaches max range without hitting anything.
 * Phase 2 (tethered):
 *   - Obstacle anchor: pendulum physics (radial → tangential conversion, orbit).
 *   - Player anchor: drag physics (rope yanks the other player along).
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
      anchoredPlayerId: null, // non-null = rope between two players
      tetherLength: stats.tetherLength || 140,
      tetherDuration: stats.tetherDuration || 3500,
      pullStrength: stats.pullStrength || 0.002,
      maxRange: stats.range || 200,
      originX,
      originY,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    // ── Flight phase: move toward target, check obstacle/player/range ──
    if (spell.phase === 'flight') {
      const prevX = spell.x;
      const prevY = spell.y;
      spell.x += spell.vx;
      spell.y += spell.vy;

      // Check obstacle collision → fixed anchor (only caster constrained)
      const hitObs = ctx.checkObstacleHit(spell.x, spell.y, spell.radius);
      if (hitObs) {
        spell.anchorX = hitObs.x;
        spell.anchorY = hitObs.y;
        spell.anchoredPlayerId = null;
        spell.phase = 'tethered';
        spell.lifetime = spell.elapsed + spell.tetherDuration;
        spell.vx = 0;
        spell.vy = 0;
        return;
      }

      // Check player collision → rope between caster and hit player (swept test)
      for (const [playerId, body] of ctx.physics.playerBodies) {
        if (playerId === spell.ownerId) continue;
        if (ctx.isEliminated(playerId)) continue;
        if (isIntangible(ctx, playerId)) continue;
        const combinedRadius = spell.radius + PLAYER.RADIUS;
        if (sweepTestHit(prevX, prevY, spell.x, spell.y,
              body.position.x, body.position.y, combinedRadius)) {
          spell.anchoredPlayerId = playerId;
          spell.phase = 'tethered';
          spell.lifetime = spell.elapsed + spell.tetherDuration;
          spell.vx = 0;
          spell.vy = 0;
          return;
        }
      }

      // Max range reached without hitting anything → fizzle
      const travelDx = spell.x - spell.originX;
      const travelDy = spell.y - spell.originY;
      const travelDist = Math.sqrt(travelDx * travelDx + travelDy * travelDy);
      if (travelDist >= spell.maxRange) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }
      return;
    }

    // ── Tethered phase ──
    if (spell.phase === 'tethered') {
      const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
      if (!ownerBody || ctx.isEliminated(spell.ownerId)) {
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      if (spell.anchoredPlayerId) {
        // ── Player-to-player rope: both constrained ──
        const targetBody = ctx.physics.playerBodies.get(spell.anchoredPlayerId);
        if (!targetBody || ctx.isEliminated(spell.anchoredPlayerId)) {
          // Partner gone — rope snaps
          spell.active = false;
          ctx.removeSpell(i);
          return 'continue';
        }

        // Track positions for visual chain
        spell.x = ownerBody.position.x;
        spell.y = ownerBody.position.y;
        spell.anchorX = targetBody.position.x;
        spell.anchorY = targetBody.position.y;

        // Drag constraint: when rope goes taut, one drags the other
        applyDragConstraint(ownerBody, targetBody,
          spell.tetherLength, spell.pullStrength);

      } else {
        // ── Fixed obstacle anchor: only caster constrained ──
        spell.x = ownerBody.position.x;
        spell.y = ownerBody.position.y;

        applyTetherConstraint(ownerBody, spell.anchorX, spell.anchorY,
          spell.tetherLength, spell.pullStrength);
      }
    }
  },
};
