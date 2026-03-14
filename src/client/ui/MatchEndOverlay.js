/**
 * MatchEndOverlay.js — Match results screen.
 *
 * Compact panel with winner highlight, scoreboard table, and action buttons.
 * Entrance animations for a polished feel.
 * Text: Press Start 2P, white, black stroke.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createSeparator, createText, animateIn } from './UIHelpers.js';
import { getSfxVolume } from '../config.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const PW = 600;
const PH = 560;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const PT = CY - PH / 2;
const PB = CY + PH / 2;
const PL = CX - PW / 2;

// Consistent style
const PS2P = FONT.FAMILY_HEADING;
const WHITE = '#FFFFFF';

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
    try { this.scene.sound.play(key, { volume: 0.6 * getSfxVolume() }); } catch (_) { /* */ }
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
    const title = createText(s, CX, y, 'ATIŞMA BİTTİ', FONT.H2, {
      fill: WHITE, depth: D + 2,
      stroke: '#000000', strokeThickness: 3,
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
          .setScale(2.5).setScrollFactor(0).setDepth(D + 3);
        this.elements.push(face);
        animateIn(s, face, { from: 'scale', delay: 250, duration: 300 });
      }
      y += 34;

      // Winner name
      const winnerName = winner.name || winner.id.slice(-4);
      const name = createText(s, CX, y, winnerName, { fontSize: '16px', fontFamily: PS2P }, {
        fill: WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 3,
      });
      this.elements.push(name);
      animateIn(s, name, { from: 'slideUp', delay: 350, duration: 250 });

      y += 18;
      const badge = createText(s, CX, y, '★ KAZANAN ★', { fontSize: '12px', fontFamily: PS2P }, {
        fill: WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
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
    const rankX = PL + 30;
    const faceX = PL + 62;
    const nameX = PL + 98;
    const ptsX  = PL + 345;
    const elimX = PL + 420;
    const winsX = PL + 500;

    // Header row
    const hdrStyle = textStyle({ fontSize: '10px', fontFamily: PS2P }, { fill: WHITE, alpha: 0.6, stroke: '#000000', strokeThickness: 2 });
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
    const rowH = 34;
    const maxRows = Math.min(scores ? scores.length : 0, 8);

    for (let i = 0; i < maxRows; i++) {
      const p = scores[i];
      const ry = y + i * rowH;
      const isLocal = p.id === localPlayerId;

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
      const rankText = s.add.text(rankX + 8, ry, `${i + 1}`, textStyle({ fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE,
        stroke: '#000000', strokeThickness: 2,
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
      const nt = s.add.text(nameX, ry, dispName, textStyle({ fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE, fontStyle: isLocal ? 'bold' : 'normal',
        stroke: '#000000', strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
      this.elements.push(nt);

      // Points
      const pt = s.add.text(ptsX, ry, `${p.points ?? 0}`, textStyle({ fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE,
        stroke: '#000000', strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(pt);

      // Eliminations
      const el = s.add.text(elimX, ry, `${p.eliminations ?? 0}`, textStyle({ fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE,
        stroke: '#000000', strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
      this.elements.push(el);

      // Rounds won
      const rw = s.add.text(winsX, ry, `${p.roundsWon ?? 0}`, textStyle({ fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE,
        stroke: '#000000', strokeThickness: 2,
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

    const { elements: menuEls } = createButton(s, CX - 115, btnY, 'Meydan', {
      width: 180, height: 46, depth: D + 3,
      onClick: () => { this.playSfx('sfx-accept'); this.returnToMenu(); },
    });
    this.elements.push(...menuEls);
    menuEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 600, duration: 250 }));

    const { elements: playEls } = createButton(s, CX + 115, btnY, 'Bir Daha', {
      width: 180, height: 46, depth: D + 3,
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
    scene.cameras.main.resetFX();
    scene.cameras.main.fadeOut(400, 0, 0, 0);

    let transitioned = false;
    const doTransition = () => {
      if (transitioned) return;
      transitioned = true;
      scene.scene.start('MenuScene');
    };
    scene.cameras.main.once('camerafadeoutcomplete', doTransition);
    setTimeout(doTransition, 600);
  }

  playAgain() {
    const scene = this.scene;
    if (scene.network) scene.network.disconnect();
    window.__networkConnected = false;
    scene.sound.stopAll();
    scene.cameras.main.resetFX();
    scene.cameras.main.fadeOut(400, 0, 0, 0);

    let transitioned = false;
    const doTransition = () => {
      if (transitioned) return;
      transitioned = true;
      scene.scene.start('GameScene', {
        characterId: scene.characterId,
        playerName: scene.playerName,
        mode: scene.gameMode,
      });
    };
    scene.cameras.main.once('camerafadeoutcomplete', doTransition);
    setTimeout(doTransition, 600);
  }
}
