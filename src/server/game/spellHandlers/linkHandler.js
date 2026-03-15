import Matter from 'matter-js';
import { SPELL_TYPES } from '../../../shared/spellData.js';
import { PLAYER } from '../../../shared/constants.js';

const { Body } = Matter;

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
      linkedPlayerId: null,
      linkedX: 0,
      linkedY: 0,
      // KB tracking for forwarding
      lastKbUntilOwner: 0,
      lastKbUntilTarget: 0,
      linkKbGuard: false, // prevents infinite recursion
    };

    ctx.activeSpells.push(spell);
    return spell;
  },

  update(ctx, spell, i) {
    const { now } = ctx;

    // ── Flight phase: move projectile, check for hit ──
    if (spell.phase === 'flight') {
      spell.x += spell.vx;
      spell.y += spell.vy;

      // Check player collision
      for (const [playerId, body] of ctx.physics.playerBodies) {
        if (playerId === spell.ownerId) continue;
        if (ctx.isEliminated(playerId)) continue;
        const targetEffects = ctx.statusEffects.get(playerId);
        if (targetEffects && targetEffects.intangible) continue;

        // Shield absorption
        if (targetEffects && targetEffects.shield && targetEffects.shield.hitsRemaining > 0) {
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < spell.radius + PLAYER.RADIUS) {
            targetEffects.shield.hitsRemaining--;
            targetEffects.shield.lastHitData = {
              attackerId: spell.ownerId,
              damage: spell.damage,
              knockbackForce: spell.knockbackForce,
            };
            spell.active = false;
            ctx.removeSpell(i);
            return 'break';
          }
        }

        const dx = body.position.x - spell.x;
        const dy = body.position.y - spell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < spell.radius + PLAYER.RADIUS) {
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
      // Detect if either player received new knockback this tick
      if (!spell.linkKbGuard) {
        const currentKbOwner = ctx.physics.knockbackUntil.get(spell.ownerId) || 0;
        const currentKbTarget = ctx.physics.knockbackUntil.get(spell.linkedPlayerId) || 0;

        // Owner got hit → forward to target
        if (currentKbOwner > spell.lastKbUntilOwner) {
          spell.linkKbGuard = true;
          const vel = ownerBody.velocity;
          const mult = 0.5 + (spell.linkedKbMultiplier || 0); // target may get extra
          Body.applyForce(targetBody, targetBody.position, {
            x: vel.x * mult * 0.008,
            y: vel.y * mult * 0.008,
          });
          // Also trigger knockback grace on target
          ctx.physics.applyKnockback(spell.linkedPlayerId,
            vel.x * mult * 0.003,
            vel.y * mult * 0.003,
            ctx.getDamageTaken(spell.linkedPlayerId),
            spell.ownerId,
          );
          spell.linkKbGuard = false;
        }

        // Target got hit → forward to owner
        if (currentKbTarget > spell.lastKbUntilTarget) {
          spell.linkKbGuard = true;
          const vel = targetBody.velocity;
          const mult = 0.5; // owner gets base forwarding
          Body.applyForce(ownerBody, ownerBody.position, {
            x: vel.x * mult * 0.008,
            y: vel.y * mult * 0.008,
          });
          ctx.physics.applyKnockback(spell.ownerId,
            vel.x * mult * 0.003,
            vel.y * mult * 0.003,
            ctx.getDamageTaken(spell.ownerId),
            spell.linkedPlayerId,
          );
          spell.linkKbGuard = false;
        }

        spell.lastKbUntilOwner = currentKbOwner;
        spell.lastKbUntilTarget = currentKbTarget;
      }
    }
  },
};
