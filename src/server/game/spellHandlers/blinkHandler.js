import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { getPassive } from '../../../shared/characterPassives.js';
import { isIntangible } from './defenseUtils.js';

const { Body } = Matter;

export const blinkHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const blinkPassive = getPassive(ctx.getCharacterId(playerId));
    const maxRange = (stats.range || 200) * (1 + (blinkPassive.mobilityRangeBonus || 0));
    const blinkDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;

    const destX = originX + nx * blinkDist;
    const destY = originY + ny * blinkDist;

    const body = ctx.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
    }

    // T3: Arrival AoE push at destination
    const arrivalHits = [];
    const arrivalForce = stats.arrivalPushForce || 0;
    const arrivalRadius = stats.arrivalPushRadius || 0;
    if (arrivalForce > 0 && arrivalRadius > 0) {
      for (const [id, pBody] of ctx.physics.playerBodies) {
        if (id === playerId) continue;
        if (ctx.isEliminated(id)) continue;
        if (isIntangible(ctx, id)) continue;
        const adx = pBody.position.x - destX;
        const ady = pBody.position.y - destY;
        const aDist = Math.sqrt(adx * adx + ady * ady);
        if (aDist < arrivalRadius + PLAYER.RADIUS) {
          const anx = aDist > 0 ? adx / aDist : 0;
          const any = aDist > 0 ? ady / aDist : 1;
          const kbMult = ctx.getKnockbackMultiplier(playerId);
          ctx.physics.applyKnockback(id, anx * arrivalForce * kbMult, any * arrivalForce * kbMult, ctx.getDamageTaken(id), playerId);
          arrivalHits.push(id);
        }
      }
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
      lifetime: stats.leaveDecoy ? 2000 : 300, // T3: decoy lasts longer
      elapsed: 0,
      active: true,
      leaveDecoy: stats.leaveDecoy || false,    // T3: leave visual decoy at origin
      arrivalHits,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  // No update needed — blink is instant, spell exists only for client visual
};
