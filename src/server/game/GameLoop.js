import { PHYSICS, DAMAGE, SANDBOX } from '../../shared/constants.js';
import { PHASE } from './RoundManager.js';
import { MSG } from '../../shared/messageTypes.js';
import { getSpawnPositions } from './utils.js';
import { applyDamage } from './damageUtils.js';
import { ServerSpell } from './ServerSpell.js';

const DUMMY_CHARACTERS = ['knight', 'ninja-green', 'demon-red', 'eskimo'];

export class GameLoop {
  /**
   * @param {object} room - The Room instance (provides players, physics, spells, rounds, etc.)
   */
  constructor(room) {
    this.room = room;
  }

  /**
   * Main tick — called every PHYSICS.TICK_MS by Room's setInterval.
   */
  update() {
    try {
      const room = this.room;
      room.tick++;

      // Count alive players
      let alivePlayers = 0;
      for (const [, player] of room.players) {
        if (!player.eliminated) alivePlayers++;
      }

      // Update round manager
      const event = room.rounds.update(PHYSICS.TICK_MS, alivePlayers, room.players.size);
      if (event) {
        room.handleRoundEvent(event);
      }

      // Only process gameplay during PLAYING phase
      const isPlaying = room.rounds.phase === PHASE.PLAYING;

      // Apply player inputs (allow movement during countdown too for feel)
      const canMove = isPlaying || room.rounds.phase === PHASE.COUNTDOWN;
      for (const [playerId, player] of room.players) {
        if (player.input && !player.eliminated && canMove) {
          const effects = room.spells.getStatusEffects(playerId);
          const reached = room.physics.applyInput(playerId, player.input, effects);
          if (reached) {
            player.input = null;
          }
        }
      }

      if (isPlaying) {
        // Update spells BEFORE physics step so forces (e.g. grappling pull)
        // are resolved in the same tick they're applied
        room.spells.update(PHYSICS.TICK_MS);

        // Broadcast spells from completed channels (deferred casts)
        const deferred = room.spells.drainDeferredResults();
        for (const spell of deferred) {
          const payload = ServerSpell.serializeForClient(spell);
          for (const [id, p] of room.players) {
            p.socket.emit(MSG.SERVER_SPELL_CAST, payload);
          }
          // Process instant hit damage from channeled spells
          if (spell.hits) {
            this.processSpellHits(spell.hits.map(h => ({
              targetId: h.id,
              attackerId: spell.ownerId,
              damage: h.damage,
              spellId: spell.type,
            })));
          }
        }
      }

      // Step physics — resolves all forces from applyInput + spells.update
      room.physics.step(PHYSICS.TICK_MS);

      // Clamp residual velocities from spell forces (sema push, çekim pull, tether)
      // that bypass the KB grace/ease system. Must run AFTER step() so forces are
      // integrated, and BEFORE broadcastState() so clients get clean values.
      room.physics.clampNonKnockbackSpeeds();

      if (isPlaying) {
        // Process deferred spell hits
        this.processSpellHits(room.spells.drainHits());

        // Broadcast obstacle destruction events
        const destroyed = room.obstacleManager.flushDestroyed();
        if (destroyed.length > 0) {
          room.broadcast(MSG.SERVER_OBSTACLE_EVENT, { destroyed });
        }

        // Process burn damage ticks from item effects (Yangin Hazine)
        this.processBurnTicks();

        // Track Nazar from KB events
        this.trackNazarFromKB();

        // Check ring damage (skip in sandbox)
        if (!room.sandbox) {
          this.checkRingDamage();
        }

        // Update dummies in sandbox
        if (room.sandbox) {
          this.updateDummies(PHYSICS.TICK_MS);
        }
      }

      // Build and send state snapshot
      this.broadcastState();
    } catch (err) {
      console.error(`[Room ${this.room.id}] Tick error:`, err);
    }
  }

