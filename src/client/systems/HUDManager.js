import { PLAYER, ARENA } from '../../shared/constants.js';
import { SPELLS } from '../../shared/spellData.js';
import { computeSpellStats } from '../../shared/skillTreeData.js';
import {
  COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN,
  getHpTint, textStyle,
} from '../ui/UIConfig.js';
import { createButton, createIconButton, createPanel, createBar, createSeparator, createText } from '../ui/UIHelpers.js';

export class HUDManager {
  constructor(scene) {
    this.scene = scene;

    // HP bar
    this._hpBar = null;       // { bg, fill, setValue, elements }
    this.hpText = null;

    // Info
    this.pingText = null;
    this.playerCountText = null;

    // Round
    this.roundText = null;
    this.timerText = null;
    this.phaseText = null;
    this.countdownText = null;

    // Kill feed
    this.killFeedTexts = [];
    this.killFeedTimeouts = [];

    // Spell slots
    this.spellSlots = [];
    this.spText = null;
    this.spBg = null;

    // Ring (world-space — uses Graphics, not UI sprites)
    this.ringGraphics = null;
    this.outerRingGraphics = null;
    this.lastDrawnRingRadius = -1;
    this.edgeVignette = null;
    this._lastVignetteDistToEdge = null;
    this._lastRingBurnSoundTime = 0;
    this._ringDamageParticles = [];

    // HUD text caches
    this._lastPing = null;
    this._lastPlayerCount = null;
    this._lastHpText = null;
    this._lastHpRatio = null;
    this._lastRoundText = '';
    this._lastTimerText = '';
    this._lastTimerFill = '';
    this._lastPhaseText = '';
    this._lastSpText = '';

    // Cooldown visuals
    this._totalCooldowns = {};
    this._lastCdWasActive = {};
    this._slotSpellIcon = {};

    // Leaderboard
    this._leaderboardElements = [];
    this._leaderboardVisible = false;
    this._cachedScores = null;
    this._cachedLocalPlayerId = null;

    // Spectator
    this._spectateElements = [];

    // Misc
    this.announcementText = null;
    this._soundIcon = null;
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE HUD
  // ═══════════════════════════════════════════════════════════

  createHUD() {
    const scene = this.scene;
    const camW = SCREEN.W;

    // --- Top-left: Ping & player count ---
    this.pingText = createText(scene, SPACE.SM, SPACE.SM, 'Ping: --', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: DEPTH.HUD, originX: 0, originY: 0,
    });
    this.playerCountText = createText(scene, SPACE.SM, SPACE.SM + 14, 'Âşıklar: 0', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: DEPTH.HUD, originX: 0, originY: 0,
    });

