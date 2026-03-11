/**
 * PauseMenu.js — ESC key overlay during gameplay.
 *
 * Compact panel with Resume / Exit buttons and confirmation dialog.
 * Smooth entrance animations.
 * All visuals use Ninja Adventure nineslice/sprite assets.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createText, animateIn } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM + 100;   // higher than other overlays
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
    const dimmer = createDimmer(s, { depth: D, alpha: 0.6 });
    dimmer.setInteractive();
    this.elements.push(dimmer);

    // Panel
    const pw = 280;
    const ph = 190;
    const panel = createPanel(s, CX, CY, pw, ph, { depth: D + 1 });
    this.elements.push(panel);
    animateIn(s, panel, { from: 'scale', duration: 200 });

    // Title
    const title = createText(s, CX, CY - ph / 2 + 32, 'ARA', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: D + 2,
      stroke: '#000000', strokeThickness: 3,
    });
    this.elements.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 80, duration: 200 });

    // Resume button
    const { elements: resumeEls } = createButton(s, CX, CY + 4, 'Devam', {
      width: 200, height: 40, depth: D + 2,
      onClick: () => { this.playSfx('sfx-accept'); this.hide(); },
    });
    this.elements.push(...resumeEls);
    resumeEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 120, duration: 200 }));

    // Exit button
    const { elements: exitEls } = createButton(s, CX, CY + 52, 'Çıkış', {
      width: 200, height: 40, depth: D + 2,
      onClick: () => { this.playSfx('sfx-accept'); this.showConfirm(); },
    });
    this.elements.push(...exitEls);
    exitEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 170, duration: 200 }));
  }

  // ═══════════════════════════════════════════════════════
  //  CONFIRM DIALOG
  // ═══════════════════════════════════════════════════════
  showConfirm() {
    this.confirmActive = true;
    const s = this.scene;
    const CD = D + 10;

    // Extra dimmer
    const overlay = createDimmer(s, { depth: CD, alpha: 0.4 });
    overlay.setInteractive();
    this.elements.push(overlay);

    // Confirm panel
    const cpw = 300;
    const cph = 150;
    const cpanel = createPanel(s, CX, CY, cpw, cph, {
      depth: CD + 1, texture: 'ui-panel-2',
    });
    this.elements.push(cpanel);
    animateIn(s, cpanel, { from: 'scale', duration: 200 });

    // Message
    const msg = createText(s, CX, CY - 26, 'Atışmadan ayrılacak mısın?', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: CD + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.elements.push(msg);
    animateIn(s, msg, { from: 'slideDown', delay: 80, duration: 200 });

    // Yes button
    const { elements: yesEls } = createButton(s, CX - 75, CY + 26, 'He', {
      width: 120, height: 36, depth: CD + 2,
      onClick: () => { this.returnToMenu(); },
    });
    this.elements.push(...yesEls);

    // No button
    const { elements: noEls } = createButton(s, CX + 75, CY + 26, 'Yok', {
      width: 120, height: 36, depth: CD + 2,
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
