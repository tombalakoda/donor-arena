import Matter from 'matter-js';
import { SPELLS, SPELL_TYPES } from '../../shared/spellData.js';
import { SKILL_TREES } from '../../shared/skillTreeData.js';
import { PLAYER, PHYSICS } from '../../shared/constants.js';
import { getPassive } from '../../shared/characterPassives.js';
import { handlers } from './spellHandlers/index.js';

const { Body, World } = Matter;

export class ServerSpell {
  /**
   * @param {object} physics - ServerPhysics instance
   * @param {function} getDamageTaken - callback (playerId) => damageTaken (0 = full HP)
   * @param {object} obstacleManager - ObstacleManager instance
   * @param {function} isEliminated - callback (playerId) => boolean — skip eliminated targets
   * @param {function} getCharacterId - callback (playerId) => characterId — for passive lookups
   */
  constructor(physics, getDamageTaken = () => 0, obstacleManager = null, isEliminated = () => false, getCharacterId = () => null, itemStatsLookup = null) {
    this.physics = physics;
    this.getDamageTaken = getDamageTaken;
    this.obstacleManager = obstacleManager;
    this.isEliminated = isEliminated;
    this.getCharacterId = getCharacterId;
    // Optional: (playerId) => itemStats object or null
    this.itemStatsLookup = itemStatsLookup;
    this.nextSpellId = 1;
    this.activeSpells = [];
    this.cooldowns = new Map(); // playerId -> { spellId: remainingMs }
    this.statusEffects = new Map(); // playerId -> { slow, root, stun, shield, intangible, speedBoost }
    this.pendingHits = [];
    this.pendingCasts = [];      // Deferred casts (channeled spells)
    this._deferredResults = [];  // Spells spawned from completed channels
    this.chargeTracking = new Map();
    // Recall (Time Shift): position history ring buffers
    // Map: playerId -> Array of { x, y, tick }
    this.positionHistory = new Map();
  }

  // ═══════════════════════════════════════════════════════
  // COLLISION HELPERS (shared by all handlers)
  // ═══════════════════════════════════════════════════════

