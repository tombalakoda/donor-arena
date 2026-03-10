/**
 * LobbyOverlay.js — Waiting room overlay (redesigned).
 *
 * Compact 320×280 panel with 2×4 player grid, title bar with count,
 * optional BAŞLAT button for host, rotating tip text.
 * All visuals use Ninja Adventure nineslice/sprite assets.
 */

import { CHARACTERS } from '../scenes/BootScene.js';
import { MATCH } from '../../shared/constants.js';
import { TIPS } from '../config.js';
import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createSeparator, createText } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const SLOT_COLOR_GOLD = 0xf0c040;
const D = DEPTH.OVERLAY_DIM;
const PW = 340;
const PH = 290;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const PT = CY - PH / 2;
const PB = CY + PH / 2;

// ─── LobbyOverlay Class ─────────────────────────────────
export class LobbyOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
    this.playerSlots = [];
    this.countText = null;
    this.tipText = null;
    this.tipIndex = 0;
    this.tipTimer = null;

    // Lobby mode state
    this.lobbyMode = false;
    this.isHost = false;
    this.hostId = null;
    this.startButtonElements = [];
    this.titleText = null;
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════
  show() {
    if (this.visible) return;
    this.visible = true;
    this.build();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.destroy();
  }

  destroy() {
    if (this.tipTimer) {
      this.tipTimer.destroy();
      this.tipTimer = null;
    }
    for (const el of this.elements) {
      if (el && !el.destroyed) {
        if (el.removeAllListeners) el.removeAllListeners();
        el.destroy();
      }
    }
    this.elements = [];
    this.playerSlots = [];
    this.countText = null;
    this.tipText = null;
    this.titleText = null;
    this.startButtonElements = [];
  }

  /**
   * Show in lobby mode (with host controls).
   */
  showLobbyMode(players, isHost, hostId) {
    if (this.visible) {
      this.visible = false;
      this.destroy();
    }
    this.lobbyMode = true;
    this.isHost = isHost;
    this.hostId = hostId;
    this.show();
    this.buildLobbyExtras();
    this.updatePlayers(players);
  }

  /**
   * Update lobby mode with new player list.
   */
  updateLobbyMode(players, isHost, hostId) {
    this.isHost = isHost;
    this.hostId = hostId;
    this.updatePlayers(players);
    for (const el of this.startButtonElements) {
      if (el && !el.destroyed) el.setVisible(this.isHost);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  BUILD
  // ═══════════════════════════════════════════════════════
  build() {
    const s = this.scene;

    // Dimmer
    const dimmer = createDimmer(s, { depth: D, alpha: 0.6 });
    dimmer.setInteractive();
    this.elements.push(dimmer);

    // Main panel
    const panelH = this.lobbyMode ? PH + 20 : PH;
    const panel = createPanel(s, CX, CY, PW, panelH, {
      depth: D + 1, alpha: ALPHA.PANEL,
    });
    this.elements.push(panel);

    // ── Title bar ──
    const titleY = PT + 22;
    const titleBar = s.add.nineslice(CX, titleY, 'ui-panel-interior', null, PW - 20, 26, ...NINE.PANEL)
      .setScrollFactor(0).setDepth(D + 2).setAlpha(0.6);
    this.elements.push(titleBar);

    const titleLabel = this.lobbyMode ? 'BEKLEME ODASI' : 'ÂŞIKLAR BEKLENİYOR';
    this.titleText = createText(s, CX - PW / 2 + 20, titleY, titleLabel, FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 1,
    });
    this.elements.push(this.titleText);

    // Pulsing dots (non-lobby mode)
    if (!this.lobbyMode) {
      let dots = 0;
      const dotsTimer = s.time.addEvent({
        delay: 500, loop: true,
        callback: () => {
          dots = (dots + 1) % 4;
          if (this.titleText && !this.titleText.destroyed) {
            this.titleText.setText('ÂŞIKLAR BEKLENİYOR' + '.'.repeat(dots));
          }
        },
      });
      this.elements.push(dotsTimer);
    }

    // Player count (right side of title bar)
    this.countText = createText(s, CX + PW / 2 - 20, titleY, `0/${MATCH.MAX_PLAYERS}`, FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_INFO, depth: D + 3, originX: 1,
    });
    this.elements.push(this.countText);

    // ── Player grid (2×4) ──
    const slotSize = 44;
    const gap = 8;
    const gridCols = 4;
    const gridRows = 2;
    const gridW = gridCols * slotSize + (gridCols - 1) * gap;
    const gridStartX = CX - gridW / 2 + slotSize / 2;
    const gridStartY = titleY + 36;

    this.playerSlots = [];
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const sx = gridStartX + col * (slotSize + gap);
        const sy = gridStartY + row * (slotSize + gap + 14);

        // Focus highlight (behind, hidden by default)
        const focus = s.add.nineslice(sx, sy, 'ui-focus', null, slotSize + 4, slotSize + 4, 2, 2, 2, 2)
          .setTint(SLOT_COLOR_GOLD).setScrollFactor(0).setDepth(D + 2).setVisible(false);
        this.elements.push(focus);

        // Slot cell
        const cell = s.add.nineslice(sx, sy, 'ui-inventory-cell', null, slotSize, slotSize, ...NINE.CELL)
          .setScrollFactor(0).setDepth(D + 2).setAlpha(0.7);
        this.elements.push(cell);

        // Placeholder
        const placeholder = createText(s, sx, sy, '?', FONT.TITLE_SM, {
          fill: COLOR.TEXT_DISABLED, depth: D + 3,
        });
        this.elements.push(placeholder);

        // Name text (below slot)
        const nameText = s.add.text(sx, sy + slotSize / 2 + 6, '', textStyle(FONT.TINY, {
          fill: COLOR.TEXT_SECONDARY,
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.elements.push(nameText);

        this.playerSlots.push({
          bg: cell, focusHighlight: focus, placeholder,
          nameText, faceSprite: null,
        });
      }
    }

    // ── Tip text ──
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
    this.tipText = s.add.text(CX, PB - 14, TIPS[this.tipIndex], textStyle(FONT.TINY, {
      fill: COLOR.TEXT_DISABLED,
      wordWrap: { width: PW - 30 }, align: 'center',
    })).setScrollFactor(0).setDepth(D + 2).setOrigin(0.5, 1);
    this.elements.push(this.tipText);

    this.tipTimer = s.time.addEvent({
      delay: 3500, loop: true,
      callback: () => {
        this.tipIndex = (this.tipIndex + 1) % TIPS.length;
        if (this.tipText && !this.tipText.destroyed) {
          this.tipText.setText(TIPS[this.tipIndex]);
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  LOBBY EXTRAS — start button for host
  // ═══════════════════════════════════════════════════════
  buildLobbyExtras() {
    const s = this.scene;
    const btnY = CY + PH / 2 - 44;

    const { elements } = createButton(s, CX, btnY, 'BAŞLAT', {
      width: 140, height: 28, depth: D + 5,
      onClick: () => {
        if (s.network) s.network.sendStartGame();
      },
    });

    for (const el of elements) {
      el.setVisible(this.isHost);
      this.elements.push(el);
    }
    this.startButtonElements = elements;
  }

  // ═══════════════════════════════════════════════════════
  //  UPDATE PLAYERS
  // ═══════════════════════════════════════════════════════
  updatePlayers(players) {
    if (!this.visible) return;

    // Update count
    if (this.countText && !this.countText.destroyed) {
      this.countText.setText(`${players.length}/${MATCH.MAX_PLAYERS}`);
    }

    // Update slots
    for (let i = 0; i < this.playerSlots.length; i++) {
      const slot = this.playerSlots[i];
      const player = players[i];

      if (player) {
        // Show player
        slot.placeholder.setVisible(false);
        const displayName = player.name || player.id.slice(-4);
        const isHostPlayer = this.lobbyMode && player.id === this.hostId;

        slot.nameText.setText(isHostPlayer ? `_${displayName}_` : displayName);
        slot.nameText.setFill(isHostPlayer ? COLOR.ACCENT_GOLD : COLOR.TEXT_SECONDARY);
        slot.bg.setTint(0xbbbbaa);
        slot.focusHighlight.setVisible(true);

        // Face sprite
        if (!slot.faceSprite) {
          const charId = player.characterId || 'boy';
          const faceKey = `${charId}-face`;
          if (this.scene.textures.exists(faceKey)) {
            slot.faceSprite = this.scene.add.image(slot.bg.x, slot.bg.y - 4, faceKey)
              .setScale(1.4).setScrollFactor(0).setDepth(slot.bg.depth + 1);
          } else {
            slot.faceSprite = this.scene.add.sprite(slot.bg.x, slot.bg.y - 4, `${charId}-idle`, 0)
              .setScale(2.5).setScrollFactor(0).setDepth(slot.bg.depth + 1);
          }
          this.elements.push(slot.faceSprite);
        }
      } else {
        // Empty slot
        slot.placeholder.setVisible(true);
        slot.nameText.setText('');
        slot.bg.clearTint();
        slot.focusHighlight.setVisible(false);

        if (slot.faceSprite) {
          slot.faceSprite.destroy();
          slot.faceSprite = null;
        }
      }
    }
  }
}
