import { SPELL_TYPES } from '../../../shared/spellData.js';

export const wallHandler = {
  spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY) {
    // Clamp placement within cast range
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRange = stats.range || 200;
    const placeDist = Math.min(dist, maxRange);
    const placeX = originX + (dx / (dist || 1)) * placeDist;
    const placeY = originY + (dy / (dist || 1)) * placeDist;

    const wallRadius = stats.wallRadius || 22;
    const hp = stats.wallHp || 30;

    // Create a temporary Matter.js obstacle — player collision is automatic
    const obstacle = ctx.obstacleManager.addTemporary(placeX, placeY, wallRadius, {
      hp,
      maxHp: hp,
      ownerId: playerId,
    });

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.WALL,
      ownerId: playerId,
      x: placeX,
      y: placeY,
      wallRadius,
      lifetime: stats.wallDuration || 4000,
      elapsed: 0,
      active: true,
      obstacle,
      // Shatter effect (T2)
      shatterSlowAmount: stats.shatterSlowAmount || 0,
      shatterSlowDuration: stats.shatterSlowDuration || 0,
      shatterRadius: stats.shatterRadius || 0,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    // Check wall HP (tracked on the obstacle object)
    if (spell.obstacle.hp <= 0) {
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

    // Player collision is handled automatically by Matter.js — no manual push needed
  },
};
