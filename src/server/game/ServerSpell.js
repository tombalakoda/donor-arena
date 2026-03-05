import Matter from 'matter-js';
import { SPELLS, SPELL_TYPES, SPELL_TO_SLOT } from '../../shared/spellData.js';
import { SKILL_TREES, computeSpellStats } from '../../shared/skillTreeData.js';
import { PLAYER, PHYSICS } from '../../shared/constants.js';
import { getPassive } from '../../shared/characterPassives.js';

const { Bodies, Body, World, Composite } = Matter;

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
    // Active walls for wall collision checks
    this.activeWalls = [];
  }

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

  /**
   * Check wall collision for a spell at position (x, y).
   * Returns the wall if hit, null otherwise.
   */
  checkWallHit(x, y, spellRadius, ownerId) {
    for (const wall of this.activeWalls) {
      if (wall.ownerId === ownerId) continue; // don't block own spells
      const dx = x - wall.x;
      const dy = y - wall.y;
      // Approximate wall as rect: check if point is within wall bounds
      const hw = (wall.wallWidth || 80) / 2 + spellRadius;
      const ht = (wall.wallThickness || 16) / 2 + spellRadius;
      // Rotate point into wall's local space
      const cos = Math.cos(-wall.angle);
      const sin = Math.sin(-wall.angle);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) < hw && Math.abs(ly) < ht) return wall;
    }
    return null;
  }

  static clampSpeed(speed) {
    return Math.min(20, Math.max(1, speed || 5));
  }

  static clampCooldown(cooldown) {
    return Math.min(30000, Math.max(100, cooldown || 3000));
  }

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

    // Check if stunned or rooted (stun prevents all casts, root doesn't)
    const effects = this.statusEffects.get(playerId);
    if (effects && effects.stun) return false;

    return true;
  }

  /**
   * Process a spell cast. Takes progression to compute dynamic stats.
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

    // Determine effective spell type
    const effectiveType = stats.type || def.type;

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
      case SPELL_TYPES.BUFF:
        return this.executeBuff(playerId, spellId, stats, originX, originY);
      case SPELL_TYPES.SWAP:
        return this.spawnSwap(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.RECALL:
        return this.executeRecall(playerId, spellId, stats, originX, originY);
      case SPELL_TYPES.HOMING:
        return this.spawnHoming(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.BOOMERANG:
        return this.spawnBoomerang(playerId, spellId, stats, originX, originY, targetX, targetY);
      case SPELL_TYPES.WALL:
        return this.spawnWall(playerId, spellId, stats, targetX, targetY, originX, originY);
      default:
        return null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // PROJECTILE — Fireball variants, Frostbolt, Bouncer
  // ═══════════════════════════════════════════════════════

  spawnProjectile(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const rawCount = stats.projectileCount || 1;
    const projectileCount = Math.min(5, Math.max(1, Math.floor(rawCount)));
    const spreadAngle = projectileCount > 1 ? 0.15 : 0;
    const clampedSpeed = ServerSpell.clampSpeed(stats.speed);

    const spells = [];
    for (let i = 0; i < projectileCount; i++) {
      let angle = Math.atan2(ny, nx);
      if (projectileCount > 1) {
        const offset = (i - (projectileCount - 1) / 2) * spreadAngle;
        angle += offset;
      }

      const vx = Math.cos(angle) * clampedSpeed;
      const vy = Math.sin(angle) * clampedSpeed;

      const spell = {
        id: this.nextSpellId++,
        type: spellId,
        spellType: SPELL_TYPES.PROJECTILE,
        ownerId: playerId,
        x: originX,
        y: originY,
        originX, originY,
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
        // Explosion data
        explosionRadius: stats.explosionRadius || 0,
        stunDuration: stats.stunDuration || 0,
        // Bouncer data
        maxBounces: stats.maxBounces || 0,
        bounceCount: 0,
        destroysSpells: stats.destroysSpells || false,
        kbPerBounce: stats.kbPerBounce || 0,
      };

      this.activeSpells.push(spell);
      spells.push(spell);
    }

    return spells;
  }

  // ═══════════════════════════════════════════════════════
  // ZONE — Blizzard, Meteor
  // ═══════════════════════════════════════════════════════

  spawnZone(playerId, spellId, stats, targetX, targetY) {
    const isMeteor = stats.isMeteor || false;

    const spell = {
      id: this.nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.ZONE,
      ownerId: playerId,
      x: targetX,
      y: targetY,
      radius: stats.zoneRadius || stats.impactRadius || stats.radius || 60,
      damage: stats.zoneDamage || stats.damage || 0,
      knockbackForce: stats.knockbackForce || 0,
      slowAmount: stats.slowAmount || 0,
      slowDuration: stats.slowDuration || 1000,
      lifetime: stats.zoneDuration || stats.lifetime || 4000,
      elapsed: 0,
      active: true,
      // Meteor-specific
      isMeteor,
      impactDelay: isMeteor ? (stats.impactDelay || 1000) : 0,
      impactTriggered: false,
      burnZoneDuration: stats.burnZoneDuration || 0,
      burnSlowAmount: stats.burnSlowAmount || 0,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // BLINK — Instant teleport
  // ═══════════════════════════════════════════════════════

  executeBlink(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const blinkPassive = getPassive(this.getCharacterId(playerId));
    const maxRange = (stats.range || 200) * (1 + (blinkPassive.blinkRangeBonus || 0));
    const blinkDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;
    const destX = originX + nx * blinkDist;
    const destY = originY + ny * blinkDist;

    const body = this.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
    }

    const spell = {
      id: this.nextSpellId++,
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

  // ═══════════════════════════════════════════════════════
  // DASH — Charge forward hitting enemies
  // ═══════════════════════════════════════════════════════

  executeDash(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const dashPassive = getPassive(this.getCharacterId(playerId));
    const maxRange = (stats.range || 140) * (1 + (dashPassive.dashRangeBonus || 0));
    let dashDist = Math.min(dist, maxRange);

    const nx = dx / dist;
    const ny = dy / dist;

    // Check obstacle collision along dash path
    if (this.obstacleManager) {
      for (const obs of this.obstacleManager.getObstacles()) {
        const opx = obs.x - originX;
        const opy = obs.y - originY;
        const t = Math.max(0, (opx * nx + opy * ny));
        if (t > dashDist) continue;
        const closestX = originX + nx * t;
        const closestY = originY + ny * t;
        const cdx = obs.x - closestX;
        const cdy = obs.y - closestY;
        const closestDist = Math.sqrt(cdx * cdx + cdy * cdy);
        const clearance = obs.radius + PLAYER.RADIUS + 2;
        if (closestDist < clearance) {
          const stopT = Math.max(0, t - clearance);
          if (stopT < dashDist) {
            dashDist = stopT;
          }
        }
      }
    }

    const destX = originX + nx * dashDist;
    const destY = originY + ny * dashDist;

    // Check for enemy collisions along the dash path
    const hits = [];
    const dashWidth = stats.dashWidth || 30;
    for (const [id, body] of this.physics.playerBodies) {
      if (id === playerId) continue;
      if (this.isEliminated(id)) continue;

      const px = body.position.x - originX;
      const py = body.position.y - originY;
      const t = Math.max(0, Math.min(1, (px * nx + py * ny) / dashDist));
      const closestX = originX + nx * dashDist * t;
      const closestY = originY + ny * dashDist * t;
      const ddx = body.position.x - closestX;
      const ddy = body.position.y - closestY;
      const distToPath = Math.sqrt(ddx * ddx + ddy * ddy);

      if (distToPath < dashWidth + PLAYER.RADIUS) {
        const knockback = (stats.dashKnockback || 0.02) * this._getKnockbackMultiplier(playerId);
        const hitNx = ddx / (distToPath || 1);
        const hitNy = ddy / (distToPath || 1);
        this.physics.applyKnockback(id,
          (hitNx * 0.6 + nx * 0.4) * knockback,
          (hitNy * 0.6 + ny * 0.4) * knockback,
          this.getDamageTaken(id),
          playerId,
        );
        hits.push({ id, damage: stats.dashDamage || 3 });
      }
    }

    const body = this.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: destX, y: destY });
      Body.setVelocity(body, { x: nx * 3, y: ny * 3 });
    }

    const spell = {
      id: this.nextSpellId++,
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

  // ═══════════════════════════════════════════════════════
  // HOOK — Hook enemy (swing & release) or Grappling (pull self)
  // ═══════════════════════════════════════════════════════

  spawnHook(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const isPullSelf = stats.pullSelf || false;

    const baseSpeed = ServerSpell.clampSpeed(stats.speed);
    const hookSpeed = isPullSelf ? baseSpeed * 1.5 : baseSpeed;
    const vx = (dx / dist) * hookSpeed;
    const vy = (dy / dist) * hookSpeed;

    const travelDist = Math.min(dist, stats.range || 300);
    const hookTargetX = originX + (dx / dist) * travelDist;
    const hookTargetY = originY + (dy / dist) * travelDist;

    const spell = {
      id: this.nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.HOOK,
      ownerId: playerId,
      x: originX,
      y: originY,
      vx, vy,
      radius: stats.radius || 10,
      damage: stats.damage || 5,
      pullForce: stats.pullForce || 0.04,
      pullSelf: isPullSelf,
      lifetime: stats.lifetime || 1500,
      range: stats.range || 300,
      elapsed: 0,
      active: true,
      hooked: false,
      hookedPlayerId: null,
      originX, originY,
      swingAngle: 0,
      swingElapsed: 0,
      swingDuration: stats.swingDuration || 600,
      orbitRadius: 0,
      released: false,
      hookTargetX, hookTargetY,
      travelDist,
      traveledDist: 0,
      anchorX: 0,
      anchorY: 0,
      pullSpeed: isPullSelf ? (stats.pullSpeed || 4) : 0,
      pullActive: false,
      pullStartX: 0,
      pullStartY: 0,
      releaseRequested: false,
      flightActive: false,
      flightElapsed: 0,
      flightDuration: isPullSelf ? (stats.flightDuration || 500) : 0,
      flightCollision: stats.flightCollision || false,
      flightDamage: stats.flightDamage || 0,
      flightKnockback: stats.flightKnockback || 0,
      flightHitIds: [],
      launchSpeedBonus: stats.launchSpeedBonus || 0,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // INSTANT — Lightning (AoE push on nearest enemy)
  // ═══════════════════════════════════════════════════════

  executeInstant(playerId, spellId, stats, originX, originY) {
    const hits = [];
    const chainCount = stats.chainCount || 0;
    const chainKbFactor = stats.chainKbFactor || 0.5;

    // Find enemies in range, sorted by distance
    const targets = [];
    for (const [id, body] of this.physics.playerBodies) {
      if (id === playerId) continue;
      if (this.isEliminated(id)) continue;
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

    // Primary hit
    const maxHits = 1 + chainCount;
    for (let i = 0; i < Math.min(targets.length, maxHits); i++) {
      const t = targets[i];
      const nx = t.dist > 0 ? t.dx / t.dist : 0;
      const ny = t.dist > 0 ? t.dy / t.dist : 1;
      const kbMult = this._getKnockbackMultiplier(playerId);
      const kbFactor = i === 0 ? 1 : chainKbFactor;
      const force = (stats.knockbackForce || 0.03) * kbFactor * kbMult;
      this.physics.applyKnockback(t.id, nx * force, ny * force, this.getDamageTaken(t.id), playerId);
      hits.push({ id: t.id, damage: (stats.damage || 3) * kbFactor });
    }

    const spell = {
      id: this.nextSpellId++,
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

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // BUFF — Flash, Ghost, Shield
  // ═══════════════════════════════════════════════════════

  executeBuff(playerId, spellId, stats, originX, originY) {
    const now = Date.now();
    const effects = this.statusEffects.get(playerId);
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
      id: this.nextSpellId++,
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

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // SWAP — Projectile that swaps positions on hit
  // ═══════════════════════════════════════════════════════

  spawnSwap(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const clampedSpeed = ServerSpell.clampSpeed(stats.speed);
    const vx = nx * clampedSpeed;
    const vy = ny * clampedSpeed;

    const spell = {
      id: this.nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.SWAP,
      ownerId: playerId,
      x: originX,
      y: originY,
      originX, originY,
      vx, vy,
      radius: stats.radius || 7,
      lifetime: stats.lifetime || 1800,
      elapsed: 0,
      active: true,
      swapStunDuration: stats.swapStunDuration || 0,
    };

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // RECALL — Time Shift (teleport to past position)
  // ═══════════════════════════════════════════════════════

  executeRecall(playerId, spellId, stats, originX, originY) {
    const history = this.positionHistory.get(playerId);
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
    const body = this.physics.playerBodies.get(playerId);
    if (body) {
      Body.setPosition(body, { x: bestPos.x, y: bestPos.y });
      Body.setVelocity(body, { x: 0, y: 0 });
    }

    // Departure AoE push (T2: Temporal Rift)
    const departPushForce = stats.departurePushForce || 0;
    const departPushRadius = stats.departurePushRadius || 0;
    const hits = [];
    if (departPushForce > 0 && departPushRadius > 0) {
      for (const [id, pBody] of this.physics.playerBodies) {
        if (id === playerId) continue;
        if (this.isEliminated(id)) continue;
        const dx = pBody.position.x - originX;
        const dy = pBody.position.y - originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < departPushRadius) {
          const nx = dist > 0 ? dx / dist : 0;
          const ny = dist > 0 ? dy / dist : 1;
          const kbMult = this._getKnockbackMultiplier(playerId);
          this.physics.applyKnockback(id, nx * departPushForce * kbMult, ny * departPushForce * kbMult, this.getDamageTaken(id), playerId);
          hits.push({ id, damage: 0 });
        }
      }
    }

    const spell = {
      id: this.nextSpellId++,
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

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // HOMING — Homing missile / Rocket Swarm
  // ═══════════════════════════════════════════════════════

  spawnHoming(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const baseAngle = Math.atan2(dy, dx);

    const missileCount = Math.min(10, Math.max(1, stats.missileCount || 1));
    const isSwarm = stats.isSwarm || missileCount > 1;
    const clampedSpeed = ServerSpell.clampSpeed(stats.speed);

    const spells = [];
    for (let i = 0; i < missileCount; i++) {
      // Spread initial angles for swarm
      let angle = baseAngle;
      if (isSwarm && missileCount > 1) {
        const spread = 0.4; // total spread in radians
        angle += (i - (missileCount - 1) / 2) * (spread / (missileCount - 1));
      }

      const vx = Math.cos(angle) * clampedSpeed;
      const vy = Math.sin(angle) * clampedSpeed;

      const spell = {
        id: this.nextSpellId++,
        type: spellId,
        spellType: SPELL_TYPES.HOMING,
        ownerId: playerId,
        x: originX,
        y: originY,
        originX, originY,
        vx, vy,
        angle,
        radius: stats.radius || 7,
        damage: stats.damage || 3,
        knockbackForce: stats.knockbackForce || 0.06,
        lifetime: stats.lifetime || 4000,
        elapsed: 0,
        active: true,
        turnRate: stats.turnRate || 0.08,
        trackingRange: stats.trackingRange || 400,
        speed: clampedSpeed,
        // Warhead T2: explosion on impact
        explosionRadius: stats.explosionRadius || 0,
      };

      this.activeSpells.push(spell);
      spells.push(spell);
    }

    return spells.length === 1 ? spells[0] : spells;
  }

  // ═══════════════════════════════════════════════════════
  // BOOMERANG — Projectile that returns
  // ═══════════════════════════════════════════════════════

  spawnBoomerang(playerId, spellId, stats, originX, originY, targetX, targetY) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const clampedSpeed = ServerSpell.clampSpeed(stats.speed);

    const spell = {
      id: this.nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.BOOMERANG,
      ownerId: playerId,
      x: originX,
      y: originY,
      originX, originY,
      vx: nx * clampedSpeed,
      vy: ny * clampedSpeed,
      radius: stats.radius || 8,
      damage: stats.damage || 2,
      knockbackForce: stats.knockbackForce || 0.03,
      maxKnockbackForce: stats.maxKnockbackForce || 0.09,
      range: stats.range || 400,
      lifetime: stats.lifetime || 3000,
      elapsed: 0,
      active: true,
      returning: false,
      hitIds: [],
      hitsOnReturn: stats.hitsOnReturn || false,
      cooldownOnCatch: stats.cooldownOnCatch || 0,
      speed: clampedSpeed,
      maxDist: 0, // track max distance traveled (for KB scaling)
    };

    this.activeSpells.push(spell);
    return spell;
  }

  // ═══════════════════════════════════════════════════════
  // WALL — Ice Wall
  // ═══════════════════════════════════════════════════════

  spawnWall(playerId, spellId, stats, targetX, targetY, originX, originY) {
    // Wall angle: perpendicular to cast direction
    const dx = targetX - originX;
    const dy = targetY - originY;
    const angle = Math.atan2(dy, dx) + Math.PI / 2;

    // Clamp placement within cast range
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRange = stats.range || 200;
    const placeDist = Math.min(dist, maxRange);
    const placeX = originX + (dx / (dist || 1)) * placeDist;
    const placeY = originY + (dy / (dist || 1)) * placeDist;

    const spell = {
      id: this.nextSpellId++,
      type: spellId,
      spellType: SPELL_TYPES.WALL,
      ownerId: playerId,
      x: placeX,
      y: placeY,
      angle,
      wallWidth: stats.wallWidth || 80,
      wallThickness: stats.wallThickness || 16,
      wallHp: stats.wallHp || 30,
      maxWallHp: stats.wallHp || 30,
      lifetime: stats.wallDuration || 4000,
      elapsed: 0,
      active: true,
      // Shatter effect (T2)
      shatterSlowAmount: stats.shatterSlowAmount || 0,
      shatterSlowDuration: stats.shatterSlowDuration || 0,
      shatterRadius: stats.shatterRadius || 0,
    };

    this.activeSpells.push(spell);
    this.activeWalls.push(spell);
    return spell;
  }


  // ═══════════════════════════════════════════════════════
  // UPDATE LOOP
  // ═══════════════════════════════════════════════════════

  update(deltaMs) {
    const now = Date.now();

    // --- Record position history for Recall ---
    for (const [playerId, body] of this.physics.playerBodies) {
      const history = this.positionHistory.get(playerId);
      if (history) {
        history.push({ x: body.position.x, y: body.position.y, time: now });
        // Keep only last 5 seconds of history
        while (history.length > 0 && history[0].time < now - 5000) {
          history.shift();
        }
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

    // --- Update active spells ---
    for (let i = this.activeSpells.length - 1; i >= 0; i--) {
      const spell = this.activeSpells[i];
      spell.elapsed += deltaMs;

      if (spell.elapsed >= spell.lifetime) {
        this._cleanupSpell(spell);
        this.removeSpell(i);
        continue;
      }

      // --- PROJECTILE movement & collision ---
      if (spell.spellType === SPELL_TYPES.PROJECTILE && spell.active) {
        spell.x += spell.vx;
        spell.y += spell.vy;

        // Bouncer: bounce off obstacles instead of being destroyed
        const hitObs = this.checkObstacleHit(spell.x, spell.y, spell.radius);
        if (hitObs) {
          if (spell.maxBounces > 0 && spell.bounceCount < spell.maxBounces) {
            // Reflect velocity off obstacle surface
            const dx = spell.x - hitObs.x;
            const dy = spell.y - hitObs.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = dx / dist;
            const ny = dy / dist;
            const dot = spell.vx * nx + spell.vy * ny;
            spell.vx -= 2 * dot * nx;
            spell.vy -= 2 * dot * ny;
            // Push out of obstacle
            spell.x = hitObs.x + nx * (hitObs.radius + spell.radius + 1);
            spell.y = hitObs.y + ny * (hitObs.radius + spell.radius + 1);
            spell.bounceCount++;
            // Grow knockback per bounce (Bouncer T2)
            if (spell.kbPerBounce) {
              spell.knockbackForce += spell.kbPerBounce;
            }
          } else {
            spell.active = false;
            this.removeSpell(i);
            continue;
          }
        }

        // Check wall collision
        const hitWall = this.checkWallHit(spell.x, spell.y, spell.radius, spell.ownerId);
        if (hitWall) {
          // Damage the wall
          hitWall.wallHp -= (spell.damage || 1);
          spell.active = false;
          this.removeSpell(i);
          continue;
        }

        // Check collision with players
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (this.isEliminated(playerId)) continue;

          // Intangible players: projectiles pass through
          const targetEffects = this.statusEffects.get(playerId);
          if (targetEffects && targetEffects.intangible) continue;

          // Shield: absorb hit instead of taking damage
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
              if (!spell.piercing) {
                spell.active = false;
                this.removeSpell(i);
                break;
              }
              continue;
            }
          }

          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < spell.radius + PLAYER.RADIUS) {
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 1;
            const kbMult = this._getKnockbackMultiplier(spell.ownerId);
            this.physics.applyKnockback(playerId,
              nx * spell.knockbackForce * kbMult,
              ny * spell.knockbackForce * kbMult,
              this.getDamageTaken(playerId),
              spell.ownerId,
            );

            this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });

            // Status effects
            if (spell.slowAmount > 0 && spell.slowDuration > 0) {
              this.applyStatusEffect(playerId, 'slow', {
                amount: spell.slowAmount,
                until: now + spell.slowDuration,
              }, spell.type);
            }
            if (spell.rootDuration > 0) {
              this.applyStatusEffect(playerId, 'root', {
                until: now + spell.rootDuration,
              }, spell.type);
            }
            if (spell.stunDuration > 0) {
              this.applyStatusEffect(playerId, 'stun', {
                until: now + spell.stunDuration,
              });
            }

            // Explosion on impact
            if (spell.explosionRadius > 0) {
              this.handleExplosion(spell, body.position.x, body.position.y, playerId);
            }

            if (!spell.piercing) {
              spell.active = false;
              this.removeSpell(i);
              break;
            }
          }
        }
      }

      // --- ZONE effects ---
      if (spell.spellType === SPELL_TYPES.ZONE && spell.active) {
        // Meteor: delayed impact
        if (spell.isMeteor && !spell.impactTriggered) {
          if (spell.elapsed >= spell.impactDelay) {
            spell.impactTriggered = true;
            // AoE push on impact
            for (const [playerId, body] of this.physics.playerBodies) {
              if (playerId === spell.ownerId) continue;
              if (this.isEliminated(playerId)) continue;
              const dx = body.position.x - spell.x;
              const dy = body.position.y - spell.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < spell.radius + PLAYER.RADIUS) {
                const nx = dist > 0 ? dx / dist : 0;
                const ny = dist > 0 ? dy / dist : 1;
                const kbMult = this._getKnockbackMultiplier(spell.ownerId);
                const force = spell.knockbackForce * (1 - dist / (spell.radius + PLAYER.RADIUS));
                this.physics.applyKnockback(playerId,
                  nx * Math.max(force, spell.knockbackForce * 0.3) * kbMult,
                  ny * Math.max(force, spell.knockbackForce * 0.3) * kbMult,
                  this.getDamageTaken(playerId),
                  spell.ownerId,
                );
                this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
              }
            }
            // If meteor has burn zone, extend lifetime for afterburn
            if (spell.burnZoneDuration > 0) {
              spell.lifetime = spell.elapsed + spell.burnZoneDuration;
              spell.isBurning = true;
            }
          }
          continue; // Skip normal zone tick during delay
        }

        // Normal zone tick (Blizzard) or meteor afterburn
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (this.isEliminated(playerId)) continue;
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < spell.radius) {
            // Apply slow
            const slowAmt = spell.isBurning ? (spell.burnSlowAmount || 0) : spell.slowAmount;
            if (slowAmt > 0) {
              this.applyStatusEffect(playerId, 'slow', {
                amount: slowAmt,
                until: now + (spell.slowDuration || 500),
              }, spell.type);
            }
            // Zone damage per tick
            const tickDmg = spell.isBurning ? 1 : spell.damage;
            if (tickDmg > 0) {
              const tickDamage = tickDmg * (PHYSICS.TICK_MS / 1000);
              this.pendingHits.push({
                attackerId: spell.ownerId,
                targetId: playerId,
                damage: tickDamage,
                spellId: spell.type,
              });
            }
          }
        }
      }

      // --- WALL checks ---
      if (spell.spellType === SPELL_TYPES.WALL && spell.active) {
        // Check wall HP
        if (spell.wallHp <= 0) {
          // Wall destroyed — shatter effect
          if (spell.shatterRadius > 0) {
            for (const [playerId, body] of this.physics.playerBodies) {
              if (playerId === spell.ownerId) continue;
              if (this.isEliminated(playerId)) continue;
              const dx = body.position.x - spell.x;
              const dy = body.position.y - spell.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < spell.shatterRadius) {
                this.applyStatusEffect(playerId, 'slow', {
                  amount: spell.shatterSlowAmount,
                  until: now + spell.shatterSlowDuration,
                }, spell.type);
              }
            }
          }
          this._cleanupSpell(spell);
          this.removeSpell(i);
          continue;
        }

        // Wall blocks player movement (push players out of wall bounds)
        for (const [playerId, body] of this.physics.playerBodies) {
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const cos = Math.cos(-spell.angle);
          const sin = Math.sin(-spell.angle);
          const lx = dx * cos - dy * sin;
          const ly = dx * sin + dy * cos;
          const hw = (spell.wallWidth || 80) / 2 + PLAYER.RADIUS;
          const ht = (spell.wallThickness || 16) / 2 + PLAYER.RADIUS;
          if (Math.abs(lx) < hw && Math.abs(ly) < ht) {
            // Push player out along shortest exit axis
            const overlapX = hw - Math.abs(lx);
            const overlapY = ht - Math.abs(ly);
            if (overlapX < overlapY) {
              const pushLx = Math.sign(lx) * hw;
              const cosR = Math.cos(spell.angle);
              const sinR = Math.sin(spell.angle);
              const pushX = pushLx * cosR - ly * sinR + spell.x;
              const pushY = pushLx * sinR + ly * cosR + spell.y;
              Body.setPosition(body, { x: pushX, y: body.position.y });
            } else {
              const pushLy = Math.sign(ly) * ht;
              const cosR = Math.cos(spell.angle);
              const sinR = Math.sin(spell.angle);
              const pushX = lx * cosR - pushLy * sinR + spell.x;
              const pushY = lx * sinR + pushLy * cosR + spell.y;
              Body.setPosition(body, { x: body.position.x, y: pushY });
            }
          }
        }
      }

      // --- SWAP projectile movement & hit ---
      if (spell.spellType === SPELL_TYPES.SWAP && spell.active) {
        spell.x += spell.vx;
        spell.y += spell.vy;

        // Obstacle collision
        if (this.checkObstacleHit(spell.x, spell.y, spell.radius)) {
          spell.active = false;
          this.removeSpell(i);
          continue;
        }

        // Player collision: swap positions
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (this.isEliminated(playerId)) continue;
          const targetEffects = this.statusEffects.get(playerId);
          if (targetEffects && targetEffects.intangible) continue;

          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < spell.radius + PLAYER.RADIUS) {
            // Swap positions
            const casterBody = this.physics.playerBodies.get(spell.ownerId);
            if (casterBody) {
              const casterPos = { x: casterBody.position.x, y: casterBody.position.y };
              const targetPos = { x: body.position.x, y: body.position.y };
              Body.setPosition(casterBody, targetPos);
              Body.setPosition(body, casterPos);
              // Reset velocities
              Body.setVelocity(casterBody, { x: 0, y: 0 });
              Body.setVelocity(body, { x: 0, y: 0 });

              // Stun the swapped enemy (T2)
              if (spell.swapStunDuration > 0) {
                this.applyStatusEffect(playerId, 'stun', {
                  until: now + spell.swapStunDuration,
                });
              }
            }
            spell.active = false;
            this.removeSpell(i);
            break;
          }
        }
      }

      // --- HOMING missile steering ---
      if (spell.spellType === SPELL_TYPES.HOMING && spell.active) {
        // Find nearest target
        let nearestDist = spell.trackingRange;
        let nearestBody = null;
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (this.isEliminated(playerId)) continue;
          const targetEffects = this.statusEffects.get(playerId);
          if (targetEffects && targetEffects.intangible) continue;
          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestBody = body;
          }
        }

        // Steer toward target
        if (nearestBody) {
          const dx = nearestBody.position.x - spell.x;
          const dy = nearestBody.position.y - spell.y;
          const targetAngle = Math.atan2(dy, dx);
          let angleDiff = targetAngle - spell.angle;
          // Normalize to [-PI, PI]
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          // Clamp turn rate
          const maxTurn = spell.turnRate || 0.08;
          spell.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        }

        spell.vx = Math.cos(spell.angle) * spell.speed;
        spell.vy = Math.sin(spell.angle) * spell.speed;
        spell.x += spell.vx;
        spell.y += spell.vy;

        // Obstacle collision
        if (this.checkObstacleHit(spell.x, spell.y, spell.radius)) {
          spell.active = false;
          this.removeSpell(i);
          continue;
        }

        // Player collision
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (this.isEliminated(playerId)) continue;
          const targetEffects = this.statusEffects.get(playerId);
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
              this.removeSpell(i);
              break;
            }
          }

          const dx = body.position.x - spell.x;
          const dy = body.position.y - spell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < spell.radius + PLAYER.RADIUS) {
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 1;
            const kbMult = this._getKnockbackMultiplier(spell.ownerId);
            this.physics.applyKnockback(playerId,
              nx * spell.knockbackForce * kbMult,
              ny * spell.knockbackForce * kbMult,
              this.getDamageTaken(playerId),
              spell.ownerId,
            );
            this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });

            // Explosion on impact (Warhead T2)
            if (spell.explosionRadius > 0) {
              this.handleExplosion(spell, body.position.x, body.position.y, playerId);
            }

            spell.active = false;
            this.removeSpell(i);
            break;
          }
        }
      }

      // --- BOOMERANG movement ---
      if (spell.spellType === SPELL_TYPES.BOOMERANG && spell.active) {
        spell.x += spell.vx;
        spell.y += spell.vy;

        const dx = spell.x - spell.originX;
        const dy = spell.y - spell.originY;
        const distFromOrigin = Math.sqrt(dx * dx + dy * dy);
        spell.maxDist = Math.max(spell.maxDist, distFromOrigin);

        // Check if should reverse
        if (!spell.returning && distFromOrigin >= spell.range) {
          spell.returning = true;
          spell.hitIds = []; // Reset hit tracking for return trip if hitsOnReturn
        }

        // Steer back toward caster when returning
        if (spell.returning) {
          const casterBody = this.physics.playerBodies.get(spell.ownerId);
          if (casterBody) {
            const cx = casterBody.position.x - spell.x;
            const cy = casterBody.position.y - spell.y;
            const cDist = Math.sqrt(cx * cx + cy * cy) || 1;
            spell.vx = (cx / cDist) * spell.speed;
            spell.vy = (cy / cDist) * spell.speed;

            // Caught by caster
            if (cDist < PLAYER.RADIUS + spell.radius) {
              // Reduce cooldown on catch (T2)
              if (spell.cooldownOnCatch) {
                const cd = this.cooldowns.get(spell.ownerId);
                if (cd && cd[spell.type]) {
                  cd[spell.type] = Math.max(0, cd[spell.type] + spell.cooldownOnCatch);
                }
              }
              spell.active = false;
              this.removeSpell(i);
              continue;
            }
          }
        }

        // Player collision
        for (const [playerId, body] of this.physics.playerBodies) {
          if (playerId === spell.ownerId) continue;
          if (this.isEliminated(playerId)) continue;
          if (spell.hitIds.includes(playerId)) continue; // Already hit this pass
          const targetEffects = this.statusEffects.get(playerId);
          if (targetEffects && targetEffects.intangible) continue;

          // Skip return hits if hitsOnReturn not enabled
          if (spell.returning && !spell.hitsOnReturn) continue;

          const pdx = body.position.x - spell.x;
          const pdy = body.position.y - spell.y;
          const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

          if (pDist < spell.radius + PLAYER.RADIUS) {
            // KB scales with distance traveled
            const distRatio = spell.maxDist / (spell.range || 400);
            const scaledKb = spell.knockbackForce + (spell.maxKnockbackForce - spell.knockbackForce) * Math.min(1, distRatio);

            const nx = pDist > 0 ? pdx / pDist : 0;
            const ny = pDist > 0 ? pdy / pDist : 1;
            const kbMult = this._getKnockbackMultiplier(spell.ownerId);
            this.physics.applyKnockback(playerId,
              nx * scaledKb * kbMult,
              ny * scaledKb * kbMult,
              this.getDamageTaken(playerId),
              spell.ownerId,
            );
            this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
            spell.hitIds.push(playerId);
          }
        }
      }

      // --- BUFF: Flash trail ---
      if (spell.spellType === SPELL_TYPES.BUFF && spell.leaveTrail && spell.trailPositions) {
        const ownerBody = this.physics.playerBodies.get(spell.ownerId);
        if (ownerBody) {
          spell.trailPositions.push({ x: ownerBody.position.x, y: ownerBody.position.y, time: now });
          // Clean old trail positions (older than trail slow duration)
          const trailTimeout = spell.trailSlowDuration || 1500;
          while (spell.trailPositions.length > 0 && spell.trailPositions[0].time < now - trailTimeout) {
            spell.trailPositions.shift();
          }
          // Check enemies crossing trail
          if (spell.trailSlowAmount > 0) {
            for (const [playerId, body] of this.physics.playerBodies) {
              if (playerId === spell.ownerId) continue;
              if (this.isEliminated(playerId)) continue;
              for (const tp of spell.trailPositions) {
                const dx = body.position.x - tp.x;
                const dy = body.position.y - tp.y;
                if (dx * dx + dy * dy < 20 * 20) { // 20px trail width
                  this.applyStatusEffect(playerId, 'slow', {
                    amount: spell.trailSlowAmount,
                    until: now + 500,
                  }, spell.type);
                  break;
                }
              }
            }
          }
        }
        // Update spell position for client rendering
        spell.x = ownerBody ? ownerBody.position.x : spell.x;
        spell.y = ownerBody ? ownerBody.position.y : spell.y;
      }

      // --- Hook Branch A: Swing & Release ---
      if (spell.spellType === SPELL_TYPES.HOOK && spell.hooked && !spell.pullSelf && spell.hookedPlayerId && !spell.released) {
        const hookedBody = this.physics.playerBodies.get(spell.hookedPlayerId);
        const casterBody = this.physics.playerBodies.get(spell.ownerId);

        if (hookedBody && casterBody) {
          const dt = PHYSICS.TICK_MS / 1000;

          if (spell.swingElapsed === 0) {
            const dx = hookedBody.position.x - casterBody.position.x;
            const dy = hookedBody.position.y - casterBody.position.y;
            spell.swingAngle = Math.atan2(dy, dx);
            spell.orbitRadius = Math.min(Math.sqrt(dx * dx + dy * dy), 120);
            this.applyStatusEffect(spell.hookedPlayerId, 'stun', {
              until: now + spell.swingDuration + 100,
            });
          }

          spell.swingElapsed += PHYSICS.TICK_MS;

          if (spell.swingElapsed < spell.swingDuration) {
            const t = spell.swingElapsed / spell.swingDuration;
            const angularSpeed = 4 + t * 6;
            spell.swingAngle += angularSpeed * dt;
            const orbitX = casterBody.position.x + Math.cos(spell.swingAngle) * spell.orbitRadius;
            const orbitY = casterBody.position.y + Math.sin(spell.swingAngle) * spell.orbitRadius;
            Body.setPosition(hookedBody, { x: orbitX, y: orbitY });
            Body.setVelocity(hookedBody, { x: 0, y: 0 });
            spell.x = orbitX;
            spell.y = orbitY;
          } else {
            const tangentX = -Math.sin(spell.swingAngle);
            const tangentY = Math.cos(spell.swingAngle);
            const releaseForce = spell.pullForce * 2.5 * this._getKnockbackMultiplier(spell.ownerId);
            this.physics.applyKnockback(
              spell.hookedPlayerId,
              tangentX * releaseForce,
              tangentY * releaseForce,
              this.getDamageTaken(spell.hookedPlayerId),
              spell.ownerId,
            );
            spell.released = true;
            spell.lifetime = spell.elapsed + 300;
            spell.x = hookedBody.position.x;
            spell.y = hookedBody.position.y;
          }
        }
      }

      // --- Hook Branch B: Velocity-based grapple pull ---
      if (spell.spellType === SPELL_TYPES.HOOK && spell.hooked && spell.pullSelf && spell.pullActive && !spell.released) {
        const casterBody = this.physics.playerBodies.get(spell.ownerId);

        if (casterBody) {
          if (spell.pullStartX === 0 && spell.pullStartY === 0) {
            spell.pullStartX = casterBody.position.x;
            spell.pullStartY = casterBody.position.y;
          }

          this.physics.knockbackUntil.set(spell.ownerId, now + PHYSICS.TICK_MS * 3);
          spell.swingElapsed += PHYSICS.TICK_MS;

          const dx = spell.anchorX - casterBody.position.x;
          const dy = spell.anchorY - casterBody.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 20) {
            const nx = dx / dist;
            const ny = dy / dist;
            Body.setVelocity(casterBody, { x: nx * spell.pullSpeed, y: ny * spell.pullSpeed });
          }

          spell.x = casterBody.position.x;
          spell.y = casterBody.position.y;

          // Pull collision
          if (spell.flightCollision) {
            for (const [playerId, body] of this.physics.playerBodies) {
              if (playerId === spell.ownerId) continue;
              if (this.isEliminated(playerId)) continue;
              if (spell.flightHitIds.includes(playerId)) continue;
              const edx = body.position.x - casterBody.position.x;
              const edy = body.position.y - casterBody.position.y;
              const eDist = Math.sqrt(edx * edx + edy * edy);
              if (eDist < PLAYER.RADIUS * 2.5) {
                const enx = eDist > 0 ? edx / eDist : 0;
                const eny = eDist > 0 ? edy / eDist : 1;
                const pullKbMult = this._getKnockbackMultiplier(spell.ownerId);
                this.physics.applyKnockback(playerId,
                  enx * (spell.flightKnockback || 0.02) * pullKbMult,
                  eny * (spell.flightKnockback || 0.02) * pullKbMult,
                  this.getDamageTaken(playerId),
                  spell.ownerId,
                );
                if (spell.flightDamage > 0) {
                  this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.flightDamage, spellId: spell.type });
                }
                spell.flightHitIds.push(playerId);
              }
            }
          }

          const reachedAnchor = dist <= 20;
          const shouldRelease = reachedAnchor || spell.releaseRequested || spell.swingElapsed >= 3000;

          if (shouldRelease) {
            const launchDx = spell.anchorX - spell.pullStartX;
            const launchDy = spell.anchorY - spell.pullStartY;
            const launchDist = Math.sqrt(launchDx * launchDx + launchDy * launchDy) || 1;
            const launchNx = launchDx / launchDist;
            const launchNy = launchDy / launchDist;
            const launchSpeed = Math.min(spell.pullSpeed + (spell.launchSpeedBonus || 0) + 2, 10);

            Body.setVelocity(casterBody, { x: launchNx * launchSpeed, y: launchNy * launchSpeed });
            this.physics.knockbackUntil.set(spell.ownerId, now + spell.flightDuration + 500);

            spell.released = true;
            spell.pullActive = false;
            spell.flightActive = true;
            spell.flightElapsed = 0;
            spell.flightHitIds = [];
            spell.lifetime = spell.elapsed + spell.flightDuration + 300;
          }
        }
      }

      // --- Hook Branch B: Post-launch flight collision ---
      if (spell.spellType === SPELL_TYPES.HOOK && spell.released && spell.pullSelf && spell.flightActive) {
        const casterBody = this.physics.playerBodies.get(spell.ownerId);
        if (casterBody) {
          spell.flightElapsed += PHYSICS.TICK_MS;
          spell.x = casterBody.position.x;
          spell.y = casterBody.position.y;

          if (spell.flightCollision) {
            for (const [playerId, body] of this.physics.playerBodies) {
              if (playerId === spell.ownerId) continue;
              if (this.isEliminated(playerId)) continue;
              if (spell.flightHitIds.includes(playerId)) continue;
              const dx = body.position.x - casterBody.position.x;
              const dy = body.position.y - casterBody.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < PLAYER.RADIUS * 2.5) {
                const nx = dist > 0 ? dx / dist : 0;
                const ny = dist > 0 ? dy / dist : 1;
                const flightKbMult = this._getKnockbackMultiplier(spell.ownerId);
                this.physics.applyKnockback(playerId,
                  nx * (spell.flightKnockback || 0.02) * flightKbMult,
                  ny * (spell.flightKnockback || 0.02) * flightKbMult,
                  this.getDamageTaken(playerId),
                  spell.ownerId,
                );
                if (spell.flightDamage > 0) {
                  this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.flightDamage, spellId: spell.type });
                }
                spell.flightHitIds.push(playerId);
              }
            }
          }

          if (spell.flightElapsed >= spell.flightDuration) {
            spell.flightActive = false;
            spell.lifetime = spell.elapsed + 100;
          }
        }
      }

      // --- Hook projectile movement & grab ---
      if (spell.spellType === SPELL_TYPES.HOOK && spell.active && !spell.hooked) {
        spell.x += spell.vx;
        spell.y += spell.vy;

        if (this.checkObstacleHit(spell.x, spell.y, spell.radius)) {
          spell.active = false;
          this.removeSpell(i);
          continue;
        }

        const dx = spell.x - spell.originX;
        const dy = spell.y - spell.originY;
        const travelDist = Math.sqrt(dx * dx + dy * dy);
        if (travelDist > spell.range) {
          spell.active = false;
          this.removeSpell(i);
          continue;
        }

        if (!spell.pullSelf) {
          for (const [playerId, body] of this.physics.playerBodies) {
            if (playerId === spell.ownerId) continue;
            if (this.isEliminated(playerId)) continue;
            const pdx = body.position.x - spell.x;
            const pdy = body.position.y - spell.y;
            const dist = Math.sqrt(pdx * pdx + pdy * pdy);

            if (dist < spell.radius + PLAYER.RADIUS) {
              spell.hooked = true;
              spell.hookedPlayerId = playerId;
              spell.swingElapsed = 0;
              this.pendingHits.push({ attackerId: spell.ownerId, targetId: playerId, damage: spell.damage, spellId: spell.type });
              spell.lifetime = spell.elapsed + spell.swingDuration + 500;
              break;
            }
          }
        } else {
          spell.traveledDist += Math.sqrt(spell.vx * spell.vx + spell.vy * spell.vy);
          if (spell.traveledDist >= spell.travelDist) {
            spell.x = spell.hookTargetX;
            spell.y = spell.hookTargetY;
            spell.hooked = true;
            spell.swingElapsed = 0;
            spell.pullActive = true;
            spell.anchorX = spell.x;
            spell.anchorY = spell.y;
            spell.lifetime = spell.elapsed + 3000 + spell.flightDuration + 500;
          }
        }
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

    // Also do frostbolt vs fireball neutralization (legacy but adapted for new spell IDs)
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

  // --- Character Passive Helpers ---

  _getKnockbackMultiplier(ownerId) {
    const passive = getPassive(this.getCharacterId(ownerId));
    return 1 + (passive.knockbackBonus || 0);
  }

  // --- Cleanup helpers ---

  _cleanupSpell(spell) {
    // Remove wall from activeWalls list
    if (spell.spellType === SPELL_TYPES.WALL) {
      const idx = this.activeWalls.indexOf(spell);
      if (idx !== -1) this.activeWalls.splice(idx, 1);
    }
  }

  // --- Status Effects ---

  applyStatusEffect(playerId, type, data, sourceSpellId = null) {
    const effects = this.statusEffects.get(playerId);
    if (!effects) return;

    // Character passive: frost resistance
    if (sourceSpellId && sourceSpellId.startsWith('frostbolt') && (type === 'slow' || type === 'root')) {
      const targetPassive = getPassive(this.getCharacterId(playerId));
      if (targetPassive.frostResist) {
        const now = Date.now();
        const originalDuration = data.until - now;
        data.until = now + originalDuration * (1 - targetPassive.frostResist);
      }
    }

    if (type === 'slow') {
      if (!effects.slow || data.amount > effects.slow.amount || data.until > effects.slow.until) {
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

  // --- Explosion Handler ---

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

  requestHookRelease(playerId) {
    const spell = this.activeSpells.find(
      s => s.spellType === SPELL_TYPES.HOOK && s.ownerId === playerId
        && s.pullSelf && s.hooked && s.pullActive && !s.released
    );
    if (!spell) return;
    spell.releaseRequested = true;
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
      this._cleanupSpell(this.activeSpells[i]);
      this.removeSpell(i);
    }
    this.activeWalls = [];
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
      released: s.released || false,
      anchorX: s.anchorX || 0,
      anchorY: s.anchorY || 0,
      swingElapsed: s.swingElapsed || 0,
      swingDuration: s.swingDuration || 0,
      pullActive: s.pullActive || false,
      flightActive: s.flightActive || false,
      // New fields for client rendering
      returning: s.returning || false,
      isMeteor: s.isMeteor || false,
      impactDelay: s.impactDelay || 0,
      impactTriggered: s.impactTriggered || false,
      buffType: s.buffType || null,
      wallWidth: s.wallWidth || 0,
      wallThickness: s.wallThickness || 0,
      wallHp: s.wallHp || 0,
      maxWallHp: s.maxWallHp || 0,
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
