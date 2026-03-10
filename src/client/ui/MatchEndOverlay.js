/**
 * MatchEndOverlay.js — Match results screen (redesigned).
 *
 * Compact panel with winner highlight, scoreboard table, and action buttons.
 * All visuals use Ninja Adventure nineslice/sprite assets.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createSeparator, createText } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const PW = 400;
const PH = 360;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const PT = CY - PH / 2;
const PB = CY + PH / 2;
const PL = CX - PW / 2;
const PR = CX + PW / 2;
const PAD = SPACE.MD;

const RANK_COLORS = [COLOR.ACCENT_GOLD, '#cccccc', '#cc8844'];

// ─── MatchEndOverlay Class ───────────────────────────────
export class MatchEndOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════
  show(scores, localPlayerId) {
    if (this.visible) this.destroy();
    this.visible = true;
    this.build(scores, localPlayerId);
  }

  hide() {
    this.visible = false;
    this.destroy();
  }

  destroy() {
    for (const el of this.elements) {
      if (el && !el.destroyed) {
        if (el.removeAllListeners) el.removeAllListeners();
        el.destroy();
      }
    }
    this.elements = [];
  }

  playSfx(key) {
    try { this.scene.sound.play(key, { volume: 0.6 }); } catch (_) { /* */ }
  }

  // ═══════════════════════════════════════════════════════
  //  BUILD
  // ═══════════════════════════════════════════════════════
  build(scores, localPlayerId) {
    const s = this.scene;

    // Play jingle
    const isWinner = scores && scores.length > 0 && scores[0].id === localPlayerId;
    this.playSfx(isWinner ? 'jingle-success' : 'jingle-gameover');

    // Dimmer
    const dimmer = createDimmer(s, { depth: D, alpha: 0.7 });
    dimmer.setInteractive();
    this.elements.push(dimmer);

    // Main panel
    const panel = createPanel(s, CX, CY, PW, PH, { depth: D + 1, alpha: 0.92 });
    this.elements.push(panel);

    // ── Title ──
    let y = PT + 24;
    const title = createText(s, CX, y, 'ATIŞMA BİTTİ', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: D + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.elements.push(title);

    // ── Winner Section ──
    if (scores && scores.length > 0) {
      const winner = scores[0];
      y += 30;

      // Winner face
      const winnerCharId = winner.characterId || 'boy';
      const faceKey = `${winnerCharId}-face`;
      if (s.textures.exists(faceKey)) {
        const face = s.add.image(CX, y + 4, faceKey)
          .setScale(1.8).setScrollFactor(0).setDepth(D + 3);
        this.elements.push(face);
      }
      y += 30;

      // Winner name
      const winnerName = winner.name || winner.id.slice(-4);
      const name = createText(s, CX, y, winnerName, FONT.BODY_BOLD, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.elements.push(name);

      y += 16;
      const badge = createText(s, CX, y, 'KAZANAN', FONT.SMALL, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3,
      });
      this.elements.push(badge);
    }

    // ── Separator ──
    y += 16;
    const sep = createSeparator(s, CX, y, PW - 30, { depth: D + 2 });
    this.elements.push(sep);

    // ── Scoreboard Table ──
    y += 12;

    // Column positions
    const rankX = PL + 24;
    const faceX = PL + 50;
    const nameX = PL + 80;
    const ptsX  = PL + 260;
    const elimX = PL + 310;
    const winsX = PL + 360;

    // Header row
    const hdrStyle = textStyle(FONT.TINY, { fill: COLOR.TEXT_SECONDARY });
    const hdrEls = [
      s.add.text(rankX, y, '#', hdrStyle).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5),
      s.add.text(nameX, y, 'Âşık', hdrStyle).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5),
      s.add.text(ptsX, y, 'Puan', hdrStyle).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5),
      s.add.text(elimX, y, 'Düş', hdrStyle).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5),
      s.add.text(winsX, y, 'Fasıl', hdrStyle).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5),
    ];
    this.elements.push(...hdrEls);

    // Header divider
    y += 10;
    const hdrDiv = createSeparator(s, CX, y, PW - 40, { depth: D + 2 });
    this.elements.push(hdrDiv);
    y += 6;

    // Data rows
    const rowH = 18;
    const maxRows = Math.min(scores ? scores.length : 0, 8);

    for (let i = 0; i < maxRows; i++) {
      const p = scores[i];
      const ry = y + i * rowH;
      const isLocal = p.id === localPlayerId;
      const rankColor = RANK_COLORS[i] || COLOR.TEXT_SECONDARY;
      const nameColor = isLocal ? COLOR.ACCENT_INFO : COLOR.TEXT_PRIMARY;

      // Alternating row bg
      if (i % 2 === 0) {
        const rowBg = s.add.nineslice(CX, ry, 'ui-panel-interior', null, PW - 30, rowH, ...NINE.PANEL)
          .setScrollFactor(0).setDepth(D + 1).setAlpha(0.2);
        this.elements.push(rowBg);
      }

      // Local player highlight
      if (isLocal) {
        const highlight = s.add.nineslice(CX, ry, 'ui-focus', null, PW - 30, rowH, 2, 2, 2, 2)
          .setTint(0xf0c040).setAlpha(0.2).setScrollFactor(0).setDepth(D + 1);
        this.elements.push(highlight);
      }

      // Rank
      s.add.text(rankX + 8, ry, `${i + 1}`, textStyle(FONT.SMALL, {
        fill: rankColor, fontStyle: 'bold',
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(s.children.list[s.children.list.length - 1]);

      // Face icon
      const charId = p.characterId || 'boy';
      const faceKey = `${charId}-face`;
      if (s.textures.exists(faceKey)) {
        const faceIcon = s.add.image(faceX, ry, faceKey)
          .setScale(0.5).setScrollFactor(0).setDepth(D + 3);
        this.elements.push(faceIcon);
      }

      // Name
      const dispName = p.name || p.id.slice(-4);
      const nt = s.add.text(nameX, ry, dispName, textStyle(FONT.SMALL, {
        fill: nameColor, fontStyle: isLocal ? 'bold' : 'normal',
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
      this.elements.push(nt);

      // Points
      const pt = s.add.text(ptsX, ry, `${p.points ?? 0}`, textStyle(FONT.SMALL, {
        fill: COLOR.ACCENT_GOLD,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(pt);

      // Eliminations
      const el = s.add.text(elimX, ry, `${p.eliminations ?? 0}`, textStyle(FONT.SMALL, {
        fill: COLOR.ACCENT_DANGER,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(el);

      // Rounds won
      const rw = s.add.text(winsX, ry, `${p.roundsWon ?? 0}`, textStyle(FONT.SMALL, {
        fill: COLOR.ACCENT_SUCCESS,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(rw);
    }

    // ── Buttons ──
    const btnY = PB - 28;

    const { elements: menuEls } = createButton(s, CX - 80, btnY, 'Meydan', {
      width: 120, height: 26, depth: D + 3,
      onClick: () => { this.playSfx('sfx-accept'); this.returnToMenu(); },
    });
    this.elements.push(...menuEls);

    const { elements: playEls } = createButton(s, CX + 80, btnY, 'Bir Daha', {
      width: 120, height: 26, depth: D + 3,
      onClick: () => { this.playSfx('sfx-accept'); this.playAgain(); },
    });
    this.elements.push(...playEls);
  }

  // ═══════════════════════════════════════════════════════
  //  NAVIGATION
  // ═══════════════════════════════════════════════════════
  returnToMenu() {
    const scene = this.scene;
    if (scene.network) scene.network.disconnect();
    window.__networkConnected = false;
    scene.sound.stopAll();
    scene.cameras.main.fadeOut(400, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start('MenuScene');
    });
  }

  playAgain() {
    const scene = this.scene;
    if (scene.network) scene.network.disconnect();
    window.__networkConnected = false;
    scene.sound.stopAll();
    scene.cameras.main.fadeOut(400, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start('GameScene', {
        characterId: scene.characterId,
        playerName: scene.playerName,
        mode: scene.gameMode,
      });
    });
  }
}
