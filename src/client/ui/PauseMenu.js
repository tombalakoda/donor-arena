/**
 * PauseMenu.js — ESC key overlay during gameplay (redesigned).
 *
 * Tiny 220×140 panel with Resume / Exit buttons and confirmation dialog.
 * All visuals use Ninja Adventure nineslice/sprite assets.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createText } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM + 100;   // higher than other overlays (400 range)
const CX = SCREEN.CX;
const CY = SCREEN.CY;

// ─── PauseMenu Class ────────────────────────────────────
export class PauseMenu {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
    this.confirmActive = false;
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════
  toggle() {
    if (this.confirmActive) return;
    if (this.visible) this.hide();
    else this.show();
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.build();
  }

  hide() {
    this.visible = false;
    this.confirmActive = false;
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
    try { this.scene.sound.play(key, { volume: 0.5 }); } catch (_) { /* */ }
  }

  // ═══════════════════════════════════════════════════════
  //  BUILD
  // ═══════════════════════════════════════════════════════
  build() {
    const s = this.scene;

    // Dimmer
    const dimmer = createDimmer(s, { depth: D, alpha: 0.65 });
    dimmer.setInteractive();
    this.elements.push(dimmer);

    // Panel — small and compact
    const pw = 220;
    const ph = 150;
    const panel = createPanel(s, CX, CY, pw, ph, { depth: D + 1, alpha: 0.92 });
    this.elements.push(panel);

    // Title
    const title = createText(s, CX, CY - ph / 2 + 24, 'ARA', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: D + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.elements.push(title);

    // Resume button
    const { elements: resumeEls } = createButton(s, CX, CY + 4, 'Devam', {
      width: 160, height: 28, depth: D + 2,
      onClick: () => { this.playSfx('sfx-accept'); this.hide(); },
    });
    this.elements.push(...resumeEls);

    // Exit button
    const { elements: exitEls } = createButton(s, CX, CY + 42, 'Çıkış', {
      width: 160, height: 28, depth: D + 2,
      onClick: () => { this.playSfx('sfx-accept'); this.showConfirm(); },
    });
    this.elements.push(...exitEls);
  }

  // ═══════════════════════════════════════════════════════
  //  CONFIRM DIALOG
  // ═══════════════════════════════════════════════════════
  showConfirm() {
    this.confirmActive = true;
    const s = this.scene;
    const CD = D + 10;

    // Extra dimmer
    const overlay = createDimmer(s, { depth: CD, alpha: 0.45 });
    overlay.setInteractive();
    this.elements.push(overlay);

    // Confirm panel
    const pw = 240;
    const ph = 110;
    const panel = createPanel(s, CX, CY, pw, ph, {
      depth: CD + 1, alpha: 0.95, texture: 'ui-panel-2',
    });
    this.elements.push(panel);

    // Message
    const msg = createText(s, CX, CY - 22, 'Atışmadan ayrılacak mısın?', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: CD + 2,
    });
    this.elements.push(msg);

    // Yes button
    const { elements: yesEls } = createButton(s, CX - 60, CY + 20, 'He', {
      width: 90, height: 26, depth: CD + 2,
      onClick: () => { this.returnToMenu(); },
    });
    this.elements.push(...yesEls);

    // No button
    const { elements: noEls } = createButton(s, CX + 60, CY + 20, 'Yok', {
      width: 90, height: 26, depth: CD + 2,
      onClick: () => {
        this.playSfx('sfx-cancel');
        this.destroy();
        this.confirmActive = false;
        this.build();
      },
    });
    this.elements.push(...noEls);
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
}
