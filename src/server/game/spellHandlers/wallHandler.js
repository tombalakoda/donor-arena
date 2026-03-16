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
    const wallCount = stats.wallCount || 1;
    const wallSpread = stats.wallFormationSpread || 35;

    // T3: place multiple walls in perpendicular formation
    const spells = [];
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    // Perpendicular direction for formation spread
    const perpX = -ny;
    const perpY = nx;

    for (let w = 0; w < wallCount; w++) {
      let wx = placeX;
      let wy = placeY;
      if (wallCount > 1) {
        const offset = (w - (wallCount - 1) / 2) * wallSpread;
        wx += perpX * offset;
        wy += perpY * offset;
      }

      const obstacle = ctx.obstacleManager.addTemporary(wx, wy, wallRadius, {
        hp,
        maxHp: hp,
        ownerId: playerId,
      });

      const spell = {
        id: ctx.nextSpellId(),
        type: spellId,
        spellType: SPELL_TYPES.WALL,
        ownerId: playerId,
        x: wx,
        y: wy,
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
      spells.push(spell);
    }

    return spells.length === 1 ? spells[0] : spells;
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
