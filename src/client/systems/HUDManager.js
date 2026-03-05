import Phaser from 'phaser';
import { PLAYER, ARENA } from '../../shared/constants.js';
import { SPELLS } from '../../shared/spellData.js';

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

    // Ring
    this.ringGraphics = null;
    this.outerRingGraphics = null;
    this.lastDrawnRingRadius = -1;
    this.edgeVignette = null;
    this._lastVignetteDistToEdge = null;

    // HUD text caches (avoid redundant setText calls)
    this._lastPing = null;
    this._lastPlayerCount = null;
    this._lastHpText = null;
    this._lastHpRatio = null;

    // Misc
    this.announcementText = null;
  }

  createHUD() {
    const scene = this.scene;
    this.pingText = scene.add.text(10, 10, 'Ping: --', {
      fontSize: '14px',
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100);

    this.playerCountText = scene.add.text(10, 28, 'Players: 0', {
      fontSize: '14px',
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100);

    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    this.hpBarBg = scene.add.rectangle(camW / 2, 20, 204, 14, 0x333333)
      .setScrollFactor(0).setDepth(100).setOrigin(0.5);
    this.hpBarFill = scene.add.rectangle(camW / 2 - 100, 20, 200, 10, 0x44dd44)
      .setScrollFactor(0).setDepth(101).setOrigin(0, 0.5);
    this.hpText = scene.add.text(camW / 2, 20, '100/100', {
      fontSize: '10px',
      fill: '#ffffff',
    }).setScrollFactor(0).setDepth(102).setOrigin(0.5);

    this.roundText = scene.add.text(camW - 10, 10, 'Round 0/20', {
      fontSize: '14px',
      fill: '#ffdd44',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.timerText = scene.add.text(camW - 10, 28, '60s', {
      fontSize: '14px',
      fill: '#88ccff',
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 0);

    this.phaseText = scene.add.text(camW / 2, 40, '', {
      fontSize: '12px',
      fill: '#aaaaaa',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    this.countdownText = scene.add.text(camW / 2, camH / 2 - 40, '', {
      fontSize: '64px',
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setScrollFactor(0).setDepth(250).setOrigin(0.5).setVisible(false);

    this.createSoundToggle(camW);
  }

  createSoundToggle(camW) {
    const scene = this.scene;
    const isMuted = scene.sound.mute;
    const btnSize = 28;
    const x = camW - 24;
    const y = 52;

    const bg = scene.add.rectangle(x, y, btnSize, btnSize, 0x1a1428, 0.8)
      .setScrollFactor(0).setDepth(100).setStrokeStyle(1, 0x3d2e1e);

    const icon = scene.add.text(x, y, isMuted ? '🔇' : '🔊', {
      fontSize: '14px',
    }).setScrollFactor(0).setDepth(101).setOrigin(0.5);

    const hitArea = scene.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0)
      .setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => bg.setStrokeStyle(1, 0xffdd44));
    hitArea.on('pointerout', () => bg.setStrokeStyle(1, 0x3d2e1e));
    hitArea.on('pointerdown', () => {
      scene.sound.mute = !scene.sound.mute;
      localStorage.setItem('soundMuted', scene.sound.mute);
      icon.setText(scene.sound.mute ? '🔇' : '🔊');
    });
  }

  createSpellHUD() {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const slotSize = 48;
    const slotGap = 8;
    const totalWidth = 4 * slotSize + 3 * slotGap;
    const startX = (camW - totalWidth) / 2;
    const slotY = camH - 60;

    const slots = ['Q', 'W', 'E', 'R'];

    for (let i = 0; i < slots.length; i++) {
      const key = slots[i];
      const x = startX + i * (slotSize + slotGap) + slotSize / 2;

      const bg = scene.add.rectangle(x, slotY, slotSize, slotSize, 0x222233, 0.8)
        .setScrollFactor(0).setDepth(100).setStrokeStyle(2, 0x445566);

      let icon = null;

      const cdOverlay = scene.add.rectangle(x, slotY, slotSize - 4, slotSize - 4, 0x000000, 0.6)
        .setScrollFactor(0).setDepth(102).setVisible(false);

      const cdText = scene.add.text(x, slotY, '', {
        fontSize: '14px',
        fill: '#ffffff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(103).setOrigin(0.5).setVisible(false);

      scene.add.text(x - slotSize / 2 + 4, slotY - slotSize / 2 + 2, key, {
        fontSize: '10px',
        fill: '#aaccff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(103);

      const lockOverlay = scene.add.rectangle(x, slotY, slotSize - 2, slotSize - 2, 0x111111, 0.8)
        .setScrollFactor(0).setDepth(104).setVisible(false);
      const lockText = scene.add.text(x, slotY, '🔒', {
        fontSize: '16px',
        fill: '#555555',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(105).setOrigin(0.5).setVisible(false);

      const emptyText = scene.add.text(x, slotY, '?', {
        fontSize: '18px',
        fill: '#555555',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(105).setOrigin(0.5).setVisible(false);

      const chargeText = scene.add.text(x + slotSize / 2 - 4, slotY + slotSize / 2 - 4, '', {
        fontSize: '10px',
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

    this.spText = scene.add.text(camW / 2, slotY + slotSize / 2 + 8, 'SP: 0', {
      fontSize: '12px',
      fill: '#44ddff',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    if (scene.gameMode === 'sandbox') {
      scene.add.text(camW / 2, slotY + slotSize / 2 + 24, 'Press B to open Shop', {
        fontSize: '11px',
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
      fontSize: '28px',
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
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
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
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
    const y = 60 + this.killFeedTexts.length * 18;
    const feedText = scene.add.text(camW - 10, y, text, {
      fontSize: '12px',
      fill: '#ff8888',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(150).setOrigin(1, 0);

    this.killFeedTexts.push(feedText);

    if (this.killFeedTexts.length > 5) {
      const old = this.killFeedTexts.shift();
      old.destroy();
      this.killFeedTexts.forEach((t, i) => {
        t.setY(60 + i * 18);
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
          t.setY(60 + i * 18);
        });
      }
    }, 4000);
    this.killFeedTimeouts.push(timeoutId);
  }

  updateRingGraphics() {
    const scene = this.scene;
    const r = Math.round(scene.ringRadius);

    const g = this.ringGraphics;
    if (!g) return;
    g.clear();

    const pulse = 0.5 + 0.5 * Math.sin(scene.time.now * 0.004);

    g.lineStyle(2, 0xff6666, 0.1 + pulse * 0.05);
    g.strokeCircle(0, 0, r - 8);

    g.lineStyle(3, 0xff4444, 0.6 + pulse * 0.3);
    g.strokeCircle(0, 0, r);

    const bandSteps = 5;
    for (let i = 1; i <= bandSteps; i++) {
      const t = i / bandSteps;
      const alpha = (0.35 - t * 0.3) * (0.7 + pulse * 0.3);
      g.lineStyle(4, 0xff2222, Math.max(0, alpha));
      g.strokeCircle(0, 0, r + i * 8);
    }

    if (r !== this.lastDrawnRingRadius && this.outerRingGraphics) {
      this.outerRingGraphics.clear();
      this.outerRingGraphics.lineStyle(1, 0xcc4444, 0.06);
      for (let dr = r + 60; dr < ARENA.FLOOR_SIZE / 2; dr += 60) {
        this.outerRingGraphics.strokeCircle(0, 0, dr);
      }
    }

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

      if (distToEdge < 80 && distToEdge > -50) {
        const danger = 1 - Math.max(0, distToEdge) / 80;
        this.edgeVignette.setAlpha(danger * 0.15 * (0.7 + pulse * 0.3));
      } else if (distToEdge <= -50) {
        this.edgeVignette.setAlpha(0.2 + pulse * 0.1);
      } else {
        this.edgeVignette.setAlpha(0);
      }
    }

    this.lastDrawnRingRadius = r;
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
        this.playerCountText.setText(`Players: ${totalPlayers}`);
        this._lastPlayerCount = totalPlayers;
      }
    }

    if (this.hpBarFill) {
      const hpRatio = Math.max(0, scene.localHp / scene.localMaxHp);

      // Only update bar width, color, and text when HP ratio changes
      if (hpRatio !== this._lastHpRatio) {
        this._lastHpRatio = hpRatio;
        this.hpBarFill.width = 200 * hpRatio;
        if (hpRatio > 0.75) {
          this.hpBarFill.fillColor = 0x44bbff;
        } else if (hpRatio > 0.5) {
          this.hpBarFill.fillColor = 0xdddd44;
        } else if (hpRatio > 0.25) {
          this.hpBarFill.fillColor = 0xff8833;
        } else {
          this.hpBarFill.fillColor = 0xff3333;
        }
        const vulnPercent = Math.round((1 - hpRatio) * 100);
        this.hpText.setText(`${Math.ceil(scene.localHp)} HP  (${vulnPercent}% vuln)`);
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
      if (scene.gameMode === 'sandbox') {
        this.roundText.setText('SANDBOX');
      } else {
        this.roundText.setText(`Round ${scene.roundNumber}/${scene.totalRounds}`);
      }
    }

    if (this.timerText) {
      if (scene.phase === 'playing') {
        const seconds = Math.ceil(scene.timeRemaining);
        this.timerText.setText(`${seconds}s`);
        this.timerText.setFill(seconds <= 10 ? '#ff4444' : '#88ccff');
      } else if (scene.phase === 'shop') {
        const seconds = Math.ceil(scene.shopTimeRemaining);
        this.timerText.setText(`Shop: ${seconds}s`);
        this.timerText.setFill('#ffdd44');
      } else {
        this.timerText.setText('');
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
        waiting: 'Waiting for players...',
        countdown: '',
        playing: '',
        roundEnd: 'Round Over',
        shop: 'Shop Phase',
        matchEnd: 'Match Complete',
      };
      this.phaseText.setText(phaseLabels[scene.phase] || '');
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

      if (slot.lockOverlay && slot.lockText) {
        slot.lockOverlay.setVisible(isLocked);
        slot.lockText.setVisible(isLocked);
      }

      if (slot.emptyText) {
        slot.emptyText.setVisible(!isLocked && !hasSpell);
      }

      if (isLocked) {
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
        if (slot.icon) { slot.icon.setVisible(false); }
        continue;
      }

      const def = hasSpell ? SPELLS[spellId] : null;
      if (def && def.icon) {
        if (!slot.icon || slot._currentIconKey !== def.icon) {
          if (slot.icon && !slot.icon.destroyed) slot.icon.destroy();
          if (scene.textures.exists(def.icon)) {
            slot.icon = scene.add.image(slot.x, slot.y, def.icon)
              .setScrollFactor(0).setDepth(101);
            const iconScale = (slot.size - 8) / Math.max(slot.icon.width, slot.icon.height);
            slot.icon.setScale(iconScale);
          } else {
            slot.icon = null;
          }
          slot._currentIconKey = def.icon;
        }
        if (slot.icon) slot.icon.setVisible(true).setAlpha(1);
      } else {
        if (slot.icon && !slot.icon.destroyed) slot.icon.setVisible(false);
      }

      if (hasSpell) {
        const cd = scene.cooldowns[spellId];
        if (cd && cd > 0) {
          slot.cdOverlay.setVisible(true);
          slot.cdText.setVisible(true);
          slot.cdText.setText((cd / 1000).toFixed(1));
        } else {
          slot.cdOverlay.setVisible(false);
          slot.cdText.setVisible(false);
        }

        const charge = scene.charges[spellId];
        if (slot.chargeText) {
          if (charge && charge.max > 1) {
            slot.chargeText.setVisible(true);
            slot.chargeText.setText(`${charge.remaining}/${charge.max}`);
            slot.chargeText.setColor(charge.remaining > 0 ? '#ffdd44' : '#ff4444');
          } else {
            slot.chargeText.setVisible(false);
          }
        }
      } else {
        slot.cdOverlay.setVisible(false);
        slot.cdText.setVisible(false);
        if (slot.chargeText) slot.chargeText.setVisible(false);
      }
    }

    if (this.spText && scene.progression) {
      this.spText.setText(`SP: ${scene.progression.sp}`);
    }
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
      this.countdownText, this.spText,
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
  }
}
