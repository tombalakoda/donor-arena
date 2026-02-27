import { ServerPhysics } from '../game/ServerPhysics.js';
import { ServerSpell } from '../game/ServerSpell.js';
import { RoundManager, PHASE } from '../game/RoundManager.js';
import { PlayerProgression } from '../game/PlayerProgression.js';
import { MSG } from '../../shared/messageTypes.js';
import { PHYSICS, MATCH, ARENA, DAMAGE, PLAYER, SANDBOX } from '../../shared/constants.js';

function getSpawnPositions(count, radius = 200) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    positions.push({
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    });
  }
  return positions;
}

const DUMMY_CHARACTERS = ['knight', 'ninja-green', 'demon-red', 'eskimo'];

export class Room {
  constructor(id, options = {}) {
    this.id = id;
    this.sandbox = options.sandbox || false;
    this.players = new Map();
    this.physics = new ServerPhysics();
    this.spells = new ServerSpell(this.physics);
    this.rounds = new RoundManager();
    this.progressions = new Map(); // playerId -> PlayerProgression
    this.tickInterval = null;
    this.tick = 0;
    this.running = false;

    // Per-round tracking for SP calculation
    this.roundDamage = new Map();       // playerId -> total damage dealt this round
    this.roundRingOutKills = new Map();  // playerId -> ring-out kills this round
    this.roundDamageKills = new Map();   // playerId -> damage kills this round

    // Sandbox dummies
    this.dummies = new Map();   // dummyId -> { hp, maxHp, characterId, eliminated, respawnTimer }
  }

  addPlayer(socket, playerName, characterId) {
    const playerId = socket.id;
    const spawnPositions = getSpawnPositions(MATCH.MAX_PLAYERS);
    const spawnIdx = this.players.size;
    const spawn = spawnPositions[spawnIdx] || { x: 0, y: 0 };

    this.players.set(playerId, {
      socket,
      name: playerName || `Player ${this.players.size + 1}`,
      characterId: characterId || 'boy',
      hp: PLAYER.MAX_HP,
      maxHp: PLAYER.MAX_HP,
      score: 0,
      input: null,
      eliminated: false,
    });

    this.physics.addPlayer(playerId, spawn.x, spawn.y);
    this.spells.initPlayer(playerId);
    this.rounds.initPlayer(playerId);

    // Create progression tracker
    this.progressions.set(playerId, new PlayerProgression(playerId));

    const playerInfo = {
      id: playerId,
      name: this.players.get(playerId).name,
      characterId: this.players.get(playerId).characterId,
    };

    for (const [id, p] of this.players) {
      if (id !== playerId) {
        p.socket.emit(MSG.SERVER_PLAYER_JOIN, playerInfo);
      }
    }

    const allPlayers = [];
    for (const [id, p] of this.players) {
      const state = this.physics.getPlayerState(id);
      allPlayers.push({
        id,
        name: p.name,
        characterId: p.characterId,
        x: state ? state.x : 0,
        y: state ? state.y : 0,
      });
    }

    const progression = this.progressions.get(playerId);
    socket.emit(MSG.SERVER_JOINED, {
      playerId,
      players: allPlayers,
      roomId: this.id,
      progression: progression ? progression.getState() : null,
    });

    // Listen for spell casts from this player
    socket.on('c:spell', (data) => {
      this.handleSpellCast(playerId, data);
    });

    // Listen for shop purchases
    socket.on(MSG.CLIENT_SHOP_UNLOCK_SLOT, (data) => {
      this.handleShopUnlockSlot(playerId, data);
    });
    socket.on(MSG.CLIENT_SHOP_CHOOSE_BRANCH, (data) => {
      this.handleShopChooseBranch(playerId, data);
    });
    socket.on(MSG.CLIENT_SHOP_UPGRADE_TIER, (data) => {
      this.handleShopUpgradeTier(playerId, data);
    });

    // Sandbox: give starting SP and shop toggle
    if (this.sandbox) {
      const progression = this.progressions.get(playerId);
      if (progression) {
        progression.awardSP(SANDBOX.STARTING_SP);
      }
      socket.on('c:sandboxShopToggle', () => {
        const prog = this.progressions.get(playerId);
        socket.emit(MSG.SERVER_SHOP_OPEN, {
          progression: prog ? prog.getState() : null,
          shopDuration: 9999,
        });
      });
    }

    if (!this.running && this.players.size >= 1) {
      this.start();
    }

    return playerId;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.physics.removePlayer(playerId);
    this.spells.removePlayer(playerId);
    this.rounds.removePlayer(playerId);
    this.progressions.delete(playerId);
    this.roundDamage.delete(playerId);
    this.roundRingOutKills.delete(playerId);
    this.roundDamageKills.delete(playerId);

    for (const [id, p] of this.players) {
      p.socket.emit(MSG.SERVER_PLAYER_LEAVE, { id: playerId });
    }

    if (this.players.size === 0) {
      this.stop();
    }
  }

