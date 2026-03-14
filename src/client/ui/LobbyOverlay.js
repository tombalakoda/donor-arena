/**
 * LobbyOverlay.js — Waiting room overlay.
 *
 * Compact panel with 2×4 player grid, title bar with count,
 * optional BAŞLAT button for host, rotating tip text.
 * All visuals use Ninja Adventure nineslice/sprite assets.
 * Text: Press Start 2P, white, black stroke.
 */

import { CHARACTERS } from '../scenes/BootScene.js';
import { MATCH } from '../../shared/constants.js';
import { TIPS } from '../config.js';
import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createSeparator, createText, createIcyFrame, animateIn } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const SLOT_COLOR_GOLD = 0xf0c040;
const D = DEPTH.OVERLAY_DIM;
const PW = 500;
const PH = 420;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const PT = CY - PH / 2;
const PB = CY + PH / 2;

// Consistent style: Press Start 2P, white text
const PS2P = FONT.FAMILY_HEADING;
const WHITE = '#FFFFFF';

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
      depth: D + 1,
    });
    this.elements.push(panel);
    animateIn(s, panel, { from: 'scale', duration: 250 });

    // ── Title bar (icy frame) ──
    const titleY = PT + 24;
    const titleBar = createIcyFrame(s, CX, titleY, PW - 20, 40, D + 2, 0.18);
    this.elements.push(titleBar);

    const titleLabel = this.lobbyMode ? 'BEKLEME ODASI' : 'ÂŞIKLAR BEKLENİYOR';
    this.titleText = createText(s, CX - PW / 2 + 22, titleY, titleLabel, { fontSize: '16px', fontFamily: PS2P }, {
      fill: WHITE, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 3,
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

    // Player count
    this.countText = createText(s, CX + PW / 2 - 22, titleY, `0/${MATCH.MAX_PLAYERS}`, { fontSize: '14px', fontFamily: PS2P }, {
      fill: WHITE, depth: D + 3, originX: 1,
      stroke: '#000000', strokeThickness: 2,
    });
    this.elements.push(this.countText);

    // ── Player grid (2×4) ──
    const slotSize = 66;
    const gap = 14;
    const gridCols = 4;
    const gridRows = 2;
    const gridW = gridCols * slotSize + (gridCols - 1) * gap;
    const gridStartX = CX - gridW / 2 + slotSize / 2;
    const gridStartY = titleY + 42;

    this.playerSlots = [];
    let slotIdx = 0;
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const sx = gridStartX + col * (slotSize + gap);
        const sy = gridStartY + row * (slotSize + gap + 16);

        // Focus highlight
        const focus = s.add.nineslice(sx, sy, 'ui-focus', null, slotSize + 4, slotSize + 4, 2, 2, 2, 2)
          .setTint(SLOT_COLOR_GOLD).setScrollFactor(0).setDepth(D + 2).setVisible(false);
        this.elements.push(focus);

        // Slot cell
        const cell = s.add.nineslice(sx, sy, 'ui-inventory-cell', null, slotSize, slotSize, ...NINE.CELL)
          .setScrollFactor(0).setDepth(D + 2).setAlpha(0.8);
        this.elements.push(cell);

        // Entrance animation — staggered
        animateIn(s, cell, { from: 'scale', delay: 100 + slotIdx * 40, duration: 200 });

        // Placeholder
        const placeholder = createText(s, sx, sy, '?', { fontSize: '24px', fontFamily: PS2P }, {
          fill: WHITE, depth: D + 3, alpha: 0.3,
        });
        this.elements.push(placeholder);

        // Name text (below slot)
        const nameText = s.add.text(sx, sy + slotSize / 2 + 7, '', textStyle({ fontSize: '10px', fontFamily: PS2P }, {
          fill: WHITE,
          stroke: '#000000', strokeThickness: 2,
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.elements.push(nameText);

        this.playerSlots.push({
          bg: cell, focusHighlight: focus, placeholder,
          nameText, faceSprite: null,
        });
        slotIdx++;
      }
    }

    // ── Tip text ──
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
    this.tipText = s.add.text(CX, PB - 12, TIPS[this.tipIndex], textStyle({ fontSize: '8px', fontFamily: PS2P }, {
      fill: WHITE, alpha: 0.5,
      wordWrap: { width: PW - 30 }, align: 'center',
      stroke: '#000000', strokeThickness: 2,
    })).setScrollFactor(0).setDepth(D + 2).setOrigin(0.5, 1);
    this.elements.push(this.tipText);

    this.tipTimer = s.time.addEvent({
      delay: 3500, loop: true,
      callback: () => {
        this.tipIndex = (this.tipIndex + 1) % TIPS.length;
        if (this.tipText && !this.tipText.destroyed) {
          // Fade transition
          s.tweens.add({
            targets: this.tipText, alpha: 0, duration: 150,
            onComplete: () => {
              if (this.tipText && !this.tipText.destroyed) {
                this.tipText.setText(TIPS[this.tipIndex]);
                s.tweens.add({ targets: this.tipText, alpha: 0.5, duration: 150 });
              }
            },
          });
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  LOBBY EXTRAS — start button for host
  // ═══════════════════════════════════════════════════════
  buildLobbyExtras() {
    const s = this.scene;
    const btnY = CY + PH / 2 - 40;

    const { elements } = createButton(s, CX, btnY, 'BAŞLAT', {
      width: 190, height: 40, depth: D + 5,
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
        slot.placeholder.setVisible(false);
        const displayName = player.name || player.id.slice(-4);
        const isHostPlayer = this.lobbyMode && player.id === this.hostId;

        slot.nameText.setText(isHostPlayer ? `★${displayName}` : displayName);
        slot.nameText.setFill(WHITE);
        slot.bg.setTint(0xbbbbaa);
        slot.focusHighlight.setVisible(true);

        // Face sprite
        if (!slot.faceSprite) {
          const charId = player.characterId || 'boy';
          const faceKey = `${charId}-face`;
          if (this.scene.textures.exists(faceKey)) {
            slot.faceSprite = this.scene.add.image(slot.bg.x, slot.bg.y - 2, faceKey)
              .setScale(1.5).setScrollFactor(0).setDepth(slot.bg.depth + 1);
          } else {
            slot.faceSprite = this.scene.add.sprite(slot.bg.x, slot.bg.y - 2, `${charId}-idle`, 0)
              .setScale(2.5).setScrollFactor(0).setDepth(slot.bg.depth + 1);
          }
          this.elements.push(slot.faceSprite);

          // Pop-in animation for new player
          animateIn(this.scene, slot.faceSprite, { from: 'scale', duration: 200 });
        }
      } else {
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