  checkObstacleHit(x, y, spellRadius) {
    if (!this.obstacleManager) return null;
    for (const obs of this.obstacleManager.getObstacles()) {
      const dx = x - obs.x;
      const dy = y - obs.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < spellRadius + obs.radius) return obs;
    }
    return null;
  }

  static clampSpeed(speed) {
    return Math.min(20, Math.max(1, speed || 5));
  }

  static clampCooldown(cooldown) {
    return Math.min(30000, Math.max(100, cooldown || 3000));
  }

  // ═══════════════════════════════════════════════════════
  // PLAYER LIFECYCLE
  // ═══════════════════════════════════════════════════════

  initPlayer(playerId) {
    this.cooldowns.set(playerId, {});
    this.statusEffects.set(playerId, {});
    this.chargeTracking.set(playerId, {});
    this.positionHistory.set(playerId, []);
  }

  removePlayer(playerId) {
    this.cooldowns.delete(playerId);
    this.statusEffects.delete(playerId);
    this.chargeTracking.delete(playerId);
    this.positionHistory.delete(playerId);
  }

  canCast(playerId, spellId) {
    const cd = this.cooldowns.get(playerId);
    if (!cd) return false;
    if (cd[spellId] && cd[spellId] > 0) return false;

    // Check if stunned (stun prevents all casts)
    const effects = this.statusEffects.get(playerId);
    if (effects && effects.stun) return false;

    return true;
  }

  // ═══════════════════════════════════════════════════════
  // HANDLER CONTEXT
  // ═══════════════════════════════════════════════════════

  _buildContext(now = Date.now(), deltaMs = 0) {
    return {
      physics: this.physics,
      obstacleManager: this.obstacleManager,
      statusEffects: this.statusEffects,
      activeSpells: this.activeSpells,
      pendingHits: this.pendingHits,
      cooldowns: this.cooldowns,
      chargeTracking: this.chargeTracking,
      positionHistory: this.positionHistory,
      nextSpellId: () => this.nextSpellId++,
      isEliminated: this.isEliminated,
      getDamageTaken: this.getDamageTaken,
      getCharacterId: this.getCharacterId,
      getItemStats: this.itemStatsLookup || (() => null),
      checkObstacleHit: this.checkObstacleHit.bind(this),
      applyStatusEffect: this.applyStatusEffect.bind(this),
      handleExplosion: this.handleExplosion.bind(this),
      handleObstacleExplosion: this.handleObstacleExplosion.bind(this),
      getKnockbackMultiplier: this._getKnockbackMultiplier.bind(this),
      removeSpell: this.removeSpell.bind(this),
      cleanupSpell: this._cleanupSpell.bind(this),
      clampSpeed: ServerSpell.clampSpeed,
      now,
      deltaMs,
    };
  }

  // ═══════════════════════════════════════════════════════
  // SPELL CAST (routes to handler.spawn)
  // ═══════════════════════════════════════════════════════

  /**
   * Process a spell cast. Takes progression to compute dynamic stats.
   */
  processCast(playerId, spellId, targetX, targetY, progression) {
    if (this.activeSpells.length >= 200) return null;
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
      const tree = SKILL_TREES[spellId];
      stats = tree ? { ...tree.base } : null;
    }
    if (!stats) return null;

    // Cooldown handling
    const cd = this.cooldowns.get(playerId);
    const maxCharges = stats.charges || 1;

    // Character passive: cooldown reduction
    const casterPassive = getPassive(this.getCharacterId(playerId));
    let cdMultiplier = 1 - (casterPassive.cdReduction || 0);

    // Item cooldown modifier
    const casterItems = this.itemStatsLookup ? this.itemStatsLookup(playerId) : null;
    if (casterItems) {
      if (casterItems.cooldownMult && casterItems.cooldownMult !== 1.0) {
        cdMultiplier *= casterItems.cooldownMult;
      }
      // Saat: idle cooldown reduction (after not attacking for 3s)
      if (casterItems.idleCooldownReduction > 0) {
        const lastAttack = casterItems.lastAttackTime || 0;
        if (Date.now() - lastAttack > 3000) {
          cdMultiplier *= (1 - casterItems.idleCooldownReduction);
        }
      }
    }

    if (maxCharges > 1) {
      const charges = this.chargeTracking.get(playerId);
      if (!charges[spellId]) {
        charges[spellId] = { remaining: maxCharges, max: maxCharges, internalCd: 0 };
      }
      const ct = charges[spellId];
      ct.max = maxCharges;
      ct.remaining--;
      if (ct.remaining <= 0) {
        cd[spellId] = ServerSpell.clampCooldown(stats.cooldown * cdMultiplier);
        ct.remaining = 0;
      } else {
        cd[spellId] = 500 * cdMultiplier;
      }
    } else {
      cd[spellId] = ServerSpell.clampCooldown(stats.cooldown * cdMultiplier);
    }

    const originX = playerBody.position.x;
    const originY = playerBody.position.y;

    // Determine effective spell type and route to handler
    const effectiveType = stats.type || def.type;
    const handler = handlers[effectiveType];
    if (!handler) return null;

    // Channeled spell: defer execution, root caster during windup
    if (stats.castTime && stats.castTime > 0) {
      this.applyStatusEffect(playerId, 'root', { until: Date.now() + stats.castTime });
      this.pendingCasts.push({
        playerId, spellId, stats, targetX, targetY,
        originX, originY, effectiveType,
        executeAt: Date.now() + stats.castTime,
      });
      return { channeling: true, playerId, spellId, duration: stats.castTime };
    }

    // Apply item modifiers to spell stats before spawning
    if (casterItems) {
      // Projectile speed modifier (Kudum)
      if (casterItems.projectileSpeedMult && casterItems.projectileSpeedMult !== 1.0) {
        if (stats.speed) stats = { ...stats, speed: stats.speed * casterItems.projectileSpeedMult };
      }
    }

    const ctx = this._buildContext();

    // Route to handler — each handler has its own spawn signature
    let result;
    switch (effectiveType) {
      case SPELL_TYPES.ZONE:
        result = handler.spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY);
        break;
      case SPELL_TYPES.INSTANT:
      case SPELL_TYPES.BUFF:
        result = handler.spawn(ctx, playerId, spellId, stats, originX, originY);
        break;
      case SPELL_TYPES.RECALL:
        result = handler.spawn(ctx, playerId, spellId, stats, originX, originY);
        break;
      case SPELL_TYPES.WALL:
        result = handler.spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY);
        break;
      default:
        // PROJECTILE, BLINK, DASH, HOOK, SWAP, HOMING, BOOMERANG, BARREL
        result = handler.spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY);
        break;
    }

    // Post-cast effects from items
    if (casterItems && result) {
      // Kasirga Hazine: speed boost after casting any spell
      if (casterItems.postCastSpeedBuff > 0 && casterItems.postCastSpeedDuration > 0) {
        this.applyStatusEffect(playerId, 'speedBoost', {
          multiplier: 1 + casterItems.postCastSpeedBuff,
          until: Date.now() + casterItems.postCastSpeedDuration,
        });
      }

      // Track last attack time for Saat (idle cooldown reduction)
      // lastAttackTime is stored on the stats object and points to ItemSystem's field
      if (casterItems.idleCooldownReduction > 0) {
        // Update via the stats cache (will be reflected on next getItemStats call)
        casterItems.lastAttackTime = Date.now();
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════
  // UPDATE LOOP
  // ═══════════════════════════════════════════════════════

  update(deltaMs) {
    const now = Date.now();
    const ctx = this._buildContext(now, deltaMs);

    // --- Record position history for Recall ---
    for (const [playerId, body] of this.physics.playerBodies) {
      const history = this.positionHistory.get(playerId);
      if (history) {
        history.push({ x: body.position.x, y: body.position.y, time: now });
        // Keep only last 5 seconds of history — single splice instead of repeated shift
        const cutoffTime = now - 5000;
        let cutoff = 0;
        while (cutoff < history.length && history[cutoff].time < cutoffTime) cutoff++;
        if (cutoff > 0) history.splice(0, cutoff);
      }
    }

    // --- Update cooldowns ---
    for (const [playerId, cd] of this.cooldowns) {
      for (const spellId in cd) {
        if (cd[spellId] > 0) {
          cd[spellId] -= deltaMs;
          if (cd[spellId] <= 0) {
            const charges = this.chargeTracking.get(playerId);
            if (charges && charges[spellId]) {
              charges[spellId].remaining = charges[spellId].max;
            }
          }
        }
      }
    }

    // --- Update status effects ---
    for (const [playerId, effects] of this.statusEffects) {
      if (effects.slow && now >= effects.slow.until) {
        delete effects.slow;
      }
      if (effects.root && now >= effects.root.until) {
        delete effects.root;
      }
      if (effects.stun && now >= effects.stun.until) {
        delete effects.stun;
      }
      if (effects.speedBoost && now >= effects.speedBoost.until) {
        delete effects.speedBoost;
      }
      // Intangible: check if expired, apply exit effect
      if (effects.intangible && now >= effects.intangible.until) {
        // Ghost T2: Poltergeist — AoE push on exit
        if (effects.intangible.exitPushForce > 0) {
          const ownerId = effects.intangible.ownerId;
          const ownerBody = this.physics.playerBodies.get(ownerId);
          if (ownerBody) {
            for (const [id, body] of this.physics.playerBodies) {
              if (id === ownerId) continue;
              if (this.isEliminated(id)) continue;
              const dx = body.position.x - ownerBody.position.x;
              const dy = body.position.y - ownerBody.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < effects.intangible.exitPushRadius) {
                const nx = dist > 0 ? dx / dist : 0;
                const ny = dist > 0 ? dy / dist : 1;
                const kbMult = this._getKnockbackMultiplier(ownerId);
                this.physics.applyKnockback(id,
                  nx * effects.intangible.exitPushForce * kbMult,
                  ny * effects.intangible.exitPushForce * kbMult,
                  this.getDamageTaken(id),
                  ownerId,
                );
              }
            }
          }
        }
        delete effects.intangible;
      }
      // Sema: check if expired, apply burst push on end
      if (effects.sema && now >= effects.sema.until) {
        if (effects.sema.burstPushForce > 0) {
          const ownerId = effects.sema.ownerId;
          const ownerBody = this.physics.playerBodies.get(ownerId);
          if (ownerBody) {
            for (const [id, body] of this.physics.playerBodies) {
              if (id === ownerId) continue;
              if (this.isEliminated(id)) continue;
              const dx = body.position.x - ownerBody.position.x;
              const dy = body.position.y - ownerBody.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 65) { // burst radius
                const nx = dist > 0 ? dx / dist : 0;
                const ny = dist > 0 ? dy / dist : 1;
                const kbMult = this._getKnockbackMultiplier(ownerId);
                this.physics.applyKnockback(id,
                  nx * effects.sema.burstPushForce * kbMult,
                  ny * effects.sema.burstPushForce * kbMult,
                  this.getDamageTaken(id),
                  ownerId,
                );
              }
            }
          }
        }
        delete effects.sema;
      }
      // Linked (Rabıta): check if expired
      if (effects.linked && now >= effects.linked.until) {
        delete effects.linked;
      }
      // Shield: check if expired
      if (effects.shield && (now >= effects.shield.until || effects.shield.hitsRemaining <= 0)) {
        // Reflect on break (Shield T2)
        if (effects.shield.hitsRemaining <= 0 && effects.shield.reflectOnBreak && effects.shield.lastHitData) {
          const hit = effects.shield.lastHitData;
          // Spawn a reflected projectile back at the attacker
          const ownerBody = this.physics.playerBodies.get(effects.shield.ownerId);
          const attackerBody = this.physics.playerBodies.get(hit.attackerId);
          if (ownerBody && attackerBody) {
            const dx = attackerBody.position.x - ownerBody.position.x;
            const dy = attackerBody.position.y - ownerBody.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const reflectSpell = {
              id: this.nextSpellId++,
              type: 'shield-reflect',
              spellType: SPELL_TYPES.PROJECTILE,
              ownerId: effects.shield.ownerId,
              x: ownerBody.position.x,
              y: ownerBody.position.y,
              originX: ownerBody.position.x,
              originY: ownerBody.position.y,
              vx: (dx / dist) * 8,
              vy: (dy / dist) * 8,
              radius: 6,
              damage: hit.damage || 3,
              knockbackForce: (hit.knockbackForce || 0.04) * 0.5, // reflect at half KB
              lifetime: 1500,
              piercing: false,
              elapsed: 0,
              active: true,
              slowAmount: 0,
              slowDuration: 0,
              rootDuration: 0,
              explosionRadius: 0,
              stunDuration: 0,
              maxBounces: 0,
              bounceCount: 0,
              destroysSpells: false,
              kbPerBounce: 0,
            };
            this.activeSpells.push(reflectSpell);
          }
        }
        delete effects.shield;
      }
    }

    // --- Process deferred (channeled) casts ---
    this.pendingCasts = this.pendingCasts.filter(pc => {
      if (now >= pc.executeAt) {
        // Channel complete — fire the spell using current position
        const playerBody = this.physics.playerBodies.get(pc.playerId);
        if (playerBody && !this.isEliminated(pc.playerId)) {
          const castCtx = this._buildContext(now, deltaMs);
          const originX = playerBody.position.x;
          const originY = playerBody.position.y;
          const h = handlers[pc.effectiveType];
          if (h) {
            let spell;
            switch (pc.effectiveType) {
              case SPELL_TYPES.WALL:
              case SPELL_TYPES.ZONE:
                spell = h.spawn(castCtx, pc.playerId, pc.spellId, pc.stats, pc.targetX, pc.targetY, originX, originY);
                break;
              case SPELL_TYPES.INSTANT:
              case SPELL_TYPES.BUFF:
              case SPELL_TYPES.RECALL:
                spell = h.spawn(castCtx, pc.playerId, pc.spellId, pc.stats, originX, originY);
                break;
              case SPELL_TYPES.BARREL:
              default:
                // PROJECTILE, BLINK, DASH, HOOK, SWAP, HOMING, BOOMERANG, BARREL
                spell = h.spawn(castCtx, pc.playerId, pc.spellId, pc.stats, originX, originY, pc.targetX, pc.targetY);
                break;
            }
            if (spell) {
              const spells = Array.isArray(spell) ? spell : [spell];
              this._deferredResults.push(...spells);
            }
          }
        }
        return false; // remove from pending
      }
      return true; // keep in pending
    });

    // --- Update active spells (dispatch to handlers) ---
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      const spell = this.activeSpells[i];
      spell.elapsed += deltaMs;

      if (spell.elapsed >= spell.lifetime) {
        // Zone on-expire effects (e.g., gravity well burst push)
        const expHandler = handlers[spell.spellType];
        if (expHandler && expHandler.onExpire) {
          expHandler.onExpire(ctx, spell);
        }
        this._cleanupSpell(spell);
        this.removeSpell(i);
        continue;
      }

      const handler = handlers[spell.spellType];
      if (handler && handler.update && spell.active) {
        const result = handler.update(ctx, spell, i);
        if (result === 'continue') continue;
        if (result === 'break') continue; // 'break' from inner loop = skip to next spell
      }
    }

    // --- Spell-vs-Spell collision (Bouncer: destroysSpells) ---
    const toRemove = new Set();
    for (let a = 0; a < this.activeSpells.length; a++) {
      const s1 = this.activeSpells[a];
      if (!s1.active || s1.spellType !== SPELL_TYPES.PROJECTILE) continue;
      if (!s1.destroysSpells) continue;

      for (let b = 0; b < this.activeSpells.length; b++) {
        if (a === b) continue;
        const s2 = this.activeSpells[b];
        if (!s2.active) continue;
        if (s1.ownerId === s2.ownerId) continue;
        // Bouncer destroys enemy projectiles/homing/boomerang
        if (s2.spellType !== SPELL_TYPES.PROJECTILE &&
            s2.spellType !== SPELL_TYPES.HOMING &&
            s2.spellType !== SPELL_TYPES.BOOMERANG &&
            s2.spellType !== SPELL_TYPES.SWAP) continue;

        const dx = s1.x - s2.x;
        const dy = s1.y - s2.y;
        const distSq = dx * dx + dy * dy;
        const threshold = (s1.radius || 7) + (s2.radius || 7);
        if (distSq < threshold * threshold) {
          toRemove.add(b); // Destroy the enemy spell
          // Bouncer survives (doesn't get destroyed)
        }
      }
    }

    // Also do frostbolt vs fireball neutralization
    for (let a = 0; a < this.activeSpells.length; a++) {
      const s1 = this.activeSpells[a];
      if (!s1.active || s1.spellType !== SPELL_TYPES.PROJECTILE) continue;
      if (!s1.type || !s1.type.startsWith('frostbolt')) continue;

      for (let b = 0; b < this.activeSpells.length; b++) {
        if (a === b) continue;
        const s2 = this.activeSpells[b];
        if (!s2.active || s2.spellType !== SPELL_TYPES.PROJECTILE) continue;
        if (!s2.type || !s2.type.startsWith('fireball')) continue;
        if (s1.ownerId === s2.ownerId) continue;

        const dx = s1.x - s2.x;
        const dy = s1.y - s2.y;
        const distSq = dx * dx + dy * dy;
        const threshold = (s1.radius || 7) + (s2.radius || 7);
        if (distSq < threshold * threshold) {
          toRemove.add(a);
          toRemove.add(b);
        }
      }
    }

    if (toRemove.size > 0) {
      const indices = [...toRemove].sort((a, b) => b - a);
      for (const idx of indices) {
        this._cleanupSpell(this.activeSpells[idx]);
        this.removeSpell(idx);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // CHARACTER PASSIVE HELPERS
  // ═══════════════════════════════════════════════════════

  _getKnockbackMultiplier(ownerId) {
    const passive = getPassive(this.getCharacterId(ownerId));
    return 1 + (passive.knockbackBonus || 0);
  }

  // ═══════════════════════════════════════════════════════
  // CLEANUP HELPERS
  // ═══════════════════════════════════════════════════════

  _cleanupSpell(spell) {
    // Remove temporary obstacle when wall spell expires or is destroyed
    if (spell.spellType === SPELL_TYPES.WALL && spell.obstacle) {
      this.obstacleManager.removeTemporary(spell.obstacle);
      spell.obstacle = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // STATUS EFFECTS
  // ═══════════════════════════════════════════════════════

  applyStatusEffect(playerId, type, data, sourceSpellId = null) {
    const effects = this.statusEffects.get(playerId);
    if (!effects) return;

    // Character passive: slow/root resistance (applies to ALL slow/root effects)
    if ((type === 'slow' || type === 'root')) {
      const targetPassive = getPassive(this.getCharacterId(playerId));
      const now = Date.now();
      let durationMult = 1.0;

      if (targetPassive.slowResist) {
        durationMult *= (1 - targetPassive.slowResist);
      }

      // Item: slow resist multiplier (Cevsen: slows last 25% shorter; Kelepce: +20% resist)
      const targetItems = this.itemStatsLookup ? this.itemStatsLookup(playerId) : null;
      if (targetItems && targetItems.slowResistMult && targetItems.slowResistMult !== 1.0) {
        durationMult *= targetItems.slowResistMult;
      }

      if (durationMult !== 1.0) {
        const originalDuration = data.until - now;
        data.until = now + originalDuration * durationMult;
      }
    }

    // Attacker item: slow duration multiplier (Permafrost Hazine: slows applied last 30% longer)
    // This is handled at the point where slows are applied (in spell handlers / processSpellHits)

    if (type === 'slow') {
      // Stronger amount always wins. Equal amount: longer duration wins.
      if (!effects.slow || data.amount > effects.slow.amount ||
          (data.amount === effects.slow.amount && data.until > effects.slow.until)) {
        effects.slow = data;
      }
    } else {
      if (!effects[type] || data.until > effects[type].until) {
        effects[type] = data;
      }
    }
  }

  getStatusEffects(playerId) {
    return this.statusEffects.get(playerId) || {};
  }

  /**
   * Check if a player is currently intangible (ghost buff active).
   */
  isIntangible(playerId) {
    const effects = this.statusEffects.get(playerId);
    return !!(effects && effects.intangible && effects.intangible.until > Date.now());
  }

  // ═══════════════════════════════════════════════════════
  // EXPLOSION HANDLER
  // ═══════════════════════════════════════════════════════

  handleExplosion(spell, impactX, impactY, directHitId = null) {
    for (const [playerId, body] of this.physics.playerBodies) {
      if (playerId === spell.ownerId) continue;
      if (this.isEliminated(playerId)) continue;
      if (playerId === directHitId) continue;
      const dx = body.position.x - impactX;
      const dy = body.position.y - impactY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < spell.explosionRadius + PLAYER.RADIUS) {
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const expKbMult = this._getKnockbackMultiplier(spell.ownerId);
        const force = spell.knockbackForce * (1 - dist / (spell.explosionRadius + PLAYER.RADIUS));
        this.physics.applyKnockback(playerId,
          nx * Math.max(force, spell.knockbackForce * 0.3) * expKbMult,
          ny * Math.max(force, spell.knockbackForce * 0.3) * expKbMult,
          this.getDamageTaken(playerId),
          spell.ownerId,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // OBSTACLE EXPLOSION
  // ═══════════════════════════════════════════════════════

  /**
   * Handle an explosive obstacle being destroyed.
   * Unlike spell explosions, this has no owner — it knockbacks ALL players.
   */
  handleObstacleExplosion(obstacle) {
    const { x, y, explosionRadius, explosionForce } = obstacle;
    for (const [playerId, body] of this.physics.playerBodies) {
      if (this.isEliminated(playerId)) continue;
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < explosionRadius + PLAYER.RADIUS) {
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const force = explosionForce * (1 - dist / (explosionRadius + PLAYER.RADIUS));
        const effectiveForce = Math.max(force, explosionForce * 0.3);
        this.physics.applyKnockback(playerId,
          nx * effectiveForce,
          ny * effectiveForce,
          this.getDamageTaken(playerId),
          null, // no owner
        );
      }
    }
  }

  /**
   * Drain deferred spell results from completed channels.
   * Called by GameLoop to broadcast them to clients.
   */
  drainDeferredResults() {
    if (this._deferredResults.length === 0) return [];
    const results = this._deferredResults;
    this._deferredResults = [];
    return results;
  }

  // ═══════════════════════════════════════════════════════
  // HOOK HELPERS
  // ═══════════════════════════════════════════════════════

  requestHookRelease(playerId) {
    const spell = this.activeSpells.find(
      s => s.spellType === SPELL_TYPES.HOOK && s.ownerId === playerId
        && s.pullSelf && s.hooked && s.pullActive && !s.released
    );
    if (!spell) return;
    spell.releaseRequested = true;
  }

  // ═══════════════════════════════════════════════════════
  // SPELL MANAGEMENT
  // ═══════════════════════════════════════════════════════

  removeSpell(index) {
    const spell = this.activeSpells[index];
    if (spell.body) {
      World.remove(this.physics.engine.world, spell.body);
    }
    this.activeSpells.splice(index, 1);
  }

  /**
   * When a player is eliminated mid-round, expire their active spells quickly
   * (500ms grace for visual fade) and cancel pending channeled casts.
   */
  deactivatePlayerSpells(playerId) {
    for (const spell of this.activeSpells) {
      if (spell.ownerId === playerId && spell.active) {
        spell.lifetime = Math.min(spell.lifetime, spell.elapsed + 500);
      }
    }
    this.pendingCasts = this.pendingCasts.filter(pc => pc.playerId !== playerId);
  }

  clearAll() {
    this.pendingCasts = [];
    this._deferredResults = [];
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      this._cleanupSpell(this.activeSpells[i]);
      this.removeSpell(i);
    }
    // Clean up any remaining temporary obstacles (walls)
    if (this.obstacleManager) this.obstacleManager.clearTemporary();
    for (const [, effects] of this.statusEffects) {
      for (const key of Object.keys(effects)) {
        delete effects[key];
      }
    }
    for (const [, charges] of this.chargeTracking) {
      for (const key of Object.keys(charges)) {
        delete charges[key];
      }
    }
    // Reset all cooldowns so players start fresh each round
    for (const [, cd] of this.cooldowns) {
      for (const key of Object.keys(cd)) {
        delete cd[key];
      }
    }
  }

  /**
   * Serialize a spell object for sending to clients.
   * Single source of truth — used by both s:spellCast and s:state snapshots.
   * @param {object} s - Internal spell object
   * @param {boolean} [roundPos=false] - Round x/y to 1 decimal (for periodic snapshots)
   */
  static serializeForClient(s, roundPos = false) {
    const x = roundPos ? Math.round(s.x * 10) / 10 : s.x;
    const y = roundPos ? Math.round(s.y * 10) / 10 : s.y;
    return {
      id: s.id,
      type: s.type,
      spellType: s.spellType,
      ownerId: s.ownerId,
      x,
      y,
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
      released: s.released || false,
      anchorX: s.anchorX || 0,
      anchorY: s.anchorY || 0,
      swingElapsed: s.swingElapsed || 0,
      swingDuration: s.swingDuration || 0,
      pullActive: s.pullActive || false,
      phase: s.phase || null,
      flightActive: s.flightActive || false,
      returning: s.returning || false,
      isMeteor: s.isMeteor || false,
      impactDelay: s.impactDelay || 0,
      impactTriggered: s.impactTriggered || false,
      buffType: s.buffType || null,
      // Link (Rabıta)
      linkedPlayerId: s.linkedPlayerId || null,
      linkedX: s.linkedX || 0,
      linkedY: s.linkedY || 0,
      // Gravity well (Çekim)
      isGravityWell: s.isGravityWell || false,
      pullForce: s.pullForce || 0,
      // Tether (Kement)
      tetherLength: s.tetherLength || 0,
      pushRadius: s.pushRadius || 0,
      wallRadius: s.wallRadius || 0,
      wallHp: s.obstacle ? s.obstacle.hp : 0,
      maxWallHp: s.obstacle ? s.obstacle.maxHp : 0,
    };
  }

  getActiveSpells() {
    return this.activeSpells.map(s => ServerSpell.serializeForClient(s, true));
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
