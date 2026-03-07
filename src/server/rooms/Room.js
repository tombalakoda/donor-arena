import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerPhysics } from '../game/ServerPhysics.js';
import { ServerSpell } from '../game/ServerSpell.js';
import { ObstacleManager } from '../game/ObstacleManager.js';
import { RoundManager, PHASE } from '../game/RoundManager.js';
import { PlayerProgression } from '../game/PlayerProgression.js';
import { MSG } from '../../shared/messageTypes.js';
import { PHYSICS, MATCH, PLAYER, SANDBOX } from '../../shared/constants.js';
import { getPassive } from '../../shared/characterPassives.js';
import { SPELL_TYPES } from '../../shared/spellData.js';
import { GameLoop } from '../game/GameLoop.js';
import { getSpawnPositions } from '../game/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Room {
  constructor(id, options = {}) {
    this.id = id;
    this.sandbox = options.sandbox || false;
    this.lobby = options.lobby || false;
    this.hostId = null;
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

    // Game loop (tick logic, spell hit processing, state broadcasting)
    this.gameLoop = new GameLoop(this);
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

    // For lobby rooms, track the host (first player to join)
    if (this.lobby && !this.hostId) {
      this.hostId = playerId;
    }

    const progression = this.progressions.get(playerId);
    socket.emit(MSG.SERVER_JOINED, {
      playerId,
      players: allPlayers,
      roomId: this.id,
      progression: progression ? progression.getState() : null,
      hostId: this.lobby ? this.hostId : undefined,
    });

    // Listen for spell casts from this player
    socket.on(MSG.CLIENT_SPELL_CAST, (data) => {
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
      socket.on(MSG.CLIENT_SANDBOX_SHOP_TOGGLE, () => {
        const prog = this.progressions.get(playerId);
        socket.emit(MSG.SERVER_SHOP_OPEN, {
          progression: prog ? prog.getState() : null,
          shopDuration: 9999,
        });
      });
    }

    // Lobby rooms: broadcast player list update + register start game listener
    if (this.lobby) {
      this.broadcastLobbyUpdate();
      socket.on(MSG.CLIENT_START_GAME, () => {
        this.startFromLobby(socket.id);
      });
    }

    // Non-lobby rooms auto-start immediately
    if (!this.lobby && !this.running && this.players.size >= 1) {
      this.start();
    }

    return playerId;
  }

  removePlayer(playerId) {
    // Clean up socket listeners added in addPlayer()
    const player = this.players.get(playerId);
    if (player && player.socket) {
      player.socket.removeAllListeners(MSG.CLIENT_SPELL_CAST);
      player.socket.removeAllListeners(MSG.CLIENT_HOOK_RELEASE);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_UNLOCK_SLOT);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_CHOOSE_SPELL);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_UPGRADE_TIER);
      player.socket.removeAllListeners(MSG.CLIENT_SANDBOX_SHOP_TOGGLE);
      player.socket.removeAllListeners(MSG.CLIENT_START_GAME);
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

    // Lobby: transfer host if the departing player was host
    if (this.lobby && this.hostId === playerId && this.players.size > 0) {
      const nextPlayer = this.players.entries().next().value;
      this.hostId = nextPlayer[0];
      console.log(`[Room ${this.id}] Host transferred to ${this.hostId}`);
      this.broadcastLobbyUpdate();
    }

    if (this.players.size === 0) {
      this.stop();
    }
  }

  // --- Lobby helpers ---

  buildPlayerList() {
    const list = [];
    for (const [id, p] of this.players) {
      list.push({ id, name: p.name, characterId: p.characterId });
    }
    return list;
  }

  broadcastLobbyUpdate() {
    const players = this.buildPlayerList();
    for (const [id, p] of this.players) {
      p.socket.emit(MSG.SERVER_LOBBY_UPDATE, {
        players,
        hostId: this.hostId,
      });
    }
  }

  startFromLobby(requesterId) {
    if (!this.lobby) return false;
    if (requesterId !== this.hostId) {
      const player = this.players.get(requesterId);
      if (player) {
        player.socket.emit(MSG.SERVER_LOBBY_ERROR, { error: 'SADECE EV SAHİBİ BAŞLATIR' });
      }
      return false;
    }
    if (this.running) return false;
    this.start();
    return true;
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
      // Blink/Swap: clear movement target so player doesn't auto-walk to old position
      if (spell.spellType === SPELL_TYPES.BLINK || spell.spellType === SPELL_TYPES.SWAP) {
        player.input = null;
      }

      const payload = ServerSpell.serializeForClient(spell);
      for (const [id, p] of this.players) {
        p.socket.emit(MSG.SERVER_SPELL_CAST, payload);
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
      p.socket.emit(MSG.SERVER_ELIMINATED, {
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
      this.gameLoop.spawnDummies();
    }

    this.tickInterval = setInterval(() => {
      this.gameLoop.update();
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


  broadcast(event, data) {
    for (const [, player] of this.players) {
      player.socket.emit(event, data);
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
