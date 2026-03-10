import { PLAYER, ARENA } from '../../shared/constants.js';
import { SPELLS } from '../../shared/spellData.js';
import { computeSpellStats } from '../../shared/skillTreeData.js';
import { UI_FONT } from '../config.js';

export class HUDManager {
  constructor(scene) {
    this.scene = scene;

    // HP bar
    this.hpBarBg = null;
    this.hpBarFill = null;
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

    // Ring
    this.ringGraphics = null;
    this.outerRingGraphics = null;
    this.lastDrawnRingRadius = -1;
    this.edgeVignette = null;
    this._lastVignetteDistToEdge = null;
    this._lastRingBurnSoundTime = 0;
    this._ringDamageParticles = [];

    // HUD text caches (avoid redundant setText calls)
    this._lastPing = null;
    this._lastPlayerCount = null;
    this._lastHpText = null;
    this._lastHpRatio = null;
    this._lastRoundText = '';
    this._lastTimerText = '';
    this._lastTimerFill = '';
    this._lastPhaseText = '';
    this._lastSpText = '';

    // Cooldown visuals state
    this._totalCooldowns = {};    // { spellId: totalCooldownMs }
    this._lastCdWasActive = {};   // { slotKey: boolean } for ready pulse
    this._slotSpellIcon = {};     // { slotKey: normalTextureKey } to track icon swaps

    // Leaderboard
    this._leaderboardElements = [];
    this._leaderboardVisible = false;
    this._cachedScores = null;
    this._cachedLocalPlayerId = null;

    // Spectator
    this._spectateElements = [];

    // Misc
    this.announcementText = null;
  }

