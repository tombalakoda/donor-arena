import Matter from 'matter-js';
import { SPELLS, SPELL_TYPES } from '../../shared/spellData.js';
import { SKILL_TREE, computeSpellStats } from '../../shared/skillTreeData.js';
import { PLAYER } from '../../shared/constants.js';

const { Bodies, Body, World, Composite } = Matter;

let nextSpellId = 1;

export class ServerSpell {
  /**
   * @param {object} physics - ServerPhysics instance
   * @param {function} getDamageTaken - callback (playerId) => damageTaken (0 = full HP)
   */
  constructor(physics, getDamageTaken = () => 0) {
    this.physics = physics;
    this.getDamageTaken = getDamageTaken; // Smash Bros-style: lookup target vulnerability for knockback scaling
    this.activeSpells = [];   // All active spell entities
    this.cooldowns = new Map(); // playerId -> { spellId: remainingMs }
    this.statusEffects = new Map(); // playerId -> { slow: { amount, until }, root: { until }, stun: { until } }
    this.pendingHits = [];    // Deferred hits from projectile/hook collisions: { attackerId, targetId, damage }
    // Charge tracking for multi-charge spells (e.g. Double Blink)
    // Map: playerId -> { spellId: { remaining, max, internalCd } }
    this.chargeTracking = new Map();
  }

  initPlayer(playerId) {
    this.cooldowns.set(playerId, {});
    this.statusEffects.set(playerId, {});
    this.chargeTracking.set(playerId, {});
  }

  removePlayer(playerId) {
    this.cooldowns.delete(playerId);
    this.statusEffects.delete(playerId);
    this.chargeTracking.delete(playerId);
  }

  canCast(playerId, spellId) {
    const cd = this.cooldowns.get(playerId);
    if (!cd) return false;
    return !cd[spellId] || cd[spellId] <= 0;
  }

