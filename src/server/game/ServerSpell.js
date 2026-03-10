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
  constructor(physics, getDamageTaken = () => 0, obstacleManager = null, isEliminated = () => false, getCharacterId = () => null) {
    this.physics = physics;
    this.getDamageTaken = getDamageTaken;
    this.obstacleManager = obstacleManager;
    this.isEliminated = isEliminated;
    this.getCharacterId = getCharacterId;
    this.nextSpellId = 1;
    this.activeSpells = [];
    this.cooldowns = new Map(); // playerId -> { spellId: remainingMs }
    this.statusEffects = new Map(); // playerId -> { slow, root, stun, shield, intangible, speedBoost }
    this.pendingHits = [];
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
      checkObstacleHit: this.checkObstacleHit.bind(this),
      applyStatusEffect: this.applyStatusEffect.bind(this),
      handleExplosion: this.handleExplosion.bind(this),
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
    const cdMultiplier = 1 - (casterPassive.cdReduction || 0);

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

    const ctx = this._buildContext();

    // Route to handler — each handler has its own spawn signature
    switch (effectiveType) {
      case SPELL_TYPES.ZONE:
        return handler.spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY);
      case SPELL_TYPES.INSTANT:
      case SPELL_TYPES.BUFF:
        return handler.spawn(ctx, playerId, spellId, stats, originX, originY);
      case SPELL_TYPES.RECALL:
        return handler.spawn(ctx, playerId, spellId, stats, originX, originY);
      case SPELL_TYPES.WALL:
        return handler.spawn(ctx, playerId, spellId, stats, targetX, targetY, originX, originY);
      default:
        // PROJECTILE, BLINK, DASH, HOOK, SWAP, HOMING, BOOMERANG
        return handler.spawn(ctx, playerId, spellId, stats, originX, originY, targetX, targetY);
    }
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
              knockbackForce: hit.knockbackForce || 0.04,
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

    // --- Update active spells (dispatch to handlers) ---
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      const spell = this.activeSpells[i];
      spell.elapsed += deltaMs;

      if (spell.elapsed >= spell.lifetime) {
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
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < (s1.radius || 7) + (s2.radius || 7)) {
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
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < (s1.radius || 7) + (s2.radius || 7)) {
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
      if (targetPassive.slowResist) {
        const now = Date.now();
        const originalDuration = data.until - now;
        data.until = now + originalDuration * (1 - targetPassive.slowResist);
      }
    }

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

  clearAll() {
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