    // --- Center-top: HP bar ---
    const barX = SCREEN.CX - 120; // left edge
    const barY = 28;
    this._hpBar = createBar(scene, barX, barY, 240, 6, {
      depth: DEPTH.HUD, tint: COLOR.HP_FULL, showBg: true, value: 1,
    });
    this.hpText = createText(scene, SCREEN.CX + 128, barY, '100 Nefes', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: DEPTH.HUD_TEXT, originX: 0, originY: 0.5,
    });

    // --- Top-right: Round & timer ---
    this.roundText = createText(scene, camW - SPACE.MD, SPACE.SM, 'Fasıl 0/20', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: DEPTH.HUD, originX: 1, originY: 0,
    });
    this.timerText = createText(scene, camW - SPACE.MD, SPACE.SM + 16, '60s', FONT.BODY, {
      fill: COLOR.ACCENT_INFO, depth: DEPTH.HUD, originX: 1, originY: 0,
    });
    this.phaseText = createText(scene, SCREEN.CX, 40, '', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: DEPTH.HUD, originX: 0.5, originY: 0,
    });

    // --- Countdown (center screen, hidden until needed) ---
    this.countdownText = scene.add.text(SCREEN.CX, SCREEN.CY - 40, '', textStyle(FONT.NUMBER_LG, {
      fill: '#ffffff', stroke: '#000000', strokeThickness: 3,
    })).setScrollFactor(0).setDepth(DEPTH.OVERLAY_TOP).setOrigin(0.5).setVisible(false);

    // --- Toggle buttons ---
    this.createSoundToggle();
    this.createScoreboardToggle();
  }

  createSoundToggle() {
    const scene = this.scene;
    const isMuted = scene.sound.mute;
    const x = SCREEN.W - 20;
    const y = 46;

    const { elements, icon, cell } = createIconButton(scene, x, y,
      isMuted ? 'spell-BookThunder-off' : 'spell-BookThunder', {
        size: 18, depth: DEPTH.HUD,
        onClick: () => {
          scene.sound.mute = !scene.sound.mute;
          localStorage.setItem('soundMuted', scene.sound.mute);
          icon.setTexture(scene.sound.mute ? 'spell-BookThunder-off' : 'spell-BookThunder');
        },
      });
    this._soundIcon = icon;
    this._soundElements = elements;
  }

  createScoreboardToggle() {
    const scene = this.scene;
    const x = SCREEN.W - 20;
    const y = 74;

    const { elements, icon, cell } = createIconButton(scene, x, y, 'spell-Cut', {
      size: 18, depth: DEPTH.HUD,
      onClick: () => {
        this.toggleLeaderboard(!this._leaderboardVisible);
        cell.setAlpha(this._leaderboardVisible ? ALPHA.SUBTLE + 0.2 : ALPHA.HINT);
      },
    });
    this._scoreboardBtnCell = cell;
    this._scoreboardElements = elements;
  }

  // ═══════════════════════════════════════════════════════════
  // SPELL HUD
  // ═══════════════════════════════════════════════════════════

  createSpellHUD() {
    const scene = this.scene;
    const slotSize = 42;
    const slotGap = 6;
    const totalWidth = 4 * slotSize + 3 * slotGap;
    const startX = (SCREEN.W - totalWidth) / 2;
    const slotY = SCREEN.H - 46;
    const slots = ['Q', 'W', 'E', 'R'];

    for (let i = 0; i < slots.length; i++) {
      const key = slots[i];
      const x = startX + i * (slotSize + slotGap) + slotSize / 2;
      const [nl, nr, nt, nb] = NINE.CELL;

      // Cell background
      const bg = scene.add.nineslice(x, slotY, 'ui-inventory-cell', null, slotSize, slotSize, nl, nr, nt, nb)
        .setScrollFactor(0).setDepth(DEPTH.HUD_BG).setAlpha(0.8);

      let icon = null;

      // Cooldown overlay (uses Graphics for radial sweep — world-effect, acceptable)
      const cdOverlay = scene.add.graphics()
        .setScrollFactor(0).setDepth(DEPTH.HUD_OVERLAY);
      cdOverlay.setVisible(false);
      cdOverlay._slotX = x;
      cdOverlay._slotY = slotY;
      cdOverlay._slotSize = slotSize;

      const cdText = createText(scene, x, slotY, '', FONT.TINY, {
        fill: '#ffffff', depth: DEPTH.HUD_OVERLAY + 1, originX: 0.5, originY: 0.5,
      }).setVisible(false);

      // Key sprite hint (top-left corner)
      const keySprite = scene.add.image(x - slotSize / 2 + 8, slotY - slotSize / 2 + 8, `key-${key}`)
        .setScrollFactor(0).setDepth(DEPTH.HUD_OVERLAY)
        .setDisplaySize(14, 14).setAlpha(0.7);

      // Lock overlay
      const lockOverlay = scene.add.nineslice(x, slotY, 'ui-bg', null, slotSize - 2, slotSize - 2, 4, 4, 4, 4)
        .setScrollFactor(0).setDepth(DEPTH.HUD_OVERLAY + 2).setAlpha(ALPHA.LOCKED).setVisible(false);

      // Empty slot indicator
      const emptyText = scene.add.image(x, slotY, 'spell-BookLight-off')
        .setScrollFactor(0).setDepth(DEPTH.HUD_OVERLAY + 3).setDisplaySize(18, 18).setAlpha(0.4).setVisible(false);

      // Charge counter
      const chargeText = createText(scene, x + slotSize / 2 - 3, slotY + slotSize / 2 - 3, '', FONT.TINY, {
        fill: COLOR.ACCENT_GOLD, depth: DEPTH.HUD_OVERLAY + 4, originX: 1, originY: 1,
        stroke: '#000000', strokeThickness: 2,
      }).setVisible(false);

      this.spellSlots.push({
        key, spellId: null,
        bg, icon, cdOverlay, cdText, keySprite,
        lockOverlay, lockText: null, emptyText, chargeText,
        x, y: slotY, size: slotSize,
      });
    }

    // --- SP Counter (mana sphere) ---
    const spY = slotY + slotSize / 2 + 12;
    this.spBg = scene.add.image(SCREEN.CX, spY, 'ui-sphere-bg')
      .setScrollFactor(0).setDepth(DEPTH.HUD_BG).setDisplaySize(22, 22);
    this._spMana = scene.add.image(SCREEN.CX, spY, 'ui-sphere-mana')
      .setScrollFactor(0).setDepth(DEPTH.HUD).setDisplaySize(16, 16);
    this._spOver = scene.add.image(SCREEN.CX, spY, 'ui-sphere-over')
      .setScrollFactor(0).setDepth(DEPTH.HUD_TEXT).setDisplaySize(22, 22);

    this.spText = createText(scene, SCREEN.CX, spY, '0', FONT.TINY, {
      fill: '#ffffff', depth: DEPTH.HUD_OVERLAY, originX: 0.5, originY: 0.5,
      stroke: '#000000', strokeThickness: 2,
    });

    if (scene.gameMode === 'sandbox') {
      createText(scene, SCREEN.CX, spY + 14, "Dükkânı açmak için B'ye bas", FONT.SMALL, {
        fill: COLOR.TEXT_DISABLED, depth: DEPTH.HUD, originX: 0.5, originY: 0,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ANNOUNCEMENTS & DAMAGE
  // ═══════════════════════════════════════════════════════════

  showAnnouncement(text, duration = 2500) {
    const scene = this.scene;
    if (this.announcementText) this.announcementText.destroy();

    this.announcementText = scene.add.text(SCREEN.CX, SCREEN.H / 3, text, textStyle(FONT.TITLE_SM, {
      fill: '#ffffff', stroke: '#000000', strokeThickness: 2, align: 'center',
    })).setScrollFactor(0).setDepth(DEPTH.OVERLAY_TOP).setOrigin(0.5).setAlpha(1);

    scene.tweens.add({
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
    const scene = this.scene;
    const dmg = scene.add.text(x, y - 20, `-${Math.ceil(amount)}`, textStyle(FONT.DAMAGE, {
      fill: COLOR.ACCENT_DANGER, stroke: '#000000', strokeThickness: 2,
    })).setDepth(DEPTH.OVERLAY_TOP).setOrigin(0.5);

    scene.tweens.add({
      targets: dmg,
      y: y - 60,
      alpha: 0,
      duration: 700,
      onComplete: () => dmg.destroy(),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // KILL FEED
  // ═══════════════════════════════════════════════════════════

  addKillFeed(text) {
    const scene = this.scene;
    const y = 50 + this.killFeedTexts.length * 18;
    const feedText = createText(scene, SCREEN.W - SPACE.MD, y, text, FONT.SMALL, {
      fill: COLOR.ACCENT_DANGER, depth: DEPTH.HUD_OVERLAY, originX: 1, originY: 0,
      stroke: '#000000', strokeThickness: 2,
    }).setAlpha(0.7);

    this.killFeedTexts.push(feedText);

    if (this.killFeedTexts.length > 3) {
      const old = this.killFeedTexts.shift();
      old.destroy();
      this.killFeedTexts.forEach((t, i) => t.setY(50 + i * 18));
    }

    const timeoutId = setTimeout(() => {
      const tIdx = this.killFeedTimeouts.indexOf(timeoutId);
      if (tIdx !== -1) this.killFeedTimeouts.splice(tIdx, 1);
      const idx = this.killFeedTexts.indexOf(feedText);
      if (idx !== -1) {
        this.killFeedTexts.splice(idx, 1);
        feedText.destroy();
        this.killFeedTexts.forEach((t, i) => t.setY(50 + i * 18));
      }
    }, 3000);
    this.killFeedTimeouts.push(timeoutId);
  }

  // ═══════════════════════════════════════════════════════════
  // RING GRAPHICS (world-space — Graphics primitives OK here)
  // ═══════════════════════════════════════════════════════════

  updateRingGraphics() {
    const scene = this.scene;
    const r = Math.round(scene.ringRadius);

    if (r !== this.lastDrawnRingRadius) {
      const g = this.ringGraphics;
      if (g) {
        g.clear();
        g.lineStyle(2, 0xff6666, 0.13);
        g.strokeCircle(0, 0, r - 8);
        g.lineStyle(3, 0xff4444, 0.75);
        g.strokeCircle(0, 0, r);
        for (let i = 1; i <= 5; i++) {
          const t = i / 5;
          const alpha = (0.35 - t * 0.3) * 0.85;
          g.lineStyle(4, 0xff2222, Math.max(0, alpha));
          g.strokeCircle(0, 0, r + i * 8);
        }
      }
      if (this.outerRingGraphics) {
        this.outerRingGraphics.clear();
        this.outerRingGraphics.lineStyle(1, 0xcc4444, 0.06);
        for (let dr = r + 60; dr < ARENA.FLOOR_SIZE / 2; dr += 60) {
          this.outerRingGraphics.strokeCircle(0, 0, dr);
        }
      }
      this.lastDrawnRingRadius = r;
    }

    // Per-frame: vignette + ring drama
    if (scene.playerBody) {
      const px = scene.playerBody.position.x;
      const py = scene.playerBody.position.y;
      const distFromCenter = Math.sqrt(px * px + py * py);
      const distToEdge = r - distFromCenter;

      if (!this.edgeVignette) {
        this.edgeVignette = scene.add.rectangle(
          SCREEN.CX, SCREEN.CY, SCREEN.W, SCREEN.H, 0xff0000, 0
        ).setScrollFactor(0).setDepth(99).setOrigin(0.5);
      }

      if (distToEdge < 80 && distToEdge > 0) {
        const danger = 1 - distToEdge / 80;
        this.edgeVignette.setAlpha(danger * 0.13);
      } else if (distToEdge <= 0) {
        const overshoot = Math.abs(distToEdge);
        const intensity = Math.min(overshoot / 100, 1);
        const pulse = 0.2 + 0.15 * Math.sin(scene.time.now * 0.008);
        this.edgeVignette.setAlpha(pulse + intensity * 0.1);
        scene.cameras.main.shake(80, 0.001 + intensity * 0.002, false);

        const now = performance.now();
        if (now - this._lastRingBurnSoundTime > 400) {
          this._lastRingBurnSoundTime = now;
          scene.sound.play('sfx-ring-burn', { volume: 0.15 + intensity * 0.35, rate: 0.8 + intensity * 0.4 });
        }

        if (Math.random() < 0.3 + intensity * 0.5) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 2;
          const fireKey = 'fx-particle-fire';
          const fireTex = scene.textures.exists(fireKey) ? scene.textures.get(fireKey) : null;
          const fireFrames = fireTex ? Math.max(1, fireTex.frameTotal - 1) : 0;

          if (fireFrames > 0) {
            const frame = Math.floor(Math.random() * fireFrames);
            const spark = scene.add.sprite(px, py, fireKey, frame);
            spark.setScale(2 + Math.random() * 2).setDepth(50).setAlpha(0.8).setTint(0xff2222);
            const life = 400 + Math.random() * 300;
            scene.tweens.add({
              targets: spark,
              x: px + Math.cos(angle) * speed * (life / 16),
              y: py + Math.sin(angle) * speed * (life / 16),
              alpha: 0, scaleX: 0.5, scaleY: 0.5,
              duration: life, ease: 'Quad.easeOut',
              onComplete: () => spark.destroy(),
            });
          } else {
            this._ringDamageParticles.push({
              x: px, y: py,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              life: 400 + Math.random() * 300, elapsed: 0,
              size: 2 + Math.random() * 3,
            });
          }
        }
      } else {
        this.edgeVignette.setAlpha(0);
      }

      // Ring damage particles (fallback)
      if (this._ringDamageParticles.length > 0) {
        if (!this._ringParticleGraphics) {
          this._ringParticleGraphics = scene.add.graphics().setDepth(50);
        }
        this._ringParticleGraphics.clear();
        for (let pi = this._ringDamageParticles.length - 1; pi >= 0; pi--) {
          const p = this._ringDamageParticles[pi];
          p.elapsed += 16;
          p.x += p.vx;
          p.y += p.vy;
          const lifeRatio = 1 - p.elapsed / p.life;
          if (lifeRatio <= 0) { this._ringDamageParticles.splice(pi, 1); continue; }
          this._ringParticleGraphics.fillStyle(0xff2222, lifeRatio * 0.8);
          this._ringParticleGraphics.fillCircle(p.x, p.y, p.size * lifeRatio);
        }
      } else if (this._ringParticleGraphics) {
        this._ringParticleGraphics.clear();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE: HUD INFO
  // ═══════════════════════════════════════════════════════════

  updateHUD() {
    const scene = this.scene;

    // Ping & player count (dirty-flag)
    if (scene.network) {
      const ping = scene.network.ping;
      if (ping !== this._lastPing) {
        this.pingText.setText(`Ping: ${ping}ms`);
        this._lastPing = ping;
      }
      const totalPlayers = 1 + scene.remotePlayers.size;
      if (totalPlayers !== this._lastPlayerCount) {
        this.playerCountText.setText(`Âşıklar: ${totalPlayers}`);
        this._lastPlayerCount = totalPlayers;
      }
    }

    // HP bar
    if (this._hpBar) {
      const hpRatio = Math.max(0, scene.localHp / scene.localMaxHp);

      if (hpRatio !== this._lastHpRatio) {
        this._lastHpRatio = hpRatio;
        const tint = getHpTint(hpRatio);
        this._hpBar.setValue(hpRatio, tint, true);

        const vulnPercent = Math.round((1 - hpRatio) * 100);
        const hpStr = `${Math.ceil(scene.localHp)} Nefes (${vulnPercent}%)`;
        if (hpStr !== this._lastHpText) {
          this.hpText.setText(hpStr);
          this._lastHpText = hpStr;
        }
      }

      // Low HP pulse
      if (hpRatio <= 0.5 && hpRatio > 0) {
        const pulse = 0.7 + 0.3 * Math.sin(scene.time.now * (hpRatio <= 0.25 ? 0.012 : 0.006));
        this._hpBar.fill.setAlpha(pulse);
      } else {
        this._hpBar.fill.setAlpha(1);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE: ROUND HUD
  // ═══════════════════════════════════════════════════════════

  updateRoundHUD() {
    const scene = this.scene;

    if (this.roundText) {
      const roundStr = scene.gameMode === 'sandbox'
        ? 'SERBEST MEYDAN'
        : `Fasıl ${scene.roundNumber}/${scene.totalRounds}`;
      if (roundStr !== this._lastRoundText) {
        this.roundText.setText(roundStr);
        this._lastRoundText = roundStr;
      }
    }

    if (this.timerText) {
      let timerStr = '';
      let timerFill = COLOR.ACCENT_INFO;
      if (scene.phase === 'playing') {
        const seconds = Math.ceil(scene.timeRemaining);
        timerStr = `${seconds}s`;
        timerFill = seconds <= 10 ? COLOR.ACCENT_DANGER : COLOR.ACCENT_INFO;
      } else if (scene.phase === 'shop') {
        const seconds = Math.ceil(scene.shopTimeRemaining);
        timerStr = `Dükkân: ${seconds}s`;
        timerFill = COLOR.ACCENT_GOLD;
      }
      if (timerStr !== this._lastTimerText) {
        this.timerText.setText(timerStr);
        this._lastTimerText = timerStr;
      }
      if (timerFill !== this._lastTimerFill) {
        this.timerText.setFill(timerFill);
        this._lastTimerFill = timerFill;
      }
    }

    // Shop overlay management
    if (scene.shopOverlay) {
      if (scene.phase === 'shop') {
        if (!scene.shopOverlay.visible && scene.progression) {
          scene.shopOverlay.show(scene.progression, scene.shopTimeRemaining);
        } else if (scene.shopOverlay.visible) {
          scene.shopOverlay.updateTimer(scene.shopTimeRemaining);
        }
      } else if (scene.shopOverlay.visible && scene.gameMode !== 'sandbox') {
        scene.shopOverlay.hide();
      }
    }

    // Lobby overlay management
    if (scene.lobbyOverlay) {
      if (scene.phase === 'waiting') {
        if (!scene.lobbyOverlay.visible) scene.lobbyOverlay.show();
        const currentCount = 1 + scene.remotePlayers.size;
        if (currentCount !== this._lastLobbyCount) {
          this._lastLobbyCount = currentCount;
          const playerList = [];
          if (scene.localPlayerId) {
            playerList.push({ id: scene.localPlayerId, name: scene.playerName, characterId: scene.characterId });
          }
          for (const [id, rp] of scene.remotePlayers) {
            playerList.push({ id, name: rp.name || id.slice(-4), characterId: rp.characterId });
          }
          scene.lobbyOverlay.updatePlayers(playerList);
        }
      } else if (scene.lobbyOverlay.visible) {
        scene.lobbyOverlay.hide();
        this._lastLobbyCount = -1;
      }
    }

    // Phase label
    if (this.phaseText) {
      const phaseLabels = {
        waiting: 'Âşıklar bekleniyor...',
        countdown: '', playing: '',
        roundEnd: 'Fasıl Tamam',
        shop: 'Dükkân Vakti',
        matchEnd: 'Atışma Tamam',
      };
      const phaseStr = phaseLabels[scene.phase] || '';
      if (phaseStr !== this._lastPhaseText) {
        this.phaseText.setText(phaseStr);
        this._lastPhaseText = phaseStr;
      }
    }

    // Countdown
    if (this.countdownText) {
      if (scene.phase === 'countdown' && scene.countdownRemaining > 0) {
        const num = Math.ceil(scene.countdownRemaining);
        this.countdownText.setText(num.toString());
        this.countdownText.setVisible(true);
        const frac = scene.countdownRemaining % 1;
        this.countdownText.setScale(1 + frac * 0.3);
        this.countdownText.setAlpha(0.5 + frac * 0.5);
      } else {
        this.countdownText.setVisible(false);
      }
    }

    // Eliminated player dim
    if (scene.localEliminated && scene.playerSprite && scene.playerSprite.alpha > 0.3) {
      scene.playerSprite.setAlpha(0.3);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UPDATE: SPELL HUD
  // ═══════════════════════════════════════════════════════════

  updateSpellHUD() {
    const scene = this.scene;

    for (const slot of this.spellSlots) {
      const isLocked = scene.progression && scene.progression.slots[slot.key] === 'locked';
      const spellState = scene.progression ? scene.progression.spells[slot.key] : null;
      const spellId = spellState ? spellState.chosenSpell : null;
      const hasSpell = spellId !== null;
      slot.spellId = spellId;

      // Lock overlay
      if (slot.lockOverlay) {
        if (isLocked !== slot._lastLocked) {
          slot.lockOverlay.setVisible(isLocked);
          slot._lastLocked = isLocked;
        }
      }

      // Empty indicator
      if (slot.emptyText) {
        const showEmpty = !isLocked && !hasSpell;
        if (showEmpty !== slot._lastShowEmpty) {
          slot.emptyText.setVisible(showEmpty);
          slot._lastShowEmpty = showEmpty;
        }
      }

      if (isLocked) {
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
        if (slot.icon) slot.icon.setVisible(false);
        continue;
      }

      // Spell icon management
      const def = hasSpell ? SPELLS[spellId] : null;
      if (def && def.icon) {
        if (slot._currentIconKey !== def.icon) {
          this._slotSpellIcon[slot.key] = def.icon;
          if (spellId) this._totalCooldowns[spellId] = undefined;
        }

        const cd = hasSpell ? (scene.cooldowns[spellId] || 0) : 0;
        const isOnCooldown = cd > 0;
        const normalKey = def.icon;
        const offKey = normalKey + '-off';
        const targetKey = isOnCooldown && scene.textures.exists(offKey) ? offKey : normalKey;

        if (!slot.icon || slot._currentIconKey !== targetKey) {
          if (slot.icon && !slot.icon.destroyed) slot.icon.destroy();
          if (scene.textures.exists(targetKey)) {
            slot.icon = scene.add.image(slot.x, slot.y, targetKey)
              .setScrollFactor(0).setDepth(DEPTH.HUD);
            const iconScale = (slot.size - 8) / Math.max(slot.icon.width, slot.icon.height);
            slot.icon.setScale(iconScale);
            slot.icon._baseScale = iconScale;
          } else {
            slot.icon = null;
          }
          slot._currentIconKey = targetKey;
        }
        if (slot.icon) slot.icon.setVisible(true).setAlpha(1);
      } else {
        if (slot.icon && !slot.icon.destroyed) slot.icon.setVisible(false);
      }

      // Cooldown
      if (hasSpell) {
        const cd = scene.cooldowns[spellId];
        if (cd && cd > 0) {
          if (!this._totalCooldowns[spellId]) {
            const tierLevel = (scene.progression && scene.progression.spells[slot.key])
              ? (scene.progression.spells[slot.key].tier || 0) : 0;
            const stats = computeSpellStats(spellId, tierLevel);
            this._totalCooldowns[spellId] = stats ? (stats.cooldown || 5000) : 5000;
          }
          const totalCd = this._totalCooldowns[spellId];
          const progress = Math.min(1, cd / totalCd);

          slot.cdOverlay.setVisible(true);
          slot.cdOverlay.clear();
          const cx = slot.cdOverlay._slotX;
          const cy = slot.cdOverlay._slotY;
          const radius = (slot.size - 4) / 2;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + progress * Math.PI * 2;

          slot.cdOverlay.fillStyle(0x000000, 0.45);
          slot.cdOverlay.beginPath();
          slot.cdOverlay.moveTo(cx, cy);
          slot.cdOverlay.arc(cx, cy, radius, startAngle, endAngle, false);
          slot.cdOverlay.closePath();
          slot.cdOverlay.fillPath();

          slot.cdText.setVisible(true);
          const cdStr = (cd / 1000).toFixed(1);
          if (cdStr !== slot._lastCdText) {
            slot.cdText.setText(cdStr);
            slot._lastCdText = cdStr;
          }
          this._lastCdWasActive[slot.key] = true;
        } else {
          slot.cdOverlay.setVisible(false);
          slot.cdOverlay.clear();
          slot.cdText.setVisible(false);
          slot._lastCdText = '';

          // Ready pulse
          if (this._lastCdWasActive[slot.key]) {
            this._lastCdWasActive[slot.key] = false;
            if (slot.icon && !slot.icon.destroyed && slot.icon._baseScale) {
              scene.tweens.add({
                targets: slot.icon,
                scaleX: slot.icon._baseScale * 1.3,
                scaleY: slot.icon._baseScale * 1.3,
                duration: 150, yoyo: true, ease: 'Quad.easeOut',
              });
            }
          }
        }

        // Charges
        const charge = scene.charges[spellId];
        if (slot.chargeText) {
          if (charge && charge.max > 1) {
            slot.chargeText.setVisible(true);
            const chargeStr = `${charge.remaining}/${charge.max}`;
            const chargeColor = charge.remaining > 0 ? COLOR.ACCENT_GOLD : COLOR.ACCENT_DANGER;
            if (chargeStr !== slot._lastChargeText) {
              slot.chargeText.setText(chargeStr);
              slot._lastChargeText = chargeStr;
            }
            if (chargeColor !== slot._lastChargeColor) {
              slot.chargeText.setColor(chargeColor);
              slot._lastChargeColor = chargeColor;
            }
          } else {
            slot.chargeText.setVisible(false);
          }
        }
      } else {
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
        slot._lastCdText = '';
        if (slot.chargeText) slot.chargeText.setVisible(false);
      }
    }

    // SP counter
    if (this.spText && scene.progression) {
      const spStr = `${scene.progression.sp}`;
      if (spStr !== this._lastSpText) {
        this.spText.setText(spStr);
        this._lastSpText = spStr;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEADERBOARD
  // ═══════════════════════════════════════════════════════════

  updateLeaderboard(scores, localPlayerId) {
    this._cachedScores = scores;
    this._cachedLocalPlayerId = localPlayerId;
    if (this._leaderboardVisible) this._renderLeaderboard();
  }

  toggleLeaderboard(show) {
    if (show === this._leaderboardVisible) return;
    this._leaderboardVisible = show;
    if (show) {
      if (!this._cachedScores) this._buildInitialScores();
      this._renderLeaderboard();
    } else {
      this._hideLeaderboard();
    }
  }

  _buildInitialScores() {
    const scene = this.scene;
    const scores = [];
    if (scene.localPlayerId) {
      scores.push({ id: scene.localPlayerId, name: scene.playerName || 'Sen', points: 0, eliminations: 0 });
    }
    this._cachedLocalPlayerId = scene.localPlayerId;
    if (scene.remotePlayers) {
      for (const [id, rp] of scene.remotePlayers) {
        scores.push({ id, name: rp.name || id.slice(-4), points: 0, eliminations: 0 });
      }
    }
    if (scores.length > 0) this._cachedScores = scores;
  }

  _renderLeaderboard() {
    this._hideLeaderboard();
    if (!this._cachedScores || this._cachedScores.length === 0) return;

    const scene = this.scene;
    const sorted = [...this._cachedScores].sort((a, b) => b.points - a.points);
    const rowH = 18;
    const panelW = 200;
    const panelH = 20 + sorted.length * rowH + SPACE.SM;
    const panelX = SCREEN.W - SPACE.MD;
    const panelY = 92;

    // Background panel (frosted glass)
    const bg = createPanel(scene, panelX - panelW / 2, panelY + panelH / 2,
      panelW, panelH, {
        depth: DEPTH.HUD_BG, fillAlpha: 0.20,
      });
    this._leaderboardElements.push(bg);

    // Header
    const header = createText(scene, panelX - panelW + SPACE.SM, panelY + SPACE.XS, 'PUAN', FONT.TINY, {
      fill: COLOR.ACCENT_GOLD, depth: DEPTH.HUD_TEXT, originX: 0, originY: 0,
    });
    this._leaderboardElements.push(header);

    // Rows
    const rankColors = [COLOR.ACCENT_GOLD, '#c0c0c0', '#cd7f32'];
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const isLocal = s.id === this._cachedLocalPlayerId;
      const color = isLocal ? COLOR.TEXT_ICE : (rankColors[i] || COLOR.TEXT_SECONDARY);
      const y = panelY + 18 + i * rowH;
      const row = createText(scene, panelX - panelW + SPACE.SM, y,
        `${i + 1}. ${s.name}  ${s.points ?? 0}p  ${s.eliminations ?? 0}k`, FONT.SMALL, {
          fill: color, depth: DEPTH.HUD_TEXT, originX: 0, originY: 0,
        });
      this._leaderboardElements.push(row);
    }
  }

  _hideLeaderboard() {
    for (const el of this._leaderboardElements) {
      if (el && !el.destroyed) el.destroy();
    }
    this._leaderboardElements = [];
  }

  // ═══════════════════════════════════════════════════════════
  // SPECTATOR HUD
  // ═══════════════════════════════════════════════════════════

  updateSpectateHUD(playerName) {
    this._hideSpectateHUD();
    if (!playerName) return;

    const scene = this.scene;
    const nameText = createText(scene, SCREEN.CX, SCREEN.H - 110,
      `İzleniyor: ${playerName}`, FONT.BODY_BOLD, {
        fill: '#ffffff', depth: DEPTH.OVERLAY_TOP, originX: 0.5, originY: 0.5,
        stroke: '#000000', strokeThickness: 2,
      });
    this._spectateElements.push(nameText);

    const hint = createText(scene, SCREEN.CX, SCREEN.H - 92,
      'Tıkla veya ← → ile değiştir', FONT.SMALL, {
        fill: COLOR.TEXT_SECONDARY, depth: DEPTH.OVERLAY_TOP, originX: 0.5, originY: 0.5,
      });
    this._spectateElements.push(hint);
  }

  _hideSpectateHUD() {
    for (const el of this._spectateElements) {
      if (el && !el.destroyed) el.destroy();
    }
    this._spectateElements = [];
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN UPDATE
  // ═══════════════════════════════════════════════════════════

  update() {
    this.updateRingGraphics();
    this.updateHUD();
    this.updateRoundHUD();
    this.updateSpellHUD();
  }

  // ═══════════════════════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════════════════════

  destroy() {
    // HUD elements
    const hudElements = [
      this.hpText,
      this.pingText, this.playerCountText,
      this.roundText, this.timerText, this.phaseText,
      this.countdownText, this.spText, this.spBg,
      this._spMana, this._spOver,
    ];
    // HP bar elements
    if (this._hpBar) {
      hudElements.push(...this._hpBar.elements);
    }
    // Sound & scoreboard elements
    if (this._soundElements) hudElements.push(...this._soundElements);
    if (this._scoreboardElements) hudElements.push(...this._scoreboardElements);

    for (const el of hudElements) {
      if (el && !el.destroyed) el.destroy();
    }

    // Spell slots
    for (const slot of this.spellSlots) {
      const slotElements = [
        slot.bg, slot.icon, slot.cdOverlay, slot.cdText, slot.keySprite,
        slot.lockOverlay, slot.lockText, slot.chargeText, slot.emptyText,
      ];
      for (const el of slotElements) {
        if (el && !el.destroyed) el.destroy();
      }
    }
    this.spellSlots = [];

    // Ring graphics
    if (this.ringGraphics && !this.ringGraphics.destroyed) this.ringGraphics.destroy();
    if (this.outerRingGraphics && !this.outerRingGraphics.destroyed) this.outerRingGraphics.destroy();
    if (this.edgeVignette && !this.edgeVignette.destroyed) this.edgeVignette.destroy();
    if (this._ringParticleGraphics && !this._ringParticleGraphics.destroyed) this._ringParticleGraphics.destroy();
    this._ringDamageParticles = [];

    // Kill feed
    if (this.killFeedTimeouts) {
      for (const id of this.killFeedTimeouts) clearTimeout(id);
      this.killFeedTimeouts = [];
    }
    for (const t of this.killFeedTexts) {
      if (t && !t.destroyed) t.destroy();
    }
    this.killFeedTexts = [];

    // Announcement
    if (this.announcementText && !this.announcementText.destroyed) this.announcementText.destroy();

    // Leaderboard & Spectator
    this._hideLeaderboard();
    this._hideSpectateHUD();
  }
}
