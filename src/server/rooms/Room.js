import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerPhysics } from '../game/ServerPhysics.js';
import { ServerSpell } from '../game/ServerSpell.js';
import { ObstacleManager } from '../game/ObstacleManager.js';
import { RoundManager, PHASE } from '../game/RoundManager.js';
import { PlayerProgression } from '../game/PlayerProgression.js';
import { MSG } from '../../shared/messageTypes.js';
import { PHYSICS, MATCH, ARENA, DAMAGE, PLAYER, SANDBOX } from '../../shared/constants.js';
import { getPassive } from '../../shared/characterPassives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    // Load all arena map variants for per-round obstacle rotation
    this.arenaMaps = [];
    for (let i = 0; i <= 9; i++) {
      try {
        const mapPath = path.join(__dirname, `../../../public/assets/maps/arena${i}.json`);
        this.arenaMaps.push(JSON.parse(readFileSync(mapPath, 'utf-8')));
      } catch (e) {
        // skip missing map files
      }
    }
    // Fallback: load arena-default.json if no numbered maps found
    if (this.arenaMaps.length === 0) {
      try {
        const mapPath = path.join(__dirname, '../../../public/assets/maps/arena-default.json');
        this.arenaMaps.push(JSON.parse(readFileSync(mapPath, 'utf-8')));
      } catch (e) {
        console.warn(`[Room ${id}] No map files found`);
      }
    }
    console.log(`[Room ${id}] Loaded ${this.arenaMaps.length} arena maps`);
    this.currentMapIndex = -1; // set on first round

    this.obstacleManager = new ObstacleManager(this.physics.world);

    // Pass HP lookup so spells can scale knockback by vulnerability (Smash Bros %)
    this.spells = new ServerSpell(this.physics, (playerId) => {
      const p = this.players.get(playerId);
      if (p) return p.maxHp - p.hp;
      // Check dummies too (sandbox mode)
      const d = this.dummies.get(playerId);
      if (d) return d.maxHp - d.hp;
      return 0;
    }, this.obstacleManager, (playerId) => {
      // Check if player/dummy is eliminated — spells skip eliminated targets
      const p = this.players.get(playerId);
      if (p) return p.eliminated;
      const d = this.dummies.get(playerId);
      if (d) return d.eliminated;
      return false;
    }, (playerId) => {
      // Get character ID for passive lookups in ServerSpell
      const p = this.players.get(playerId);
      return p ? p.characterId : null;
    });
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

    const charId = characterId || 'boy';
    const passive = getPassive(charId);
    const maxHp = PLAYER.MAX_HP + (passive.bonusHp || 0);

    this.players.set(playerId, {
      socket,
      name: playerName || `Player ${this.players.size + 1}`,
      characterId: charId,
      hp: maxHp,
      maxHp,
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

    // Listen for hook release (grappling hook Branch B)
    socket.on(MSG.CLIENT_HOOK_RELEASE, () => {
      this.spells.requestHookRelease(playerId);
    });

    // Listen for shop purchases
    socket.on(MSG.CLIENT_SHOP_UNLOCK_SLOT, (data) => {
      this.handleShopUnlockSlot(playerId, data);
    });
    socket.on(MSG.CLIENT_SHOP_CHOOSE_SPELL, (data) => {
      this.handleShopChooseSpell(playerId, data);
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
    // Clean up socket listeners added in addPlayer()
    const player = this.players.get(playerId);
    if (player && player.socket) {
      player.socket.removeAllListeners('c:spell');
      player.socket.removeAllListeners(MSG.CLIENT_HOOK_RELEASE);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_UNLOCK_SLOT);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_CHOOSE_SPELL);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_UPGRADE_TIER);
      player.socket.removeAllListeners('c:sandboxShopToggle');
    }

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
    if (!player) return;
    if (!input || typeof input !== 'object') return;

    // Only accept known fields with numeric validation
    if (input.targetX != null && input.targetY != null
        && Number.isFinite(input.targetX) && Number.isFinite(input.targetY)) {
      player.input = { targetX: input.targetX, targetY: input.targetY };
    } else {
      player.input = null;
    }
  }

  handleSpellCast(playerId, data) {
    const player = this.players.get(playerId);
    if (!player || player.eliminated) return;
    // Only allow spells during playing phase
    if (this.rounds.phase !== PHASE.PLAYING) return;
    // Validate spell data — client sends slot key (Q/W/E/R) or direct spellId
    if (!data || !Number.isFinite(data.targetX) || !Number.isFinite(data.targetY)) return;

    const progression = this.progressions.get(playerId);

    // Resolve the spell ID: client sends slot key, we look up chosen spell
    let spellId = data.spellId;
    if (progression && data.slot) {
      spellId = progression.getSlotSpellId(data.slot);
    }
    if (!spellId || typeof spellId !== 'string') return;

    // Check if player has this spell equipped
    if (progression && !progression.canCastSpell(spellId)) return;

    const result = this.spells.processCast(playerId, spellId, data.targetX, data.targetY, progression);
    if (!result) return;

    // processCast returns an array for multi-projectile spells, single spell otherwise
    const spells = Array.isArray(result) ? result : [result];

    for (const spell of spells) {
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
            let finalDamage = hit.damage;

            // Apply character passive damage reduction
            const targetPassive = getPassive(target.characterId);
            if (targetPassive.damageReduction) {
              finalDamage *= (1 - targetPassive.damageReduction);
            }
            if (targetPassive.fireResist && spell.type && spell.type.startsWith('fireball')) {
              finalDamage *= (1 - targetPassive.fireResist);
            }

            target.hp = Math.max(0, target.hp - finalDamage);
            // Track damage for SP
            this.trackDamage(playerId, finalDamage);

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

  handleShopChooseSpell(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const progression = this.progressions.get(playerId);
    if (!progression) return;
    if (!data || !data.slot || !data.spellId) return;

    const success = progression.chooseSpell(data.slot, data.spellId);
    if (success) {
      this.sendProgressionUpdate(playerId);
      console.log(`[SHOP] ${playerId} chose ${data.spellId} for slot ${data.slot}`);
    }
  }

  handleShopUpgradeTier(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const progression = this.progressions.get(playerId);
    if (!progression) return;
    if (!data || !data.slot) return;

    const success = progression.upgradeTier(data.slot);
    if (success) {
      this.sendProgressionUpdate(playerId);
      console.log(`[SHOP] ${playerId} upgraded tier for slot ${data.slot}`);
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
        // Clear stale input during knockback — prevents walking back to old
        // target after grapple launch or any knockback hit
        if (this.physics.isInKnockback(playerId)) {
          player.input = null;
        } else {
          const effects = this.spells.getStatusEffects(playerId);
          const reached = this.physics.applyInput(playerId, player.input, effects);
          if (reached) {
            // Target reached — clear input so force stops, let ice slide happen
            player.input = null;
          }
        }
      }
    }

    if (isPlaying) {
      // Update spells BEFORE physics step so forces (e.g. grappling pull)
      // are resolved in the same tick they're applied
      this.spells.update(PHYSICS.TICK_MS);
    }

    // Step physics — resolves all forces from applyInput + spells.update
    this.physics.step(PHYSICS.TICK_MS);

    if (isPlaying) {
      // Process deferred spell hits (projectile/hook collisions from this tick)
      const spellHits = this.spells.drainHits();
      for (const hit of spellHits) {
        // Check player targets
        const target = this.players.get(hit.targetId);
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
          this.trackDamage(hit.attackerId, finalDamage);
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
        // Pick a random map for this round's obstacles
        if (this.arenaMaps.length > 0) {
          this.currentMapIndex = Math.floor(Math.random() * this.arenaMaps.length);
          this.obstacleManager.destroy();
          this.obstacleManager.loadFromMap(this.arenaMaps[this.currentMapIndex]);
        }

        this.resetPlayersForRound();
        this.resetRoundTracking();
        this.broadcast(MSG.SERVER_ROUND_START, {
          round: event.round,
          totalRounds: this.rounds.getState().totalRounds,
          mapIndex: this.currentMapIndex,
        });
        console.log(`Room ${this.id}: Round ${event.round} starting (map ${this.currentMapIndex})`);
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

        // Calculate average SP for underdog bonus (catch-up mechanic)
        let totalSp = 0;
        let playerCount = 0;
        for (const [id] of this.players) {
          const prog = this.progressions.get(id);
          if (prog) {
            totalSp += prog.totalSpEarned;
            playerCount++;
          }
        }
        const averageSp = playerCount > 1 ? totalSp / playerCount : 0;

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

          // Underdog bonus: players below average total SP get bonus
          let underdogBonus = 0;
          if (playerCount > 1 && progression.totalSpEarned < averageSp) {
            underdogBonus = Math.max(0, Math.floor((averageSp - progression.totalSpEarned) / 5));
          }
          if (underdogBonus > 0) {
            progression.awardSP(underdogBonus);
          }

          spAwards[id] = { earned: earned + underdogBonus, underdogBonus, total: progression.sp, stats };
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
      player.hp = player.maxHp;
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

    const roundState = this.rounds.getState();
    const snapshot = {
      tick: this.tick,
      players: playerStates,
      spells: this.spells.getActiveSpells(),
      ringRadius: roundState.ringRadius,
      round: roundState.round,
      totalRounds: roundState.totalRounds,
      phase: roundState.phase,
      mapIndex: this.currentMapIndex,
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
          // Credit the last player who knocked us (within 5s window)
          const lastAttacker = this.physics.getLastKnockbackAttacker(playerId, 5000);
          this.onPlayerEliminated(playerId, lastAttacker, 'ring');
        }
      }
    }
  }

  get playerCount() {
    return this.players.size;
  }

  destroy() {
    this.stop();
    if (this.obstacleManager) this.obstacleManager.destroy();
    this.physics.destroy();
    this.players.clear();
    this.progressions.clear();
    this.dummies.clear();
  }
}
