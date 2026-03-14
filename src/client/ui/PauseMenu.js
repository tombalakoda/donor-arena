/**
 * PauseMenu.js — ESC key overlay during gameplay.
 *
 * Compact panel with Resume / Exit buttons, sound sliders,
 * and confirmation dialog. Smooth entrance animations.
 * Text: Press Start 2P, white, black stroke.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createText, animateIn } from './UIHelpers.js';
import { getMusicVolume, getSfxVolume } from '../config.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM + 100;   // higher than other overlays
const CX = SCREEN.CX;
const CY = SCREEN.CY;

// Consistent style
const PS2P = FONT.FAMILY_HEADING;
const WHITE = '#FFFFFF';

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
    try { this.scene.sound.play(key, { volume: 0.5 * getSfxVolume() }); } catch (_) { /* */ }
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

    // Panel (taller to fit sound sliders)
    const pw = 360;
    const ph = 360;
    const panel = createPanel(s, CX, CY, pw, ph, { depth: D + 1 });
    this.elements.push(panel);
    animateIn(s, panel, { from: 'scale', duration: 200 });

    // Title
    const title = createText(s, CX, CY - ph / 2 + 36, 'ARA', FONT.H2, {
      fill: WHITE, depth: D + 2,
      stroke: '#000000', strokeThickness: 3,
    });
    this.elements.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 80, duration: 200 });

    // ── Sound Sliders ──
    this._buildSoundSliders(s);

    // Resume button
    const { elements: resumeEls } = createButton(s, CX, CY + 50, 'Devam', {
      width: 240, height: 48, depth: D + 2,
      onClick: () => { this.playSfx('sfx-accept'); this.hide(); },
    });
    this.elements.push(...resumeEls);
    resumeEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 120, duration: 200 }));

    // Exit button
    const { elements: exitEls } = createButton(s, CX, CY + 108, 'Çıkış', {
      width: 240, height: 48, depth: D + 2,
      onClick: () => { this.playSfx('sfx-accept'); this.showConfirm(); },
    });
    this.elements.push(...exitEls);
    exitEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 170, duration: 200 }));
  }

  // ═══════════════════════════════════════════════════════
  //  SOUND SLIDERS
  // ═══════════════════════════════════════════════════════
  _buildSoundSliders(s) {
    const sliderW = 140;
    const sliderH = 8;
    const trackX = CX - 20;
    const labelX = trackX - 12;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    const buildSlider = (y, label, storageKey, defaultVal, onChange) => {
      const val = parseFloat(localStorage.getItem(storageKey) ?? String(defaultVal));

      // Label — Press Start 2P, white
      const lbl = createText(s, labelX, y, label, { fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE, depth: D + 3, originX: 1, originY: 0.5,
        stroke: '#000000', strokeThickness: 2,
      });
      this.elements.push(lbl);

      // Track background
      const trackBg = s.add.graphics().setDepth(D + 2).setScrollFactor(0);
      trackBg.fillStyle(0x334455, 0.6);
      trackBg.fillRoundedRect(trackX, y - sliderH / 2, sliderW, sliderH, 3);
      this.elements.push(trackBg);

      // Fill bar
      const fill = s.add.graphics().setDepth(D + 3).setScrollFactor(0);
      const drawFill = (v) => {
        fill.clear();
        fill.fillStyle(0x88ccff, 0.8);
        fill.fillRoundedRect(trackX, y - sliderH / 2, sliderW * v, sliderH, 3);
      };
      drawFill(val);
      this.elements.push(fill);

      // Invisible drag zone
      const zone = s.add.zone(trackX + sliderW / 2, y, sliderW + 20, 26)
        .setOrigin(0.5).setDepth(D + 4).setScrollFactor(0).setInteractive({ useHandCursor: true });
      this.elements.push(zone);

      zone.on('pointerdown', (pointer) => {
        const pct = clamp01((pointer.x - trackX) / sliderW);
        localStorage.setItem(storageKey, pct.toFixed(2));
        drawFill(pct);
        onChange(pct);
      });
      zone.on('pointermove', (pointer) => {
        if (!pointer.isDown) return;
        const pct = clamp01((pointer.x - trackX) / sliderW);
        localStorage.setItem(storageKey, pct.toFixed(2));
        drawFill(pct);
        onChange(pct);
      });
    };

    // Music slider
    buildSlider(CY - 54, 'Ezgi', 'musicVolume', 0.35, (v) => {
      try {
        (s.sound.sounds || []).forEach(snd => {
          if (snd.key && snd.key.startsWith('music-') && snd.isPlaying) {
            snd.volume = v;
          }
        });
      } catch (_) { /* audio not available */ }
    });

    // SFX slider
    buildSlider(CY - 16, 'Efekt', 'sfxVolume', 0.5, (_v) => {
      // SFX volume is read per-call via getSfxVolume()
    });
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
    const cpw = 380;
    const cph = 190;
    const cpanel = createPanel(s, CX, CY, cpw, cph, {
      depth: CD + 1, texture: 'ui-panel-2',
    });
    this.elements.push(cpanel);
    animateIn(s, cpanel, { from: 'scale', duration: 200 });

    // Message
    const msg = createText(s, CX, CY - 30, 'Atışmadan ayrılacak mısın?', { fontSize: '12px', fontFamily: PS2P }, {
      fill: WHITE, depth: CD + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.elements.push(msg);
    animateIn(s, msg, { from: 'slideDown', delay: 80, duration: 200 });

    // Yes button
    const { elements: yesEls } = createButton(s, CX - 90, CY + 34, 'He', {
      width: 150, height: 44, depth: CD + 2,
      onClick: () => { this.returnToMenu(); },
    });
    this.elements.push(...yesEls);

    // No button
    const { elements: noEls } = createButton(s, CX + 90, CY + 34, 'Yok', {
      width: 150, height: 44, depth: CD + 2,
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

    // Reset camera effects before fade (shake can prevent fadeOut completion)
    scene.cameras.main.resetFX();
    scene.cameras.main.fadeOut(400, 0, 0, 0);

    let transitioned = false;
    const doTransition = () => {
      if (transitioned) return;
      transitioned = true;
      scene.scene.start('MenuScene');
    };
    scene.cameras.main.once('camerafadeoutcomplete', doTransition);
    // Safety: force transition if fade event never fires
    setTimeout(doTransition, 600);
  }
}
