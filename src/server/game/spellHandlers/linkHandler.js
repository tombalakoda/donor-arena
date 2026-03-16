import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';
import { isIntangible, tryShieldAbsorb } from './defenseUtils.js';
import { sweepTestHit } from './collisionUtils.js';

/**
 * Link handler — Rabıta (Bond/Shared KB).
 *
 * Phase 1 (flight): projectile travels toward target.
 * Phase 2 (linked): on hit, both caster and target are linked for linkDuration.
 *   Any knockback either player receives is also applied to the other.
 */
export const linkHandler = {
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
      spellType: SPELL_TYPES.LINK,
      ownerId: playerId,
      x: originX,
      y: originY,
      vx: nx * clampedSpeed,
      vy: ny * clampedSpeed,
      radius: stats.radius || 7,
      damage: stats.damage || 2,
      knockbackForce: stats.knockbackForce || 0,
      lifetime: stats.lifetime || 1500,
      elapsed: 0,
      active: true,
      // Link-specific
      phase: 'flight',
      linkDuration: stats.linkDuration || 4000,
      linkedKbMultiplier: stats.linkedKbMultiplier || 0,
      linkForwardKb: stats.linkForwardKb || 0.003,
      linkedPlayerId: null,
      linkedX: 0,
      linkedY: 0,
      // T3: KB transfer ratio (caster KB → linked enemy) & linked slow
      kbTransfer: stats.kbTransfer || 0,
      linkedSlowAmount: stats.linkedSlowAmount || 0,
      // KB tracking — timestamps to detect new KB events
      lastKbUntilOwner: 0,
      lastKbUntilTarget: 0,
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    // ── Flight phase: move projectile, check for hit ──
    if (spell.phase === 'flight') {
      const prevX = spell.x;
      const prevY = spell.y;
      spell.x += spell.vx;
      spell.y += spell.vy;

      // Check player collision (swept test)
      for (const [playerId, body] of ctx.physics.playerBodies) {
        if (playerId === spell.ownerId) continue;
        if (ctx.isEliminated(playerId)) continue;
        if (isIntangible(ctx, playerId)) continue;

        const combinedRadius = spell.radius + PLAYER.RADIUS;
        if (!sweepTestHit(prevX, prevY, spell.x, spell.y,
              body.position.x, body.position.y, combinedRadius)) {
          continue;
        }

        if (tryShieldAbsorb(ctx, playerId, spell.ownerId, spell.damage, spell.knockbackForce)) {
          spell.active = false;
          ctx.removeSpell(i);
          return 'break';
        }

        {
          // Hit! Transition to linked phase
          spell.phase = 'linked';
          spell.linkedPlayerId = playerId;
          spell.lifetime = spell.elapsed + spell.linkDuration;

          // Apply damage
          if (spell.damage > 0) {
            ctx.pendingHits.push({
              attackerId: spell.ownerId,
              targetId: playerId,
              damage: spell.damage,
              spellId: spell.type,
            });
          }

          // Set linked status effect on BOTH players
          const linkUntil = now + spell.linkDuration;
          const ownerEffects = ctx.statusEffects.get(spell.ownerId);
          if (ownerEffects) {
            ownerEffects.linked = {
              partnerId: playerId,
              until: linkUntil,
              kbMultiplier: 0, // owner gets base KB forwarding
            };
          }
          const targetEffects = ctx.statusEffects.get(playerId);
          if (targetEffects) {
            targetEffects.linked = {
              partnerId: spell.ownerId,
              until: linkUntil,
              kbMultiplier: spell.linkedKbMultiplier, // target may get extra KB
            };
          }

          // Initialize KB tracking
          spell.lastKbUntilOwner = ctx.physics.knockbackUntil.get(spell.ownerId) || 0;
          spell.lastKbUntilTarget = ctx.physics.knockbackUntil.get(playerId) || 0;

          // Stop projectile movement
          spell.vx = 0;
          spell.vy = 0;
          return 'break';
        }
      }
      return;
    }

    // ── Linked phase: track positions + forward knockback ──
    if (spell.phase === 'linked') {
      const ownerBody = ctx.physics.playerBodies.get(spell.ownerId);
      const targetBody = ctx.physics.playerBodies.get(spell.linkedPlayerId);

      // If either player is gone, end the link
      if (!ownerBody || !targetBody ||
          ctx.isEliminated(spell.ownerId) || ctx.isEliminated(spell.linkedPlayerId)) {
        // Clean up linked effects
        const oe = ctx.statusEffects.get(spell.ownerId);
        if (oe && oe.linked) delete oe.linked;
        const te = ctx.statusEffects.get(spell.linkedPlayerId);
        if (te && te.linked) delete te.linked;
        spell.active = false;
        ctx.removeSpell(i);
        return 'continue';
      }

      // Track positions for visual chain
      spell.x = ownerBody.position.x;
      spell.y = ownerBody.position.y;
      spell.linkedX = targetBody.position.x;
      spell.linkedY = targetBody.position.y;

      // ── KB forwarding ──
      // Detect if either player received new knockback this tick.
      // Uses a fixed force (linkForwardKb) instead of reading velocity,
      // which would escalate across ticks. Direction comes from the
      // original attacker via lastKnockbackFrom.
      // After forwarding, we update the partner's lastKbUntil so our
      // own applyKnockback call doesn't re-trigger on the next tick.
      const currentKbOwner = ctx.physics.knockbackUntil.get(spell.ownerId) || 0;
      const currentKbTarget = ctx.physics.knockbackUntil.get(spell.linkedPlayerId) || 0;

      // T3: continuous slow on linked enemy
      if (spell.linkedSlowAmount > 0) {
        ctx.applyStatusEffect(spell.linkedPlayerId, 'slow', {
          amount: spell.linkedSlowAmount,
          until: now + 200, // refreshed every tick
        }, spell.type);
      }

      // Owner got hit → forward to target
      if (currentKbOwner > spell.lastKbUntilOwner) {
        const kbInfo = ctx.physics.lastKnockbackFrom.get(spell.ownerId);
        if (kbInfo) {
          // Direction: away from attacker toward recipient.
          // If the attacker is the recipient themselves (caster hit their own
          // linked target), fall back to pushing along the link axis.
          const attackerBody = ctx.physics.playerBodies.get(kbInfo.attackerId);
          let nx = 0, ny = 1;
          if (attackerBody && kbInfo.attackerId !== spell.linkedPlayerId) {
            const adx = targetBody.position.x - attackerBody.position.x;
            const ady = targetBody.position.y - attackerBody.position.y;
            const aDist = Math.sqrt(adx * adx + ady * ady) || 1;
            nx = adx / aDist;
            ny = ady / aDist;
          } else {
            // Attacker is the recipient or unknown — push away from partner (along link axis)
            const ldx = targetBody.position.x - ownerBody.position.x;
            const ldy = targetBody.position.y - ownerBody.position.y;
            const lDist = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
            nx = ldx / lDist;
            ny = ldy / lDist;
          }
          // T3: kbTransfer adds a fraction of the ACTUAL KB to the linked enemy
          const transferMult = spell.kbTransfer || 0;
          const mult = 1 + (spell.linkedKbMultiplier || 0);
          const force = spell.linkForwardKb * mult + (kbInfo.magnitude || 0) * transferMult;
          ctx.physics.applyKnockback(spell.linkedPlayerId,
            nx * force, ny * force,
            ctx.getDamageTaken(spell.linkedPlayerId),
            spell.ownerId,
          );
          // Record partner's new KB timestamp so it doesn't re-trigger
          spell.lastKbUntilTarget = ctx.physics.knockbackUntil.get(spell.linkedPlayerId) || 0;
        }
      }

      // Target got hit → forward to owner
      if (currentKbTarget > spell.lastKbUntilTarget) {
        const kbInfo = ctx.physics.lastKnockbackFrom.get(spell.linkedPlayerId);
        if (kbInfo) {
          const attackerBody = ctx.physics.playerBodies.get(kbInfo.attackerId);
          let nx = 0, ny = 1;
          if (attackerBody && kbInfo.attackerId !== spell.ownerId) {
            const adx = ownerBody.position.x - attackerBody.position.x;
            const ady = ownerBody.position.y - attackerBody.position.y;
            const aDist = Math.sqrt(adx * adx + ady * ady) || 1;
            nx = adx / aDist;
            ny = ady / aDist;
          } else {
            // Attacker is the recipient or unknown — push away from partner (along link axis)
            const ldx = ownerBody.position.x - targetBody.position.x;
            const ldy = ownerBody.position.y - targetBody.position.y;
            const lDist = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
            nx = ldx / lDist;
            ny = ldy / lDist;
          }
          const force = spell.linkForwardKb; // owner gets base forwarding (no multiplier)
          ctx.physics.applyKnockback(spell.ownerId,
            nx * force, ny * force,
            ctx.getDamageTaken(spell.ownerId),
            spell.linkedPlayerId,
          );
          spell.lastKbUntilOwner = ctx.physics.knockbackUntil.get(spell.ownerId) || 0;
        }
      }

      // Update baselines (use Math.max to preserve any mid-tick updates from forwarding)
      spell.lastKbUntilOwner = Math.max(spell.lastKbUntilOwner, currentKbOwner);
      spell.lastKbUntilTarget = Math.max(spell.lastKbUntilTarget, currentKbTarget);
    }
  },
};
