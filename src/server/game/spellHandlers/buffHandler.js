import { SPELL_TYPES } from '../../../shared/spellData.js';

export const buffHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY) {
    const now = Date.now();
    const effects = ctx.statusEffects.get(playerId);
    if (!effects) return null;

    const duration = stats.buffDuration || 2000;

    // Apply buff based on spell type
    if (stats.speedBoost) {
      effects.speedBoost = {
        amount: stats.speedBoost,
        until: now + duration,
        frictionReduction: stats.frictionReduction || 0,
      };
    }

    if (stats.intangible) {
      effects.intangible = {
        until: now + duration,
        speedBoost: stats.speedBoost || 0,
        // On-exit AoE push (Ghost T2: Poltergeist)
        exitPushForce: stats.exitPushForce || 0,
        exitPushRadius: stats.exitPushRadius || 0,
        ownerId: playerId,
      };
    }

    if (stats.shieldHits) {
      effects.shield = {
        hitsRemaining: stats.shieldHits,
        until: now + duration,
        reflectOnBreak: stats.reflectOnBreak || false,
        lastHitData: null, // stores last absorbed hit for reflect
        ownerId: playerId,
      };
    }

    // Flash trail (T2: Blazing Trail)
    const leaveTrail = stats.leaveTrail || false;

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.BUFF,
      ownerId: playerId,
      x: originX,
      y: originY,
      lifetime: duration + 100,
      elapsed: 0,
      active: true,
      buffType: stats.intangible ? 'ghost' : stats.shieldHits ? 'shield' : 'flash',
      leaveTrail,
      trailSlowAmount: stats.trailSlowAmount || 0,
      trailSlowDuration: stats.trailSlowDuration || 0,
      trailPositions: leaveTrail ? [] : null,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
    // Always update buff position for client rendering (all buff types)
    if (ownerBody) {
      spell.x = ownerBody.position.x;
      spell.y = ownerBody.position.y;
    }
    // Flash trail logic (only for trail-enabled buffs)
    if (spell.leaveTrail && spell.trailPositions && ownerBody) {
      spell.trailPositions.push({ x: ownerBody.position.x, y: ownerBody.position.y, time: now });
      // Clean old trail positions (older than trail slow duration)
      const trailTimeout = spell.trailSlowDuration || 1500;
      while (spell.trailPositions.length > 0 && spell.trailPositions[0].time < now - trailTimeout) {
        spell.trailPositions.shift();
      }
      // Check enemies crossing trail
      if (spell.trailSlowAmount > 0) {
        for (const [playerId, body] of ctx.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (ctx.isEliminated(playerId)) continue;
          for (const tp of spell.trailPositions) {
            const dx = body.position.x - tp.x;
            const dy = body.position.y - tp.y;
            if (dx * dx + dy * dy < 20 * 20) { // 20px trail width
              ctx.applyStatusEffect(playerId, 'slow', {
                amount: spell.trailSlowAmount,
                until: now + 500,
              }, spell.type);
              break;
            }
          }
        }
      }
    }
  },
};