  /**
   * Process a spell cast. Now takes progression to compute dynamic stats.
   */
  processCast(playerId, spellId, targetX, targetY, progression) {
    const def = SPELLS[spellId];
    if (!def) return null;
    if (!this.canCast(playerId, spellId)) return null;

    const playerBody = this.physics.playerBodies.get(playerId);
    if (!playerBody) return null;

    // Get dynamic stats from skill tree
    let stats;
    if (progression) {
      stats = progression.getSpellStats(spellId);
    }
    if (!stats) {
      // Fallback to base stats from skill tree
      const tree = SKILL_TREE[spellId];
      stats = tree ? { ...tree.base } : null;
    }
    if (!stats) return null;

    // --- Charge / cooldown handling ---
    const cd = this.cooldowns.get(playerId);
    const maxCharges = stats.charges || 1;

    if (maxCharges > 1) {
      // Multi-charge spell (e.g. Double Blink)
      const charges = this.chargeTracking.get(playerId);
      if (!charges[spellId]) {
        // First use — initialise charge tracking
        charges[spellId] = { remaining: maxCharges, max: maxCharges, internalCd: 0 };
      }
      const ct = charges[spellId];
      // Update max in case tier changed between rounds
      ct.max = maxCharges;

      ct.remaining--;
      if (ct.remaining <= 0) {
        // All charges spent — full cooldown, then refill all charges
        cd[spellId] = stats.cooldown || 3000;
        ct.remaining = 0; // will be reset when cooldown expires (in update)
      } else {
        // Still have charges — short internal cooldown (500ms between blinks)
        cd[spellId] = 500;
      }
    } else {
      // Standard single-charge spell — full cooldown immediately
      cd[spellId] = stats.cooldown || 3000;
    }

    const originX = playerBody.position.x;
    const originY = playerBody.position.y;

    // Determine effective spell type (can change with upgrades, e.g. frostBolt → zone)
    let effectiveType = stats.type || def.type;
    if (stats.convertToZone) {
      effectiveType = SPELL_TYPES.ZONE;
    }

    // Check for dash (blink branch B)
    if (effectiveType === SPELL_TYPES.BLINK && stats.dashDamage) {
      effectiveType = SPELL_TYPES.DASH;
    }

    switch (effectiveType) {
      case SPELL_TYPES.PROJECTILE:
        return this.spawnProjectile(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.ZONE:
        return this.spawnZone(playerId, spellId, stats, targetX, targetY);
      case SPELL_TYPES.BLINK:
        return this.executeBlink(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.DASH:
        return this.executeDash(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.HOOK:
        return this.spawnHook(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.INSTANT:
        return this.executeInstant(playerId, spellId, stats, originX, originY);
      default:
        return null;
    }
  }

  spawnProjectile(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const projectileCount = stats.projectileCount || 1;
    const spreadAngle = projectileCount > 1 ? 0.15 : 0; // radians spread per projectile

    const spells = [];
    for (let i = 0; i < projectileCount; i++) {
      // Calculate spread offset
      let angle = Math.atan2(ny, nx);
      if (projectileCount > 1) {
        const offset = (i - (projectileCount - 1) / 2) * spreadAngle;
        angle += offset;
      }

      const vx = Math.cos(angle) * stats.speed;
      const vy = Math.sin(angle) * stats.speed;

      const spell = {
        id: nextSpellId++,
        type: spellId,
        spellType: SPELL_TYPES.PROJECTILE,
        ownerId: playerId,
        x: originX,
        y: originY,
        vx, vy,
        radius: stats.radius || 8,
        damage: stats.damage || 0,
        knockbackForce: stats.knockbackForce || 0,
        lifetime: stats.lifetime || 2000,
        piercing: stats.piercing || false,
        elapsed: 0,
        active: true,
        // Status effect data
        slowAmount: stats.slowAmount || 0,
        slowDuration: stats.slowDuration || 0,
        rootDuration: stats.rootDuration || 0,
        // Explosion data (Meteor branch)
        explosionRadius: stats.explosionRadius || 0,
        burnDuration: stats.burnDuration || 0,
        burnDamage: stats.burnDamage || 0,
      };

      this.activeSpells.push(spell);
      spells.push(spell);
    }

    // Return the first spell for the broadcast (client will handle multi-projectile visually)
    return spells[0];
  }

  spawnZone(playerId, spellId, stats, targetX, targetY) {
    const spell = {
      id: nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.ZONE,
      ownerId: playerId,
      x: targetX,
      y: targetY,
      radius: stats.zoneRadius || stats.radius || 60,
      damage: stats.zoneDamage || stats.damage || 0,
      slowAmount: stats.slowAmount || 0,
      slowDuration: stats.slowDuration || 1000,
      lifetime: stats.zoneDuration || stats.lifetime || 4000,
      elapsed: 0,
      active: true,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  executeBlink(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const maxRange = stats.range || 200;
    const blinkDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;
    const destX = originX + nx * blinkDist;
    const destY = originY + ny * blinkDist;

    // Teleport the player
    const body = this.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
      // Preserve velocity (momentum carry)
    }

    // Create visual-only spell entity
    const spell = {
      id: nextSpellId++,
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

    this.activeSpells.push(spell);
    return spell;
  }

  executeDash(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const maxRange = stats.range || 140;
    const dashDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;
    const destX = originX + nx * dashDist;
    const destY = originY + ny * dashDist;

    // Check for enemy collisions along the dash path
    const hits = [];
    const dashWidth = stats.dashWidth || 30;
    for (const [id, body] of this.physics.playerBodies) {
      if (id === playerId) continue;

      // Point-to-line segment distance check
      const px = body.position.x - originX;
      const py = body.position.y - originY;
      const t = Math.max(0, Math.min(1, (px * nx + py * ny) / dashDist));
      const closestX = originX + nx * dashDist * t;
      const closestY = originY + ny * dashDist * t;
      const ddx = body.position.x - closestX;
      const ddy = body.position.y - closestY;
      const distToPath = Math.sqrt(ddx * ddx + ddy * ddy);

      if (distToPath < dashWidth + PLAYER.RADIUS) {
        // Hit! Apply knockback perpendicular to dash direction + forward
        const knockback = stats.dashKnockback || 0.02;
        const hitNx = ddx / (distToPath || 1);
        const hitNy = ddy / (distToPath || 1);
        this.physics.applyKnockback(id,
          (hitNx * 0.6 + nx * 0.4) * knockback,
          (hitNy * 0.6 + ny * 0.4) * knockback,
          this.getDamageTaken(id),
        );
        hits.push({ id, damage: stats.dashDamage || 3 });
      }
    }

    // Move the player to destination
    const body = this.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
      Body.setVelocity(body, { x: nx * 3, y: ny * 3 }); // Exit momentum
    }

    const spell = {
      id: nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.DASH,
      ownerId: playerId,
      x: originX,
      y: originY,
      targetX: destX,
      targetY: destY,
      lifetime: 400,
      elapsed: 0,
      active: true,
      hits,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  spawnHook(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const vx = (dx / dist) * stats.speed;
    const vy = (dy / dist) * stats.speed;

    const spell = {
      id: nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.HOOK,
      ownerId: playerId,
      x: originX,
      y: originY,
      vx, vy,
      radius: stats.radius || 10,
      damage: stats.damage || 5,
      pullForce: stats.pullForce || 0.04,
      pullSelf: stats.pullSelf || false,
      lifetime: stats.lifetime || 1500,
      range: stats.range || 300,
      elapsed: 0,
      active: true,
      hooked: false, // becomes true when it hits something
      hookedPlayerId: null,
      originX, originY, // remember caster position for pull calculation
      stunDuration: stats.stunDuration || 0,
      // Grapple arrival effects
      arrivalKnockback: stats.arrivalKnockback || 0,
      arrivalDamage: stats.arrivalDamage || 0,
      arrivalRadius: stats.arrivalRadius || 0,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  executeInstant(playerId, spellId, stats, originX, originY) {
    const hits = [];
    for (const [id, body] of this.physics.playerBodies) {
      if (id === playerId) continue;
      const dx = body.position.x - originX;
      const dy = body.position.y - originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = stats.radius || 120;

      if (dist < radius) {
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const force = (stats.knockbackForce || 0.03) * (1 - dist / radius);
        this.physics.applyKnockback(id, nx * force, ny * force, this.getDamageTaken(id));
        hits.push({ id, damage: stats.damage || 12 });
      }
    }

    const spell = {
      id: nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.INSTANT,
      ownerId: playerId,
      x: originX,
      y: originY,
      radius: stats.radius || 120,
      lifetime: stats.lifetime || 500,
      elapsed: 0,
      active: true,
      hits,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  update(deltaMs) {
    const now = Date.now();

    // Update cooldowns
    for (const [playerId, cd] of this.cooldowns) {
      for (const spellId in cd) {
        if (cd[spellId] > 0) {
          cd[spellId] -= deltaMs;
          // When cooldown expires, refill charges for multi-charge spells
          if (cd[spellId] <= 0) {
            const charges = this.chargeTracking.get(playerId);
            if (charges && charges[spellId]) {
              charges[spellId].remaining = charges[spellId].max;
            }
          }
        }
      }
    }

    // Update status effects
    for (const [playerId, effects] of this.statusEffects) {
      // Apply slow effect (reduce max speed)
      if (effects.slow && now >= effects.slow.until) {
        delete effects.slow;
      }
      // Apply root effect (prevent movement)
      if (effects.root && now >= effects.root.until) {
        delete effects.root;
      }
      // Apply stun effect (prevent everything)
      if (effects.stun && now >= effects.stun.until) {
        delete effects.stun;
      }
    }

    // Update active spells
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      const spell = this.activeSpells[i];
      spell.elapsed += deltaMs;

      if (spell.elapsed >= spell.lifetime) {
        this.removeSpell(i);
        continue;
      }

      // --- Projectile movement & collision ---
      if (spell.spellType === SPELL_TYPES.PROJECTILE && spell.active) {
        spell.x += spell.vx;
        spell.y += spell.vy;

        // Check collision with players
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < spell.radius + PLAYER.RADIUS) {
            // Hit! Apply knockback with stagger grace
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 1;
            this.physics.applyKnockback(playerId,
              nx * spell.knockbackForce,
              ny * spell.knockbackForce,
              this.getDamageTaken(playerId),
            );

            // Queue damage for Room.js to process
            this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage });

            // Apply status effects
            if (spell.slowAmount > 0 && spell.slowDuration > 0) {
              this.applyStatusEffect(playerId, 'slow', {
                amount: spell.slowAmount,
                until: now + spell.slowDuration,
              });
            }
            if (spell.rootDuration > 0) {
              this.applyStatusEffect(playerId, 'root', {
                until: now + spell.rootDuration,
              });
            }

            // Explosion on impact (Meteor branch)
            if (spell.explosionRadius > 0) {
              this.handleExplosion(spell, body.position.x, body.position.y);
            }

            if (!spell.piercing) {
              spell.active = false;
              this.removeSpell(i);
              break;
            }
          }
        }

        // Check if projectile exceeded range
        const ox = spell.x - (spell.originX || spell.x);
        const oy = spell.y - (spell.originY || spell.y);
        // Use lifetime as range limiter since we don't track origin on every spell
      }

      // --- Zone effects ---
      if (spell.spellType === SPELL_TYPES.ZONE && spell.active) {
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < spell.radius) {
            // Apply slow
            if (spell.slowAmount > 0) {
              this.applyStatusEffect(playerId, 'slow', {
                amount: spell.slowAmount,
                until: now + (spell.slowDuration || 500),
              });
            }
            // Apply zone damage per tick
            if (spell.damage > 0) {
              // damage is per second, convert to per tick
              // (handled by Room.js spell hit tracking, but we'll note it here)
            }
          }
        }
      }

      // --- Hook continuous pull (after hooking an enemy) ---
      if (spell.spellType === SPELL_TYPES.HOOK && spell.hooked && !spell.pullSelf && spell.hookedPlayerId) {
        const hookedBody = this.physics.playerBodies.get(spell.hookedPlayerId);
        const casterBody = this.physics.playerBodies.get(spell.ownerId);

        if (hookedBody && casterBody) {
          const pullDx = casterBody.position.x - hookedBody.position.x;
          const pullDy = casterBody.position.y - hookedBody.position.y;
          const pullDist = Math.sqrt(pullDx * pullDx + pullDy * pullDy);

          // Only pull if not already very close
          if (pullDist > PLAYER.RADIUS * 2) {
            const pullNx = pullDx / pullDist;
            const pullNy = pullDy / pullDist;

            // Mutual pull: 70% on target, 30% on caster
            Body.applyForce(hookedBody, hookedBody.position, {
              x: pullNx * spell.pullForce * 0.7,
              y: pullNy * spell.pullForce * 0.7,
            });
            Body.applyForce(casterBody, casterBody.position, {
              x: -pullNx * spell.pullForce * 0.3,
              y: -pullNy * spell.pullForce * 0.3,
            });
          }

          // Update spell position to follow the hooked target (for visual sync)
          spell.x = hookedBody.position.x;
          spell.y = hookedBody.position.y;
        }
      }

      // --- Hook projectile movement & grab ---
      if (spell.spellType === SPELL_TYPES.HOOK && spell.active && !spell.hooked) {
        spell.x += spell.vx;
        spell.y += spell.vy;

        // Check if hook has traveled too far
        const dx = spell.x - spell.originX;
        const dy = spell.y - spell.originY;
        const travelDist = Math.sqrt(dx * dx + dy * dy);
        if (travelDist > spell.range) {
          // Hook missed — retract
          spell.active = false;
          this.removeSpell(i);
          continue;
        }

        // Check collision with players (for pull hook)
        if (!spell.pullSelf) {
          for (const [playerId, body] of this.physics.playerBodies) {
            if (playerId === spell.ownerId) continue;
            const pdx = body.position.x - spell.x;
            const pdy = body.position.y - spell.y;
            const dist = Math.sqrt(pdx * pdx + pdy * pdy);

            if (dist < spell.radius + PLAYER.RADIUS) {
              // Hooked an enemy! Pull them toward caster
              spell.hooked = true;
              spell.hookedPlayerId = playerId;

              // Mutual pull: 70% on target toward caster, 30% on caster toward target
              const casterBody = this.physics.playerBodies.get(spell.ownerId);
              if (casterBody) {
                const pullDx = casterBody.position.x - body.position.x;
                const pullDy = casterBody.position.y - body.position.y;
                const pullDist = Math.sqrt(pullDx * pullDx + pullDy * pullDy) || 1;
                const pullNx = pullDx / pullDist;
                const pullNy = pullDy / pullDist;
                Body.applyForce(body, body.position, {
                  x: pullNx * spell.pullForce * 0.7,
                  y: pullNy * spell.pullForce * 0.7,
                });
                Body.applyForce(casterBody, casterBody.position, {
                  x: -pullNx * spell.pullForce * 0.3,
                  y: -pullNy * spell.pullForce * 0.3,
                });
              }

              // Apply stun if available
              if (spell.stunDuration > 0) {
                this.applyStatusEffect(playerId, 'stun', {
                  until: now + spell.stunDuration,
                });
              }

              // Queue damage for Room.js to process
              this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage });

              // Short remaining lifetime for visual
              spell.lifetime = spell.elapsed + 500;
              break;
            }
          }
        } else {
          // Grapple mode — hook travels to target point, then pulls caster
          // When hook reaches near its max range or target, pull player
          if (travelDist >= spell.range * 0.9) {
            spell.hooked = true;
            const casterBody = this.physics.playerBodies.get(spell.ownerId);
            if (casterBody) {
              // Teleport caster toward hook position
              Body.setPosition(casterBody, { x: spell.x, y: spell.y });
              Body.setVelocity(casterBody, { x: spell.vx * 0.3, y: spell.vy * 0.3 });

              // Arrival AoE knockback/damage
              if (spell.arrivalKnockback > 0 || spell.arrivalDamage > 0) {
                const hits = [];
                for (const [pid, pbody] of this.physics.playerBodies) {
                  if (pid === spell.ownerId) continue;
                  const adx = pbody.position.x - spell.x;
                  const ady = pbody.position.y - spell.y;
                  const adist = Math.sqrt(adx * adx + ady * ady);
                  const arrRadius = spell.arrivalRadius || 40;
                  if (adist < arrRadius + PLAYER.RADIUS) {
                    const anx = adist > 0 ? adx / adist : 0;
                    const any = adist > 0 ? ady / adist : 1;
                    this.physics.applyKnockback(pid,
                      anx * (spell.arrivalKnockback || 0),
                      any * (spell.arrivalKnockback || 0),
                      this.getDamageTaken(pid),
                    );
                    if (spell.arrivalDamage > 0) {
                      hits.push({ id: pid, damage: spell.arrivalDamage });
                    }
                  }
                }
                spell.hits = hits;
              }
            }
            spell.lifetime = spell.elapsed + 300;
          }
        }
      }
    }

    // --- Frost Bolt vs Fireball collision ---
    // Frost bolt projectile can neutralize fireball projectile on contact
    const toNeutralize = new Set();
    for (let a = 0; a < this.activeSpells.length; a++) {
      const s1 = this.activeSpells[a];
      if (s1.spellId !== 'frostBolt' || s1.spellType !== SPELL_TYPES.PROJECTILE || !s1.active) continue;
      for (let b = 0; b < this.activeSpells.length; b++) {
        if (a === b) continue;
        const s2 = this.activeSpells[b];
        if (s2.spellId !== 'fireball' || s2.spellType !== SPELL_TYPES.PROJECTILE || !s2.active) continue;
        if (s1.ownerId === s2.ownerId) continue; // don't cancel own spells
        const dx = s1.x - s2.x;
        const dy = s1.y - s2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < s1.radius + s2.radius) {
          toNeutralize.add(a);
          toNeutralize.add(b);
        }
      }
    }
    if (toNeutralize.size > 0) {
      // Remove in reverse order to keep indices valid
      const indices = [...toNeutralize].sort((a, b) => b - a);
      for (const idx of indices) {
        this.removeSpell(idx);
      }
    }
  }

  // --- Status Effects ---

  applyStatusEffect(playerId, type, data) {
    const effects = this.statusEffects.get(playerId);
    if (!effects) return;

    if (type === 'slow') {
      // Use the stronger slow if already slowed
      if (!effects.slow || data.amount > effects.slow.amount || data.until > effects.slow.until) {
        effects.slow = data;
      }
    } else {
      // For root/stun, extend duration if already affected
      if (!effects[type] || data.until > effects[type].until) {
        effects[type] = data;
      }
    }
  }

  getStatusEffects(playerId) {
    return this.statusEffects.get(playerId) || {};
  }

  // --- Explosion Handler (Meteor branch) ---

  handleExplosion(spell, impactX, impactY) {
    for (const [playerId, body] of this.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      const dx = body.position.x - impactX;
      const dy = body.position.y - impactY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < spell.explosionRadius + PLAYER.RADIUS) {
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const force = spell.knockbackForce * (1 - dist / (spell.explosionRadius + PLAYER.RADIUS));
        this.physics.applyKnockback(playerId,
          nx * Math.max(force, spell.knockbackForce * 0.3),
          ny * Math.max(force, spell.knockbackForce * 0.3),
          this.getDamageTaken(playerId),
        );
        // AoE damage from explosion is handled in the same hit
      }
    }
  }

