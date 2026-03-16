import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';

const { Body } = Matter;

export const recallHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY) {
    const history = ctx.positionHistory.get(playerId);
    if (!history || history.length === 0) return null;

    const recallMs = stats.recallDuration || 3000;
    const now = Date.now();
    const targetTime = now - recallMs;

    // Find the position closest to targetTime
    let bestPos = history[0];
    for (const pos of history) {
      if (pos.time <= targetTime) {
        bestPos = pos;
      } else {
        break;
      }
    }

    if (!bestPos) return null;

    // Teleport player to recalled position
    const body = ctx.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: bestPos.x, y: bestPos.y });
      Body.setVelocity(body, { x: 0, y: 0 });
    }

    // Departure AoE push (T2: Temporal Rift)
    const departPushForce = stats.departurePushForce || 0;
    const departPushRadius = stats.departurePushRadius || 0;
    const hits = [];
    const departDamage = stats.departureDamage || 0;       // T3
    const departSlowAmt = stats.departureSlowAmount || 0;  // T3
    const departSlowDur = stats.departureSlowDuration || 0; // T3
    if (departPushForce > 0 && departPushRadius > 0) {
      const now2 = Date.now();
      for (const [id, pBody] of ctx.physics.playerBodies) {
        if (id === playerId) continue;
        if (ctx.isEliminated(id)) continue;
        if (isIntangible(ctx, id)) continue;
        const dx = pBody.position.x - originX;
        const dy = pBody.position.y - originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < departPushRadius) {
          if (tryShieldAbsorb(ctx, id, playerId, departDamage, departPushForce)) {
            continue;
          }
          const nx = dist > 0 ? dx / dist : 0;
          const ny = dist > 0 ? dy / dist : 1;
          const kbMult = ctx.getKnockbackMultiplier(playerId);
          ctx.physics.applyKnockback(id, nx * departPushForce * kbMult, ny * departPushForce * kbMult, ctx.getDamageTaken(id), playerId);
          hits.push({ id, damage: departDamage });
          // T3: slow enemies caught in departure blast
          if (departSlowAmt > 0 && departSlowDur > 0) {
            ctx.applyStatusEffect(id, 'slow', {
              amount: departSlowAmt,
              until: now2 + departSlowDur,
            }, spellId);
          }
        }
      }
    }

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.RECALL,
      ownerId: playerId,
      x: originX,
      y: originY,
      targetX: bestPos.x,
      targetY: bestPos.y,
      lifetime: 500,
      elapsed: 0,
      active: true,
      hits,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  // No update needed — recall is instant teleport
};
