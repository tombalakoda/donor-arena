import Phaser from 'phaser';
import { PLAYER, ARENA } from '../../shared/constants.js';
import { MSG } from '../../shared/messageTypes.js';
import { SPELLS, SPELL_TYPES } from '../../shared/spellData.js';
import { computeSpellStats } from '../../shared/skillTreeData.js';
import { NetworkManager } from '../systems/NetworkManager.js';
import { UI_FONT } from '../config.js';
import { ShopOverlay } from '../ui/ShopOverlay.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { MatchEndOverlay } from '../ui/MatchEndOverlay.js';
import { LobbyOverlay } from '../ui/LobbyOverlay.js';
import { SpellVisualManager } from '../systems/SpellVisualManager.js';
import { HUDManager } from '../systems/HUDManager.js';

const MatterBody = Phaser.Physics.Matter.Matter.Body;
const SPRITE_SCALE = 2.25;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.network = null;
    this.localPlayerId = null;
    this.characterId = 'boy';
    this.playerName = 'Âşık';
    this.gameMode = 'normal';     // 'normal' or 'sandbox'

    // Local player
    this.playerBody = null;
    this.playerSprite = null;
    this.playerShadow = null;
    this.moveTarget = null;
    this.moveTargetMarker = null;
    this.facingDir = 'down';
    this.isMoving = false;
    this.speedTrail = [];  // Array of { x, y, alpha } for knockback speed lines
    this.knockbackUntil = 0;  // performance.now() timestamp when knockback ends

    // Grappling hook state (Branch B) — server-controlled, no client prediction
    this.grapplingActive = false;
    this.localHp = 100;
    this.localMaxHp = 100;

    // Remote players
    this.remotePlayers = new Map();

    // Spells
    this.spellVisualManager = null;
    this.cooldowns = {};            // { spellId: remainingMs }
    this.charges = {};              // { spellId: { remaining, max } } — multi-charge spells
    this.spellKeys = {};            // Phaser key objects for Q/W/E/R

    // Arena
    this.arenaGraphics = null;
    this.ringRadius = ARENA.RADIUS;

    // HUD manager
    this.hudManager = null;

    // Round state
    this.roundNumber = 0;
    this.totalRounds = 20;
    this.phase = 'waiting';
    this.timeRemaining = 0;
    this.countdownRemaining = 0;
    this.localEliminated = false;

    // Progression / Shop
    this.shopOverlay = null;
    this.progression = null;      // { sp, totalSpEarned, slots, spells }
    this.shopTimeRemaining = 0;

    // Overlays
    this.pauseMenu = null;
    this.matchEndOverlay = null;
    this.lobbyOverlay = null;
    this.lastPhase = null;        // Track phase transitions for lobby
    this.isHost = false;
    this.roomId = null;
  }

  init(data) {
    if (data) {
      this.characterId = data.characterId || 'boy';
      this.playerName = data.playerName || 'Âşık';
      this.gameMode = data.mode || 'normal';
      this.roomId = data.roomId || null;
    }
  }

  /**
   * Reset all scene state for clean 2nd+ game sessions.
   * Constructor only runs once (Phaser reuses Scene instances),
   * so create() must reset everything.
   */
  resetSceneState() {
    this.network = null;
    this.localPlayerId = null;
    this.playerBody = null;
    this.playerSprite = null;
    this.playerShadow = null;
    this.moveTarget = null;
    this.moveTargetMarker = null;
    this.facingDir = 'down';
    this.isMoving = false;
    this.speedTrail = [];
    this.knockbackUntil = 0;
    this.grapplingActive = false;
    this.localHp = 100;
    this.localMaxHp = 100;
    this.remotePlayers = new Map();
    if (this.spellVisualManager) this.spellVisualManager.destroy();
    this.spellVisualManager = null;
    this.cooldowns = {};
    this.charges = {};
    this.spellKeys = {};
    this.arenaGraphics = null;
    this.ringRadius = ARENA.RADIUS;
    if (this.hudManager) this.hudManager.destroy();
    this.hudManager = null;
    this.roundNumber = 0;
    this.totalRounds = 20;
    this.phase = 'waiting';
    this.timeRemaining = 0;
    this.countdownRemaining = 0;
    this.localEliminated = false;
    if (this.shopOverlay) this.shopOverlay.destroy();
    if (this.pauseMenu) this.pauseMenu.destroy();
    if (this.matchEndOverlay) this.matchEndOverlay.destroy();
    if (this.lobbyOverlay) this.lobbyOverlay.destroy();
    this.shopOverlay = null;
    this.progression = null;
    this.shopTimeRemaining = 0;
    this.pauseMenu = null;
    this.matchEndOverlay = null;
    this.lobbyOverlay = null;
    this.lastPhase = null;
    this.isHost = false;
    // NOTE: do NOT reset this.roomId here — it is set in init() before create()
    this.obstacleSprites = [];
    this.currentMapIndex = -1;
    this.lastServerSpells = [];
    this.trailGraphics = null;
    this.cachedScores = null;
    this.spectateMode = false;
    this.spectateTargetId = null;
    this.spectateTargetIndex = -1;
    this.aimingSlot = null;
    this.indicatorGraphics = null;
    this._indicatorStatsCache = {};
  }

  create() {
    // Reset all state for clean 2nd+ game sessions (constructor only runs once)
    this.resetSceneState();

    // Register Phaser shutdown event so cleanup actually runs
    this.events.once('shutdown', this.shutdown, this);

    // Managers
    this.spellVisualManager = new SpellVisualManager(this);
    this.hudManager = new HUDManager(this);

    // Fade in from black
    this.cameras.main.fadeIn(500, 0, 0, 0);

    this.createArena();
    this.setupInput();
    this.setupCamera();
    this.hudManager.createHUD();
    this.hudManager.createSpellHUD();
    this.shopOverlay = new ShopOverlay(this);
    this.pauseMenu = new PauseMenu(this);
    this.matchEndOverlay = new MatchEndOverlay(this);
    this.lobbyOverlay = new LobbyOverlay(this);
    this.connectToServer();

    // Show lobby immediately (phase starts as 'waiting')
    this.lobbyOverlay.show();

    // ESC key to toggle pause menu
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.shopOverlay && this.shopOverlay.visible) return;
      // Don't allow pause if match-end is showing
      if (this.matchEndOverlay && this.matchEndOverlay.visible) return;
      if (this.pauseMenu) this.pauseMenu.toggle();
    });

    // Sandbox: B key to toggle shop
    if (this.gameMode === 'sandbox') {
      this.input.keyboard.on('keydown-B', () => {
        if (!this.network || !this.network.connected) return;
        if (this.pauseMenu && this.pauseMenu.visible) return;
        if (this.shopOverlay && this.shopOverlay.visible) {
          this.shopOverlay.hide();
        } else {
          this.network.socket.emit(MSG.CLIENT_SANDBOX_SHOP_TOGGLE);
        }
      });
    }

    // Tab key to toggle leaderboard
    this.input.keyboard.on('keydown-TAB', (e) => {
      e.preventDefault();
      this.hudManager.toggleLeaderboard(true);
    });
    this.input.keyboard.on('keyup-TAB', () => {
      this.hudManager.toggleLeaderboard(false);
    });

    window.__gameScene = this;
  }

  // --- Network ---

  connectToServer() {
    // Always start fresh — disconnect any previous connection
    if (window.__networkManager) {
      window.__networkManager.disconnect();
    }
    window.__networkConnected = true;

    this.network = new NetworkManager();
    window.__networkManager = this.network;

    this.network.onJoined = (data) => {
      this.localPlayerId = data.playerId;

      const myData = data.players.find(p => p.id === this.localPlayerId);
      const startX = myData ? myData.x : 0;
      const startY = myData ? myData.y : 0;
      if (!this.playerBody) {
        this.createLocalPlayer(startX, startY);
      }

      for (const p of data.players) {
        if (p.id !== this.localPlayerId) {
          this.addRemotePlayer(p.id, p.characterId || 'ninja-green', p.x, p.y, p.name);
        }
      }

      // Lobby mode: show lobby overlay with host controls
      if (data.hostId) {
        this.isHost = (data.hostId === data.playerId);
        if (this.lobbyOverlay) {
          this.lobbyOverlay.showLobbyMode(data.players, this.isHost, data.hostId);
        }
      }
    };

    this.network.onLobbyUpdate = (data) => {
      this.isHost = (data.hostId === this.localPlayerId);
      if (this.lobbyOverlay) {
        this.lobbyOverlay.updateLobbyMode(data.players, this.isHost, data.hostId);
      }
    };

    this.network.onLobbyError = (data) => {
      console.error('Lobby error:', data.error);
      if (this.network) this.network.disconnect();
      window.__networkConnected = false;
      // Show error and go back to menu
      const cam = this.cameras.main;
      const errorText = this.add.text(cam.width / 2, cam.height / 2, data.error, {
        fontSize: '32px',
        fontFamily: 'KiwiSoda',
        fill: '#ff4444',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(999);

      this.time.delayedCall(2000, () => {
        errorText.destroy();
        this.scene.start('MenuScene');
      });
    };

    this.network.onPlayerJoin = (data) => {
      this.addRemotePlayer(data.id, data.characterId || 'ninja-green', 0, 0, data.name);
    };

    this.network.onPlayerLeave = (data) => {
      this.removeRemotePlayer(data.id);
    };

    this.network.onStateUpdate = (snapshot) => {
      this.handleServerState(snapshot);
    };

    this.network.onSpellCast = (data) => {
      this.spellVisualManager.handleSpellCast(data);
    };

    this.network.onRoundStart = (data) => {
      this.handleRoundStart(data);
    };

    this.network.onRoundEnd = (data) => {
      this.handleRoundEnd(data);
    };

    this.network.onEliminated = (data) => {
      this.handleElimination(data);
    };

    this.network.onMatchEnd = (data) => {
      this.handleMatchEnd(data);
    };

    this.network.onShopOpen = (data) => {
      this.handleShopOpen(data);
    };

    this.network.onShopUpdate = (data) => {
      this.handleShopUpdate(data);
    };

    this.network.onObstacleEvent = (data) => {
      this.handleObstacleEvent(data);
    };

    this.network.connect();
    // Wait for actual connection before joining (cloudflare can be slow)
    const tryJoin = () => {
      if (this.network.connected) {
        this.network.join(this.playerName, this.characterId, this.gameMode, this.roomId);
      } else {
        this._tryJoinTimeout = setTimeout(tryJoin, 200);
      }
    };
    this._tryJoinTimeout = setTimeout(tryJoin, 200);
  }

  handleServerState(snapshot) {
    for (const ps of snapshot.players) {
      if (ps.id === this.localPlayerId) {
        this.reconcileLocalPlayer(ps);
        const prevHp = this.localHp;
        this.localHp = ps.hp;
        this.localMaxHp = ps.maxHp;
        // Screen shake and hit flash on damage
        if (prevHp > this.localHp) {
          const hpLost = prevHp - this.localHp;
          this.cameras.main.shake(150, Math.min(0.02, hpLost * 0.003));
          // Hit flash on local player sprite
          if (this.playerSprite && hpLost > 0) {
            this.playerSprite.setTintFill(0xffffff);
            this.time.delayedCall(80, () => {
              if (this.playerSprite) {
                this.playerSprite.setTintFill(0xff4444);
                this.time.delayedCall(80, () => {
                  if (this.playerSprite) this.playerSprite.clearTint();
                });
              }
            });
          }
          // Floating damage number
          if (hpLost > 0 && this.playerBody) {
            this.hudManager.showDamageNumber(this.playerBody.position.x, this.playerBody.position.y, hpLost);
          }
        }
        const wasEliminated = this.localEliminated;
        this.localEliminated = ps.eliminated || false;
        if (!wasEliminated && this.localEliminated) {
          this.enterSpectatorMode();
        }

        // Ghost transparency for local player
        if (this.playerSprite) {
          const localAlpha = ps.intangible ? 0.35 : 1.0;
          if (this.playerSprite.alpha !== localAlpha) {
            this.playerSprite.setAlpha(localAlpha);
          }
        }
      } else {
        this.updateRemotePlayer(ps);
      }
    }

    // Update cooldowns and charges from server
    if (snapshot.cooldowns) {
      this.cooldowns = snapshot.cooldowns;
    }
    if (snapshot.charges) {
      this.charges = snapshot.charges;
    }

    // Update ring radius
    if (snapshot.ringRadius !== undefined) {
      this.ringRadius = snapshot.ringRadius;
    }

    // Update round state
    if (snapshot.round !== undefined) this.roundNumber = snapshot.round;
    if (snapshot.totalRounds !== undefined) this.totalRounds = snapshot.totalRounds;
    if (snapshot.phase !== undefined) this.phase = snapshot.phase;
    if (snapshot.timeRemaining !== undefined) this.timeRemaining = snapshot.timeRemaining;
    if (snapshot.countdownRemaining !== undefined) this.countdownRemaining = snapshot.countdownRemaining;
    if (snapshot.shopTimeRemaining !== undefined) this.shopTimeRemaining = snapshot.shopTimeRemaining;
    if (snapshot.progression) this.progression = snapshot.progression;

    // Sync map index for obstacles (handles late join / reconnection)
    if (snapshot.mapIndex !== undefined && snapshot.mapIndex !== this.currentMapIndex) {
      this.loadObstaclesForMap(snapshot.mapIndex);
    }

    // Sync active spells from server state
    this.lastServerSpells = snapshot.spells || [];
    this.spellVisualManager.syncSpellVisuals(this.lastServerSpells);
  }

  // --- Round Events ---

  handleRoundStart(data) {
    this.roundNumber = data.round;
    this.localEliminated = false;
    this.spectateMode = false;
    this.spectateTargetId = null;
    this.spectateTargetIndex = -1;
    this.hudManager._hideSpectateHUD();
    if (this.playerSprite) this.playerSprite.setAlpha(1);

    // Clear move target on new round
    this.moveTarget = null;
    if (this.moveTargetMarker) this.moveTargetMarker.setVisible(false);

    // Swap obstacles for this round's map
    if (data.mapIndex !== undefined) {
      this.loadObstaclesForMap(data.mapIndex);
    }

    // Show round start announcement
    this.hudManager.showAnnouncement(`Fasıl ${data.round} / ${data.totalRounds}`);
  }

  handleRoundEnd(data) {
    const msg = data.winnerName
      ? `Fasıl ${data.round} — ${data.winnerName} aldı!`
      : `Fasıl ${data.round} — Berabere!`;
    this.hudManager.showAnnouncement(msg);

    // Cache scores with resolved names for leaderboard
    if (data.scores) {
      this.cachedScores = data.scores.map(s => ({
        ...s,
        name: s.id === this.localPlayerId ? this.playerName
            : (this.remotePlayers.get(s.id)?.name || s.id.slice(-4)),
      }));
      this.hudManager.updateLeaderboard(this.cachedScores, this.localPlayerId);
    }
  }

  handleElimination(data) {
    // Ring-out celebration — the core sumo moment!
    if (data.method === 'ring') {
      // Find victim position
      const rp = this.remotePlayers.get(data.playerId);
      const isLocal = data.playerId === this.localPlayerId;
      const pos = rp ? { x: rp.x, y: rp.y } :
                  isLocal && this.playerBody ? { x: this.playerBody.position.x, y: this.playerBody.position.y } : null;

      if (pos) {
        // Burst effect at elimination point — explosion sprite
        if (this.anims.exists('fx-explosion-play')) {
          const burst = this.add.sprite(pos.x, pos.y, 'fx-explosion');
          burst.setScale(3);
          burst.setDepth(20);
          burst.play({ key: 'fx-explosion-play', repeat: 0 });
          burst.once('animationcomplete', () => burst.destroy());
        }

        // Secondary ring burst — circular slash sprite
        if (this.anims.exists('fx-circular-slash-play')) {
          const ring = this.add.sprite(pos.x, pos.y, 'fx-circular-slash');
          ring.setTint(0xff6644);
          ring.setScale(1.5);
          ring.setDepth(20);
          ring.setAlpha(0.9);
          ring.play({ key: 'fx-circular-slash-play', repeat: 0 });
          this.tweens.add({
            targets: ring,
            scaleX: 6, scaleY: 6, alpha: 0,
            duration: 800,
            onComplete: () => ring.destroy(),
          });
        }
      }

      // Camera shake for everyone
      this.cameras.main.shake(200, 0.012);

      // Big "RING OUT!" announcement
      this.hudManager.showAnnouncement('MEYDANDAN DÜŞTÜ!', 1500);

      // Kill feed with special prefix
      const msg = data.eliminatorName
        ? `${data.eliminatorName}, ${data.playerName} âşığı susturdu!`
        : `${data.playerName} meydandan düştü!`;
      this.hudManager.addKillFeed(msg);
    } else {
      // Regular spell kill (should be rare now)
      const msg = data.eliminatorName
        ? `${data.eliminatorName}, ${data.playerName} âşığı susturdu`
        : `${data.playerName} susturuldu`;
      this.hudManager.addKillFeed(msg);
    }

    // Fade eliminated remote player sprite
    const rp = this.remotePlayers.get(data.playerId);
    if (rp && rp.sprite) {
      rp.sprite.setAlpha(0.3);
    }
    // Fade local player if eliminated
    if (data.playerId === this.localPlayerId && this.playerSprite) {
      this.playerSprite.setAlpha(0.3);
    }
  }

  handleMatchEnd(data) {
    // Hide other overlays
    if (this.lobbyOverlay) this.lobbyOverlay.hide();
    if (this.shopOverlay && this.shopOverlay.visible) this.shopOverlay.hide();
    // Show match end screen
    if (this.matchEndOverlay) {
      this.matchEndOverlay.show(data.scores || [], this.localPlayerId);
    }
  }

  handleShopOpen(data) {
    if (data.progression) this.progression = data.progression;
    if (this.shopOverlay) {
      this.shopOverlay.show(this.progression, data.shopDuration || 20);
    }
  }

  handleShopUpdate(data) {
    this.progression = data;
    if (this.shopOverlay && this.shopOverlay.visible) {
      this.shopOverlay.updateProgression(data);
    }
  }


  reconcileLocalPlayer(serverState) {
    if (!this.playerBody) return;

    // During grappling: FULLY trust server — no client prediction, smooth follow
    if (this.grapplingActive) {
      const pos = this.playerBody.position;
      const dx = serverState.x - pos.x;
      const dy = serverState.y - pos.y;
      // 0.7 blend: aggressive trust, but not hard-snap (avoids 20Hz stutter)
      MatterBody.setPosition(this.playerBody, {
        x: pos.x + dx * 0.7,
        y: pos.y + dy * 0.7,
      });
      // Fully trust server velocity — enables smooth extrapolation between ticks
      MatterBody.setVelocity(this.playerBody, {
        x: serverState.vx,
        y: serverState.vy,
      });
      // Update knockback state so post-launch flight also trusts server
      if (serverState.kb > 0) {
        this.knockbackUntil = performance.now() + serverState.kb;
      }
      return;
    }

    // Update knockback state from server
    if (serverState.kb > 0) {
      const newKbUntil = performance.now() + serverState.kb;
      // Only extend, never shorten — avoids jitter from tick timing
      if (newKbUntil > this.knockbackUntil) {
        this.knockbackUntil = newKbUntil;
      }
    }

    const inKnockback = performance.now() < this.knockbackUntil;

    const pos = this.playerBody.position;
    const dx = serverState.x - pos.x;
    const dy = serverState.y - pos.y;
    const distSq = dx * dx + dy * dy;

    // During knockback: trust server much more (player is flying fast, divergence grows quickly)
    const correctionStrength = inKnockback
      ? (distSq > 2500 ? 0.8 : 0.5)
      : (distSq > 2500 ? 0.5 : distSq > 400 ? 0.3 : 0.15);

    if (distSq > 4) {
      MatterBody.setPosition(this.playerBody, {
        x: pos.x + dx * correctionStrength,
        y: pos.y + dy * correctionStrength,
      });
    }

    // Smooth velocity blend: ease from 0.8 → 0.2 over 300ms after knockback ends
    const vel = this.playerBody.velocity;
    let velBlend;
    if (inKnockback) {
      velBlend = 0.8;
    } else {
      const kbEndedAgo = performance.now() - this.knockbackUntil;
      velBlend = kbEndedAgo < 300 ? 0.8 - 0.6 * (kbEndedAgo / 300) : 0.2;
    }
    MatterBody.setVelocity(this.playerBody, {
      x: vel.x + (serverState.vx - vel.x) * velBlend,
      y: vel.y + (serverState.vy - vel.y) * velBlend,
    });
  }

  // --- Remote Players ---

  addRemotePlayer(playerId, characterId, x, y, playerName, maxHp) {
    if (this.remotePlayers.has(playerId)) return;

    const shadow = this.add.ellipse(x, y + PLAYER.RADIUS * 0.5, PLAYER.RADIUS * 2.5, PLAYER.RADIUS * 1.2, 0x000000, 0.25);
    shadow.setDepth(9);
    const sprite = this.add.sprite(x, y - 4, `${characterId}-idle`, 0);
    sprite.setScale(SPRITE_SCALE);
    sprite.setDepth(10);
    sprite.play(`${characterId}-idle-down`);

    const isDummy = playerId.startsWith('dummy-');
    const displayName = isDummy ? 'Kukla' : (playerName || playerId.slice(-4));
    const nameLabel = this.add.text(x, y - 30, displayName, {
      fontSize: '12px',
      fontFamily: UI_FONT,
      fill: isDummy ? '#ff8866' : '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setDepth(11);

    // HP bar for remote player
    const hpBg = this.add.image(x, y - 22, 'ui-lifebar-bg').setOrigin(0.5).setDepth(11).setDisplaySize(32, 4);
    const hpFill = this.add.image(x - 18, y - 22, 'ui-lifebar-fill').setOrigin(0, 0.5).setDepth(11).setDisplaySize(32, 4).setTint(0x44dd44);

    this.remotePlayers.set(playerId, {
      sprite, shadow, nameLabel, hpBg, hpFill,
      characterId,
      name: playerName || null,
      x, y,
      targetX: x, targetY: y,
      vx: 0, vy: 0,
      hp: maxHp || PLAYER.MAX_HP, maxHp: maxHp || PLAYER.MAX_HP,
      facingDir: 'down',
      isMoving: false,
      _lastHpRatio: null,
    });
  }

  removeRemotePlayer(playerId) {
    const rp = this.remotePlayers.get(playerId);
    if (rp) {
      if (rp.sprite && !rp.sprite.destroyed) {
        this.tweens.killTweensOf(rp.sprite);
        rp.sprite.destroy();
      }
      if (rp.shadow && !rp.shadow.destroyed) rp.shadow.destroy();
      if (rp.nameLabel && !rp.nameLabel.destroyed) rp.nameLabel.destroy();
      if (rp.hpBg && !rp.hpBg.destroyed) rp.hpBg.destroy();
      if (rp.hpFill && !rp.hpFill.destroyed) rp.hpFill.destroy();
      this.remotePlayers.delete(playerId);
    }
  }

  updateRemotePlayer(serverState) {
    let rp = this.remotePlayers.get(serverState.id);
    if (!rp) {
      this.addRemotePlayer(serverState.id, serverState.characterId || 'ninja-green', serverState.x, serverState.y, serverState.name, serverState.maxHp);
      rp = this.remotePlayers.get(serverState.id);
      if (!rp) return;
    }

    rp.targetX = serverState.x;
    rp.targetY = serverState.y;
    rp.vx = serverState.vx;
    rp.vy = serverState.vy;
    rp.lastUpdateTime = performance.now();
    const prevHp = rp.hp;
    rp.hp = serverState.hp;
    rp.maxHp = serverState.maxHp;

    // Hit flash and damage number on remote player damage
    if (prevHp > rp.hp && rp.sprite) {
      rp.sprite.setTintFill(0xffffff);
      this.time.delayedCall(80, () => {
        if (rp.sprite && !rp.sprite.destroyed) {
          rp.sprite.setTintFill(0xff4444);
          this.time.delayedCall(80, () => {
            if (rp.sprite && !rp.sprite.destroyed) rp.sprite.clearTint();
          });
        }
      });
      this.hudManager.showDamageNumber(rp.targetX, rp.targetY, prevHp - rp.hp);
    }

    // Track intangible state (ghost buff)
    rp.intangible = serverState.intangible || false;

    // Update name from server if provided
    if (serverState.name && !rp.name) {
      rp.name = serverState.name;
      if (rp.nameLabel && !rp.nameLabel.destroyed) {
        const isDummy = serverState.id.startsWith('dummy-');
        if (!isDummy) {
          rp.nameLabel.setText(serverState.name);
        }
      }
    }
  }

  interpolateRemotePlayers() {
    const lerpFactor = 0.15;

    for (const [id, rp] of this.remotePlayers) {
      // Check if this remote player is mid-hook-swing — use orbital/aggressive lerp
      let usedOrbitalPrediction = false;
      if (this.lastServerSpells) {
        // Branch B grappling or flight: use aggressive lerp
        const grapplingSpell = this.lastServerSpells.find(
          s => s.pullSelf && s.ownerId === id && (
            (s.hooked && s.pullActive && !s.released) || s.flightActive
          )
        );
        if (grapplingSpell) {
          rp.x += (rp.targetX - rp.x) * 0.4; // aggressive lerp
          rp.y += (rp.targetY - rp.y) * 0.4;
          usedOrbitalPrediction = true;
        }

        // Branch A: this player is being swung by someone (orbits around the caster)
        if (!usedOrbitalPrediction) {
          const swingSpell = this.lastServerSpells.find(
            s => !s.pullSelf && s.hooked && !s.released && s.hookedPlayerId === id && s.swingDuration > 0
          );
          if (swingSpell) {
            let centerX, centerY;
            if (swingSpell.ownerId === this.localPlayerId && this.playerBody) {
              centerX = this.playerBody.position.x;
              centerY = this.playerBody.position.y;
            } else {
              const casterRp = this.remotePlayers.get(swingSpell.ownerId);
              centerX = casterRp ? casterRp.x : swingSpell.x;
              centerY = casterRp ? casterRp.y : swingSpell.y;
            }
            const timeSinceUpdate = (performance.now() - (rp.lastUpdateTime || performance.now())) / 1000;
            const localElapsed = swingSpell.swingElapsed + timeSinceUpdate * 1000;
            if (localElapsed < swingSpell.swingDuration) {
              const t = localElapsed / swingSpell.swingDuration;
              const angularSpeed = 4 + t * 6;
              const predictedAngle = swingSpell.swingAngle + angularSpeed * timeSinceUpdate;
              rp.x = centerX + Math.cos(predictedAngle) * swingSpell.orbitRadius;
              rp.y = centerY + Math.sin(predictedAngle) * swingSpell.orbitRadius;
              usedOrbitalPrediction = true;
            }
          }
        }
      }

      if (!usedOrbitalPrediction) {
        rp.x += (rp.targetX - rp.x) * lerpFactor;
        rp.y += (rp.targetY - rp.y) * lerpFactor;
      }

      rp.sprite.setPosition(rp.x, rp.y - 4);
      rp.shadow.setPosition(rp.x, rp.y + PLAYER.RADIUS * 0.5);
      rp.nameLabel.setPosition(rp.x, rp.y - 30);

      // Update remote HP bar position (always, since player moves)
      rp.hpBg.setPosition(rp.x, rp.y - 22);
      rp.hpFill.setPosition(rp.x - 18, rp.y - 22);

      // Only recalculate width and color when HP changes
      const hpRatio = Math.max(0, rp.hp / rp.maxHp);
      if (hpRatio !== rp._lastHpRatio) {
        rp._lastHpRatio = hpRatio;
        rp.hpFill.displayWidth = 32 * hpRatio;
        if (hpRatio > 0.75) {
          rp.hpFill.setTint(0x44bbff);
        } else if (hpRatio > 0.5) {
          rp.hpFill.setTint(0xdddd44);
        } else if (hpRatio > 0.25) {
          rp.hpFill.setTint(0xff8833);
        } else {
          rp.hpFill.setTint(0xff3333);
        }
      }

      // Ghost transparency: semi-transparent while intangible
      const targetAlpha = rp.intangible ? 0.35 : 1.0;
      if (rp.sprite && rp.sprite.alpha !== targetAlpha) {
        rp.sprite.setAlpha(targetAlpha);
      }

      const speed = Math.sqrt(rp.vx * rp.vx + rp.vy * rp.vy);
      const wasMoving = rp.isMoving;
      rp.isMoving = speed > 0.5;

      if (rp.isMoving) {
        const ax = Math.abs(rp.vx);
        const ay = Math.abs(rp.vy);
        const newDir = ax >= ay
          ? (rp.vx > 0 ? 'right' : 'left')
          : (rp.vy > 0 ? 'down' : 'up');
        const dirChanged = newDir !== rp.facingDir;
        rp.facingDir = newDir;
        if (!wasMoving || dirChanged) {
          rp.sprite.play(`${rp.characterId}-walk-${rp.facingDir}`);
        }
      } else if (wasMoving) {
        rp.sprite.play(`${rp.characterId}-idle-${rp.facingDir}`);
      }
    }
  }

  // --- Local Player ---

  createLocalPlayer(x, y) {
    if (this.playerBody) return;

    this.playerBody = this.matter.add.circle(x, y, PLAYER.RADIUS, {
      label: 'player',
      mass: PLAYER.MASS,
      friction: PLAYER.FRICTION,
      frictionAir: PLAYER.FRICTION_AIR,
      restitution: PLAYER.RESTITUTION,
      frictionStatic: PLAYER.FRICTION_STATIC,
      inertia: Infinity,
      inverseInertia: 0,
    });

    this.playerShadow = this.add.ellipse(x, y + PLAYER.RADIUS * 0.5, PLAYER.RADIUS * 2.5, PLAYER.RADIUS * 1.2, 0x000000, 0.3);
    this.playerShadow.setDepth(9);
    this.playerSprite = this.add.sprite(x, y - 4, `${this.characterId}-idle`, 0);
    this.playerSprite.setScale(SPRITE_SCALE);
    this.playerSprite.setDepth(10);
    this.playerSprite.play(`${this.characterId}-idle-down`);

    this.moveTargetMarker = this.add.image(0, 0, 'fx-particle-spark', 0).setTint(0x44aadd).setAlpha(0.6).setDisplaySize(8, 8);
    this.moveTargetMarker.setVisible(false);
    this.moveTargetMarker.setDepth(5);
  }

  // --- Spell System ---


  castSpell(slotKey) {
    // Look up the chosen spell for this slot from progression
    const spellId = this.getSlotSpellId(slotKey);
    if (!spellId) return;

    // Check client-side cooldown (server also validates)
    if (this.cooldowns[spellId] && this.cooldowns[spellId] > 0) return;

    // Get mouse position in world coords for targeting
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    this.network.sendSpellCast(slotKey, spellId, worldPoint.x, worldPoint.y);

    // Blink/Swap: clear movement target so player doesn't auto-walk to old click position
    const spellDef = SPELLS[spellId];
    if (spellDef && (spellDef.type === SPELL_TYPES.BLINK || spellDef.type === SPELL_TYPES.SWAP)) {
      this.moveTarget = null;
    }
  }

  // --- Spectator Mode ---

  enterSpectatorMode() {
    this.spectateMode = true;
    this.cycleSpectateTarget(1);

    // Listen for left-click and arrow keys to cycle target
    this._spectateClickHandler = () => {
      if (this.spectateMode) this.cycleSpectateTarget(1);
    };
    this._spectateLeftHandler = () => {
      if (this.spectateMode) this.cycleSpectateTarget(-1);
    };
    this._spectateRightHandler = () => {
      if (this.spectateMode) this.cycleSpectateTarget(1);
    };
    this.input.on('pointerdown', this._spectateClickHandler);
    this.input.keyboard.on('keydown-LEFT', this._spectateLeftHandler);
    this.input.keyboard.on('keydown-RIGHT', this._spectateRightHandler);
  }

  cycleSpectateTarget(direction) {
    // Build list of alive remote players
    const alivePlayers = [];
    for (const [id, rp] of this.remotePlayers) {
      if (rp.sprite && rp.sprite.alpha > 0.35) {
        alivePlayers.push(id);
      }
    }
    if (alivePlayers.length === 0) {
      this.spectateTargetId = null;
      this.hudManager._hideSpectateHUD();
      return;
    }

    // Cycle through alive players
    let idx = this.spectateTargetIndex;
    idx += direction;
    if (idx >= alivePlayers.length) idx = 0;
    if (idx < 0) idx = alivePlayers.length - 1;

    this.spectateTargetIndex = idx;
    this.spectateTargetId = alivePlayers[idx];

    const rp = this.remotePlayers.get(this.spectateTargetId);
    const name = rp ? (rp.name || this.spectateTargetId.slice(-4)) : '???';
    this.hudManager.updateSpectateHUD(name);
  }

  /** Look up which spell the player has chosen for a slot */
  getSlotSpellId(slotKey) {
    if (!this.progression) return null;
    const spellState = this.progression.spells[slotKey];
    if (!spellState || !spellState.chosenSpell) return null;
    return spellState.chosenSpell;
  }

  // --- Arena ---

  createArena() {
    // Load all arena map variants for per-round obstacle rotation
    this.arenaMaps = [];
    for (let i = 1; i <= 29; i++) {
      const m = this.cache.json.get(`arena-map-${i}`);
      if (m) this.arenaMaps.push(m);
    }
    this.currentMapIndex = -1;

    // Use first available map for floor/decorations (they're shared across all maps)
    const mapData = this.arenaMaps[0] || this.cache.json.get('arena-map');
    if (mapData && mapData.floor && mapData.floor.tiles && mapData.floor.tiles.length > 0) {
      this.createArenaFromMap(mapData);
    } else {
      this.createArenaProceduralFallback();
    }
  }

  createArenaFromMap(mapData) {
    const texSize = ARENA.FLOOR_SIZE + 800;
    const texHalf = texSize / 2;
    const radius = ARENA.RADIUS;
    const COLS = 22;
    const TILE_SIZE = 16;

    // --- RenderTexture for static floor ---
    const rt = this.add.renderTexture(0, 0, texSize, texSize);
    rt.setOrigin(0.5);
    rt.setDepth(0);

    // Step 1: Fill entire texture with white (frame 331 is pure 255,255,255 — just fill white)
    rt.fill(0xFFFFFF);

    // Step 2: Stamp map tiles on top (centered within the larger texture)
    // Reuse a single sprite — avoids 15k+ create/destroy cycles that freeze the browser
    const mapOffset = (texSize - ARENA.FLOOR_SIZE) / 2;
    const stampSprite = this.make.sprite({ x: 0, y: 0, key: 'tile-floor', frame: 0, add: false });
    stampSprite.setOrigin(0);
    let currentTileset = 'tile-floor';
    for (const tile of mapData.floor.tiles) {
      if (tile.tileset !== currentTileset) {
        currentTileset = tile.tileset;
        stampSprite.setTexture(currentTileset, tile.frame);
      } else {
        stampSprite.setFrame(tile.frame);
      }
      rt.draw(stampSprite, mapOffset + tile.col * 16, mapOffset + tile.row * 16);
    }
    stampSprite.destroy();

    // Step 3: Subtle grid overlay
    this.drawGridOverlay(rt, texSize, texHalf);

    this.arenaTexture = rt;

    // Step 5: Place decorations from map data
    if (mapData.decorations && mapData.decorations.length > 0) {
      this.createDecorationsFromMap(mapData.decorations);
    }

    // Step 6: Obstacles are loaded dynamically per round (see loadObstaclesForMap)

    // Step 7: Dynamic ring graphics (owned by HUDManager)
    this.hudManager.ringGraphics = this.add.graphics();
    this.hudManager.ringGraphics.setDepth(1);
    this.hudManager.outerRingGraphics = this.add.graphics();
    this.hudManager.outerRingGraphics.setDepth(1);
    this.hudManager.lastDrawnRingRadius = -1;

    // Aim indicator graphics (world-space, below spells)
    this.indicatorGraphics = this.add.graphics().setDepth(3);
  }

  createDecorationsFromMap(decorations) {
    const half = ARENA.FLOOR_SIZE / 2; // 600 — editor coords are 0-1200, game world is centered at 0,0
    for (const dec of decorations) {
      const scale = dec.scale || 3;
      const alpha = dec.alpha || 0.65;

      // Convert editor coords (0-1200) to game world coords (centered at 0,0)
      const worldX = dec.x - half;
      const worldY = dec.y - half;

      const sprite = this.add.sprite(worldX, worldY, dec.tileset, dec.frame);
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 0.5);
      sprite.setAlpha(alpha);
      sprite.setDepth(2);
    }
  }

  createObstaclesFromMap(obstacles) {
    const half = ARENA.FLOOR_SIZE / 2;
    this.obstacleSprites = [];

    // Type → tint map
    const TYPE_TINTS = {
      breakable: 0xddaa44,  // amber
      bouncer:   0x44ff88,  // green
      explosive: 0xff4444,  // red
    };

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const worldX = obs.x - half;
      const worldY = obs.y - half;
      const scale = obs.scale || 2.25;
      const radius = obs.radius || 24;
      const type = obs.type || 'normal';

      // Subtle shadow under the pillar
      const shadow = this.add.ellipse(worldX, worldY + 4, radius * 2, radius, 0x000000, 0.3);
      shadow.setDepth(4);

      // Main pillar sprite
      const sprite = this.add.sprite(worldX, worldY, obs.tileset, obs.frame);
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(5); // Above floor (0), ring (1), decos (2); below spells (10+)

      // Type-specific tint
      const tint = TYPE_TINTS[type];
      if (tint) {
        sprite.setTint(tint);
      }

      // Bouncer: subtle scale pulse tween
      if (type === 'bouncer') {
        this.tweens.add({
          targets: sprite,
          scaleX: scale * 1.08,
          scaleY: scale * 1.08,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      this.obstacleSprites.push({ sprite, shadow, mapIndex: i, type });
    }
  }

  /**
   * Swap obstacle visuals for a new round's map.
   * Destroys old obstacle sprites and creates new ones from the given map index.
   */
  loadObstaclesForMap(mapIndex) {
    // Destroy existing obstacles
    if (this.obstacleSprites) {
      for (const obs of this.obstacleSprites) {
        if (obs.sprite && !obs.sprite.destroyed) obs.sprite.destroy();
        if (obs.shadow && !obs.shadow.destroyed) obs.shadow.destroy();
      }
      this.obstacleSprites = [];
    }

    this.currentMapIndex = mapIndex;

    // Load new obstacles from the selected map
    if (mapIndex >= 0 && mapIndex < this.arenaMaps.length) {
      const mapData = this.arenaMaps[mapIndex];
      if (mapData && mapData.obstacles && mapData.obstacles.length > 0) {
        this.createObstaclesFromMap(mapData.obstacles);
      }
    }
  }

  /**
   * Handle obstacle destruction events from server.
   * Removes sprite/shadow and shows visual effects for explosive obstacles.
   */
  handleObstacleEvent(data) {
    if (!data || !data.destroyed) return;

    for (const evt of data.destroyed) {
      // Find the obstacle sprite by mapIndex
      const idx = this.obstacleSprites.findIndex(o => o.mapIndex === evt.mapIndex);
      if (idx === -1) continue;

      const obs = this.obstacleSprites[idx];
      const x = obs.sprite ? obs.sprite.x : evt.x;
      const y = obs.sprite ? obs.sprite.y : evt.y;

      // Destroy sprite and shadow
      if (obs.sprite && !obs.sprite.destroyed) obs.sprite.destroy();
      if (obs.shadow && !obs.shadow.destroyed) obs.shadow.destroy();
      this.obstacleSprites.splice(idx, 1);

      // Explosion effect for explosive obstacles
      if (evt.type === 'explosive') {
        const explosionRadius = evt.explosionRadius || 120;

        // Explosion sprite animation
        if (this.anims.exists('fx-explosion-play')) {
          const explosion = this.add.sprite(x, y, 'fx-explosion');
          explosion.setScale(explosionRadius / 20);
          explosion.setDepth(16);
          explosion.play({ key: 'fx-explosion-play', repeat: 0 });
          explosion.once('animationcomplete', () => explosion.destroy());
        }

        // Expanding ring flash
        if (this.anims.exists('fx-circular-slash-play')) {
          const ring = this.add.sprite(x, y, 'fx-circular-slash');
          ring.setTint(0xff4444);
          ring.setScale(1);
          ring.setDepth(15);
          ring.setAlpha(0.8);
          ring.play({ key: 'fx-circular-slash-play', repeat: 0 });
          this.tweens.add({
            targets: ring,
            scaleX: explosionRadius / 16, scaleY: explosionRadius / 16,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
          });
        }
      } else {
        // Breakable: smoke puff + rock debris
        if (this.anims.exists('fx-smoke-circular-play')) {
          const puff = this.add.sprite(x, y, 'fx-smoke-circular');
          puff.setTint(0xddaa44);
          puff.setScale(3);
          puff.setDepth(15);
          puff.play({ key: 'fx-smoke-circular-play', repeat: 0 });
          puff.once('animationcomplete', () => puff.destroy());
        }

        // Scatter rock debris particles
        const rockKey = 'fx-particle-rock';
        const rockTex = this.textures.exists(rockKey) ? this.textures.get(rockKey) : null;
        const rockFrames = rockTex ? Math.max(1, rockTex.frameTotal - 1) : 0;
        if (rockFrames > 0) {
          for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 30;
            const frame = Math.floor(Math.random() * rockFrames);
            const debris = this.add.sprite(x, y, rockKey, frame);
            debris.setScale(1.5 + Math.random());
            debris.setDepth(15);
            debris.setAlpha(0.8);
            this.tweens.add({
              targets: debris,
              x: x + Math.cos(angle) * dist,
              y: y + Math.sin(angle) * dist,
              alpha: 0,
              scaleX: 0.5,
              scaleY: 0.5,
              duration: 300 + Math.random() * 200,
              ease: 'Quad.easeOut',
              onComplete: () => debris.destroy(),
            });
          }
        }
      }
    }
  }

  drawEdgeMask(rt, size, half, radius) {
    const edgeMask = this.make.graphics({ x: 0, y: 0, add: false });
    const snowColor = 0xe8eef5;
    edgeMask.fillStyle(snowColor, 1);

    // Soft fade zone — white snow blends into ice edge
    for (let i = 0; i < 8; i++) {
      const alpha = 0.08 + i * 0.13;
      edgeMask.lineStyle(4, snowColor, Math.min(alpha, 1.0));
      edgeMask.strokeCircle(half, half, radius - 4 + i * 4);
    }

    // Hard coverage zone — solid white snow beyond arena
    for (let i = 0; i < 40; i++) {
      edgeMask.lineStyle(4, snowColor, 1.0);
      edgeMask.strokeCircle(half, half, radius + 28 + i * 4);
    }

    // Corner strips — fill remaining corners with snow
    edgeMask.fillRect(0, 0, size, half - radius - 150);
    edgeMask.fillRect(0, half + radius + 150, size, half - radius - 150);
    edgeMask.fillRect(0, 0, half - radius - 150, size);
    edgeMask.fillRect(half + radius + 150, 0, half - radius - 150, size);

    rt.draw(edgeMask);
    edgeMask.destroy();
  }

  drawGridOverlay(rt, size, half) {
    const grid = this.make.graphics({ x: 0, y: 0, add: false });
    const radius = ARENA.RADIUS;
    const gridSpacing = 64;

    // Only draw grid lines within the arena circle (avoids visible lines on white snow)
    grid.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x <= size; x += gridSpacing) {
      // Clip line to arena circle
      const dx = x - half;
      if (Math.abs(dx) > radius) continue;
      const yExtent = Math.sqrt(radius * radius - dx * dx);
      grid.lineBetween(x, half - yExtent, x, half + yExtent);
    }
    for (let y = 0; y <= size; y += gridSpacing) {
      const dy = y - half;
      if (Math.abs(dy) > radius) continue;
      const xExtent = Math.sqrt(radius * radius - dy * dy);
      grid.lineBetween(half - xExtent, y, half + xExtent, y);
    }

    // Center crosshair
    grid.lineStyle(1, 0xffffff, 0.1);
    grid.lineBetween(half - 20, half, half + 20, half);
    grid.lineBetween(half, half - 20, half, half + 20);
    rt.draw(grid);
    grid.destroy();
  }

  createArenaProceduralFallback() {
    const radius = ARENA.RADIUS;    // 550
    const TILE_SCALE = 2;
    const TILE_SIZE = 16 * TILE_SCALE; // 32px rendered

    // Make texture large enough that players never see the edge, even when knocked far
    const texSize = ARENA.FLOOR_SIZE + 800; // 2000px — plenty of margin
    const texHalf = texSize / 2;

    // --- RenderTexture for static floor ---
    const rt = this.add.renderTexture(0, 0, texSize, texSize);
    rt.setOrigin(0.5);
    rt.setDepth(0);

    // TilesetFloor.png: 22 cols x 26 rows (16x16 tiles)
    const COLS = 22;

    // Pure white snow tile (verified: all 256 pixels are exactly 255,255,255, zero variance)
    const snowFillFrame = 15 * COLS + 1; // frame 331 — perfectly uniform white

    // Ice fill tiles — for inside the arena ring
    const iceFillFrames = [
      22 * COLS + 1,  // row 22, col 1 — cleanest solid ice (primary)
      22 * COLS + 1,  // duplicate for higher weight
      22 * COLS + 1,  // duplicate for higher weight
      22 * COLS + 5,  // row 22, col 5 — subtle variant
      22 * COLS + 6,  // row 22, col 6 — subtle variant
      22 * COLS + 9,  // row 22, col 9 — subtle variant
      21 * COLS + 5,  // row 21, col 5 — faint mark variant
      21 * COLS + 9,  // row 21, col 9 — faint mark variant
      23 * COLS + 5,  // row 23, col 5 — subtle variant
      23 * COLS + 9,  // row 23, col 9 — subtle variant
    ];

    // Seeded RNG for deterministic tile placement
    let rngSeed = 42;
    const nextRng = () => {
      rngSeed = (rngSeed * 16807 + 0) % 2147483647;
      return (rngSeed & 0x7fffffff) / 0x7fffffff;
    };

    // Step 1: Fill white, then stamp ice tiles only inside the arena
    // (avoids 4000+ sprite create/destroy cycles that freeze the browser)
    rt.fill(0xFFFFFF);

    const totalTiles = Math.ceil(texSize / TILE_SIZE);
    const stampTile = this.make.sprite({ x: 0, y: 0, key: 'tile-floor', frame: 0, add: false });
    stampTile.setScale(TILE_SCALE);
    stampTile.setOrigin(0);

    for (let ty = 0; ty < totalTiles; ty++) {
      for (let tx = 0; tx < totalTiles; tx++) {
        const cx = tx * TILE_SIZE + TILE_SIZE / 2;
        const cy = ty * TILE_SIZE + TILE_SIZE / 2;
        const dx = cx - texHalf;
        const dy = cy - texHalf;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Only stamp ice tiles inside the arena — snow is already white fill
        if (dist < radius + TILE_SIZE * 0.3) {
          const frame = iceFillFrames[Math.floor(nextRng() * iceFillFrames.length)];
          stampTile.setFrame(frame);
          rt.draw(stampTile, tx * TILE_SIZE, ty * TILE_SIZE);
        } else {
          // Advance RNG to keep deterministic sequence
          nextRng();
        }
      }
    }
    stampTile.destroy();

    // Step 2: Subtle grid overlay
    this.drawGridOverlay(rt, texSize, texHalf);

    this.arenaTexture = rt;

    // Step 3: Decorative props around arena rim
    this.createArenaDecorations();

    // Step 4: Dynamic ring graphics (owned by HUDManager)
    this.hudManager.ringGraphics = this.add.graphics();
    this.hudManager.ringGraphics.setDepth(1);
    this.hudManager.outerRingGraphics = this.add.graphics();
    this.hudManager.outerRingGraphics.setDepth(1);
    this.hudManager.lastDrawnRingRadius = -1;

    // Aim indicator graphics
    if (this.indicatorGraphics && !this.indicatorGraphics.destroyed) this.indicatorGraphics.destroy();
    this.indicatorGraphics = this.add.graphics().setDepth(3);
  }

  createArenaDecorations() {
    const PROP_SCALE = 3;
    const radius = ARENA.RADIUS;
    const COLS = 24; // TilesetNature: 384/16 = 24 cols

    // Define multi-tile decoration props from TilesetNature.png
    // Frame = row * 24 + col (24 cols in TilesetNature)
    // Only snow/ice/grey objects — NO trees with green grass or brown dirt bases
    const PROPS = [
      // White snowball — r13c10 (322), confirmed clean white
      { frames: [[13*COLS+10]], w: 1, h: 1, weight: 5 },
      // White puff — r12c10 (298), confirmed clean white
      { frames: [[12*COLS+10]], w: 1, h: 1, weight: 4 },
      // White blob — r12c11 (299), confirmed clean white
      { frames: [[12*COLS+11]], w: 1, h: 1, weight: 3 },
      // White/cream rock — r13c11 (323), confirmed clean white
      { frames: [[13*COLS+11]], w: 1, h: 1, weight: 3 },
      // White triangular tree canopy (top only) — r0 c8-9
      { frames: [[0*COLS+8, 0*COLS+9]], w: 2, h: 1, weight: 5 },
      // White round canopy (top only) — r0 c10-11
      { frames: [[0*COLS+10, 0*COLS+11]], w: 2, h: 1, weight: 5 },
      // White snow evergreen top — r2 c8-9
      { frames: [[2*COLS+8, 2*COLS+9]], w: 2, h: 1, weight: 4 },
    ];

    // Seeded RNG
    let rng = 54321;
    const nextRng = () => {
      rng = (rng * 16807) % 2147483647;
      return (rng & 0x7fffffff) / 0x7fffffff;
    };

    // Build weighted array
    const weighted = [];
    for (const prop of PROPS) {
      for (let i = 0; i < prop.weight; i++) weighted.push(prop);
    }

    // Place props in ring around arena edge
    const numProps = 22;
    const innerR = radius - 10;
    const outerR = radius + 50;
    const placed = [];
    const minDist = 90;

    for (let i = 0; i < numProps; i++) {
      const angle = (i / numProps) * Math.PI * 2 + nextRng() * 0.25;
      const r = innerR + nextRng() * (outerR - innerR);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      // Check minimum spacing
      let tooClose = false;
      for (const pp of placed) {
        const ddx = pp.x - x, ddy = pp.y - y;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
      placed.push({ x, y });

      // Pick a prop type
      const prop = weighted[Math.floor(nextRng() * weighted.length)];

      // Create container for multi-tile prop
      const container = this.add.container(x, y);
      container.setDepth(2);

      const tileRendered = 16 * PROP_SCALE;
      const offsetX = -(prop.w * tileRendered) / 2;
      const offsetY = -(prop.h * tileRendered) / 2;

      for (let row = 0; row < prop.h; row++) {
        for (let col = 0; col < prop.w; col++) {
          const frame = prop.frames[row][col];
          const sprite = this.add.sprite(
            offsetX + col * tileRendered,
            offsetY + row * tileRendered,
            'tile-nature',
            frame
          );
          sprite.setScale(PROP_SCALE);
          sprite.setOrigin(0, 0);
          sprite.setAlpha(0.65);
          container.add(sprite);
        }
      }
    }
  }

  // --- Input ---

  setupInput() {
    // Right-click movement
    this.input.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown()) {
        this.setMoveTarget(pointer);
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (pointer.rightButtonDown()) {
        this.setMoveTarget(pointer);
      }
    });

    // QWER spell keys
    this.spellKeys = {
      Q: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      E: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      R: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
  }

  setMoveTarget(pointer) {
    // Block movement when paused or match-end
    if (this.pauseMenu && this.pauseMenu.visible) return;
    if (this.matchEndOverlay && this.matchEndOverlay.visible) return;
    // During knockback: allow DI (directional influence) — player can steer slightly
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.moveTarget = { x: worldPoint.x, y: worldPoint.y };

    // Set facing direction from player to click target
    if (this.playerBody) {
      const dx = worldPoint.x - this.playerBody.position.x;
      const dy = worldPoint.y - this.playerBody.position.y;
      // Only update direction if target is far enough (avoids jitter from nearby clicks)
      if (dx * dx + dy * dy > 25) {
        this.facingDir = Math.abs(dx) >= Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up');
      }
    }

    if (this.moveTargetMarker) {
      this.moveTargetMarker.setPosition(worldPoint.x, worldPoint.y);
      this.moveTargetMarker.setVisible(true);
      this.tweens.killTweensOf(this.moveTargetMarker);
      this.moveTargetMarker.setAlpha(0.6);
      this.tweens.add({
        targets: this.moveTargetMarker,
        alpha: 0,
        duration: 1500,
        ease: 'Power2',
        onComplete: () => this.moveTargetMarker.setVisible(false),
      });
    }

    if (this.network && this.network.connected) {
      this.network.sendInput({
        targetX: worldPoint.x,
        targetY: worldPoint.y,
      });
    }
  }

  // --- Camera ---

  setupCamera() {
    this.cameras.main.setZoom(1);
  }

  // --- Update Loop ---

  update(time, delta) {
    if (this !== window.__gameScene && window.__gameScene) {
      console.error('[BUG] update() running on WRONG scene! this.scene.key:', this.scene?.key, 'expected:', window.__gameScene?.scene?.key);
      return;
    }
    this.spellVisualManager.processPending();
    this.updateLocalMovement(delta);
    this.syncLocalVisuals();
    this.interpolateRemotePlayers();
    this.updateSpellInput();
    this.updateAimIndicator();
    this.spellVisualManager.update(delta);
    this.updateCamera();
    this.hudManager.update();
    this.sendInputToServer();
  }

  updateLocalMovement(delta) {
    // Block input during pause or match end
    if (this.pauseMenu && this.pauseMenu.visible) return;
    if (this.matchEndOverlay && this.matchEndOverlay.visible) return;
    if (!this.playerBody || !this.moveTarget) return;

    // During grappling: no movement forces
    if (this.grapplingActive) return;

    const pos = this.playerBody.position;
    const dx = this.moveTarget.x - pos.x;
    const dy = this.moveTarget.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // During knockback: apply DI (directional influence) instead of normal movement
    if (performance.now() < this.knockbackUntil) {
      const vel = this.playerBody.velocity;
      const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      if (currentSpeed > 0.5 && distance > 1) {
        const diStrength = PLAYER.DI_STRENGTH || 0.15;
        const nx = dx / distance;
        const ny = dy / distance;
        const timeScale = delta / 50;
        const diForce = currentSpeed * diStrength * 0.001 * timeScale;
        MatterBody.applyForce(this.playerBody, this.playerBody.position, {
          x: nx * diForce,
          y: ny * diForce,
        });
      }
      return; // No speed cap during knockback
    }

    const maxSpeed = PLAYER.SPEED * 0.05;
    const stopRadius = PLAYER.STOP_RADIUS || 10;

    if (distance > stopRadius) {
      // Apply thrust toward target
      // Scale force by delta to match server tick rate (50ms)
      // Server applies full force once per 50ms tick;
      // client runs at ~60fps (16.7ms), so scale proportionally.
      const nx = dx / distance;
      const ny = dy / distance;

      const baseForceMagnitude = PLAYER.SPEED * 0.0002;
      const timeScale = delta / 50; // 50ms = server tick
      const forceMagnitude = baseForceMagnitude * timeScale;
      MatterBody.applyForce(this.playerBody, this.playerBody.position, {
        x: nx * forceMagnitude,
        y: ny * forceMagnitude,
      });
    } else {
      // Entered stop zone — clear target, let momentum carry (ice slide)
      this.moveTarget = null;
    }

    // Speed cap: soft decay during post-knockback ease, hard clamp otherwise
    const vel = this.playerBody.velocity;
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (currentSpeed > maxSpeed) {
      const kbEndedAgo = performance.now() - this.knockbackUntil;
      if (kbEndedAgo >= 0 && kbEndedAgo < (PLAYER.KNOCKBACK_EASE_MS || 1000)) {
        // Post-knockback ease: soft cap decays excess smoothly
        const excess = currentSpeed - maxSpeed;
        const decay = Math.pow(PLAYER.SPEED_CAP_DECAY || 0.82, delta / 50);
        const targetSpeed = maxSpeed + excess * decay;
        const scale = targetSpeed / currentSpeed;
        MatterBody.setVelocity(this.playerBody, { x: vel.x * scale, y: vel.y * scale });
      } else {
        // Normal movement: hard cap
        const scale = maxSpeed / currentSpeed;
        MatterBody.setVelocity(this.playerBody, { x: vel.x * scale, y: vel.y * scale });
      }
    }
  }


  sendInputToServer() {
    if (!this.network || !this.network.connected || !this.moveTarget) return;
    // Don't send input during grappling — server ignores it
    // (knockback DI input IS sent — server uses it for directional influence)
    if (this.grapplingActive) return;
    this.network.sendInput({
      targetX: this.moveTarget.x,
      targetY: this.moveTarget.y,
    });
  }

  updateSpellInput() {
    if (!this.network || !this.network.connected || !this.playerBody) return;
    // Don't cast spells during shop phase or when paused/match-end
    if (this.phase === 'shop') return;
    if (this.pauseMenu && this.pauseMenu.visible) return;
    if (this.matchEndOverlay && this.matchEndOverlay.visible) return;
    // No spell input during spectator mode
    if (this.spectateMode) return;

    // Spell types that cast instantly (no aiming needed)
    const INSTANT_TYPES = [SPELL_TYPES.BUFF, SPELL_TYPES.RECALL, SPELL_TYPES.DASH];

    for (const key of ['Q', 'W', 'E', 'R']) {
      const keyObj = this.spellKeys[key];

      // Check if spell slot is locked
      if (this.progression && this.progression.slots[key] === 'locked') continue;

      // If mid-grapple and pressing R, this is a release, not a new cast
      if (key === 'R' && this.grapplingActive) {
        if (Phaser.Input.Keyboard.JustDown(keyObj)) {
          this.network.sendHookRelease();
        }
        continue;
      }

      const spellId = this.getSlotSpellId(key);
      if (!spellId) continue;
      const spellDef = SPELLS[spellId];
      if (!spellDef) continue;
      const spellType = spellDef.type;

      // Instant-cast spells: fire on JustDown (no hold-to-aim)
      if (INSTANT_TYPES.includes(spellType)) {
        if (Phaser.Input.Keyboard.JustDown(keyObj)) {
          this.castSpell(key);
        }
        continue;
      }

      // Hold-to-aim spells: enter aiming on key down, cast on key release
      if (Phaser.Input.Keyboard.JustDown(keyObj)) {
        // Check cooldown — if on CD, don't enter aiming
        if (this.cooldowns[spellId] && this.cooldowns[spellId] > 0) continue;
        this.aimingSlot = key;
      }

      if (this.aimingSlot === key && Phaser.Input.Keyboard.JustUp(keyObj)) {
        this.castSpell(key);
        this.aimingSlot = null;
      }
    }

    // Safety: if aiming slot key is no longer held, clear
    if (this.aimingSlot && !this.spellKeys[this.aimingSlot].isDown) {
      this.aimingSlot = null;
    }
  }

  /** Compute the correct effective range for a spell based on its type and server mechanics. */
  _getEffectiveRange(stats, spellType) {
    switch (spellType) {
      case SPELL_TYPES.PROJECTILE:
      case SPELL_TYPES.SWAP:
        // Server: spell.x += spell.vx each tick, despawn at lifetime. range stat ignored.
        return (stats.speed || 5) * ((stats.lifetime || 2000) / 50);
      case SPELL_TYPES.HOOK:
        // Server: travelDist > spell.range → despawn. range enforced.
        return stats.range || 300;
      case SPELL_TYPES.HOMING:
        // No range stat; trackingRange is detection radius for target acquisition.
        return stats.trackingRange || 400;
      case SPELL_TYPES.BOOMERANG:
        // Outbound distance before returning.
        return stats.range || 70;
      case SPELL_TYPES.INSTANT:
        // Detection radius around caster.
        return stats.radius || 100;
      default: // ZONE, WALL, BLINK
        return stats.range || 200;
    }
  }

  updateAimIndicator() {
    if (!this.indicatorGraphics) return;
    this.indicatorGraphics.clear();

    if (!this.aimingSlot || !this.playerBody || this.localEliminated) return;

    const slotKey = this.aimingSlot;
    const spellId = this.getSlotSpellId(slotKey);
    if (!spellId) return;
    const spellDef = SPELLS[spellId];
    if (!spellDef) return;

    // Get cached stats for range
    if (!this._indicatorStatsCache[spellId]) {
      const tierLevel = (this.progression && this.progression.spells[slotKey])
        ? (this.progression.spells[slotKey].tier || 0) : 0;
      this._indicatorStatsCache[spellId] = computeSpellStats(spellId, tierLevel);
    }
    const stats = this._indicatorStatsCache[spellId];
    if (!stats) return;

    const spellType = spellDef.type;
    const range = this._getEffectiveRange(stats, spellType);
    const px = this.playerBody.position.x;
    const py = this.playerBody.position.y;

    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const mx = worldPoint.x;
    const my = worldPoint.y;

    // Slot colors
    const SLOT_COLORS = { Q: 0xff4444, W: 0x4488ff, E: 0x44ddff, R: 0xaa44ff };
    const color = SLOT_COLORS[slotKey] || 0xffffff;

    const g = this.indicatorGraphics;

    // Direction to cursor
    const dx = mx - px;
    const dy = my - py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    switch (spellType) {
      // ── LoL-style line skillshot: narrow filled rectangle to max range ──
      case SPELL_TYPES.PROJECTILE:
      case SPELL_TYPES.SWAP:
      case SPELL_TYPES.HOOK:
      case SPELL_TYPES.BOOMERANG: {
        const halfW = Math.max((stats.radius || 7) * 2, 8) / 2;
        const angle = Math.atan2(dy, dx);
        const perpX = -Math.sin(angle) * halfW;
        const perpY = Math.cos(angle) * halfW;
        const endX = px + nx * range;
        const endY = py + ny * range;

        // Filled rectangle body
        g.fillStyle(color, 0.10);
        g.beginPath();
        g.moveTo(px + perpX, py + perpY);
        g.lineTo(endX + perpX, endY + perpY);
        g.lineTo(endX - perpX, endY - perpY);
        g.lineTo(px - perpX, py - perpY);
        g.closePath();
        g.fillPath();

        // Rectangle outline
        g.lineStyle(1, color, 0.20);
        g.strokePath();

        // Endpoint marker at max range
        g.fillStyle(color, 0.30);
        g.fillCircle(endX, endY, 4);
        break;
      }

      // ── Homing: tracking range circle + aim direction line ──
      case SPELL_TYPES.HOMING: {
        // Detection zone circle (trackingRange)
        g.lineStyle(1.5, color, 0.15);
        g.strokeCircle(px, py, range);
        g.fillStyle(color, 0.05);
        g.fillCircle(px, py, range);
        // Aim direction line (shows initial launch direction)
        const lineLen = Math.min(dist, range);
        g.lineStyle(2, color, 0.25);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + nx * lineLen, py + ny * lineLen);
        g.strokePath();
        g.fillStyle(color, 0.3);
        g.fillCircle(px + nx * lineLen, py + ny * lineLen, 4);
        break;
      }

      // ── Zone: range circle + AoE preview at cursor ──
      case SPELL_TYPES.ZONE: {
        // Subtle range circle to show max placement distance
        g.lineStyle(1.5, color, 0.15);
        g.strokeCircle(px, py, range);
        // Aim line to cursor (clamped to range)
        const zoneDist = Math.min(dist, range);
        const zoneX = px + nx * zoneDist;
        const zoneY = py + ny * zoneDist;
        g.lineStyle(1, color, 0.15);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(zoneX, zoneY);
        g.strokePath();
        // AoE preview circle at target position
        const aoeRadius = stats.zoneRadius || stats.impactRadius || stats.radius || 35;
        g.lineStyle(1.5, color, 0.25);
        g.strokeCircle(zoneX, zoneY, aoeRadius);
        g.fillStyle(color, 0.08);
        g.fillCircle(zoneX, zoneY, aoeRadius);
        break;
      }

      // ── Blink: line + destination dot ──
      case SPELL_TYPES.BLINK: {
        const blinkDist = Math.min(dist, range);
        const destX = px + nx * blinkDist;
        const destY = py + ny * blinkDist;
        g.lineStyle(1, color, 0.15);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(destX, destY);
        g.strokePath();
        // Destination dot
        g.fillStyle(color, 0.3);
        g.fillCircle(destX, destY, 6);
        g.lineStyle(1.5, color, 0.4);
        g.strokeCircle(destX, destY, 6);
        break;
      }

      // ── Instant: detection radius circle around player ──
      case SPELL_TYPES.INSTANT: {
        g.fillStyle(color, 0.06);
        g.fillCircle(px, py, range);
        g.lineStyle(1.5, color, 0.2);
        g.strokeCircle(px, py, range);
        break;
      }

      // ── Wall: aim line + circle preview at placement point ──
      case SPELL_TYPES.WALL: {
        // Range circle to show max placement distance
        g.lineStyle(1.5, color, 0.15);
        g.strokeCircle(px, py, range);
        const wallDist = Math.min(dist, range);
        const wallX = px + nx * wallDist;
        const wallY = py + ny * wallDist;
        g.lineStyle(1, color, 0.15);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(wallX, wallY);
        g.strokePath();
        // Wall preview circle (matches obstacle radius)
        const wallRadius = stats.wallRadius || 22;
        g.lineStyle(2, color, 0.3);
        g.strokeCircle(wallX, wallY, wallRadius);
        g.fillStyle(color, 0.1);
        g.fillCircle(wallX, wallY, wallRadius);
        break;
      }

      default:
        break;
    }
  }


  syncLocalVisuals() {
    if (!this.playerBody || !this.playerSprite) return;

    const pos = this.playerBody.position;
    const vel = this.playerBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

    this.playerSprite.setPosition(pos.x, pos.y - 4);
    this.playerShadow.setPosition(pos.x, pos.y + PLAYER.RADIUS * 0.5);

    const wasMoving = this.isMoving;
    this.isMoving = speed > 0.5;

    if (this.isMoving) {
      // facingDir is set once in setMoveTarget() at click time.
      // We only call play() on the transition from idle→moving,
      // NOT every frame — prevents animation restarts from speed oscillation.
      if (!wasMoving) {
        this.playerSprite.play(`${this.characterId}-walk-${this.facingDir}`);
      }
    } else if (wasMoving) {
      this.playerSprite.play(`${this.characterId}-idle-${this.facingDir}`);
    }

    // Speed trail for knockback flights (spark sprites)
    if (this.playerBody) {
      const trailVel = this.playerBody.velocity;
      const trailSpeed = Math.sqrt(trailVel.x * trailVel.x + trailVel.y * trailVel.y);
      const maxSpeed = PLAYER.SPEED * 0.05;

      if (trailSpeed > maxSpeed * 1.5) {
        // Player is flying from knockback — spawn spark sprite
        if (!this._trailSprites) this._trailSprites = [];
        const sparkKey = 'fx-particle-spark';
        const sparkTex = this.textures.exists(sparkKey) ? this.textures.get(sparkKey) : null;
        const sparkFrames = sparkTex ? Math.max(1, sparkTex.frameTotal - 1) : 0;

        if (sparkFrames > 0) {
          const frame = Math.floor(Math.random() * sparkFrames);
          const spark = this.add.sprite(this.playerBody.position.x, this.playerBody.position.y, sparkKey, frame);
          spark.setScale(2 + Math.random() * 2);
          spark.setDepth(5);
          spark.setAlpha(0.6);
          spark.setTint(0xffffff);
          this._trailSprites.push(spark);
          this.tweens.add({
            targets: spark,
            alpha: 0,
            scaleX: 0.5,
            scaleY: 0.5,
            duration: 300,
            ease: 'Quad.easeOut',
            onComplete: () => {
              spark.destroy();
              if (this._trailSprites) {
                const idx = this._trailSprites.indexOf(spark);
                if (idx >= 0) this._trailSprites.splice(idx, 1);
              }
            },
          });
          if (this._trailSprites.length > 12) {
            const old = this._trailSprites.shift();
            if (old && !old.destroyed) old.destroy();
          }
        } else {
          // Fallback to old graphics trail
          this.speedTrail.push({
            x: this.playerBody.position.x,
            y: this.playerBody.position.y,
            alpha: 0.6,
          });
          if (this.speedTrail.length > 8) this.speedTrail.shift();
        }
      }

      // Draw and fade fallback trail (only if spark sprites unavailable)
      if (this.speedTrail.length > 0) {
        if (!this.trailGraphics) {
          this.trailGraphics = this.add.graphics().setDepth(5);
        }
        this.trailGraphics.clear();
        for (let i = this.speedTrail.length - 1; i >= 0; i--) {
          this.speedTrail[i].alpha -= 0.06;
          if (this.speedTrail[i].alpha <= 0) {
            this.speedTrail.splice(i, 1);
          }
        }
        for (let i = 0; i < this.speedTrail.length; i++) {
          const t = this.speedTrail[i];
          const size = 6 + (i / this.speedTrail.length) * 8;
          this.trailGraphics.fillStyle(0xffffff, t.alpha * 0.5);
          this.trailGraphics.fillCircle(t.x, t.y, size);
        }
      }
    }
  }

  updateCamera() {
    const cam = this.cameras.main;
    const lerpFactor = 0.08;

    // Spectator mode: follow the spectated player
    if (this.spectateMode && this.spectateTargetId) {
      const rp = this.remotePlayers.get(this.spectateTargetId);
      if (rp) {
        // Check if spectated player is still alive
        if (rp.sprite && rp.sprite.alpha <= 0.35) {
          // Spectated player died — cycle to next alive player
          this.cycleSpectateTarget(1);
          return;
        }
        cam.scrollX += (rp.x - cam.width / 2 - cam.scrollX) * lerpFactor;
        cam.scrollY += (rp.y - cam.height / 2 - cam.scrollY) * lerpFactor;
        return;
      }
    }

    if (!this.playerBody) return;
    const pos = this.playerBody.position;
    cam.scrollX += (pos.x - cam.width / 2 - cam.scrollX) * lerpFactor;
    cam.scrollY += (pos.y - cam.height / 2 - cam.scrollY) * lerpFactor;
  }


  shutdown() {
    // Cleanup obstacle sprites
    if (this.obstacleSprites) {
      for (const obs of this.obstacleSprites) {
        if (obs.sprite && !obs.sprite.destroyed) obs.sprite.destroy();
        if (obs.shadow && !obs.shadow.destroyed) obs.shadow.destroy();
      }
      this.obstacleSprites = [];
    }

    // Cleanup spell visuals
    if (this.spellVisualManager) {
      this.spellVisualManager.destroy();
    }

    // Cleanup remote player sprites, shadows, labels, HP bars (kill tweens first)
    for (const [id, rp] of this.remotePlayers) {
      if (rp.sprite && !rp.sprite.destroyed) {
        this.tweens.killTweensOf(rp.sprite);
        rp.sprite.destroy();
      }
      if (rp.shadow && !rp.shadow.destroyed) rp.shadow.destroy();
      if (rp.nameLabel && !rp.nameLabel.destroyed) rp.nameLabel.destroy();
      if (rp.hpBg && !rp.hpBg.destroyed) rp.hpBg.destroy();
      if (rp.hpFill && !rp.hpFill.destroyed) rp.hpFill.destroy();
    }
    this.remotePlayers.clear();

    // Cleanup HUD
    if (this.hudManager) {
      this.hudManager.destroy();
    }

    // Cleanup graphics objects
    if (this.trailGraphics && !this.trailGraphics.destroyed) this.trailGraphics.destroy();
    if (this.arenaTexture && !this.arenaTexture.destroyed) this.arenaTexture.destroy();

    // Destroy overlay systems
    if (this.shopOverlay) this.shopOverlay.destroy();
    if (this.pauseMenu) this.pauseMenu.destroy();
    if (this.matchEndOverlay) this.matchEndOverlay.destroy();
    if (this.lobbyOverlay) this.lobbyOverlay.destroy();

    // Cleanup speed trail
    this.speedTrail = [];

    // Cleanup spectator listeners
    if (this._spectateClickHandler) {
      this.input.off('pointerdown', this._spectateClickHandler);
      this._spectateClickHandler = null;
    }
    if (this._spectateLeftHandler) {
      this.input.keyboard.off('keydown-LEFT', this._spectateLeftHandler);
      this._spectateLeftHandler = null;
    }
    if (this._spectateRightHandler) {
      this.input.keyboard.off('keydown-RIGHT', this._spectateRightHandler);
      this._spectateRightHandler = null;
    }

    // Cleanup aim indicator graphics
    if (this.indicatorGraphics && !this.indicatorGraphics.destroyed) {
      this.indicatorGraphics.destroy();
    }
    this.indicatorGraphics = null;

    // Clear tryJoin timeout
    if (this._tryJoinTimeout) { clearTimeout(this._tryJoinTimeout); this._tryJoinTimeout = null; }

    // Disconnect network
    if (this.network) {
      this.network.disconnect();
    }
  }
}
