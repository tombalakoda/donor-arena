import { ServerPhysics } from '../game/ServerPhysics.js';
import { ServerSpell } from '../game/ServerSpell.js';
import { ObstacleManager } from '../game/ObstacleManager.js';
import { RoundManager, PHASE } from '../game/RoundManager.js';
import { PlayerProgression } from '../game/PlayerProgression.js';
import { MSG } from '../../shared/messageTypes.js';
import { PHYSICS, MATCH, PLAYER, SANDBOX, ARENA, SP } from '../../shared/constants.js';
import { getPassive } from '../../shared/characterPassives.js';
import { SPELL_TYPES } from '../../shared/spellData.js';
import { GameLoop } from '../game/GameLoop.js';
import { MATERIAL_IDS } from '../../shared/itemData.js';
import { getSpawnPositions } from '../game/utils.js';
import { applyDamage } from '../game/damageUtils.js';

export class Room {
  constructor(id, options = {}) {
    this.id = id;
    this.sandbox = options.sandbox || false;
    this.lobby = options.lobby || false;
    this.hostId = null;
    this.players = new Map();
    this.physics = new ServerPhysics((playerId) => {
      const prog = this.progressions.get(playerId);
      return prog ? prog.items.getItemStats() : null;
    });

    // Arena maps are loaded once at startup by RoomManager and shared
    this.arenaMaps = options.arenaMaps || [];
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
    }, (playerId) => {
      // Item stats lookup for ServerSpell
      const prog = this.progressions.get(playerId);
      return prog ? prog.items.getItemStats() : null;
    });
    // Callback for Saat idle-CDR: update lastAttackTime on the ItemSystem instance
    this.spells.itemStatsUpdateAttackTime = (playerId, time) => {
      const prog = this.progressions.get(playerId);
      if (prog) prog.items.updateLastAttackTime(time);
    };

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

  addPlayer(socket, playerName, characterId, options = {}) {
    const playerId = socket.id;
    const spawnPositions = getSpawnPositions(MATCH.MAX_PLAYERS);
    const spawnIdx = this.players.size;
    const spawn = spawnPositions[spawnIdx] || { x: 0, y: 0 };

    const charId = characterId || 'boy';
    const passive = getPassive(charId);
    const maxHp = PLAYER.MAX_HP + (passive.bonusHp || 0);

    this.players.set(playerId, {
      socket,
      name: playerName || `Âşık ${this.players.size + 1}`,
      characterId: charId,
      hp: maxHp,
      maxHp,
      input: null,
      eliminated: false,
    });

    this.physics.addPlayer(playerId, spawn.x, spawn.y);
    this.physics.characterIds.set(playerId, charId);
    this.spells.initPlayer(playerId);
    this.rounds.initPlayer(playerId);

    // Create progression tracker
    this.progressions.set(playerId, new PlayerProgression(playerId));

    // Load persisted discoveries from client
    const progression = this.progressions.get(playerId);
    if (options.discoveredRecipes || options.discoveredHazine) {
      progression.items.loadDiscoveries(options.discoveredRecipes, options.discoveredHazine);
    }

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
    socket.on(MSG.CLIENT_SHOP_CHOOSE_SPELL, (data) => {
      this.handleShopChooseSpell(playerId, data);
    });
    socket.on(MSG.CLIENT_SHOP_UPGRADE_TIER, (data) => {
      this.handleShopUpgradeTier(playerId, data);
    });

    // Listen for crafting/item actions
    socket.on(MSG.CLIENT_CRAFT_ITEM, (data) => {
      this.handleCraftItem(playerId, data);
    });
    socket.on(MSG.CLIENT_DISASSEMBLE_ITEM, (data) => {
      this.handleDisassembleItem(playerId, data);
    });
    socket.on(MSG.CLIENT_EQUIP_ITEM, (data) => {
      this.handleEquipItem(playerId, data);
    });
    socket.on(MSG.CLIENT_UNEQUIP_ITEM, (data) => {
      this.handleUnequipItem(playerId, data);
    });
    socket.on(MSG.CLIENT_NAZAR_SPEND, (data) => {
      this.handleNazarSpend(playerId, data);
    });

    // Sandbox: give starting SP, unlock all slots, and shop toggle
    if (this.sandbox) {
      const progression = this.progressions.get(playerId);
      if (progression) {
        progression.awardSP(SANDBOX.STARTING_SP);
        // Unlock all spell slots immediately in sandbox
        for (const slot of ['W', 'E', 'R']) {
          progression.autoUnlockSlot(slot);
        }
        // Give starting materials for crafting
        const items = progression.items;
        for (const matId of MATERIAL_IDS) {
          for (let i = 0; i < SANDBOX.STARTING_MATERIALS; i++) {
            items.addMaterial(matId);
          }
        }
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
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_CHOOSE_SPELL);
      player.socket.removeAllListeners(MSG.CLIENT_SHOP_UPGRADE_TIER);
      player.socket.removeAllListeners(MSG.CLIENT_SANDBOX_SHOP_TOGGLE);
      player.socket.removeAllListeners(MSG.CLIENT_START_GAME);
      player.socket.removeAllListeners(MSG.CLIENT_CRAFT_ITEM);
      player.socket.removeAllListeners(MSG.CLIENT_DISASSEMBLE_ITEM);
      player.socket.removeAllListeners(MSG.CLIENT_EQUIP_ITEM);
      player.socket.removeAllListeners(MSG.CLIENT_UNEQUIP_ITEM);
      player.socket.removeAllListeners(MSG.CLIENT_NAZAR_SPEND);
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
    // Rate limit: max ~33 inputs/sec per player
    const now = Date.now();
    if (now - (player.lastMoveInput || 0) < 30) return;
    player.lastMoveInput = now;

    // Only accept known fields with numeric validation
    if (input.targetX != null && input.targetY != null
        && Number.isFinite(input.targetX) && Number.isFinite(input.targetY)) {
      const MAX_COORD = ARENA.FLOOR_SIZE * 2;
      input.targetX = Math.max(-MAX_COORD, Math.min(MAX_COORD, input.targetX));
      input.targetY = Math.max(-MAX_COORD, Math.min(MAX_COORD, input.targetY));
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
    if (!data || !Number.isFinite(data.targetX) || !Number.isFinite(data.targetY)) {
      console.warn(`[CAST] ${playerId}: invalid target coords`);
      return;
    }
    const MAX_COORD = ARENA.FLOOR_SIZE * 2;
    data.targetX = Math.max(-MAX_COORD, Math.min(MAX_COORD, data.targetX));
    data.targetY = Math.max(-MAX_COORD, Math.min(MAX_COORD, data.targetY));

    const now = Date.now();
    if (now - (player.lastSpellCast || 0) < 150) return; // rate limit — no log needed

    player.lastSpellCast = now;

    const progression = this.progressions.get(playerId);

    // Resolve the spell ID: client sends slot key, we look up chosen spell
    let spellId = data.spellId;
    if (progression && data.slot) {
      spellId = progression.getSlotSpellId(data.slot);
    }
    if (!spellId || typeof spellId !== 'string') {
      console.warn(`[CAST] ${playerId}: invalid spellId (slot=${data?.slot})`);
      return;
    }

    // Check if player has this spell equipped
    if (progression && !progression.canCastSpell(spellId)) {
      console.warn(`[CAST] ${playerId}: cannot cast ${spellId} (not equipped or locked)`);
      return;
    }

    const result = this.spells.processCast(playerId, spellId, data.targetX, data.targetY, progression);
    if (!result) return; // processCast logs its own failures

    // Channeled spell: broadcast channeling start, actual spell fires later
    if (result.channeling) {
      for (const [id, p] of this.players) {
        p.socket.emit(MSG.SERVER_CHANNELING, {
          playerId: result.playerId,
          spellId: result.spellId,
          duration: result.duration,
        });
      }
      return;
    }

    // processCast returns an array for multi-projectile spells, single spell otherwise
    const spells = Array.isArray(result) ? result : [result];

    for (const spell of spells) {
      // Movement spells: clear movement target so player doesn't auto-walk to old position
      if (spell.spellType === SPELL_TYPES.BLINK ||
          spell.spellType === SPELL_TYPES.SWAP ||
          spell.spellType === SPELL_TYPES.DASH ||
          spell.spellType === SPELL_TYPES.RECALL) {
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
            const aProg = this.progressions.get(playerId);
            const tProg = this.progressions.get(hit.id);
            const attackerItems = aProg ? aProg.items.getItemStats() : null;
            const targetItems = tProg ? tProg.items.getItemStats() : null;
            const finalDamage = applyDamage(target, hit.damage, spell.type, attackerItems, targetItems);
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

  handleShopChooseSpell(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShopAction || 0) < 100) return;
    player.lastShopAction = now;
    const VALID_SLOTS = new Set(['Q', 'W', 'E', 'R']);
    if (!data || !VALID_SLOTS.has(data.slot) || typeof data.spellId !== 'string') {
      console.warn(`[SHOP] ${playerId}: chooseSpell invalid data (slot=${data?.slot}, spellId=${data?.spellId})`);
      return;
    }
    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const success = progression.chooseSpell(data.slot, data.spellId);
    if (success) {
      this.sendProgressionUpdate(playerId);
      console.log(`[SHOP] ${playerId} chose ${data.spellId} for slot ${data.slot}`);
    }
  }

  handleShopUpgradeTier(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShopAction || 0) < 100) return;
    player.lastShopAction = now;
    const VALID_SLOTS = new Set(['Q', 'W', 'E', 'R']);
    if (!data || !VALID_SLOTS.has(data.slot)) {
      console.warn(`[SHOP] ${playerId}: upgradeTier invalid slot=${data?.slot}`);
      return;
    }
    const progression = this.progressions.get(playerId);
    if (!progression) return;

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

  // --- Crafting / Item Handlers ---

  handleCraftItem(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShopAction || 0) < 100) return;
    player.lastShopAction = now;

    if (!data || typeof data.recipeId !== 'string') return;

    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const result = progression.items.craft(data.recipeId);
    if (result.ok) {
      this.sendProgressionUpdate(playerId);
      console.log(`[CRAFT] ${playerId} crafted ${data.recipeId}${result.newDiscovery ? ' (NEW DISCOVERY!)' : ''}`);
    }
  }

  handleDisassembleItem(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShopAction || 0) < 100) return;
    player.lastShopAction = now;

    if (!data || typeof data.instanceId !== 'string' || !['equipped', 'stash'].includes(data.source)) return;

    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const result = progression.items.disassemble(data.instanceId, data.source);
    if (result.ok) {
      this.sendProgressionUpdate(playerId);
      console.log(`[CRAFT] ${playerId} disassembled item, got ${result.returned.join(', ')}`);
    }
  }

  handleEquipItem(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShopAction || 0) < 100) return;
    player.lastShopAction = now;

    if (!data || typeof data.instanceId !== 'string') return;

    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const result = progression.items.equip(data.instanceId);
    if (result.ok) {
      // Update maxHP if item modifies it
      this._applyItemMaxHp(playerId, progression);
      this.sendProgressionUpdate(playerId);
      console.log(`[CRAFT] ${playerId} equipped item to ${result.slot}`);
    }
  }

  handleUnequipItem(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShopAction || 0) < 100) return;
    player.lastShopAction = now;

    const VALID_SLOTS = new Set(['saz', 'yadigar', 'pabuc']);
    if (!data || !VALID_SLOTS.has(data.slot)) return;

    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const result = progression.items.unequip(data.slot);
    if (result.ok) {
      this._applyItemMaxHp(playerId, progression);
      this.sendProgressionUpdate(playerId);
      console.log(`[CRAFT] ${playerId} unequipped ${data.slot}`);
    }
  }

  handleNazarSpend(playerId, data) {
    if (!this.sandbox && this.rounds.phase !== PHASE.SHOP) return;
    const player = this.players.get(playerId);
    if (!player) return;

    if (!data || !['reroll', 'extra', 'hint'].includes(data.action)) return;

    const progression = this.progressions.get(playerId);
    if (!progression) return;

    const result = progression.items.spendNazar(data.action);
    if (result.ok) {
      this.sendProgressionUpdate(playerId);
      console.log(`[NAZAR] ${playerId} spent nazar on ${data.action}`);
    }
  }

  _applyItemMaxHp(playerId, progression) {
    const player = this.players.get(playerId);
    if (!player) return;
    const passive = getPassive(player.characterId);
    const baseMaxHp = PLAYER.MAX_HP + (passive.bonusHp || 0);
    const itemStats = progression.items.getItemStats();
    const newMaxHp = baseMaxHp + (itemStats.maxHpBonus || 0);

    if (player.maxHp !== newMaxHp) {
      player.maxHp = newMaxHp;
      // Clamp HP to new max
      if (player.hp > newMaxHp) player.hp = newMaxHp;
    }

    // Apply friction modifier (Takunya: -30% friction = slide further)
    if (itemStats.frictionMult && itemStats.frictionMult !== 1.0) {
      const body = this.physics.playerBodies.get(playerId);
      if (body) {
        body.frictionAir = PLAYER.FRICTION_AIR * itemStats.frictionMult;
      }
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
    // Expire eliminated player's active spells (500ms grace for visual fade)
    this.spells.deactivatePlayerSpells(eliminatedId);

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
        playerName: eliminated?.name || 'Meçhul',
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
        // Auto-unlock slots at round milestones
        if (SP.SLOT_UNLOCK_ROUNDS) {
          for (const [slot, round] of Object.entries(SP.SLOT_UNLOCK_ROUNDS)) {
            if (event.round >= round) {
              for (const [playerId] of this.players) {
                const progression = this.progressions.get(playerId);
                if (progression && progression.autoUnlockSlot(slot)) {
                  console.log(`[AUTO-UNLOCK] ${playerId} unlocked slot ${slot} at round ${event.round}`);
                }
              }
            }
          }
        }

        // Pick a random map for this round's obstacles
        if (this.arenaMaps.length > 0) {
          this.currentMapIndex = Math.floor(Math.random() * this.arenaMaps.length);
          this.obstacleManager.destroy();
          this.obstacleManager.loadFromMap(this.arenaMaps[this.currentMapIndex]);
        }

        this.resetPlayersForRound();
        this.resetRoundTracking();

        // Reset per-round item tracking
        for (const [playerId] of this.players) {
          const progression = this.progressions.get(playerId);
          if (progression) {
            progression.items.onRoundStart();
            // Apply Korsanlik HP penalty (start at 85%)
            const itemStats = progression.items.getItemStats();
            if (itemStats.korsanlikActive) {
              const player = this.players.get(playerId);
              if (player) {
                player.hp = Math.floor(player.maxHp * 0.85);
              }
            }
          }
        }

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

        // Award SP from skill tree system
        // Step 1: Award round SP to all players first
        const spAwards = {};
        const earnedMap = new Map();
        let playerCount = 0;
        for (const [id, player] of this.players) {
          const progression = this.progressions.get(id);
          if (!progression) continue;
          playerCount++;

          const stats = {
            damageDealt: this.roundDamage.get(id) || 0,
            ringOutKills: this.roundRingOutKills.get(id) || 0,
            damageKills: this.roundDamageKills.get(id) || 0,
            survived: !player.eliminated,
            wonRound: id === winnerId,
          };

          const earned = progression.awardRoundSP(stats);
          earnedMap.set(id, { earned, stats });
        }

        // Step 2: Compute average SP from POST-award totals
        let totalSp = 0;
        for (const [id] of this.players) {
          const prog = this.progressions.get(id);
          if (prog) {
            totalSp += prog.totalSpEarned;
          }
        }
        const averageSp = playerCount > 1 ? totalSp / playerCount : 0;

        // Step 3: Compute and award underdog bonuses
        for (const [id] of this.players) {
          const progression = this.progressions.get(id);
          if (!progression) continue;
          const info = earnedMap.get(id);
          if (!info) continue;

          let underdogBonus = 0;
          if (playerCount > 1 && progression.totalSpEarned < averageSp) {
            underdogBonus = Math.max(0, Math.floor((averageSp - progression.totalSpEarned) / 5));
          }
          if (underdogBonus > 0) {
            progression.awardSP(underdogBonus);
          }

          spAwards[id] = { earned: info.earned + underdogBonus, underdogBonus, total: progression.sp, stats: info.stats };
        }

        // Step 4: Award materials, Nazar, and item-based SP/material bonuses
        const materialAwards = {};
        for (const [id, player] of this.players) {
          const progression = this.progressions.get(id);
          if (!progression) continue;
          const items = progression.items;
          const itemStats = items.getItemStats();
          const drops = [];

          // Base: 1 random material
          const baseMat = items.getRandomMaterialType();
          items.addMaterial(baseMat);
          drops.push(baseMat);

          // Bonus per ring-out kill
          const kills = this.roundRingOutKills.get(id) || 0;
          for (let k = 0; k < kills; k++) {
            const mat = items.getRandomMaterialType();
            items.addMaterial(mat);
            drops.push(mat);
          }

          // Round win bonus
          if (id === winnerId) {
            const mat = items.getRandomMaterialType();
            items.addMaterial(mat);
            drops.push(mat);
          }

          // Item bonus: Corap (+1 material per round)
          if (itemStats.materialBonusPerRound > 0) {
            for (let m = 0; m < itemStats.materialBonusPerRound; m++) {
              const mat = items.getRandomMaterialType();
              items.addMaterial(mat);
              drops.push(mat);
            }
          }

          // Korsanlik Hazine: double all drops
          if (itemStats.korsanlikActive) {
            const extraDrops = [...drops]; // duplicate
            for (const mat of extraDrops) {
              items.addMaterial(mat);
              drops.push(mat);
            }
          }

          // Nazar: eliminated players get +2
          if (player.eliminated) {
            items.addNazar(2);
          }

          // Item SP bonuses
          if (itemStats.spBonusPerRound > 0) {
            progression.awardSP(itemStats.spBonusPerRound);
          }
          if (itemStats.spBonusPerKill > 0 && kills > 0) {
            progression.awardSP(itemStats.spBonusPerKill * kills);
          }

          // Round lifecycle for items
          items.onRoundEnd(!player.eliminated);

          materialAwards[id] = drops;
        }

        const winner = winnerId ? this.players.get(winnerId) : null;
        this.broadcast(MSG.SERVER_ROUND_END, {
          round: event.round,
          winnerId,
          winnerName: winner?.name || null,
          scores: this.rounds.getScores(),
          timeUp: event.timeUp,
          spAwards,
          materialAwards,
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
        this.stop();
        // Clean up game state while keeping sockets for match-end screen
        this.spells.clearAll();
        this.obstacleManager.destroy();
        this.physics.destroy();
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
