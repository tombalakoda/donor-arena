import { PHYSICS, DAMAGE, SANDBOX } from '../../shared/constants.js';
import { getPassive } from '../../shared/characterPassives.js';
import { PHASE } from './RoundManager.js';
import { MSG } from '../../shared/messageTypes.js';
import { getSpawnPositions } from './utils.js';

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
        if (room.physics.isInKnockback(playerId)) {
          player.input = null;
        } else {
          const effects = room.spells.getStatusEffects(playerId);
          const reached = room.physics.applyInput(playerId, player.input, effects);
          if (reached) {
            player.input = null;
          }
        }
      }
    }

    if (isPlaying) {
      // Update spells BEFORE physics step so forces (e.g. grappling pull)
      // are resolved in the same tick they're applied
      room.spells.update(PHYSICS.TICK_MS);
    }

    // Step physics — resolves all forces from applyInput + spells.update
    room.physics.step(PHYSICS.TICK_MS);

    if (isPlaying) {
      // Process deferred spell hits
      this.processSpellHits(room.spells.drainHits());

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
  }

  processSpellHits(hits) {
    const room = this.room;

    for (const hit of hits) {
      // Check player targets
      const target = room.players.get(hit.targetId);
      if (target && !target.eliminated) {
        let finalDamage = hit.damage;

        // Apply character passive damage reduction
        const targetPassive = getPassive(target.characterId);
        if (targetPassive.damageReduction) {
          finalDamage *= (1 - targetPassive.damageReduction);
        }
        // Fire resistance (stacks multiplicatively with armor)
        if (targetPassive.fireResist && hit.spellId && hit.spellId.startsWith('fireball')) {
          finalDamage *= (1 - targetPassive.fireResist);
        }

        target.hp = Math.max(0, target.hp - finalDamage);
        room.trackDamage(hit.attackerId, finalDamage);
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

  checkRingDamage() {
    const room = this.room;
    const ringRadius = room.rounds.ringRadius;

    for (const [playerId, player] of room.players) {
      if (player.eliminated) continue;
      const state = room.physics.getPlayerState(playerId);
      if (!state) continue;

      const distFromCenter = Math.sqrt(state.x * state.x + state.y * state.y);
      if (distFromCenter > ringRadius) {
        const overshoot = distFromCenter - ringRadius;
        const damage = (DAMAGE.RING_BASE + overshoot * overshoot * DAMAGE.RING_SCALE) * (PHYSICS.TICK_MS / 1000);
        player.hp = Math.max(0, player.hp - damage);

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
        playerStates.push({
          id: playerId,
          x: phys.x,
          y: phys.y,
          vx: phys.vx,
          vy: phys.vy,
          kb: phys.kb,
          hp: player.hp,
          maxHp: player.maxHp,
          characterId: player.characterId,
          name: player.name,
          eliminated: player.eliminated,
        });
      }
    }

    // Include dummies in sandbox mode
    if (room.sandbox) {
      for (const [dummyId, dummy] of room.dummies) {
        const phys = room.physics.getPlayerState(dummyId);
        if (phys) {
          playerStates.push({
            id: dummyId,
            x: phys.x,
            y: phys.y,
            vx: phys.vx,
            vy: phys.vy,
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

    for (const [playerId, player] of room.players) {
      const cd = room.spells.getCooldowns(playerId);
      const charges = room.spells.getCharges(playerId);
      const progression = room.progressions.get(playerId);
      player.socket.emit(MSG.SERVER_STATE, {
        ...snapshot,
        cooldowns: cd,
        charges,
        progression: progression ? progression.getState() : null,
      });
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