  processSpellHits(hits) {
    const room = this.room;

    for (const hit of hits) {
      // Get item stats for attacker and target
      const attackerProg = room.progressions.get(hit.attackerId);
      const attackerItems = attackerProg ? attackerProg.items.getItemStats() : null;

      // Check player targets
      const target = room.players.get(hit.targetId);
      if (target && !target.eliminated) {
        const targetProg = room.progressions.get(hit.targetId);
        const targetItems = targetProg ? targetProg.items.getItemStats() : null;

        // Build enriched attacker item stats with runtime callbacks for conditional checks
        let enrichedAttackerItems = null;
        if (attackerItems) {
          enrichedAttackerItems = { ...attackerItems };

          // First-hit check: has attacker dealt a hit this round yet?
          if (attackerItems.firstHitBonusDamage > 0 && attackerProg) {
            enrichedAttackerItems._firstHitCheck = () => {
              if (!attackerProg.items.firstHitDealtThisRound) {
                attackerProg.items.firstHitDealtThisRound = true;
                return true;
              }
              return false;
            };
          }

          // Low HP check for attacker (Berserker Hazine)
          if (attackerItems.lowHpDamageBonus > 0) {
            const attacker = room.players.get(hit.attackerId);
            if (attacker) {
              enrichedAttackerItems._attackerHpCheck = () => ({
                hp: attacker.hp,
                maxHp: attacker.maxHp,
              });
            }
          }

          // Target slowed check (Piyano: bonus damage vs slowed)
          if (attackerItems.slowBonusDamage > 0) {
            enrichedAttackerItems._targetIsSlowed = () => {
              const effects = room.spells.getStatusEffects(hit.targetId);
              return !!(effects && effects.slow);
            };
          }
        }

        const finalDamage = applyDamage(target, hit.damage, hit.spellId, enrichedAttackerItems, targetItems);
        room.trackDamage(hit.attackerId, finalDamage);

        // --- Post-damage item effects ---
        if (attackerItems) {
          const now = Date.now();

          // Burn on hit (Yangin Hazine: damage-dealing spells leave a burn)
          if (attackerItems.burnOnHit && attackerItems.burnDamage > 0 && attackerItems.burnDuration > 0) {
            // Apply burn as a status effect on the target
            const targetEffects = room.spells.getStatusEffects(hit.targetId);
            if (targetEffects) {
              const burnEnd = now + attackerItems.burnDuration;
              // Only extend burn, don't stack
              if (!targetEffects.burn || burnEnd > targetEffects.burn.until) {
                targetEffects.burn = {
                  damage: attackerItems.burnDamage,
                  until: burnEnd,
                  attackerId: hit.attackerId,
                };
              }
            }
          }

          // Slow on hit (Mutlak Sifir: all spells apply a small slow)
          if (attackerItems.slowOnHit > 0 && attackerItems.slowOnHitDuration > 0) {
            let slowDuration = attackerItems.slowOnHitDuration;
            // Permafrost Hazine: slow effects applied last 30% longer
            if (attackerItems.slowDurationMult && attackerItems.slowDurationMult !== 1.0) {
              slowDuration *= attackerItems.slowDurationMult;
            }
            room.spells.applyStatusEffect(hit.targetId, 'slow', {
              amount: attackerItems.slowOnHit,
              until: now + slowDuration,
            }, hit.spellId);
          }
        }

        if (target.hp <= 0) {
          target.eliminated = true;
          room.onPlayerEliminated(hit.targetId, hit.attackerId, 'spell');
        }
      }

      // Check dummy targets in sandbox
      if (room.sandbox) {
        const dummy = room.dummies.get(hit.targetId);
        if (dummy && !dummy.eliminated) {
          dummy.hp = Math.max(0, dummy.hp - hit.damage);
          if (dummy.hp <= 0) {
            dummy.eliminated = true;
            dummy.respawnTimer = SANDBOX.DUMMY_RESPAWN_DELAY;
          }
        }
      }
    }
  }

