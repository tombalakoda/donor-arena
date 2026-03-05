import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { getPassive } from '../../../shared/characterPassives.js';

const { Body } = Matter;

export const blinkHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const blinkPassive = getPassive(ctx.getCharacterId(playerId));
    const maxRange = (stats.range || 200) * (1 + (blinkPassive.blinkRangeBonus || 0));
    const blinkDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;

    const destX = originX + nx * blinkDist;
    const destY = originY + ny * blinkDist;

    const body = ctx.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
    }

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.BLINK,
      ownerId: playerId,
      x: originX,
      y: originY,
      targetX: destX,
      targetY: destY,
      lifetime: 300,
      elapsed: 0,
      active: true,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  // No update needed — blink is instant, spell exists only for client visual
};