  handleInput(playerId, input) {
    const player = this.players.get(playerId);
    if (player) {
      player.input = input;
    }
  }

  handleSpellCast(playerId, data) {
    const player = this.players.get(playerId);
    if (!player || player.eliminated) return;
    // Only allow spells during playing phase
    if (this.rounds.phase !== PHASE.PLAYING) return;

    // Check if player has this spell slot unlocked
    const progression = this.progressions.get(playerId);
    if (progression && !progression.canCastSpell(data.spellId)) return;

    const spell = this.spells.processCast(playerId, data.spellId, data.targetX, data.targetY, progression);
    if (spell) {
      for (const [id, p] of this.players) {
        p.socket.emit('s:spellCast', {
          id: spell.id,
          type: spell.type,
          spellType: spell.spellType,
          ownerId: spell.ownerId,
          x: spell.x,
          y: spell.y,
          vx: spell.vx || 0,
          vy: spell.vy || 0,
          radius: spell.radius,
          width: spell.width,
          height: spell.height,
          angle: spell.angle,
          lifetime: spell.lifetime,
          // Additional data for new spell types
          targetX: spell.targetX,
          targetY: spell.targetY,
          pullSelf: spell.pullSelf,
        });
      }

      if (spell.hits) {
        for (const hit of spell.hits) {
          const target = this.players.get(hit.id);
          if (target) {
            target.hp = Math.max(0, target.hp - hit.damage);
            // Track damage for SP
            this.trackDamage(playerId, hit.damage);

            if (target.hp <= 0 && !target.eliminated) {
              target.eliminated = true;
              this.onPlayerEliminated(hit.id, playerId, 'spell');
            }
          } else if (this.sandbox) {
            // Check if hit a dummy
            const dummy = this.dummies.get(hit.id);
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
    }
  }

  // --- Shop Handlers ---

  handleShopUnlockSlot(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const success = progression.unlockSlot(data.slot);
    if (success) {
      this.sendProgressionUpdate(playerId);
      console.log(`[SHOP] ${playerId} unlocked slot ${data.slot}`);
    }
  }

  handleShopChooseBranch(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const success = progression.chooseBranch(data.spellId, data.branch);
    if (success) {
      this.sendProgressionUpdate(playerId);
      console.log(`[SHOP] ${playerId} chose branch ${data.branch} for ${data.spellId}`);
    }
  }

  handleShopUpgradeTier(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const success = progression.upgradeTier(data.spellId);
    if (success) {
      this.sendProgressionUpdate(playerId);
      console.log(`[SHOP] ${playerId} upgraded tier for ${data.spellId}`);
    }
  }

  sendProgressionUpdate(playerId) {
    const player = this.players.get(playerId);
    const progression = this.progressions.get(playerId);
    if (player && progression) {
      player.socket.emit(MSG.SERVER_SHOP_UPDATE, progression.getState());
    }
  }

  // --- Damage Tracking ---

  trackDamage(attackerId, amount) {
    if (!this.roundDamage.has(attackerId)) {
      this.roundDamage.set(attackerId, 0);
    }
    this.roundDamage.set(attackerId, this.roundDamage.get(attackerId) + amount);
  }

  trackKill(eliminatorId, method) {
    if (method === 'ring') {
      if (eliminatorId) {
        const kills = this.roundRingOutKills.get(eliminatorId) || 0;
        this.roundRingOutKills.set(eliminatorId, kills + 1);
      }
    } else {
      if (eliminatorId) {
        const kills = this.roundDamageKills.get(eliminatorId) || 0;
        this.roundDamageKills.set(eliminatorId, kills + 1);
      }
    }
  }

  resetRoundTracking() {
    this.roundDamage.clear();
    this.roundRingOutKills.clear();
    this.roundDamageKills.clear();
  }

  onPlayerEliminated(eliminatedId, eliminatorId, method) {
    // Track kill for SP
    this.trackKill(eliminatorId, method);

    // Award points to eliminator (existing scoring)
    if (eliminatorId && eliminatorId !== eliminatedId) {
      this.rounds.awardElimination(eliminatorId);
    }

    // Broadcast elimination event
    const eliminated = this.players.get(eliminatedId);
    const eliminator = this.players.get(eliminatorId);
    for (const [id, p] of this.players) {
      p.socket.emit('s:eliminated', {
        playerId: eliminatedId,
        playerName: eliminated?.name || 'Unknown',
        eliminatorId: eliminatorId || null,
        eliminatorName: eliminator?.name || null,
        method,
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.tick = 0;
    this.rounds.startMatch();

    if (this.sandbox) {
      this.rounds.setSandboxMode(true);
      this.spawnDummies();
    }

    this.tickInterval = setInterval(() => {
      this.update();
    }, PHYSICS.TICK_MS);

    console.log(`Room ${this.id} started with ${this.players.size} player(s)`);
  }

  stop() {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log(`Room ${this.id} stopped`);
  }

  // --- Sandbox Dummies ---

  spawnDummies() {
    const positions = getSpawnPositions(SANDBOX.DUMMY_COUNT, 150);
    for (let i = 0; i < SANDBOX.DUMMY_COUNT; i++) {
      const dummyId = `dummy-${i + 1}`;
      const spawn = positions[i];
      this.physics.addPlayer(dummyId, spawn.x, spawn.y);
      this.dummies.set(dummyId, {
        hp: SANDBOX.DUMMY_HP,
        maxHp: SANDBOX.DUMMY_HP,
        characterId: DUMMY_CHARACTERS[i % DUMMY_CHARACTERS.length],
        eliminated: false,
        respawnTimer: 0,
      });
    }
    console.log(`Room ${this.id}: Spawned ${SANDBOX.DUMMY_COUNT} training dummies`);
  }

  updateDummies(deltaMs) {
    for (const [dummyId, dummy] of this.dummies) {
      if (dummy.eliminated) {
        dummy.respawnTimer -= deltaMs;
        if (dummy.respawnTimer <= 0) {
          // Respawn at random position
          dummy.hp = dummy.maxHp;
          dummy.eliminated = false;
          const angle = Math.random() * Math.PI * 2;
          const dist = 100 + Math.random() * 200;
          this.physics.setPlayerPosition(dummyId,
            Math.cos(angle) * dist,
            Math.sin(angle) * dist
          );
        }
      }
    }
  }

  update() {
    this.tick++;

    // Count alive players
    let alivePlayers = 0;
    for (const [, player] of this.players) {
      if (!player.eliminated) alivePlayers++;
    }

    // Update round manager
    const event = this.rounds.update(PHYSICS.TICK_MS, alivePlayers, this.players.size);
    if (event) {
      this.handleRoundEvent(event);
    }

    // Only process gameplay during PLAYING phase
    const isPlaying = this.rounds.phase === PHASE.PLAYING;

    // Apply player inputs (allow movement during countdown too for feel)
    const canMove = isPlaying || this.rounds.phase === PHASE.COUNTDOWN;
    for (const [playerId, player] of this.players) {
      if (player.input && !player.eliminated && canMove) {
        const effects = this.spells.getStatusEffects(playerId);
        const reached = this.physics.applyInput(playerId, player.input, effects);
        if (reached) {
          // Target reached — clear input so force stops, let ice slide happen
          player.input = null;
        }
      }
    }

    // Step physics
    this.physics.step(PHYSICS.TICK_MS);

    if (isPlaying) {
      // Update spells
      this.spells.update(PHYSICS.TICK_MS);

      // Process deferred spell hits (projectile/hook collisions from this tick)
      const spellHits = this.spells.drainHits();
      for (const hit of spellHits) {
        // Check player targets
        const target = this.players.get(hit.targetId);
        if (target && !target.eliminated) {
          target.hp = Math.max(0, target.hp - hit.damage);
          this.trackDamage(hit.attackerId, hit.damage);
          if (target.hp <= 0) {
            target.eliminated = true;
            this.onPlayerEliminated(hit.targetId, hit.attackerId, 'spell');
          }
        }
        // Check dummy targets in sandbox
        if (this.sandbox) {
          const dummy = this.dummies.get(hit.targetId);
          if (dummy && !dummy.eliminated) {
            dummy.hp = Math.max(0, dummy.hp - hit.damage);
            if (dummy.hp <= 0) {
              dummy.eliminated = true;
              dummy.respawnTimer = SANDBOX.DUMMY_RESPAWN_DELAY;
            }
          }
        }
      }

      // Check ring damage (skip in sandbox)
      if (!this.sandbox) {
        this.checkRingDamage();
      }

      // Update dummies in sandbox
      if (this.sandbox) {
        this.updateDummies(PHYSICS.TICK_MS);
      }
    }

    // Build and send state snapshot
    this.broadcastState();
  }

  handleRoundEvent(event) {
    switch (event.event) {
      case 'roundStart':
        this.resetPlayersForRound();
        this.resetRoundTracking();
        this.broadcast(MSG.SERVER_ROUND_START, {
          round: event.round,
          totalRounds: this.rounds.getState().totalRounds,
        });
        console.log(`Room ${this.id}: Round ${event.round} starting`);
        break;

      case 'countdownEnd':
        // Gameplay begins
        break;

      case 'roundEnd': {
        // Find winner (last alive or highest HP)
        let winnerId = null;
        let highestHp = -1;
        for (const [id, player] of this.players) {
          if (!player.eliminated && player.hp > highestHp) {
            highestHp = player.hp;
            winnerId = id;
          }
        }

        // Award points (existing scoring system)
        for (const [id, player] of this.players) {
          if (!player.eliminated) {
            this.rounds.awardSurvival(id);
          }
        }
        if (winnerId) {
          this.rounds.awardRoundWin(winnerId);
        }

        // Award SP from skill tree system
        const spAwards = {};
        for (const [id, player] of this.players) {
          const progression = this.progressions.get(id);
          if (!progression) continue;

          const stats = {
            damageDealt: this.roundDamage.get(id) || 0,
            ringOutKills: this.roundRingOutKills.get(id) || 0,
            damageKills: this.roundDamageKills.get(id) || 0,
            survived: !player.eliminated,
            wonRound: id === winnerId,
          };

          const earned = progression.awardRoundSP(stats);
          spAwards[id] = { earned, total: progression.sp, stats };
        }

        const winner = winnerId ? this.players.get(winnerId) : null;
        this.broadcast(MSG.SERVER_ROUND_END, {
          round: event.round,
          winnerId,
          winnerName: winner?.name || null,
          scores: this.rounds.getScores(),
          timeUp: event.timeUp,
          spAwards,
        });
        console.log(`Room ${this.id}: Round ${event.round} ended. Winner: ${winner?.name || 'none'}`);
        break;
      }

      case 'shopOpen': {
        // Send shop open event with each player's progression state
        for (const [playerId, player] of this.players) {
          const progression = this.progressions.get(playerId);
          player.socket.emit(MSG.SERVER_SHOP_OPEN, {
            progression: progression ? progression.getState() : null,
            shopDuration: this.rounds.getShopTimeRemaining(),
          });
        }
        console.log(`Room ${this.id}: Shop phase opened`);
        break;
      }

      case 'matchEnd':
        this.broadcast(MSG.SERVER_MATCH_END, {
          scores: this.rounds.getScores().map(s => ({
            ...s,
            name: this.players.get(s.id)?.name || s.id.slice(-4),
            characterId: this.players.get(s.id)?.characterId || 'boy',
          })),
        });
        console.log(`Room ${this.id}: Match ended`);
        break;
    }
  }

  resetPlayersForRound() {
    const spawnPositions = getSpawnPositions(this.players.size);
    let idx = 0;
    for (const [playerId, player] of this.players) {
      player.hp = PLAYER.MAX_HP;
      player.eliminated = false;
      const spawn = spawnPositions[idx++] || { x: 0, y: 0 };
      this.physics.setPlayerPosition(playerId, spawn.x, spawn.y);
    }
    // Reset dummies in sandbox
    if (this.sandbox) {
      const dummyPositions = getSpawnPositions(this.dummies.size, 150);
      let dIdx = 0;
      for (const [dummyId, dummy] of this.dummies) {
        dummy.hp = dummy.maxHp;
        dummy.eliminated = false;
        dummy.respawnTimer = 0;
        const spawn = dummyPositions[dIdx++] || { x: 0, y: 0 };
        this.physics.setPlayerPosition(dummyId, spawn.x, spawn.y);
      }
    }
    // Clear active spells
    this.spells.clearAll();
  }

  broadcastState() {
    const playerStates = [];
    for (const [playerId, player] of this.players) {
      const phys = this.physics.getPlayerState(playerId);
      if (phys) {
        playerStates.push({
          id: playerId,
          x: phys.x,
          y: phys.y,
          vx: phys.vx,
          vy: phys.vy,
          hp: player.hp,
          maxHp: player.maxHp,
          characterId: player.characterId,
          name: player.name,
          eliminated: player.eliminated,
        });
      }
    }

    // Include dummies in sandbox mode
    if (this.sandbox) {
      for (const [dummyId, dummy] of this.dummies) {
        const phys = this.physics.getPlayerState(dummyId);
        if (phys) {
          playerStates.push({
            id: dummyId,
            x: phys.x,
            y: phys.y,
            vx: phys.vx,
            vy: phys.vy,
            hp: dummy.hp,
            maxHp: dummy.maxHp,
            characterId: dummy.characterId,
            eliminated: dummy.eliminated,
            isDummy: true,
          });
        }
      }
    }

    const roundState = this.rounds.getState();
    const snapshot = {
      tick: this.tick,
      players: playerStates,
      spells: this.spells.getActiveSpells(),
      ringRadius: roundState.ringRadius,
      round: roundState.round,
      totalRounds: roundState.totalRounds,
      phase: roundState.phase,
      timeRemaining: roundState.timeRemaining,
      countdownRemaining: roundState.countdownRemaining,
      shopTimeRemaining: roundState.shopTimeRemaining,
    };

    for (const [playerId, player] of this.players) {
      const cd = this.spells.getCooldowns(playerId);
      const charges = this.spells.getCharges(playerId);
      const progression = this.progressions.get(playerId);
      player.socket.emit(MSG.SERVER_STATE, {
        ...snapshot,
        cooldowns: cd,
        charges,
        progression: progression ? progression.getState() : null,
      });
    }
  }

  broadcast(event, data) {
    for (const [, player] of this.players) {
      player.socket.emit(event, data);
    }
  }

  checkRingDamage() {
    const ringRadius = this.rounds.ringRadius;
    for (const [playerId, player] of this.players) {
      if (player.eliminated) continue;
      const state = this.physics.getPlayerState(playerId);
      if (!state) continue;

      const distFromCenter = Math.sqrt(state.x * state.x + state.y * state.y);
      if (distFromCenter > ringRadius) {
        const overshoot = distFromCenter - ringRadius;
        const damage = (DAMAGE.RING_BASE + overshoot * overshoot * DAMAGE.RING_SCALE) * (PHYSICS.TICK_MS / 1000);
        player.hp = Math.max(0, player.hp - damage);

        if (player.hp <= 0 && !player.eliminated) {
          player.eliminated = true;
          this.onPlayerEliminated(playerId, null, 'ring');
        }
      }
    }
  }

  get playerCount() {
    return this.players.size;
  }

  destroy() {
    this.stop();
    this.physics.destroy();
    this.players.clear();
    this.progressions.clear();
    this.dummies.clear();
  }
}