  /**
   * Process burn damage ticks from item effects (Yangin/Cehennem Hazine).
   * Burns deal damage per second, checked each tick.
   */
  processBurnTicks() {
    const room = this.room;
    const now = Date.now();

    for (const [playerId, player] of room.players) {
      if (player.eliminated) continue;
      const effects = room.spells.getStatusEffects(playerId);
      if (!effects || !effects.burn) continue;

      if (now < effects.burn.until) {
        // Burn damage per tick (scaled by tick rate)
        const burnDmg = effects.burn.damage * (PHYSICS.TICK_MS / 1000);
        // Burn can't kill — floor at 1 HP (same as spell damage)
        player.hp = Math.max(1, player.hp - burnDmg);
        if (effects.burn.attackerId) {
          room.trackDamage(effects.burn.attackerId, burnDmg);
        }
      } else {
        delete effects.burn;
      }
    }
  }

  /**
   * Track Nazar bead awards from knockback events.
   * Players earn +1 Nazar when they enter KB grace period.
   */
  trackNazarFromKB() {
    const room = this.room;
    const now = Date.now();

    for (const [playerId, player] of room.players) {
      if (player.eliminated) continue;
      const prog = room.progressions.get(playerId);
      if (!prog) continue;

      const kbUntil = room.physics.knockbackUntil.get(playerId) || 0;

      // Track if player just entered KB (new KB event)
      if (!player._lastKbUntil) player._lastKbUntil = 0;
      if (kbUntil > player._lastKbUntil && kbUntil > now) {
        // New KB event — award 1 Nazar
        prog.items.addNazar(1);

        // Hayalet Hazine: become semi-transparent for 1.5s after taking KB
        const itemStats = prog.items.getItemStats();
        if (itemStats && itemStats.hayaletActive) {
          player.hayaletUntil = now + 1500;
        }
      }
      player._lastKbUntil = kbUntil;
    }
  }

