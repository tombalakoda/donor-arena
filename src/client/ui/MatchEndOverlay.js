/**
 * MatchEndOverlay.js — Match results screen.
 *
 * Compact panel with winner highlight, scoreboard table, and action buttons.
 * Entrance animations for a polished feel.
 * All visuals use Ninja Adventure nineslice/sprite assets.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createSeparator, createText, animateIn } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const PW = 480;
const PH = 440;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const PT = CY - PH / 2;
const PB = CY + PH / 2;
const PL = CX - PW / 2;

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
    const dimmer = createDimmer(s, { depth: D, alpha: ALPHA.DIMMER });
    dimmer.setInteractive();
    this.elements.push(dimmer);

    // Main panel — entrance animation
    const panel = createPanel(s, CX, CY, PW, PH, { depth: D + 1 });
    this.elements.push(panel);
    animateIn(s, panel, { from: 'scale', duration: 300 });

    // ── Title ──
    let y = PT + 26;
    const title = createText(s, CX, y, 'ATIŞMA BİTTİ', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: D + 2,
      stroke: '#000000', strokeThickness: 4,
    });
    this.elements.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 150, duration: 250 });

    // ── Winner Section ──
    if (scores && scores.length > 0) {
      const winner = scores[0];
      y += 34;

      // Winner face (bigger)
      const winnerCharId = winner.characterId || 'boy';
      const faceKey = `${winnerCharId}-face`;
      if (s.textures.exists(faceKey)) {
        const face = s.add.image(CX, y + 4, faceKey)
          .setScale(2.0).setScrollFactor(0).setDepth(D + 3);
        this.elements.push(face);
        animateIn(s, face, { from: 'scale', delay: 250, duration: 300 });
      }
      y += 34;

      // Winner name
      const winnerName = winner.name || winner.id.slice(-4);
      const name = createText(s, CX, y, winnerName, FONT.TITLE_SM, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3,
        stroke: '#000000', strokeThickness: 3,
      });
      this.elements.push(name);
      animateIn(s, name, { from: 'slideUp', delay: 350, duration: 250 });

      y += 18;
      const badge = createText(s, CX, y, '★ KAZANAN ★', FONT.SMALL, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3,
      });
      this.elements.push(badge);

      // Gentle pulse on winner badge
      s.tweens.add({
        targets: badge, alpha: { from: 0.7, to: 1 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // ── Separator ──
    y += 18;
    const sep = createSeparator(s, CX, y, PW - 30, { depth: D + 2 });
    this.elements.push(sep);

    // ── Scoreboard Table ──
    y += 14;

    // Column positions
    const rankX = PL + 26;
    const faceX = PL + 52;
    const nameX = PL + 82;
    const ptsX  = PL + 270;
    const elimX = PL + 325;
    const winsX = PL + 380;

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
    y += 12;
    const hdrDiv = createSeparator(s, CX, y, PW - 40, { depth: D + 2 });
    this.elements.push(hdrDiv);
    y += 8;

    // Data rows
    const rowH = 24;
    const maxRows = Math.min(scores ? scores.length : 0, 8);

    for (let i = 0; i < maxRows; i++) {
      const p = scores[i];
      const ry = y + i * rowH;
      const isLocal = p.id === localPlayerId;
      const rankColor = RANK_COLORS[i] || COLOR.TEXT_SECONDARY;
      const nameColor = isLocal ? COLOR.TEXT_ICE : COLOR.TEXT_PRIMARY;

      // Alternating row bg (icy tint)
      if (i % 2 === 0) {
        const rowBg = s.add.graphics().setScrollFactor(0).setDepth(D + 1);
        rowBg.fillStyle(0xb8e4f0, 0.12);
        rowBg.fillRoundedRect(CX - (PW - 30) / 2, ry - rowH / 2, PW - 30, rowH, 3);
        this.elements.push(rowBg);
      }

      // Local player highlight
      if (isLocal) {
        const highlight = s.add.nineslice(CX, ry, 'ui-focus', null, PW - 30, rowH, 2, 2, 2, 2)
          .setTint(COLOR.TINT_GOLD).setAlpha(ALPHA.HINT).setScrollFactor(0).setDepth(D + 1);
        this.elements.push(highlight);
      }

      // Rank
      const rankText = s.add.text(rankX + 8, ry, `${i + 1}`, textStyle(FONT.SMALL, {
        fill: rankColor, fontStyle: 'bold',
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(rankText);

      // Face icon
      const charId = p.characterId || 'boy';
      const fKey = `${charId}-face`;
      if (s.textures.exists(fKey)) {
        const faceIcon = s.add.image(faceX, ry, fKey)
          .setScale(0.55).setScrollFactor(0).setDepth(D + 3);
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

      // Row entrance animation — staggered
      const rowDelay = 400 + i * 60;
      [rankText, nt, pt, el, rw].forEach(txt => {
        animateIn(s, txt, { from: 'fadeOnly', delay: rowDelay, duration: 200 });
      });
    }

    // ── Buttons ──
    const btnY = PB - 30;

    const { elements: menuEls } = createButton(s, CX - 95, btnY, 'Meydan', {
      width: 145, height: 38, depth: D + 3,
      onClick: () => { this.playSfx('sfx-accept'); this.returnToMenu(); },
    });
    this.elements.push(...menuEls);
    menuEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 600, duration: 250 }));

    const { elements: playEls } = createButton(s, CX + 95, btnY, 'Bir Daha', {
      width: 145, height: 38, depth: D + 3,
      onClick: () => { this.playSfx('sfx-accept'); this.playAgain(); },
    });
    this.elements.push(...playEls);
    playEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 650, duration: 250 }));
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
