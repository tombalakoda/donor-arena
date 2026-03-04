import Phaser from 'phaser';
import { PLAYER, ARENA } from '../../shared/constants.js';
import { SPELLS, SPELL_KEYS, SPELL_TYPES } from '../../shared/spellData.js';
import { SKILL_TREE, SPELL_SLOTS } from '../../shared/skillTreeData.js';
import { NetworkManager } from '../systems/NetworkManager.js';
import { ShopOverlay } from '../ui/ShopOverlay.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { MatchEndOverlay } from '../ui/MatchEndOverlay.js';
import { LobbyOverlay } from '../ui/LobbyOverlay.js';

const MatterBody = Phaser.Physics.Matter.Matter.Body;
const SPRITE_SCALE = 3;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.network = null;
    this.localPlayerId = null;
    this.characterId = 'boy';
    this.playerName = 'Player';
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
    this.spellVisuals = new Map();  // spellId -> { sprite/graphics, ... }
    this.pendingSpellCasts = [];    // Queue of spell cast events to create visuals for
    this.cooldowns = {};            // { spellId: remainingMs }
    this.charges = {};              // { spellId: { remaining, max } } — multi-charge spells
    this.spellKeys = {};            // Phaser key objects for Q/W/E/R

    // Arena
    this.arenaGraphics = null;
    this.ringRadius = ARENA.RADIUS;

    // HUD
    this.pingText = null;
    this.playerCountText = null;
    this.hpBarBg = null;
    this.hpBarFill = null;
    this.spellSlots = [];           // HUD spell slot UI elements

    // Round state
    this.roundNumber = 0;
    this.totalRounds = 20;
    this.phase = 'waiting';
    this.timeRemaining = 0;
    this.countdownRemaining = 0;
    this.localEliminated = false;

    // Round HUD elements
    this.roundText = null;
    this.timerText = null;
    this.phaseText = null;
    this.countdownOverlay = null;
    this.countdownText = null;
    this.killFeedTexts = [];
    this.killFeedTimeouts = [];

    // Ring graphics (dynamic, redrawn as ring shrinks)
    this.ringGraphics = null;
    this.outerRingGraphics = null;
    this.lastDrawnRingRadius = -1;

    // Progression / Shop
    this.shopOverlay = null;
    this.progression = null;      // { sp, totalSpEarned, slots, spells }
    this.shopTimeRemaining = 0;
    this.spText = null;           // SP counter HUD element

    // Overlays
    this.pauseMenu = null;
    this.matchEndOverlay = null;
    this.lobbyOverlay = null;
    this.lastPhase = null;        // Track phase transitions for lobby
  }

  init(data) {
    if (data) {
      this.characterId = data.characterId || 'boy';
      this.playerName = data.playerName || 'Player';
      this.gameMode = data.mode || 'normal';
    }
  }

  create() {
    // Track scene instances for debugging
    window.__gameSceneCount = (window.__gameSceneCount || 0) + 1;
    console.log('[SCENE] create() called, instance count:', window.__gameSceneCount, 'mode:', this.gameMode);

    // Fade in from black
    this.cameras.main.fadeIn(500, 0, 0, 0);

    this.createArena();
    this.setupInput();
    this.setupCamera();
    this.createHUD();
    this.createSpellHUD();
    this.shopOverlay = new ShopOverlay(this);
    this.pauseMenu = new PauseMenu(this);
    this.matchEndOverlay = new MatchEndOverlay(this);
    this.lobbyOverlay = new LobbyOverlay(this);
    this.connectToServer();

    // Show lobby immediately (phase starts as 'waiting')
    this.lobbyOverlay.show();

    // ESC key to toggle pause menu
    this.input.keyboard.on('keydown-ESC', () => {
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
          this.network.socket.emit('c:sandboxShopToggle');
        }
      });
    }

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
      console.log('Joined as', this.localPlayerId);

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
    };

    this.network.onPlayerJoin = (data) => {
      console.log('Player joined:', data.id);
      this.addRemotePlayer(data.id, data.characterId || 'ninja-green', 0, 0, data.name);
    };

    this.network.onPlayerLeave = (data) => {
      console.log('Player left:', data.id);
      this.removeRemotePlayer(data.id);
    };

    this.network.onStateUpdate = (snapshot) => {
      this.handleServerState(snapshot);
    };

    this.network.onSpellCast = (data) => {
      this.handleSpellCast(data);
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

    this.network.connect();
    // Wait for actual connection before joining (cloudflare can be slow)
    const tryJoin = () => {
      if (this.network.connected) {
        this.network.join(this.playerName, this.characterId, this.gameMode);
      } else {
        setTimeout(tryJoin, 200);
      }
    };
    setTimeout(tryJoin, 200);
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
            this.showDamageNumber(this.playerBody.position.x, this.playerBody.position.y, hpLost);
          }
        }
        this.localEliminated = ps.eliminated || false;
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

    // Sync active spells from server state
    this.lastServerSpells = snapshot.spells || [];
    this.syncSpellVisuals(this.lastServerSpells);
  }

  // --- Round Events ---

  handleRoundStart(data) {
    console.log('[ROUND] Round', data.round, 'starting');
    this.roundNumber = data.round;
    this.localEliminated = false;

    // Clear move target on new round
    this.moveTarget = null;
    if (this.moveTargetMarker) this.moveTargetMarker.setVisible(false);

    // Show round start announcement
    this.showAnnouncement(`Round ${data.round} / ${data.totalRounds}`);
  }

  handleRoundEnd(data) {
    console.log('[ROUND] Round', data.round, 'ended. Winner:', data.winnerName);
    const msg = data.winnerName
      ? `Round ${data.round} — ${data.winnerName} wins!`
      : `Round ${data.round} — Draw!`;
    this.showAnnouncement(msg);
  }

  handleElimination(data) {
    console.log('[ELIM]', data.playerName, 'eliminated by', data.eliminatorName, 'via', data.method);

    // Ring-out celebration — the core sumo moment!
    if (data.method === 'ring') {
      // Find victim position
      const rp = this.remotePlayers.get(data.playerId);
      const isLocal = data.playerId === this.localPlayerId;
      const pos = rp ? { x: rp.x, y: rp.y } :
                  isLocal && this.playerBody ? { x: this.playerBody.position.x, y: this.playerBody.position.y } : null;

      if (pos) {
        // Burst effect at elimination point
        const burst = this.add.circle(pos.x, pos.y, 30, 0xff4444, 0.8);
        burst.setDepth(20);
        this.tweens.add({
          targets: burst,
          scaleX: 4, scaleY: 4, alpha: 0,
          duration: 600,
          onComplete: () => burst.destroy(),
        });

        // Secondary ring burst
        const ring = this.add.circle(pos.x, pos.y, 20, 0, 0);
        ring.setStrokeStyle(3, 0xff6644, 0.9);
        ring.setDepth(20);
        this.tweens.add({
          targets: ring,
          scaleX: 5, scaleY: 5, alpha: 0,
          duration: 800,
          onComplete: () => ring.destroy(),
        });
      }

      // Camera shake for everyone
      this.cameras.main.shake(200, 0.012);

      // Big "RING OUT!" announcement
      this.showAnnouncement('RING OUT!', 1500);

      // Kill feed with special prefix
      const msg = data.eliminatorName
        ? `${data.eliminatorName} knocked out ${data.playerName}!`
        : `${data.playerName} fell out of the ring!`;
      this.addKillFeed(msg);
    } else {
      // Regular spell kill (should be rare now)
      const msg = data.eliminatorName
        ? `${data.eliminatorName} eliminated ${data.playerName}`
        : `${data.playerName} was eliminated`;
      this.addKillFeed(msg);
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
    console.log('[MATCH] Match ended. Scores:', data.scores);
    // Hide other overlays
    if (this.lobbyOverlay) this.lobbyOverlay.hide();
    if (this.shopOverlay && this.shopOverlay.visible) this.shopOverlay.hide();
    // Show match end screen
    if (this.matchEndOverlay) {
      this.matchEndOverlay.show(data.scores || [], this.localPlayerId);
    }
  }

  handleShopOpen(data) {
    console.log('[SHOP] Shop opened', data);
    if (data.progression) this.progression = data.progression;
    if (this.shopOverlay) {
      this.shopOverlay.show(this.progression, data.shopDuration || 20);
    }
  }

  handleShopUpdate(data) {
    console.log('[SHOP] Progression updated', data);
    this.progression = data;
    if (this.shopOverlay && this.shopOverlay.visible) {
      this.shopOverlay.updateProgression(data);
    }
  }

  showAnnouncement(text, duration = 2500) {
    if (this.announcementText) {
      this.announcementText.destroy();
    }
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    this.announcementText = this.add.text(camW / 2, camH / 3, text, {
      fontSize: '28px',
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(1);

    // Fade out
    this.tweens.add({
      targets: this.announcementText,
      alpha: 0,
      delay: duration - 500,
      duration: 500,
      onComplete: () => {
        if (this.announcementText) {
          this.announcementText.destroy();
          this.announcementText = null;
        }
      },
    });
  }

  showDamageNumber(x, y, amount) {
    const text = this.add.text(x, y - 20, `-${Math.ceil(amount)}`, {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(200).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 55,
      alpha: 0,
      duration: 900,
      onComplete: () => text.destroy(),
    });
  }

  addKillFeed(text) {
    const camW = this.cameras.main.width;
    const y = 60 + this.killFeedTexts.length * 18;
    const feedText = this.add.text(camW - 10, y, text, {
      fontSize: '12px',
      fill: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(150).setOrigin(1, 0);

    this.killFeedTexts.push(feedText);

    // Remove oldest if too many
    if (this.killFeedTexts.length > 5) {
      const old = this.killFeedTexts.shift();
      old.destroy();
      // Reposition remaining
      this.killFeedTexts.forEach((t, i) => {
        t.setY(60 + i * 18);
      });
    }

    // Auto-remove after 4s
    const timeoutId = setTimeout(() => {
      // Remove this timeout from tracking
      const tIdx = this.killFeedTimeouts.indexOf(timeoutId);
      if (tIdx !== -1) this.killFeedTimeouts.splice(tIdx, 1);

      const idx = this.killFeedTexts.indexOf(feedText);
      if (idx !== -1) {
        this.killFeedTexts.splice(idx, 1);
        feedText.destroy();
        this.killFeedTexts.forEach((t, i) => {
          t.setY(60 + i * 18);
        });
      }
    }, 4000);
    this.killFeedTimeouts.push(timeoutId);
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

    // During knockback: near-fully trust server velocity (0.8 blend vs normal 0.2)
    const vel = this.playerBody.velocity;
    const velBlend = inKnockback ? 0.8 : 0.2;
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
    const displayName = isDummy ? 'Dummy' : (playerName || playerId.slice(-4));
    const nameLabel = this.add.text(x, y - 30, displayName, {
      fontSize: '10px',
      fill: isDummy ? '#ff8866' : '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5).setDepth(11);

    // HP bar for remote player
    const hpBg = this.add.rectangle(x, y - 22, 36, 4, 0x333333).setOrigin(0.5).setDepth(11);
    const hpFill = this.add.rectangle(x - 18, y - 22, 36, 4, 0x44dd44).setOrigin(0, 0.5).setDepth(11);

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
    });
  }

  removeRemotePlayer(playerId) {
    const rp = this.remotePlayers.get(playerId);
    if (rp) {
      rp.sprite.destroy();
      rp.shadow.destroy();
      rp.nameLabel.destroy();
      rp.hpBg.destroy();
      rp.hpFill.destroy();
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
      this.showDamageNumber(rp.targetX, rp.targetY, prevHp - rp.hp);
    }

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

      // Update remote HP bar
      rp.hpBg.setPosition(rp.x, rp.y - 22);
      const hpRatio = Math.max(0, rp.hp / rp.maxHp);
      rp.hpFill.setPosition(rp.x - 18, rp.y - 22);
      rp.hpFill.width = 36 * hpRatio;
      if (hpRatio > 0.75) {
        rp.hpFill.fillColor = 0x44bbff;
      } else if (hpRatio > 0.5) {
        rp.hpFill.fillColor = 0xdddd44;
      } else if (hpRatio > 0.25) {
        rp.hpFill.fillColor = 0xff8833;
      } else {
        rp.hpFill.fillColor = 0xff3333;
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

    this.moveTargetMarker = this.add.circle(0, 0, 4, 0x44aadd, 0.6);
    this.moveTargetMarker.setStrokeStyle(1, 0x88ccff, 0.8);
    this.moveTargetMarker.setVisible(false);
    this.moveTargetMarker.setDepth(5);
  }

  // --- Spell System ---

  handleSpellCast(data) {
    // Deduplicate by spell ID
    if (this.spellVisuals.has(data.id)) return;
    if (this.pendingSpellCasts.some(p => p.id === data.id)) return;
    this.pendingSpellCasts.push(data);
  }

  createSpellVisual(spell) {
    const def = SPELLS[spell.type];
    if (!def) return;

    // Use effective spell type from server (can differ from def.type due to upgrades)
    const effectiveType = spell.spellType || def.type;

    const visual = {
      type: effectiveType,
      lifetime: spell.lifetime || 2000,
      elapsed: 0,
      ownerId: spell.ownerId,
    };

    switch (effectiveType) {
      case SPELL_TYPES.PROJECTILE: {
        // Animated FX sprite projectile (fireball, frost bolt, etc.)
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-flam';
        const animKey = fx.animKey || 'fx-flam-play';
        const scale = fx.scale || 1.5;
        const color = fx.color || 0xff4400;
        const glowColor = fx.glowColor || color;

        // Glow circle behind the projectile
        const glow = this.add.circle(spell.x, spell.y, (spell.radius || 8) + 10, glowColor, 0.25);
        glow.setDepth(15);

        // Animated FX sprite
        const sprite = this.add.sprite(spell.x, spell.y, spriteKey);
        sprite.setScale(scale);
        sprite.setDepth(16);
        sprite.play({ key: animKey, repeat: -1 }); // Loop for projectile lifetime

        // Rotate sprite in direction of travel
        const angle = Math.atan2(spell.vy || 0, spell.vx || 0);
        sprite.setRotation(angle);

        visual.sprite = sprite;
        visual.glow = glow;
        // Scale velocity: server speed is in units/tick (50ms), client runs at ~60fps (~16.7ms)
        // Factor: 16.7 / 50 ≈ 0.33, but server sends raw vx/vy per tick
        visual.vx = (spell.vx || 0) * 0.05;
        visual.vy = (spell.vy || 0) * 0.05;
        break;
      }

      case SPELL_TYPES.BLINK: {
        // Teleport: poof at origin, trail, poof at destination
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-spirit';
        const animKey = fx.animKey || 'fx-spirit-play';
        const scale = fx.scale || 2;
        const color = fx.color || 0x44ddff;

        // Departure poof
        const departure = this.add.sprite(spell.x, spell.y, spriteKey);
        departure.setScale(scale);
        departure.setDepth(16);
        departure.setAlpha(0.9);
        departure.play({ key: animKey, repeat: 0 });

        // Arrival poof
        const destX = spell.targetX || spell.x;
        const destY = spell.targetY || spell.y;
        const arrival = this.add.sprite(destX, destY, spriteKey);
        arrival.setScale(scale);
        arrival.setDepth(16);
        arrival.setAlpha(0.9);
        arrival.play({ key: animKey, repeat: 0 });

        // Trail line between origin and destination
        const trail = this.add.graphics();
        trail.setDepth(14);
        trail.lineStyle(3, color, 0.6);
        trail.beginPath();
        trail.moveTo(spell.x, spell.y);
        trail.lineTo(destX, destY);
        trail.strokePath();

        visual.sprite = departure;
        visual.arrival = arrival;
        visual.trail = trail;
        visual.lifetime = spell.lifetime || 300;
        break;
      }

      case SPELL_TYPES.DASH: {
        // Dash: orange burst charge — physical, heavy feel (distinct from ethereal blink)
        const dashColor = 0xffaa33;    // Orange/gold — physical charge
        const dashSprite = 'fx-boost';
        const dashAnim = 'fx-boost-play';

        const destX = spell.targetX || spell.x;
        const destY = spell.targetY || spell.y;

        // Wide blurred trail (background glow)
        const trail = this.add.graphics();
        trail.setDepth(14);
        trail.lineStyle(14, dashColor, 0.15);
        trail.beginPath();
        trail.moveTo(spell.x, spell.y);
        trail.lineTo(destX, destY);
        trail.strokePath();
        // Thick bright trail (foreground)
        trail.lineStyle(6, dashColor, 0.7);
        trail.beginPath();
        trail.moveTo(spell.x, spell.y);
        trail.lineTo(destX, destY);
        trail.strokePath();

        // Arrival burst effect (orange boost)
        const arrival = this.add.sprite(destX, destY, dashSprite);
        arrival.setScale(2.5);
        arrival.setDepth(16);
        arrival.setAlpha(0.95);
        arrival.setTint(dashColor);
        arrival.play({ key: dashAnim, repeat: 0 });

        visual.sprite = arrival;
        visual.trail = trail;
        visual.lifetime = spell.lifetime || 400;
        break;
      }

      case SPELL_TYPES.HOOK: {
        // Hook: rock projectile with chain line back to caster
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-rock';
        const animKey = fx.animKey || 'fx-rock-play';
        const scale = fx.scale || 1.5;
        const chainColor = fx.chainColor || 0xaaaaaa;

        // Animated rock projectile
        const sprite = this.add.sprite(spell.x, spell.y, spriteKey);
        sprite.setScale(scale);
        sprite.setDepth(16);
        sprite.play({ key: animKey, repeat: -1 });

        // Rotate in direction of travel
        const hookAngle = Math.atan2(spell.vy || 0, spell.vx || 0);
        sprite.setRotation(hookAngle);

        // Chain line from caster to projectile
        const chain = this.add.graphics();
        chain.setDepth(14);

        // Store origin for chain drawing
        visual.originX = spell.x;
        visual.originY = spell.y;
        visual.chainColor = chainColor;
        visual.sprite = sprite;
        visual.chain = chain;
        visual.hooked = false;
        visual.vx = (spell.vx || 0) * 0.05;
        visual.vy = (spell.vy || 0) * 0.05;
        break;
      }

      case SPELL_TYPES.ZONE: {
        // Zone: colored circle + animated FX sprite in center
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-ice';
        const animKey = fx.animKey || 'fx-ice-play';
        const color = fx.color || 0x44ddff;
        const zoneRadius = spell.radius || 60;

        // Zone circle
        const zone = this.add.circle(spell.x, spell.y, zoneRadius, color, 0.2);
        zone.setDepth(5);
        zone.setStrokeStyle(2, color, 0.6);

        // FX sprite in center
        const sprite = this.add.sprite(spell.x, spell.y, spriteKey);
        sprite.setScale((zoneRadius / 16) * 0.8); // Scale to fill zone area
        sprite.setDepth(6);
        sprite.setAlpha(0.7);
        sprite.play({ key: animKey, repeat: -1 });

        visual.zone = zone;
        visual.sprite = sprite;
        visual.baseAlpha = 0.2;
        break;
      }

      case SPELL_TYPES.WALL: {
        // Rock wall — keep simple rectangle approach
        const wall = this.add.rectangle(
          spell.x, spell.y,
          spell.width || 80,
          spell.height || 20,
          0x886644, 0.9
        );
        wall.setDepth(10);
        wall.setRotation(spell.angle || 0);
        wall.setStrokeStyle(2, 0xaa8866, 1);
        visual.sprite = wall;
        break;
      }

      case SPELL_TYPES.INSTANT: {
        // Shockwave ring that expands briefly
        const ring = this.add.circle(spell.x, spell.y, spell.radius || 120, 0xffdd44, 0.3);
        ring.setDepth(5);
        ring.setStrokeStyle(3, 0xffee66, 0.8);
        ring.isFilled = false;
        visual.sprite = ring;
        visual.lifetime = spell.lifetime || 500;
        break;
      }

      default: {
        // Fallback: simple colored circle
        const color = (def.fx && def.fx.color) || 0xff00ff;
        const marker = this.add.circle(spell.x, spell.y, spell.radius || 20, color, 0.6);
        marker.setDepth(15);
        visual.sprite = marker;
        break;
      }
    }

    this.spellVisuals.set(spell.id, visual);
  }

  syncSpellVisuals(serverSpells) {
    const activeIds = new Set(serverSpells.map(s => s.id));

    // Remove visuals for spells no longer on server
    for (const [id, visual] of this.spellVisuals) {
      if (!activeIds.has(id) && visual.elapsed > 200) {
        // Deactivate grappling if the removed spell was providing grappling state
        if (visual.pullSelf && visual.ownerId === this.localPlayerId && this.grapplingActive) {
          this.grapplingActive = false;
          this.moveTarget = null; // kill stale movement command
        }
        this.destroySpellVisual(visual);
        this.spellVisuals.delete(id);
      }
    }

    // Update positions from server for moving spell types
    for (const spell of serverSpells) {
      const visual = this.spellVisuals.get(spell.id);
      if (!visual || !visual.sprite || visual.sprite.destroyed) continue;

      if (visual.type === SPELL_TYPES.PROJECTILE) {
        // Lerp animated sprite + glow to server position
        const lerpFactor = 0.3;
        visual.sprite.x += (spell.x - visual.sprite.x) * lerpFactor;
        visual.sprite.y += (spell.y - visual.sprite.y) * lerpFactor;
        if (visual.glow && !visual.glow.destroyed) {
          visual.glow.x = visual.sprite.x;
          visual.glow.y = visual.sprite.y;
        }
      } else if (visual.type === SPELL_TYPES.HOOK) {
        // Update chain origin to caster's CURRENT position (not cast position)
        if (spell.ownerId === this.localPlayerId && this.playerBody) {
          visual.originX = this.playerBody.position.x;
          visual.originY = this.playerBody.position.y;
        } else {
          const rp = this.remotePlayers.get(spell.ownerId);
          if (rp) {
            visual.originX = rp.x;
            visual.originY = rp.y;
          }
        }

        if (spell.hooked && !visual.hooked) {
          visual.hooked = true;
          visual.vx = 0;
          visual.vy = 0;
        }

        // Store metadata on visual for 60fps chain rendering in updateSpellVisuals
        visual.pullSelf = spell.pullSelf;
        visual.serverAnchorX = spell.anchorX || 0;
        visual.serverAnchorY = spell.anchorY || 0;
        visual.serverReleased = spell.released;

        // --- Grappling hook: detect activation for local player ---
        if (spell.pullSelf && spell.hooked && spell.pullActive && !spell.released && spell.ownerId === this.localPlayerId) {
          this.grapplingActive = true;
        }
        // Deactivate grappling when released or no longer pulling
        if (spell.pullSelf && spell.ownerId === this.localPlayerId && (spell.released || !spell.hooked || !spell.pullActive)) {
          if (this.grapplingActive) {
            this.grapplingActive = false;
            this.moveTarget = null; // kill stale movement command
          }
        }

        // Lerp hook position to server
        const lerpFactor = 0.3;
        visual.sprite.x += (spell.x - visual.sprite.x) * lerpFactor;
        visual.sprite.y += (spell.y - visual.sprite.y) * lerpFactor;

        // For Branch B grapple: chain goes from anchor to caster (not caster to hook)
        // For Branch A swing: chain goes from caster to hooked enemy
        let chainFromX, chainFromY, chainToX, chainToY;
        if (spell.pullSelf && spell.hooked) {
          // Grapple: chain from anchor point to caster
          chainFromX = spell.anchorX || visual.sprite.x;
          chainFromY = spell.anchorY || visual.sprite.y;
          chainToX = visual.originX;
          chainToY = visual.originY;
        } else {
          // Normal / Branch A: chain from caster to hook/enemy
          chainFromX = visual.originX;
          chainFromY = visual.originY;
          chainToX = visual.sprite.x;
          chainToY = visual.sprite.y;
        }

        // Hide hook sprite during swing (the swinging player IS the visual)
        if (spell.hooked && !spell.released) {
          visual.sprite.setVisible(false);
        }

        if (visual.chain && !visual.chain.destroyed) {
          visual.chain.clear();
          visual.chain.lineStyle(3, visual.chainColor || 0xaaaaaa, 0.7);
          visual.chain.beginPath();
          visual.chain.moveTo(chainFromX, chainFromY);
          visual.chain.lineTo(chainToX, chainToY);
          visual.chain.strokePath();
        }
      }
      // BLINK, DASH, ZONE, WALL, INSTANT: no position sync needed (stationary effects)
    }
  }

  destroySpellVisual(visual) {
    if (visual.sprite && !visual.sprite.destroyed) visual.sprite.destroy();
    if (visual.glow && !visual.glow.destroyed) visual.glow.destroy();
    if (visual.chain && !visual.chain.destroyed) visual.chain.destroy();
    if (visual.trail && !visual.trail.destroyed) visual.trail.destroy();
    if (visual.arrival && !visual.arrival.destroyed) visual.arrival.destroy();
    if (visual.zone && !visual.zone.destroyed) visual.zone.destroy();
    // Legacy cleanup
    if (visual.circle && !visual.circle.destroyed) visual.circle.destroy();
    if (visual.rect && !visual.rect.destroyed) visual.rect.destroy();
    if (visual.core && !visual.core.destroyed) visual.core.destroy();
  }

  castSpell(slotKey) {
    const spellId = SPELL_KEYS[slotKey];
    if (!spellId) return;

    // Check client-side cooldown (server also validates)
    if (this.cooldowns[spellId] && this.cooldowns[spellId] > 0) return;

    // Get mouse position in world coords for targeting
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    this.network.sendSpellCast(spellId, worldPoint.x, worldPoint.y);
  }

  // --- Arena ---

  createArena() {
    // Try to load hand-designed map from editor, fall back to procedural
    const mapData = this.cache.json.get('arena-map');
    if (mapData && mapData.floor && mapData.floor.tiles && mapData.floor.tiles.length > 0) {
      console.log(`[Arena] Loading hand-designed map (${mapData.floor.tiles.length} tiles, ${(mapData.decorations || []).length} decorations)`);
      this.createArenaFromMap(mapData);
    } else {
      console.log('[Arena] No map data found, using procedural generation');
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

    // Step 6: Dynamic ring graphics
    this.ringGraphics = this.add.graphics();
    this.ringGraphics.setDepth(1);
    this.outerRingGraphics = this.add.graphics();
    this.outerRingGraphics.setDepth(1);
    this.lastDrawnRingRadius = -1;
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

    // Step 4: Dynamic ring graphics
    this.ringGraphics = this.add.graphics();
    this.ringGraphics.setDepth(1);
    this.outerRingGraphics = this.add.graphics();
    this.outerRingGraphics.setDepth(1);
    this.lastDrawnRingRadius = -1;
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

  updateRingGraphics() {
    const r = Math.round(this.ringRadius);
    // Redraw every frame for pulse animation
    const g = this.ringGraphics;
    g.clear();

    // Pulse factor for animated danger feel
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now * 0.004);

    // Inner glow (safe side hint)
    g.lineStyle(2, 0xff6666, 0.1 + pulse * 0.05);
    g.strokeCircle(0, 0, r - 8);

    // Main ring border — thick and bright
    g.lineStyle(3, 0xff4444, 0.6 + pulse * 0.3);
    g.strokeCircle(0, 0, r);

    // Danger band — graduated rings outside boundary
    const bandSteps = 5;
    for (let i = 1; i <= bandSteps; i++) {
      const t = i / bandSteps;
      const alpha = (0.35 - t * 0.3) * (0.7 + pulse * 0.3);
      g.lineStyle(4, 0xff2222, Math.max(0, alpha));
      g.strokeCircle(0, 0, r + i * 8);
    }

    // Outer faint rings — only redraw when radius changes (expensive: ~9 strokeCircle calls)
    if (r !== this.lastDrawnRingRadius && this.outerRingGraphics) {
      this.outerRingGraphics.clear();
      this.outerRingGraphics.lineStyle(1, 0xcc4444, 0.06);
      for (let dr = r + 60; dr < ARENA.FLOOR_SIZE / 2; dr += 60) {
        this.outerRingGraphics.strokeCircle(0, 0, dr);
      }
    }

    // Screen-edge vignette when player is near ring edge
    if (this.playerBody) {
      const px = this.playerBody.position.x;
      const py = this.playerBody.position.y;
      const distFromCenter = Math.sqrt(px * px + py * py);
      const distToEdge = r - distFromCenter;

      if (!this.edgeVignette) {
        this.edgeVignette = this.add.rectangle(
          this.cameras.main.width / 2, this.cameras.main.height / 2,
          this.cameras.main.width, this.cameras.main.height,
          0xff0000, 0
        ).setScrollFactor(0).setDepth(99).setOrigin(0.5);
      }

      if (distToEdge < 80 && distToEdge > -50) {
        const danger = 1 - Math.max(0, distToEdge) / 80;
        this.edgeVignette.setAlpha(danger * 0.15 * (0.7 + pulse * 0.3));
      } else if (distToEdge <= -50) {
        // Deep outside — strong red flash
        this.edgeVignette.setAlpha(0.2 + pulse * 0.1);
      } else {
        this.edgeVignette.setAlpha(0);
      }
    }

    this.lastDrawnRingRadius = r;
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
    // Block movement during knockback stagger — player is flying
    if (performance.now() < this.knockbackUntil) return;
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

  // --- HUD ---

  createHUD() {
    this.pingText = this.add.text(10, 10, 'Ping: --', {
      fontSize: '14px',
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100);

    this.playerCountText = this.add.text(10, 28, 'Players: 0', {
      fontSize: '14px',
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100);

    // Local player HP bar (top center)
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    this.hpBarBg = this.add.rectangle(camW / 2, 20, 204, 14, 0x333333)
      .setScrollFactor(0).setDepth(100).setOrigin(0.5);
    this.hpBarFill = this.add.rectangle(camW / 2 - 100, 20, 200, 10, 0x44dd44)
      .setScrollFactor(0).setDepth(101).setOrigin(0, 0.5);
    this.hpText = this.add.text(camW / 2, 20, '100/100', {
      fontSize: '10px',
      fill: '#ffffff',
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);

    // Round info (top-right)
    this.roundText = this.add.text(camW - 10, 10, 'Round 0/20', {
      fontSize: '14px',
      fill: '#ffdd44',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.timerText = this.add.text(camW - 10, 28, '60s', {
      fontSize: '14px',
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.phaseText = this.add.text(camW / 2, 40, '', {
      fontSize: '12px',
      fill: '#aaaaaa',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    // Countdown overlay (large center text during countdown)
    this.countdownText = this.add.text(camW / 2, camH / 2 - 40, '', {
      fontSize: '64px',
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setScrollFactor(0).setDepth(250).setOrigin(0.5).setVisible(false);

    // Sound toggle (top-right, below timer)
    this.createSoundToggle(camW);
  }

  createSoundToggle(camW) {
    const isMuted = this.sound.mute;
    const btnSize = 28;
    const x = camW - 24;
    const y = 52;

    const bg = this.add.rectangle(x, y, btnSize, btnSize, 0x1a1428, 0.8)
      .setScrollFactor(0).setDepth(100).setStrokeStyle(1, 0x3d2e1e);

    const icon = this.add.text(x, y, isMuted ? '🔇' : '🔊', {
      fontSize: '14px',
    }).setScrollFactor(0).setDepth(101).setOrigin(0.5);

    const hitArea = this.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0)
      .setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => bg.setStrokeStyle(1, 0xffdd44));
    hitArea.on('pointerout', () => bg.setStrokeStyle(1, 0x3d2e1e));
    hitArea.on('pointerdown', () => {
      this.sound.mute = !this.sound.mute;
      localStorage.setItem('soundMuted', this.sound.mute);
      icon.setText(this.sound.mute ? '🔇' : '🔊');
    });
  }

  createSpellHUD() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const slotSize = 48;
    const slotGap = 8;
    const totalWidth = 4 * slotSize + 3 * slotGap;
    const startX = (camW - totalWidth) / 2;
    const slotY = camH - 60;

    const slots = ['Q', 'W', 'E', 'R'];

    for (let i = 0; i < slots.length; i++) {
      const key = slots[i];
      const spellId = SPELL_KEYS[key];
      const def = SPELLS[spellId];
      const x = startX + i * (slotSize + slotGap) + slotSize / 2;

      // Slot background
      const bg = this.add.rectangle(x, slotY, slotSize, slotSize, 0x222233, 0.8)
        .setScrollFactor(0).setDepth(100).setStrokeStyle(2, 0x445566);

      // Spell icon
      let icon = null;
      if (def && def.icon) {
        icon = this.add.image(x, slotY, def.icon)
          .setScrollFactor(0).setDepth(101);
        // Scale icon to fit slot
        const iconScale = (slotSize - 8) / Math.max(icon.width, icon.height);
        icon.setScale(iconScale);
      }

      // Cooldown overlay (semi-transparent dark rect that shrinks)
      const cdOverlay = this.add.rectangle(x, slotY, slotSize - 4, slotSize - 4, 0x000000, 0.6)
        .setScrollFactor(0).setDepth(102).setVisible(false);

      // Cooldown text
      const cdText = this.add.text(x, slotY, '', {
        fontSize: '14px',
        fill: '#ffffff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(103).setOrigin(0.5).setVisible(false);

      // Key label
      this.add.text(x - slotSize / 2 + 4, slotY - slotSize / 2 + 2, key, {
        fontSize: '10px',
        fill: '#aaccff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(103);

      // Lock overlay (for locked spell slots)
      const lockOverlay = this.add.rectangle(x, slotY, slotSize - 2, slotSize - 2, 0x111111, 0.8)
        .setScrollFactor(0).setDepth(104).setVisible(false);
      const lockText = this.add.text(x, slotY, 'X', {
        fontSize: '20px',
        fill: '#555555',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(105).setOrigin(0.5).setVisible(false);

      // Charge counter (bottom-right corner, for multi-charge spells like Double Blink)
      const chargeText = this.add.text(x + slotSize / 2 - 4, slotY + slotSize / 2 - 4, '', {
        fontSize: '10px',
        fill: '#ffdd44',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      }).setScrollFactor(0).setDepth(106).setOrigin(1, 1).setVisible(false);

      this.spellSlots.push({
        key,
        spellId,
        bg,
        icon,
        cdOverlay,
        cdText,
        lockOverlay,
        lockText,
        chargeText,
      });
    }

    // SP counter below spell HUD
    this.spText = this.add.text(camW / 2, slotY + slotSize / 2 + 8, 'SP: 0', {
      fontSize: '12px',
      fill: '#44ddff',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    // Sandbox hint
    if (this.gameMode === 'sandbox') {
      this.add.text(camW / 2, slotY + slotSize / 2 + 24, 'Press B to open Shop', {
        fontSize: '11px',
        fill: '#666688',
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);
    }
  }

  // --- Update Loop ---

  update(time, delta) {
    if (this !== window.__gameScene && window.__gameScene) {
      console.error('[BUG] update() running on WRONG scene! this.scene.key:', this.scene?.key, 'expected:', window.__gameScene?.scene?.key);
    }
    this.processPendingSpells();
    this.updateLocalMovement(delta);
    this.syncLocalVisuals();
    this.interpolateRemotePlayers();
    this.updateSpellInput();
    this.updateSpellVisuals(delta);
    this.updateRingGraphics();
    this.updateCamera();
    this.updateHUD();
    this.updateRoundHUD();
    this.updateSpellHUD();
    this.sendInputToServer();
  }

  processPendingSpells() {
    while (this.pendingSpellCasts.length > 0) {
      const spell = this.pendingSpellCasts.shift();
      this.createSpellVisual(spell);
    }
  }

  updateLocalMovement(delta) {
    // Block input during pause or match end
    if (this.pauseMenu && this.pauseMenu.visible) return;
    if (this.matchEndOverlay && this.matchEndOverlay.visible) return;
    if (!this.playerBody || !this.moveTarget) return;

    // During grappling or knockback: no movement forces
    if (this.grapplingActive) return;
    if (performance.now() < this.knockbackUntil) return;

    const pos = this.playerBody.position;
    const dx = this.moveTarget.x - pos.x;
    const dy = this.moveTarget.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

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

    // Cap max velocity (never kill momentum — let friction handle decel)
    const vel = this.playerBody.velocity;
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      MatterBody.setVelocity(this.playerBody, {
        x: vel.x * scale,
        y: vel.y * scale,
      });
    }
  }


  sendInputToServer() {
    if (!this.network || !this.network.connected || !this.moveTarget) return;
    // Don't send input during grappling or knockback — server ignores it anyway
    if (this.grapplingActive) return;
    if (performance.now() < this.knockbackUntil) return;
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

    for (const key of ['Q', 'W', 'E', 'R']) {
      if (Phaser.Input.Keyboard.JustDown(this.spellKeys[key])) {
        // Check if spell slot is locked
        if (this.progression && this.progression.slots[key] === 'locked') continue;
        // If mid-grapple and pressing R, this is a release, not a new cast
        if (key === 'R' && this.grapplingActive) {
          this.network.sendHookRelease();
          continue;
        }
        this.castSpell(key);
      }
    }
  }

  updateSpellVisuals(delta) {
    for (const [id, visual] of this.spellVisuals) {
      visual.elapsed += delta;

      // Per-type client-side movement and effects
      if (visual.type === SPELL_TYPES.PROJECTILE && visual.sprite && !visual.sprite.destroyed) {
        // Move animated sprite + glow between server ticks
        visual.sprite.x += (visual.vx || 0);
        visual.sprite.y += (visual.vy || 0);
        if (visual.glow && !visual.glow.destroyed) {
          visual.glow.x = visual.sprite.x;
          visual.glow.y = visual.sprite.y;
        }
      } else if (visual.type === SPELL_TYPES.HOOK && visual.sprite && !visual.sprite.destroyed) {
        if (!visual.hooked) {
          // Move hook projectile between server ticks
          visual.sprite.x += (visual.vx || 0);
          visual.sprite.y += (visual.vy || 0);
        }

        // Update chain origin from current player position (for smooth 60fps tracking)
        if (visual.ownerId === this.localPlayerId && this.playerBody) {
          visual.originX = this.playerBody.position.x;
          visual.originY = this.playerBody.position.y;
        } else {
          const rp = this.remotePlayers.get(visual.ownerId);
          if (rp) {
            visual.originX = rp.x;
            visual.originY = rp.y;
          }
        }

        // Redraw chain every frame
        if (visual.chain && !visual.chain.destroyed) {
          // Hide chain during flight phase (released + pullSelf)
          if (visual.pullSelf && visual.serverReleased) {
            visual.chain.clear();
          } else {
            let chainFromX, chainFromY, chainToX, chainToY;
            let lineWidth = 3;
            let chainColor = visual.chainColor || 0xaaaaaa;

            if (visual.pullSelf && visual.hooked) {
              // Grappling hook: chain from anchor to caster
              chainFromX = visual.serverAnchorX || visual.sprite.x;
              chainFromY = visual.serverAnchorY || visual.sprite.y;
              chainToX = visual.originX;
              chainToY = visual.originY;
              // Thicker chain during swing, color shifts with speed
              lineWidth = 4;
              if (visual.ownerId === this.localPlayerId && this.playerBody) {
                const vel = this.playerBody.velocity;
                const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                const normalMax = PLAYER.SPEED * 0.05;
                if (speed > normalMax * 3) chainColor = 0xff6600;      // orange at high speed
                else if (speed > normalMax * 1.5) chainColor = 0xddaa44; // yellow-ish
              }
            } else {
              // Normal / Branch A: chain from caster to hook/enemy
              chainFromX = visual.originX;
              chainFromY = visual.originY;
              chainToX = visual.sprite.x;
              chainToY = visual.sprite.y;
            }
            visual.chain.clear();
            visual.chain.lineStyle(lineWidth, chainColor, 0.7);
            visual.chain.beginPath();
            visual.chain.moveTo(chainFromX, chainFromY);
            visual.chain.lineTo(chainToX, chainToY);
            visual.chain.strokePath();
          }
        }
      } else if (visual.type === SPELL_TYPES.BLINK || visual.type === SPELL_TYPES.DASH) {
        // Fade out over lifetime
        const alpha = Math.max(0, 1 - visual.elapsed / visual.lifetime);
        if (visual.sprite && !visual.sprite.destroyed) visual.sprite.setAlpha(alpha);
        if (visual.arrival && !visual.arrival.destroyed) visual.arrival.setAlpha(alpha);
        if (visual.trail && !visual.trail.destroyed) visual.trail.setAlpha(alpha);
      } else if (visual.type === SPELL_TYPES.ZONE) {
        // Pulse the zone circle alpha
        if (visual.zone && !visual.zone.destroyed) {
          const pulse = 0.15 + 0.1 * Math.sin(visual.elapsed * 0.004);
          visual.zone.setAlpha(pulse);
        }
      }

      // Cleanup when lifetime expired (with grace period for server sync)
      if (visual.elapsed > visual.lifetime + 500) {
        this.destroySpellVisual(visual);
        this.spellVisuals.delete(id);
      }
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

    // Speed trail for knockback flights
    if (this.playerBody) {
      const trailVel = this.playerBody.velocity;
      const trailSpeed = Math.sqrt(trailVel.x * trailVel.x + trailVel.y * trailVel.y);
      const maxSpeed = PLAYER.SPEED * 0.05;

      if (trailSpeed > maxSpeed * 1.5) {
        // Player is flying from knockback — add trail point
        this.speedTrail.push({
          x: this.playerBody.position.x,
          y: this.playerBody.position.y,
          alpha: 0.6,
        });
        if (this.speedTrail.length > 8) this.speedTrail.shift();
      }

      // Draw and fade trail
      if (!this.trailGraphics) {
        this.trailGraphics = this.add.graphics().setDepth(5);
      }
      this.trailGraphics.clear();
      // Fade and remove expired trail points (backward for safe splice)
      for (let i = this.speedTrail.length - 1; i >= 0; i--) {
        this.speedTrail[i].alpha -= 0.06;
        if (this.speedTrail[i].alpha <= 0) {
          this.speedTrail.splice(i, 1);
        }
      }
      // Draw remaining trail points (forward for correct visual ordering)
      for (let i = 0; i < this.speedTrail.length; i++) {
        const t = this.speedTrail[i];
        const size = 6 + (i / this.speedTrail.length) * 8;
        this.trailGraphics.fillStyle(0xffffff, t.alpha * 0.5);
        this.trailGraphics.fillCircle(t.x, t.y, size);
      }
    }
  }

  updateCamera() {
    if (!this.playerBody) return;
    const pos = this.playerBody.position;
    const cam = this.cameras.main;
    const lerpFactor = 0.08;
    cam.scrollX += (pos.x - cam.width / 2 - cam.scrollX) * lerpFactor;
    cam.scrollY += (pos.y - cam.height / 2 - cam.scrollY) * lerpFactor;
  }

  updateHUD() {
    if (this.network) {
      this.pingText.setText(`Ping: ${this.network.ping}ms`);
      const totalPlayers = 1 + this.remotePlayers.size;
      this.playerCountText.setText(`Players: ${totalPlayers}`);
    }

    // Update local HP bar
    if (this.hpBarFill) {
      const hpRatio = Math.max(0, this.localHp / this.localMaxHp);
      this.hpBarFill.width = 200 * hpRatio;
      // Colors communicate knockback vulnerability (Smash Bros style)
      if (hpRatio > 0.75) {
        this.hpBarFill.fillColor = 0x44bbff;  // Blue — safe, normal knockback
      } else if (hpRatio > 0.5) {
        this.hpBarFill.fillColor = 0xdddd44;  // Yellow — moderate vulnerability
      } else if (hpRatio > 0.25) {
        this.hpBarFill.fillColor = 0xff8833;  // Orange — high vulnerability
      } else {
        this.hpBarFill.fillColor = 0xff3333;  // Red — extreme, one hit = ring-out
      }
      // Pulse effect at high vulnerability
      if (hpRatio <= 0.5 && hpRatio > 0) {
        const pulse = 0.7 + 0.3 * Math.sin(this.time.now * (hpRatio <= 0.25 ? 0.012 : 0.006));
        this.hpBarFill.setAlpha(pulse);
      } else {
        this.hpBarFill.setAlpha(1);
      }
      const vulnPercent = Math.round((1 - hpRatio) * 100);
      this.hpText.setText(`${Math.ceil(this.localHp)} HP  (${vulnPercent}% vuln)`);
    }
  }

  updateRoundHUD() {
    // Round counter
    if (this.roundText) {
      if (this.gameMode === 'sandbox') {
        this.roundText.setText('SANDBOX');
      } else {
        this.roundText.setText(`Round ${this.roundNumber}/${this.totalRounds}`);
      }
    }

    // Timer
    if (this.timerText) {
      if (this.phase === 'playing') {
        const seconds = Math.ceil(this.timeRemaining);
        this.timerText.setText(`${seconds}s`);
        this.timerText.setFill(seconds <= 10 ? '#ff4444' : '#88ccff');
      } else if (this.phase === 'shop') {
        const seconds = Math.ceil(this.shopTimeRemaining);
        this.timerText.setText(`Shop: ${seconds}s`);
        this.timerText.setFill('#ffdd44');
      } else {
        this.timerText.setText('');
      }
    }

    // Shop overlay management
    if (this.shopOverlay) {
      if (this.phase === 'shop') {
        if (!this.shopOverlay.visible && this.progression) {
          this.shopOverlay.show(this.progression, this.shopTimeRemaining);
        } else if (this.shopOverlay.visible) {
          this.shopOverlay.updateTimer(this.shopTimeRemaining);
        }
      } else if (this.shopOverlay.visible && this.gameMode !== 'sandbox') {
        // In sandbox mode, don't auto-hide shop (player controls it with B key)
        this.shopOverlay.hide();
      }
    }

    // Lobby overlay management
    if (this.lobbyOverlay) {
      if (this.phase === 'waiting') {
        if (!this.lobbyOverlay.visible) {
          this.lobbyOverlay.show();
        }
        // Build player list for lobby from remotePlayers + local
        const playerList = [];
        if (this.localPlayerId) {
          playerList.push({
            id: this.localPlayerId,
            name: this.playerName,
            characterId: this.characterId,
          });
        }
        for (const [id, rp] of this.remotePlayers) {
          playerList.push({
            id,
            name: rp.name || id.slice(-4),
            characterId: rp.characterId,
          });
        }
        this.lobbyOverlay.updatePlayers(playerList);
      } else if (this.lobbyOverlay.visible) {
        this.lobbyOverlay.hide();
      }
    }

    // Phase indicator
    if (this.phaseText) {
      const phaseLabels = {
        waiting: 'Waiting for players...',
        countdown: '',
        playing: '',
        roundEnd: 'Round Over',
        shop: 'Shop Phase',
        matchEnd: 'Match Complete',
      };
      this.phaseText.setText(phaseLabels[this.phase] || '');
    }

    // Countdown overlay
    if (this.countdownText) {
      if (this.phase === 'countdown' && this.countdownRemaining > 0) {
        const num = Math.ceil(this.countdownRemaining);
        this.countdownText.setText(num.toString());
        this.countdownText.setVisible(true);
        // Pulse effect via scale
        const frac = this.countdownRemaining % 1;
        const scale = 1 + frac * 0.3;
        this.countdownText.setScale(scale);
        this.countdownText.setAlpha(0.5 + frac * 0.5);
      } else {
        this.countdownText.setVisible(false);
      }
    }

    // Dim the player sprite if eliminated
    if (this.localEliminated && this.playerSprite && this.playerSprite.alpha > 0.3) {
      this.playerSprite.setAlpha(0.3);
    }
  }

  updateSpellHUD() {
    for (const slot of this.spellSlots) {
      // Check if slot is locked
      const isLocked = this.progression && this.progression.slots[slot.key] === 'locked';

      if (slot.lockOverlay && slot.lockText) {
        slot.lockOverlay.setVisible(isLocked);
        slot.lockText.setVisible(isLocked);
      }

      if (isLocked) {
        // Hide cooldown stuff for locked slots
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
        if (slot.icon) slot.icon.setAlpha(0.2);
        continue;
      }

      if (slot.icon) slot.icon.setAlpha(1);

      const cd = this.cooldowns[slot.spellId];
      if (cd && cd > 0) {
        slot.cdOverlay.setVisible(true);
        slot.cdText.setVisible(true);
        slot.cdText.setText((cd / 1000).toFixed(1));
      } else {
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
      }

      // Show charge counter for multi-charge spells
      const charge = this.charges[slot.spellId];
      if (slot.chargeText) {
        if (charge && charge.max > 1) {
          slot.chargeText.setVisible(true);
          slot.chargeText.setText(`${charge.remaining}/${charge.max}`);
          // Color: gold if charges available, red if depleted
          slot.chargeText.setColor(charge.remaining > 0 ? '#ffdd44' : '#ff4444');
        } else {
          slot.chargeText.setVisible(false);
        }
      }
    }

    // Update SP counter
    if (this.spText && this.progression) {
      this.spText.setText(`SP: ${this.progression.sp}`);
    }
  }

  shutdown() {
    // Cleanup spell visuals
    for (const [id, visual] of this.spellVisuals) {
      this.destroySpellVisual(visual);
    }
    this.spellVisuals.clear();

    // Cleanup remote player sprites, shadows, labels, HP bars
    for (const [id, rp] of this.remotePlayers) {
      if (rp.sprite && !rp.sprite.destroyed) rp.sprite.destroy();
      if (rp.shadow && !rp.shadow.destroyed) rp.shadow.destroy();
      if (rp.nameLabel && !rp.nameLabel.destroyed) rp.nameLabel.destroy();
      if (rp.hpBg && !rp.hpBg.destroyed) rp.hpBg.destroy();
      if (rp.hpFill && !rp.hpFill.destroyed) rp.hpFill.destroy();
    }
    this.remotePlayers.clear();

    // Cleanup HUD elements
    const hudElements = [
      this.hpBarBg, this.hpBarFill, this.hpText,
      this.pingText, this.playerCountText,
      this.roundText, this.timerText, this.phaseText,
      this.countdownText, this.spText,
    ];
    for (const el of hudElements) {
      if (el && !el.destroyed) el.destroy();
    }

    // Cleanup spell HUD slots
    for (const slot of this.spellSlots) {
      const slotElements = [slot.bg, slot.icon, slot.cdOverlay, slot.cdText,
                            slot.lockOverlay, slot.lockText, slot.chargeText];
      for (const el of slotElements) {
        if (el && !el.destroyed) el.destroy();
      }
    }
    this.spellSlots = [];

    // Cleanup graphics objects
    if (this.trailGraphics && !this.trailGraphics.destroyed) this.trailGraphics.destroy();
    if (this.ringGraphics && !this.ringGraphics.destroyed) this.ringGraphics.destroy();
    if (this.outerRingGraphics && !this.outerRingGraphics.destroyed) this.outerRingGraphics.destroy();
    if (this.edgeVignette && !this.edgeVignette.destroyed) this.edgeVignette.destroy();

    // Clear kill feed timeouts and texts
    if (this.killFeedTimeouts) {
      for (const id of this.killFeedTimeouts) {
        clearTimeout(id);
      }
      this.killFeedTimeouts = [];
    }
    for (const t of this.killFeedTexts) {
      if (t && !t.destroyed) t.destroy();
    }
    this.killFeedTexts = [];

    // Destroy overlay systems
    if (this.shopOverlay) this.shopOverlay.destroy();
    if (this.pauseMenu) this.pauseMenu.destroy();
    if (this.matchEndOverlay) this.matchEndOverlay.destroy();
    if (this.lobbyOverlay) this.lobbyOverlay.destroy();

    // Cleanup speed trail
    this.speedTrail = [];

    // Disconnect network
    if (this.network) {
      this.network.disconnect();
    }
  }
}