  createHUD() {
    const scene = this.scene;
    this.pingText = scene.add.text(8, 8, 'Ping: --', {
      fontSize: '12px', fontFamily: UI_FONT,
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100);

    this.playerCountText = scene.add.text(8, 22, 'Âşıklar: 0', {
      fontSize: '12px', fontFamily: UI_FONT,
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100);

    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;

    // HP bar: nineslice frame + sprite fill inside
    this.hpBarBg = scene.add.nineslice(camW / 2, 16, 'ui-panel-2', null, 168, 14, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(100).setOrigin(0.5);
    this.hpBarFill = scene.add.nineslice(camW / 2 - 80, 16, 'ui-slider-progress', null, 160, 8, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(101).setOrigin(0, 0.5).setTint(0x44dd44);
    this.hpText = scene.add.text(camW / 2, 16, '100/100', {
      fontSize: '13px', fontFamily: UI_FONT,
      fill: '#ffffff',
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);

    this.roundText = scene.add.text(camW - 10, 8, 'Fasıl 0/20', {
      fontSize: '13px', fontFamily: UI_FONT,
      fill: '#ffdd44',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.timerText = scene.add.text(camW - 10, 24, '60s', {
      fontSize: '13px', fontFamily: UI_FONT,
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.phaseText = scene.add.text(camW / 2, 34, '', {
      fontSize: '12px', fontFamily: UI_FONT,
      fill: '#aaaaaa',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    this.countdownText = scene.add.text(camW / 2, camH / 2 - 40, '', {
      fontSize: '48px', fontFamily: UI_FONT,
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(250).setOrigin(0.5).setVisible(false);

    this.createSoundToggle(camW);
    this.createScoreboardToggle(camW);
  }

  createSoundToggle(camW) {
    const scene = this.scene;
    const isMuted = scene.sound.mute;
    const btnSize = 22;
    const x = camW - 20;
    const y = 46;

    const bg = scene.add.nineslice(x, y, 'ui-inventory-cell', null, btnSize, btnSize, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(100);

    const icon = scene.add.image(x, y, isMuted ? 'spell-BookThunder-off' : 'spell-BookThunder')
      .setScrollFactor(0).setDepth(101).setDisplaySize(18, 18);

    const hitArea = scene.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0)
      .setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => bg.setTint(0xddddaa));
    hitArea.on('pointerout', () => bg.clearTint());
    hitArea.on('pointerdown', () => {
      scene.sound.mute = !scene.sound.mute;
      localStorage.setItem('soundMuted', scene.sound.mute);
      icon.setTexture(scene.sound.mute ? 'spell-BookThunder-off' : 'spell-BookThunder');
    });
  }

  createScoreboardToggle(camW) {
    const scene = this.scene;
    const btnSize = 22;
    const x = camW - 20;
    const y = 46 + 28; // below the mute button

    const bg = scene.add.nineslice(x, y, 'ui-inventory-cell', null, btnSize, btnSize, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(100);

    scene.add.image(x, y, 'spell-Cut')
      .setScrollFactor(0).setDepth(101).setDisplaySize(18, 18);

    const hitArea = scene.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0)
      .setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => bg.setTint(0xddddaa));
    hitArea.on('pointerout', () => {
      if (!this._leaderboardVisible) bg.clearTint();
    });
    hitArea.on('pointerdown', () => {
      this.toggleLeaderboard(!this._leaderboardVisible);
      bg.setTint(this._leaderboardVisible ? 0xffdd44 : 0xddddaa);
    });

    this._scoreboardBtnBg = bg;
  }

  createSpellHUD() {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const slotSize = 40;
    const slotGap = 6;
    const totalWidth = 4 * slotSize + 3 * slotGap;
    const startX = (camW - totalWidth) / 2;
    const slotY = camH - 50;

    const slots = ['Q', 'W', 'E', 'R'];

    for (let i = 0; i < slots.length; i++) {
      const key = slots[i];
      const x = startX + i * (slotSize + slotGap) + slotSize / 2;

      // Nineslice inventory cell
      const bg = scene.add.nineslice(x, slotY, 'ui-inventory-cell', null, slotSize, slotSize, 4, 4, 4, 4)
        .setScrollFactor(0).setDepth(100);

      let icon = null;

      const cdOverlay = scene.add.graphics()
        .setScrollFactor(0).setDepth(102);
      cdOverlay.setVisible(false);
      cdOverlay._slotX = x;
      cdOverlay._slotY = slotY;
      cdOverlay._slotSize = slotSize;

      const cdText = scene.add.text(x, slotY, '', {
        fontSize: '13px', fontFamily: UI_FONT,
        fill: '#ffffff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(103).setOrigin(0.5).setVisible(false);

      scene.add.text(x - slotSize / 2 + 3, slotY - slotSize / 2 + 2, key, {
        fontSize: '11px', fontFamily: UI_FONT,
        fill: '#aaccff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(103);

      const lockOverlay = scene.add.nineslice(x, slotY, 'ui-bg-2', null, slotSize - 2, slotSize - 2, 4, 4, 4, 4)
        .setScrollFactor(0).setDepth(104).setTint(0x111111).setAlpha(0.8).setVisible(false);
      // Lock text removed — dark overlay is sufficient indicator
      const lockText = null;

      const emptyText = scene.add.image(x, slotY, 'spell-BookLight-off')
        .setScrollFactor(0).setDepth(105).setDisplaySize(20, 20).setAlpha(0.5).setVisible(false);

      const chargeText = scene.add.text(x + slotSize / 2 - 3, slotY + slotSize / 2 - 3, '', {
        fontSize: '12px', fontFamily: UI_FONT,
        fill: '#ffdd44',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      }).setScrollFactor(0).setDepth(106).setOrigin(1, 1).setVisible(false);

      this.spellSlots.push({
        key,
        spellId: null,
        bg,
        icon,
        cdOverlay,
        cdText,
        lockOverlay,
        lockText,
        emptyText,
        chargeText,
        x, y: slotY, size: slotSize,
      });
    }

    // SP counter — mana sphere
    const spY = slotY + slotSize / 2 + 10;
    this.spBg = scene.add.image(camW / 2, spY, 'ui-sphere-bg')
      .setScrollFactor(0).setDepth(99).setDisplaySize(28, 28);
    this._spMana = scene.add.image(camW / 2, spY, 'ui-sphere-mana')
      .setScrollFactor(0).setDepth(100).setDisplaySize(20, 20);
    this._spOver = scene.add.image(camW / 2, spY, 'ui-sphere-over')
      .setScrollFactor(0).setDepth(101).setDisplaySize(28, 28);

    this.spText = scene.add.text(camW / 2, spY, '0', {
      fontSize: '11px', fontFamily: UI_FONT,
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);

    if (scene.gameMode === 'sandbox') {
      scene.add.text(camW / 2, spY + 16, "Dükkânı açmak için B'ye bas", {
        fontSize: '13px', fontFamily: UI_FONT,
        fill: '#666688',
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);
    }
  }

  showAnnouncement(text, duration = 2500) {
    const scene = this.scene;
    if (this.announcementText) {
      this.announcementText.destroy();
    }
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    this.announcementText = scene.add.text(camW / 2, camH / 3, text, {
      fontSize: '24px', fontFamily: UI_FONT,
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(1);

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
    const text = scene.add.text(x, y - 20, `-${Math.ceil(amount)}`, {
      fontSize: '14px', fontFamily: UI_FONT,
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setDepth(200).setOrigin(0.5);

    scene.tweens.add({
      targets: text,
      y: y - 55,
      alpha: 0,
      duration: 900,
      onComplete: () => text.destroy(),
    });
  }

  addKillFeed(text) {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const y = 60 + this.killFeedTexts.length * 15;
    const feedText = scene.add.text(camW - 10, y, text, {
      fontSize: '12px', fontFamily: UI_FONT,
      fill: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(150).setOrigin(1, 0);

    this.killFeedTexts.push(feedText);

    if (this.killFeedTexts.length > 5) {
      const old = this.killFeedTexts.shift();
      old.destroy();
      this.killFeedTexts.forEach((t, i) => {
        t.setY(60 + i * 15);
      });
    }

    const timeoutId = setTimeout(() => {
      const tIdx = this.killFeedTimeouts.indexOf(timeoutId);
      if (tIdx !== -1) this.killFeedTimeouts.splice(tIdx, 1);

      const idx = this.killFeedTexts.indexOf(feedText);
      if (idx !== -1) {
        this.killFeedTexts.splice(idx, 1);
        feedText.destroy();
        this.killFeedTexts.forEach((t, i) => {
          t.setY(60 + i * 15);
        });
      }
    }, 4000);
    this.killFeedTimeouts.push(timeoutId);
  }

  updateRingGraphics() {
    const scene = this.scene;
    const r = Math.round(scene.ringRadius);

    // Redraw ring circles only when radius changes
    if (r !== this.lastDrawnRingRadius) {
      const g = this.ringGraphics;
      if (g) {
        g.clear();

        g.lineStyle(2, 0xff6666, 0.13);
        g.strokeCircle(0, 0, r - 8);

        g.lineStyle(3, 0xff4444, 0.75);
        g.strokeCircle(0, 0, r);

        const bandSteps = 5;
        for (let i = 1; i <= bandSteps; i++) {
          const t = i / bandSteps;
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

    // --- Per-frame: vignette + ring drama effects ---
    if (scene.playerBody) {
      const px = scene.playerBody.position.x;
      const py = scene.playerBody.position.y;
      const distFromCenter = Math.sqrt(px * px + py * py);
      const distToEdge = r - distFromCenter;

      if (!this.edgeVignette) {
        this.edgeVignette = scene.add.rectangle(
          scene.cameras.main.width / 2, scene.cameras.main.height / 2,
          scene.cameras.main.width, scene.cameras.main.height,
          0xff0000, 0
        ).setScrollFactor(0).setDepth(99).setOrigin(0.5);
      }

      if (distToEdge < 80 && distToEdge > 0) {
        // Near edge warning: static danger vignette
        const danger = 1 - distToEdge / 80;
        this.edgeVignette.setAlpha(danger * 0.13);
      } else if (distToEdge <= 0) {
        // RING DRAMA: player is outside the ring — pulsing vignette + shake + sound
        const overshoot = Math.abs(distToEdge);
        const intensity = Math.min(overshoot / 100, 1); // 0→1 over 100px overshoot

        // Pulsing vignette: oscillate alpha with sin(time)
        const pulse = 0.2 + 0.15 * Math.sin(scene.time.now * 0.008);
        this.edgeVignette.setAlpha(pulse + intensity * 0.1);

        // Camera micro-shake: proportional to overshoot distance
        const shakeIntensity = 0.001 + intensity * 0.002;
        scene.cameras.main.shake(80, shakeIntensity, false);

        // Sound: play ring-burn throttled to every 400ms
        const now = performance.now();
        if (now - this._lastRingBurnSoundTime > 400) {
          this._lastRingBurnSoundTime = now;
          const vol = 0.15 + intensity * 0.35;
          scene.sound.play('sfx-ring-burn', { volume: vol, rate: 0.8 + intensity * 0.4 });
        }

        // Particles: fire sprites flying off player
        if (Math.random() < 0.3 + intensity * 0.5) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 2;
          const fireKey = 'fx-particle-fire';
          const fireTex = scene.textures.exists(fireKey) ? scene.textures.get(fireKey) : null;
          const fireFrames = fireTex ? Math.max(1, fireTex.frameTotal - 1) : 0;

          if (fireFrames > 0) {
            const frame = Math.floor(Math.random() * fireFrames);
            const spark = scene.add.sprite(px, py, fireKey, frame);
            spark.setScale(2 + Math.random() * 2);
            spark.setDepth(50);
            spark.setAlpha(0.8);
            spark.setTint(0xff2222);
            const life = 400 + Math.random() * 300;
            scene.tweens.add({
              targets: spark,
              x: px + Math.cos(angle) * speed * (life / 16),
              y: py + Math.sin(angle) * speed * (life / 16),
              alpha: 0,
              scaleX: 0.5,
              scaleY: 0.5,
              duration: life,
              ease: 'Quad.easeOut',
              onComplete: () => spark.destroy(),
            });
          } else {
            // Fallback: old particle system
            this._ringDamageParticles.push({
              x: px, y: py,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 400 + Math.random() * 300,
              elapsed: 0,
              size: 2 + Math.random() * 3,
            });
          }
        }
      } else {
        this.edgeVignette.setAlpha(0);
      }

      // Update & draw ring damage particles
      if (this._ringDamageParticles.length > 0) {
        if (!this._ringParticleGraphics) {
          this._ringParticleGraphics = scene.add.graphics().setDepth(50);
        }
        this._ringParticleGraphics.clear();
        for (let pi = this._ringDamageParticles.length - 1; pi >= 0; pi--) {
          const p = this._ringDamageParticles[pi];
          p.elapsed += 16; // ~60fps
          p.x += p.vx;
          p.y += p.vy;
          const lifeRatio = 1 - p.elapsed / p.life;
          if (lifeRatio <= 0) {
            this._ringDamageParticles.splice(pi, 1);
            continue;
          }
          this._ringParticleGraphics.fillStyle(0xff2222, lifeRatio * 0.8);
          this._ringParticleGraphics.fillCircle(p.x, p.y, p.size * lifeRatio);
        }
      } else if (this._ringParticleGraphics) {
        this._ringParticleGraphics.clear();
      }
    }
  }

  updateHUD() {
    const scene = this.scene;
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

    if (this.hpBarFill) {
      const hpRatio = Math.max(0, scene.localHp / scene.localMaxHp);

      // Only update bar width, color, and text when HP ratio changes
      if (hpRatio !== this._lastHpRatio) {
        this._lastHpRatio = hpRatio;
        this.hpBarFill.displayWidth = 160 * hpRatio;
        if (hpRatio > 0.75) {
          this.hpBarFill.setTint(0x44bbff);
        } else if (hpRatio > 0.5) {
          this.hpBarFill.setTint(0xdddd44);
        } else if (hpRatio > 0.25) {
          this.hpBarFill.setTint(0xff8833);
        } else {
          this.hpBarFill.setTint(0xff3333);
        }
        const vulnPercent = Math.round((1 - hpRatio) * 100);
        this.hpText.setText(`${Math.ceil(scene.localHp)} Nefes  (${vulnPercent}% açık)`);
      }

      // Pulse animation still runs every frame (only when low HP)
      if (hpRatio <= 0.5 && hpRatio > 0) {
        const pulse = 0.7 + 0.3 * Math.sin(scene.time.now * (hpRatio <= 0.25 ? 0.012 : 0.006));
        this.hpBarFill.setAlpha(pulse);
      } else {
        this.hpBarFill.setAlpha(1);
      }
    }
  }

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
      let timerFill = '#88ccff';
      if (scene.phase === 'playing') {
        const seconds = Math.ceil(scene.timeRemaining);
        timerStr = `${seconds}s`;
        timerFill = seconds <= 10 ? '#ff4444' : '#88ccff';
      } else if (scene.phase === 'shop') {
        const seconds = Math.ceil(scene.shopTimeRemaining);
        timerStr = `Dükkân: ${seconds}s`;
        timerFill = '#ffdd44';
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

    if (scene.lobbyOverlay) {
      if (scene.phase === 'waiting') {
        if (!scene.lobbyOverlay.visible) {
          scene.lobbyOverlay.show();
        }
        const playerList = [];
        if (scene.localPlayerId) {
          playerList.push({
            id: scene.localPlayerId,
            name: scene.playerName,
            characterId: scene.characterId,
          });
        }
        for (const [id, rp] of scene.remotePlayers) {
          playerList.push({
            id,
            name: rp.name || id.slice(-4),
            characterId: rp.characterId,
          });
        }
        scene.lobbyOverlay.updatePlayers(playerList);
      } else if (scene.lobbyOverlay.visible) {
        scene.lobbyOverlay.hide();
      }
    }

    if (this.phaseText) {
      const phaseLabels = {
        waiting: 'Âşıklar bekleniyor...',
        countdown: '',
        playing: '',
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

    if (this.countdownText) {
      if (scene.phase === 'countdown' && scene.countdownRemaining > 0) {
        const num = Math.ceil(scene.countdownRemaining);
        this.countdownText.setText(num.toString());
        this.countdownText.setVisible(true);
        const frac = scene.countdownRemaining % 1;
        const scale = 1 + frac * 0.3;
        this.countdownText.setScale(scale);
        this.countdownText.setAlpha(0.5 + frac * 0.5);
      } else {
        this.countdownText.setVisible(false);
      }
    }

    if (scene.localEliminated && scene.playerSprite && scene.playerSprite.alpha > 0.3) {
      scene.playerSprite.setAlpha(0.3);
    }
  }

  updateSpellHUD() {
    const scene = this.scene;

    for (const slot of this.spellSlots) {
      const isLocked = scene.progression && scene.progression.slots[slot.key] === 'locked';
      const spellState = scene.progression ? scene.progression.spells[slot.key] : null;
      const spellId = spellState ? spellState.chosenSpell : null;
      const hasSpell = spellId !== null;

      slot.spellId = spellId;

      if (slot.lockOverlay) {
        if (isLocked !== slot._lastLocked) {
          slot.lockOverlay.setVisible(isLocked);
          if (slot.lockText) slot.lockText.setVisible(isLocked);
          slot._lastLocked = isLocked;
        }
      }

      if (slot.emptyText) {
        const showEmpty = !isLocked && !hasSpell;
        if (showEmpty !== slot._lastHasSpell) {
          slot.emptyText.setVisible(showEmpty);
          slot._lastHasSpell = showEmpty;
        }
      }

      if (isLocked) {
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
        if (slot.icon) { slot.icon.setVisible(false); }
        continue;
      }

      const def = hasSpell ? SPELLS[spellId] : null;
      if (def && def.icon) {
        // Track the normal icon key for this slot
        if (slot._currentIconKey !== def.icon) {
          this._slotSpellIcon[slot.key] = def.icon;
          // Invalidate cached total cooldown when spell changes
          if (spellId) this._totalCooldowns[spellId] = undefined;
        }

        const cd = hasSpell ? (scene.cooldowns[spellId] || 0) : 0;
        const isOnCooldown = cd > 0;

        // Determine which texture to show (normal or disabled)
        const normalKey = def.icon;
        const offKey = normalKey + '-off';
        const targetKey = isOnCooldown && scene.textures.exists(offKey) ? offKey : normalKey;

        if (!slot.icon || slot._currentIconKey !== targetKey) {
          if (slot.icon && !slot.icon.destroyed) slot.icon.destroy();
          if (scene.textures.exists(targetKey)) {
            slot.icon = scene.add.image(slot.x, slot.y, targetKey)
              .setScrollFactor(0).setDepth(101);
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

      if (hasSpell) {
        const cd = scene.cooldowns[spellId];
        if (cd && cd > 0) {
          // Get total cooldown for progress calculation
          if (!this._totalCooldowns[spellId]) {
            const tierLevel = (scene.progression && scene.progression.spells[slot.key])
              ? (scene.progression.spells[slot.key].tier || 0) : 0;
            const stats = computeSpellStats(spellId, tierLevel);
            this._totalCooldowns[spellId] = stats ? (stats.cooldown || 5000) : 5000;
          }
          const totalCd = this._totalCooldowns[spellId];
          const progress = Math.min(1, cd / totalCd); // 1 = full cooldown, 0 = ready

          // Draw radial sweep arc
          slot.cdOverlay.setVisible(true);
          slot.cdOverlay.clear();
          const cx = slot.cdOverlay._slotX;
          const cy = slot.cdOverlay._slotY;
          const radius = (slot.size - 4) / 2;
          const startAngle = -Math.PI / 2; // 12 o'clock
          const endAngle = startAngle + progress * Math.PI * 2;

          slot.cdOverlay.fillStyle(0x000000, 0.45);
          slot.cdOverlay.beginPath();
          slot.cdOverlay.moveTo(cx, cy);
          slot.cdOverlay.arc(cx, cy, radius, startAngle, endAngle, false);
          slot.cdOverlay.closePath();
          slot.cdOverlay.fillPath();

          // Cooldown text
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

          // Ready pulse: cooldown just ended
          if (this._lastCdWasActive[slot.key]) {
            this._lastCdWasActive[slot.key] = false;
            // Swap icon back to normal (will happen naturally on next frame via targetKey logic above)
            // Pulse scale animation
            if (slot.icon && !slot.icon.destroyed && slot.icon._baseScale) {
              scene.tweens.add({
                targets: slot.icon,
                scaleX: slot.icon._baseScale * 1.3,
                scaleY: slot.icon._baseScale * 1.3,
                duration: 150,
                yoyo: true,
                ease: 'Quad.easeOut',
              });
            }
          }
        }

        const charge = scene.charges[spellId];
        if (slot.chargeText) {
          if (charge && charge.max > 1) {
            slot.chargeText.setVisible(true);
            const chargeStr = `${charge.remaining}/${charge.max}`;
            const chargeColor = charge.remaining > 0 ? '#ffdd44' : '#ff4444';
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

    if (this.spText && scene.progression) {
      const spStr = `${scene.progression.sp}`;
      if (spStr !== this._lastSpText) {
        this.spText.setText(spStr);
        this._lastSpText = spStr;
      }
    }
  }

  // --- Leaderboard ---

  updateLeaderboard(scores, localPlayerId) {
    this._cachedScores = scores;
    this._cachedLocalPlayerId = localPlayerId;
    if (this._leaderboardVisible) {
      this._renderLeaderboard();
    }
  }

  toggleLeaderboard(show) {
    if (show === this._leaderboardVisible) return;
    this._leaderboardVisible = show;
    if (show) {
      // Build initial scores from scene players if no round has ended yet
      if (!this._cachedScores) {
        this._buildInitialScores();
      }
      this._renderLeaderboard();
    } else {
      this._hideLeaderboard();
    }
  }

  /** Build placeholder scores from scene player data before first round end. */
  _buildInitialScores() {
    const scene = this.scene;
    const scores = [];
    // Local player
    if (scene.localPlayerId) {
      scores.push({
        id: scene.localPlayerId,
        name: scene.playerName || 'Sen',
        points: 0,
        eliminations: 0,
      });
    }
    this._cachedLocalPlayerId = scene.localPlayerId;
    // Remote players
    if (scene.remotePlayers) {
      for (const [id, rp] of scene.remotePlayers) {
        scores.push({
          id,
          name: rp.name || id.slice(-4),
          points: 0,
          eliminations: 0,
        });
      }
    }
    if (scores.length > 0) {
      this._cachedScores = scores;
    }
  }

  _renderLeaderboard() {
    this._hideLeaderboard();
    if (!this._cachedScores || this._cachedScores.length === 0) return;

    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const sorted = [...this._cachedScores].sort((a, b) => b.points - a.points);

    const panelX = camW - 10;
    const panelY = 90;
    const rowH = 18;
    const panelW = 180;
    const panelH = 24 + sorted.length * rowH + 8;

    // Background — nineslice panel instead of rectangle
    const bg = scene.add.nineslice(panelX - panelW / 2, panelY + panelH / 2, 'ui-panel-2', null, panelW, panelH, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(140).setOrigin(0.5).setAlpha(0.85);
    this._leaderboardElements.push(bg);

    // Header
    const header = scene.add.text(panelX - panelW + 8, panelY + 4, 'PUAN TABLOSU', {
      fontSize: '12px', fontFamily: UI_FONT,
      fill: '#ffdd44',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(141);
    this._leaderboardElements.push(header);

    // Rows
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const isLocal = s.id === this._cachedLocalPlayerId;
      const color = isLocal ? '#44ddff' : '#cccccc';
      const y = panelY + 22 + i * rowH;
      const row = scene.add.text(panelX - panelW + 8, y,
        `${i + 1}. ${s.name}  ${s.points}p  ${s.eliminations}k`, {
        fontSize: '11px', fontFamily: UI_FONT,
        fill: color,
      }).setScrollFactor(0).setDepth(141);
      this._leaderboardElements.push(row);
    }
  }

  _hideLeaderboard() {
    for (const el of this._leaderboardElements) {
      if (el && !el.destroyed) el.destroy();
    }
    this._leaderboardElements = [];
  }

  // --- Spectator HUD ---

  updateSpectateHUD(playerName) {
    this._hideSpectateHUD();
    if (!playerName) return;

    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;

    const nameText = scene.add.text(camW / 2, camH - 110, `İzleniyor: ${playerName}`, {
      fontSize: '16px', fontFamily: UI_FONT,
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5);
    this._spectateElements.push(nameText);

    const hint = scene.add.text(camW / 2, camH - 90, 'Tıkla veya ← → ile değiştir', {
      fontSize: '12px', fontFamily: UI_FONT,
      fill: '#888899',
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5);
    this._spectateElements.push(hint);
  }

  _hideSpectateHUD() {
    for (const el of this._spectateElements) {
      if (el && !el.destroyed) el.destroy();
    }
    this._spectateElements = [];
  }

  update() {
    this.updateRingGraphics();
    this.updateHUD();
    this.updateRoundHUD();
    this.updateSpellHUD();
  }

  destroy() {
    // HUD elements
    const hudElements = [
      this.hpBarBg, this.hpBarFill, this.hpText,
      this.pingText, this.playerCountText,
      this.roundText, this.timerText, this.phaseText,
      this.countdownText, this.spText, this.spBg,
    ];
    for (const el of hudElements) {
      if (el && !el.destroyed) el.destroy();
    }

    // Spell HUD slots
    for (const slot of this.spellSlots) {
      const slotElements = [slot.bg, slot.icon, slot.cdOverlay, slot.cdText,
                            slot.lockOverlay, slot.lockText, slot.chargeText, slot.emptyText];
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
      for (const id of this.killFeedTimeouts) {
        clearTimeout(id);
      }
      this.killFeedTimeouts = [];
    }
    for (const t of this.killFeedTexts) {
      if (t && !t.destroyed) t.destroy();
    }
    this.killFeedTexts = [];

    // Announcement
    if (this.announcementText && !this.announcementText.destroyed) {
      this.announcementText.destroy();
    }

    // Leaderboard
    this._hideLeaderboard();

    // Spectator HUD
    this._hideSpectateHUD();
  }
}