  checkRingDamage() {
    const room = this.room;
    const ringRadius = room.rounds.ringRadius;

    for (const [playerId, player] of room.players) {
      if (player.eliminated) continue;
      const state = room.physics.getPlayerState(playerId);
      if (!state) continue;

      // Skip players with corrupted positions (NaN from physics glitches)
      if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
        console.warn(`[Room ${room.id}] NaN position for ${playerId}, resetting to center`);
        room.physics.setPlayerPosition(playerId, 0, 0);
        continue;
      }

      const distFromCenter = Math.sqrt(state.x * state.x + state.y * state.y);
      if (distFromCenter > ringRadius) {
        const overshoot = distFromCenter - ringRadius;
        const damage = (DAMAGE.RING_BASE + overshoot * overshoot * DAMAGE.RING_SCALE) * (PHYSICS.TICK_MS / 1000);
        player.hp = Math.max(0, player.hp - damage);

        // Nazar: award fractional nazar for ring damage (0.5 per second)
        const prog = room.progressions.get(playerId);
        if (prog) {
          prog.items.addNazarFractional(0.5 * (PHYSICS.TICK_MS / 1000));
        }

        if (player.hp <= 0 && !player.eliminated) {
          player.eliminated = true;
          const lastAttacker = room.physics.getLastKnockbackAttacker(playerId, 5000);
          room.onPlayerEliminated(playerId, lastAttacker, 'ring');
        }
      }
    }
  }

  broadcastState() {
    const room = this.room;
    const playerStates = [];

    for (const [playerId, player] of room.players) {
      const phys = room.physics.getPlayerState(playerId);
      if (phys) {
        // Sanitize corrupted physics values before broadcasting
        const x = Number.isFinite(phys.x) ? phys.x : 0;
        const y = Number.isFinite(phys.y) ? phys.y : 0;
        const vx = Number.isFinite(phys.vx) ? phys.vx : 0;
        const vy = Number.isFinite(phys.vy) ? phys.vy : 0;
        playerStates.push({
          id: playerId,
          x, y, vx, vy,
          kb: phys.kb,
          hp: player.hp,
          maxHp: player.maxHp,
          characterId: player.characterId,
          name: player.name,
          eliminated: player.eliminated,
          intangible: room.spells.isIntangible(playerId),
          hayalet: !!(player.hayaletUntil && Date.now() < player.hayaletUntil),
        });
      }
    }

    // Include dummies in sandbox mode
    if (room.sandbox) {
      for (const [dummyId, dummy] of room.dummies) {
        const phys = room.physics.getPlayerState(dummyId);
        if (phys) {
          const x = Number.isFinite(phys.x) ? phys.x : 0;
          const y = Number.isFinite(phys.y) ? phys.y : 0;
          const vx = Number.isFinite(phys.vx) ? phys.vx : 0;
          const vy = Number.isFinite(phys.vy) ? phys.vy : 0;
          playerStates.push({
            id: dummyId,
            x, y, vx, vy,
            kb: phys.kb,
            hp: dummy.hp,
            maxHp: dummy.maxHp,
            characterId: dummy.characterId,
            eliminated: dummy.eliminated,
            isDummy: true,
          });
        }
      }
    }

    const roundState = room.rounds.getState();
    const snapshot = {
      tick: room.tick,
      players: playerStates,
      spells: room.spells.getActiveSpells(),
      ringRadius: roundState.ringRadius,
      round: roundState.round,
      totalRounds: roundState.totalRounds,
      phase: roundState.phase,
      mapIndex: room.currentMapIndex,
      timeRemaining: roundState.timeRemaining,
      countdownRemaining: roundState.countdownRemaining,
      shopTimeRemaining: roundState.shopTimeRemaining,
    };

    // Reuse a single envelope object — Socket.IO serializes synchronously
    // before emit returns, so mutating per-player fields between emits is safe.
    const envelope = {
      ...snapshot,
      cooldowns: null,
      charges: null,
      progression: null,
    };

    for (const [playerId, player] of room.players) {
      envelope.cooldowns = room.spells.getCooldowns(playerId);
      envelope.charges = room.spells.getCharges(playerId);
      const progression = room.progressions.get(playerId);
      envelope.progression = progression ? progression.getState() : null;
      player.socket.emit(MSG.SERVER_STATE, envelope);
    }
  }

  // --- Sandbox Dummies ---

  spawnDummies() {
    const room = this.room;
    const positions = getSpawnPositions(SANDBOX.DUMMY_COUNT, 150);
    for (let i = 0; i < SANDBOX.DUMMY_COUNT; i++) {
      const dummyId = `dummy-${i + 1}`;
      const spawn = positions[i];
      room.physics.addPlayer(dummyId, spawn.x, spawn.y);
      room.dummies.set(dummyId, {
        hp: SANDBOX.DUMMY_HP,
        maxHp: SANDBOX.DUMMY_HP,
        characterId: DUMMY_CHARACTERS[i % DUMMY_CHARACTERS.length],
        eliminated: false,
        respawnTimer: 0,
      });
    }
    console.log(`Room ${room.id}: Spawned ${SANDBOX.DUMMY_COUNT} training dummies`);
  }

  updateDummies(deltaMs) {
    const room = this.room;
    for (const [dummyId, dummy] of room.dummies) {
      if (dummy.eliminated) {
        dummy.respawnTimer -= deltaMs;
        if (dummy.respawnTimer <= 0) {
          dummy.hp = dummy.maxHp;
          dummy.eliminated = false;
          const angle = Math.random() * Math.PI * 2;
          const dist = 100 + Math.random() * 200;
          room.physics.setPlayerPosition(dummyId,
            Math.cos(angle) * dist,
            Math.sin(angle) * dist
          );
        }
      }
    }
  }
}
