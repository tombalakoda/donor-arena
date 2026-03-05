import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';

const { Body } = Matter;

export const wallHandler = {
  spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY) {
    // Wall angle: perpendicular to cast direction
    const dx = targetX - originX;
    const dy = targetY - originY;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;

    // Clamp placement within cast range
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRange = stats.range || 200;
    const placeDist = Math.min(dist, maxRange);
    const placeX = originX + (dx / (dist || 1)) * placeDist;
    const placeY = originY + (dy / (dist || 1)) * placeDist;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.WALL,
      ownerId: playerId,
      x: placeX,
      y: placeY,
      angle,
      wallWidth: stats.wallWidth || 80,
      wallThickness: stats.wallThickness || 16,
      wallHp: stats.wallHp || 30,
      maxWallHp: stats.wallHp || 30,
      lifetime: stats.wallDuration || 4000,
      elapsed: 0,
      active: true,
      // Shatter effect (T2)
      shatterSlowAmount: stats.shatterSlowAmount || 0,
      shatterSlowDuration: stats.shatterSlowDuration || 0,
      shatterRadius: stats.shatterRadius || 0,
    };

    ctx.activeSpells.push(spell);
    ctx.activeWalls.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    // Check wall HP
    if (spell.wallHp <= 0) {
      // Wall destroyed — shatter effect
      if (spell.shatterRadius > 0) {
        for (const [playerId, body] of ctx.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (ctx.isEliminated(playerId)) continue;
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < spell.shatterRadius) {
            ctx.applyStatusEffect(playerId, 'slow', {
              amount: spell.shatterSlowAmount,
              until: now + spell.shatterSlowDuration,
            }, spell.type);
          }
        }
      }
      ctx.cleanupSpell(spell);
      ctx.removeSpell(i);
      return 'continue';
    }

    // Wall blocks player movement (push players out of wall bounds)
    for (const [playerId, body] of ctx.physics.playerBodies) {
      const dx = body.position.x - spell.x;
      const dy = body.position.y - spell.y;
      const cos = Math.cos(-spell.angle);
      const sin = Math.sin(-spell.angle);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      const hw = (spell.wallWidth || 80) / 2 + PLAYER.RADIUS;
      const ht = (spell.wallThickness || 16) / 2 + PLAYER.RADIUS;
      if (Math.abs(lx) < hw && Math.abs(ly) < ht) {
        // Push player out along shortest exit axis
        const overlapX = hw - Math.abs(lx);
        const overlapY = ht - Math.abs(ly);
        if (overlapX < overlapY) {
          const pushLx = Math.sign(lx) * hw;
          const cosR = Math.cos(spell.angle);
          const sinR = Math.sin(spell.angle);
          const pushX = pushLx * cosR - ly * sinR + spell.x;
          Body.setPosition(body, { x: pushX, y: body.position.y });
        } else {
          const pushLy = Math.sign(ly) * ht;
          const cosR = Math.cos(spell.angle);
          const sinR = Math.sin(spell.angle);
          const pushY = lx * sinR + pushLy * cosR + spell.y;
          Body.setPosition(body, { x: body.position.x, y: pushY });
        }
      }
    }
  },
};