  removeSpell(index) {
    const spell = this.activeSpells[index];
    if (spell.body) {
      World.remove(this.physics.engine.world, spell.body);
    }
    this.activeSpells.splice(index, 1);
  }

  clearAll() {
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      this.removeSpell(i);
    }
    // Clear all status effects
    for (const [, effects] of this.statusEffects) {
      for (const key of Object.keys(effects)) {
        delete effects[key];
      }
    }
    // Reset all charge tracking
    for (const [, charges] of this.chargeTracking) {
      for (const key of Object.keys(charges)) {
        delete charges[key];
      }
    }
  }

  getActiveSpells() {
    return this.activeSpells.map(s => ({
      id: s.id,
      type: s.type,
      spellType: s.spellType,
      ownerId: s.ownerId,
      x: Math.round(s.x * 10) / 10,
      y: Math.round(s.y * 10) / 10,
      vx: s.vx || 0,
      vy: s.vy || 0,
      radius: s.radius,
      width: s.width,
      height: s.height,
      angle: s.angle,
      elapsed: s.elapsed,
      lifetime: s.lifetime,
      active: s.active,
      targetX: s.targetX,
      targetY: s.targetY,
      pullSelf: s.pullSelf,
      hooked: s.hooked,
      hookedPlayerId: s.hookedPlayerId || null,
    }));
  }

  drainHits() {
    const hits = this.pendingHits;
    this.pendingHits = [];
    return hits;
  }

  getCooldowns(playerId) {
    return this.cooldowns.get(playerId) || {};
  }

  getCharges(playerId) {
    return this.chargeTracking.get(playerId) || {};
  }
}
