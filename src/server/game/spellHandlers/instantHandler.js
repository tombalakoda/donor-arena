import { SPELL_TYPES } from '../../../shared/spellData.js';

export const instantHandler = {
  spawn(ctx, playerId, spellId, stats, originX, originY) {
    const hits = [];
    const chainCount = stats.chainCount || 0;
    const chainKbFactor = stats.chainKbFactor || 0.5;

    // Find enemies in range, sorted by distance
    const targets = [];
    for (const [id, body] of ctx.physics.playerBodies) {
      if (id === playerId) continue;
      if (ctx.isEliminated(id)) continue;
      const targetEffects = ctx.statusEffects.get(id);
      if (targetEffects && targetEffects.intangible) continue;
      const dx = body.position.x - originX;
      const dy = body.position.y - originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = stats.radius || 120;

      if (dist < radius) {
        targets.push({ id, body, dx, dy, dist });
      }
    }

    // Sort by distance (closest first)
    targets.sort((a, b) => a.dist - b.dist);

    // Hit ALL targets in range at full power
    const kbMult = ctx.getKnockbackMultiplier(playerId);
    for (const t of targets) {
      // Shield absorption — skip this target if shielded
      const tEffects = ctx.statusEffects.get(t.id);
      if (tEffects && tEffects.shield && tEffects.shield.hitsRemaining > 0) {
        tEffects.shield.hitsRemaining--;
        tEffects.shield.lastHitData = {
          attackerId: playerId,
          damage: stats.damage || 3,
          knockbackForce: stats.knockbackForce || 0.03,
        };
        continue;
      }
      const nx = t.dist > 0 ? t.dx / t.dist : 0;
      const ny = t.dist > 0 ? t.dy / t.dist : 1;
      const force = (stats.knockbackForce || 0.03) * kbMult;
      ctx.physics.applyKnockback(t.id, nx * force, ny * force, ctx.getDamageTaken(t.id), playerId);
      hits.push({ id: t.id, damage: stats.damage || 3 });
    }

    const spell = {
      id: ctx.nextSpellId(),
      type: spellId,
      spellType: SPELL_TYPES.INSTANT,
      ownerId: playerId,
      x: originX,
      y: originY,
      radius: stats.radius || 120,
      lifetime: 500,
      elapsed: 0,
      active: true,
      hits,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  // No update needed — instant spells resolve immediately
};
