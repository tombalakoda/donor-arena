import { SPELL_TYPES } from '../../../shared/spellData.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';

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
      if (isIntangible(ctx, id)) continue;
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
    let kbMult = ctx.getKnockbackMultiplier(playerId);
    const attackerItems = ctx.getItemStats(playerId);
    if (attackerItems) {
      // KB bonus vs slowed targets (Santur + Buzul Hazine)
      // Applied per-target below
    }

    const hitIds = new Set();
    for (const t of targets) {
      if (tryShieldAbsorb(ctx, t.id, playerId, stats.damage || 3, stats.knockbackForce || 0.03)) {
        continue;
      }
      const nx = t.dist > 0 ? t.dx / t.dist : 0;
      const ny = t.dist > 0 ? t.dy / t.dist : 1;
      let targetKbMult = kbMult;

      // Per-target item KB modifiers
      if (attackerItems) {
        if (attackerItems.kbBonusVsSlowed > 0) {
          const tEffects = ctx.statusEffects.get(t.id);
          if (tEffects && tEffects.slow) {
            targetKbMult *= (1 + attackerItems.kbBonusVsSlowed);
          }
        }
      }

      const force = (stats.knockbackForce || 0.03) * targetKbMult;
      ctx.physics.applyKnockback(t.id, nx * force, ny * force, ctx.getDamageTaken(t.id), playerId);
      hits.push({ id: t.id, damage: stats.damage || 3 });
      hitIds.add(t.id);
    }

    // T3: Chain to additional targets from each hit player
    const chainRadiusGrowth = stats.chainRadiusGrowth || 0;
    if (chainCount > 0 && hitIds.size > 0) {
      let chainSources = [...hitIds];
      let chainRadius = (stats.radius || 120) + chainRadiusGrowth;
      let chainKb = (stats.knockbackForce || 0.03) * chainKbFactor;
      for (let c = 0; c < chainCount; c++) {
        const newSources = [];
        for (const srcId of chainSources) {
          const srcBody = ctx.physics.playerBodies.get(srcId);
          if (!srcBody) continue;
          for (const [id, body] of ctx.physics.playerBodies) {
            if (id === playerId || hitIds.has(id)) continue;
            if (ctx.isEliminated(id)) continue;
            if (isIntangible(ctx, id)) continue;
            const cdx = body.position.x - srcBody.position.x;
            const cdy = body.position.y - srcBody.position.y;
            const cDist = Math.sqrt(cdx * cdx + cdy * cdy);
            if (cDist < chainRadius) {
              const cnx = cDist > 0 ? cdx / cDist : 0;
              const cny = cDist > 0 ? cdy / cDist : 1;
              ctx.physics.applyKnockback(id, cnx * chainKb * kbMult, cny * chainKb * kbMult, ctx.getDamageTaken(id), playerId);
              hits.push({ id, damage: stats.damage || 3 });
              hitIds.add(id);
              newSources.push(id);
            }
          }
        }
        chainSources = newSources;
        chainRadius += chainRadiusGrowth;
        chainKb *= chainKbFactor;
        if (chainSources.length === 0) break;
      }
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
