/**
 * UIHelpers.js — Reusable UI component factory functions.
 * All visual elements use Ninja Adventure nineslice/sprite assets.
 * Design tokens come from UIConfig.js.
 */

import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, textStyle } from './UIConfig.js';

// ─── Text Button ─────────────────────────────────────────────
/**
 * Create a nineslice text button with hover/pressed texture swaps.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {string} label - Button text
 * @param {object} opts
 * @param {number} [opts.width=140]
 * @param {number} [opts.height=32]
 * @param {number} [opts.depth=DEPTH.OVERLAY_UI]
 * @param {object} [opts.fontToken=FONT.BODY_BOLD]
 * @param {boolean} [opts.enabled=true]
 * @param {function} [opts.onClick]
 * @param {boolean} [opts.sfx=true]
 * @param {number} [opts.alpha=1]
 * @returns {{ elements: Phaser.GameObjects.GameObject[], btn: NineSlice, text: Text }}
 */
export function createButton(scene, x, y, label, opts = {}) {
  const w       = opts.width  || 140;
  const h       = opts.height || 32;
  const depth   = opts.depth  ?? DEPTH.OVERLAY_UI;
  const token   = opts.fontToken || FONT.BODY_BOLD;
  const enabled = opts.enabled !== false;
  const onClick = opts.onClick || (() => {});
  const sfx     = opts.sfx !== false;
  const alpha   = opts.alpha ?? 1;
  const elements = [];

  const [nl, nr, nt, nb] = NINE.BUTTON;

  if (!enabled) {
    const btn = scene.add.nineslice(x, y, 'ui-button-disabled', null, w, h, nl, nr, nt, nb)
      .setScrollFactor(0).setDepth(depth).setAlpha(0.7);
    const text = scene.add.text(x, y, label, textStyle(token, {
      fill: COLOR.TEXT_DISABLED,
    })).setScrollFactor(0).setDepth(depth + 1).setOrigin(0.5);
    elements.push(btn, text);
    return { elements, btn, text };
  }

  // Normal state
  const btn = scene.add.nineslice(x, y, 'ui-button', null, w, h, nl, nr, nt, nb)
    .setScrollFactor(0).setDepth(depth).setAlpha(alpha);

  const text = scene.add.text(x, y - 1, label, textStyle(token, {
    fill: COLOR.TEXT_LIGHT,
    stroke: '#000000', strokeThickness: 3,
  })).setScrollFactor(0).setDepth(depth + 1).setOrigin(0.5);

  // Invisible hit area
  const hitArea = scene.add.nineslice(x, y, 'ui-button', null, w + 2, h + 2, nl, nr, nt, nb)
    .setScrollFactor(0).setDepth(depth + 2).setAlpha(0.001)
    .setInteractive({ useHandCursor: true });

  let isOver = false;
  let isDown = false;

  hitArea.on('pointerover', () => {
    isOver = true;
    if (!isDown) {
      btn.setTexture('ui-button-hover');
      text.setY(y - 2);
    }
    if (sfx) try { scene.sound.play('sfx-move', { volume: 0.4 }); } catch (_) { /* */ }
  });

  hitArea.on('pointerout', () => {
    isOver = false;
    isDown = false;
    btn.setTexture('ui-button');
    text.setY(y - 1);
  });

  hitArea.on('pointerdown', () => {
    isDown = true;
    btn.setTexture('ui-button-pressed');
    text.setY(y + 1);
  });

  hitArea.on('pointerup', () => {
    isDown = false;
    if (isOver) {
      btn.setTexture('ui-button-hover');
      text.setY(y - 2);
      onClick();
    } else {
      btn.setTexture('ui-button');
      text.setY(y - 1);
    }
  });

  elements.push(btn, text, hitArea);
  return { elements, btn, text };
}

// ─── Icon Button ─────────────────────────────────────────────
/**
 * Create an icon-only button (e.g. mute toggle).
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {string} iconKey - Texture key for the icon
 * @param {object} opts
 * @param {number} [opts.size=24] - Icon display size
 * @param {number} [opts.depth=DEPTH.HUD]
 * @param {function} [opts.onClick]
 * @param {boolean} [opts.sfx=true]
 * @returns {{ elements: Phaser.GameObjects.GameObject[], icon: Image }}
 */
export function createIconButton(scene, x, y, iconKey, opts = {}) {
  const size    = opts.size || 24;
  const depth   = opts.depth ?? DEPTH.HUD;
  const onClick = opts.onClick || (() => {});
  const sfx     = opts.sfx !== false;
  const elements = [];

  const icon = scene.add.image(x, y, iconKey)
    .setScrollFactor(0).setDepth(depth)
    .setDisplaySize(size, size);

  // Hit cell behind icon
  const [nl, nr, nt, nb] = NINE.CELL;
  const hitSize = size + SPACE.SM;
  const cell = scene.add.nineslice(x, y, 'ui-inventory-cell', null, hitSize, hitSize, nl, nr, nt, nb)
    .setScrollFactor(0).setDepth(depth - 1).setAlpha(ALPHA.HINT)
    .setInteractive({ useHandCursor: true });

  let isOver = false;
  cell.on('pointerover', () => {
    isOver = true;
    icon.setScale(icon.scaleX * 1.1, icon.scaleY * 1.1);
    cell.setAlpha(ALPHA.SUBTLE);
    if (sfx) try { scene.sound.play('sfx-move', { volume: 0.3 }); } catch (_) { /* */ }
  });
  cell.on('pointerout', () => {
    isOver = false;
    icon.setDisplaySize(size, size);
    cell.setAlpha(ALPHA.HINT);
  });
  cell.on('pointerup', () => {
    if (isOver) onClick();
  });

  elements.push(cell, icon);
  return { elements, icon, cell };
}

// ─── Panel ───────────────────────────────────────────────────
/**
 * Create a nineslice panel.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {object} opts
 * @param {string} [opts.texture='ui-panel']
 * @param {number} [opts.depth=DEPTH.OVERLAY_PANEL]
 * @param {number} [opts.alpha=ALPHA.PANEL]
 * @param {number} [opts.tint] - Optional tint color
 * @returns {Phaser.GameObjects.NineSlice}
 */
export function createPanel(scene, x, y, w, h, opts = {}) {
  const texture = opts.texture || 'ui-panel';
  const depth   = opts.depth ?? DEPTH.OVERLAY_PANEL;
  const alpha   = opts.alpha ?? ALPHA.PANEL;
  const [nl, nr, nt, nb] = NINE.PANEL;

  const panel = scene.add.nineslice(x, y, texture, null, w, h, nl, nr, nt, nb)
    .setScrollFactor(0).setDepth(depth).setAlpha(alpha);

  if (opts.tint !== undefined) {
    panel.setTint(opts.tint);
  }

  return panel;
}

// ─── Dimmer ──────────────────────────────────────────────────
/**
 * Create a full-screen overlay dimmer.
 *
 * @param {Phaser.Scene} scene
 * @param {object} opts
 * @param {number} [opts.depth=DEPTH.OVERLAY_DIM]
 * @param {number} [opts.alpha=ALPHA.DIMMER]
 * @returns {Phaser.GameObjects.NineSlice}
 */
export function createDimmer(scene, opts = {}) {
  const depth = opts.depth ?? DEPTH.OVERLAY_DIM;
  const alpha = opts.alpha ?? ALPHA.DIMMER;

  return scene.add.nineslice(640, 360, 'ui-bg-2', null, 1280, 720, 4, 4, 4, 4)
    .setScrollFactor(0).setDepth(depth).setAlpha(alpha).setTint(COLOR.DIMMER_TINT);
}

// ─── Bar ─────────────────────────────────────────────────────
/**
 * Create a thin progress bar (fill + optional background).
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Left edge X (NOT center)
 * @param {number} y - Center Y
 * @param {number} w - Full width
 * @param {number} h - Height (4-6px typical)
 * @param {object} opts
 * @param {number} [opts.depth=DEPTH.HUD]
 * @param {number} [opts.tint] - Fill tint
 * @param {boolean} [opts.showBg=true] - Show background track
 * @param {number} [opts.value=1] - Initial fill ratio 0..1
 * @returns {{ bg: NineSlice|null, fill: NineSlice, setValue: function, elements: GameObject[] }}
 */
export function createBar(scene, x, y, w, h, opts = {}) {
  const depth  = opts.depth ?? DEPTH.HUD;
  const tint   = opts.tint;
  const showBg = opts.showBg !== false;
  const value  = opts.value ?? 1;
  const elements = [];

  let bg = null;
  if (showBg) {
    const [nl, nr, nt, nb] = NINE.PANEL;
    bg = scene.add.nineslice(x + w / 2, y, 'ui-panel-interior', null, w, h, nl, nr, nt, nb)
      .setScrollFactor(0).setDepth(depth).setAlpha(ALPHA.BAR_BG);
    elements.push(bg);
  }

  const fillW = Math.max(1, w * value);
  const [sl, sr, st, sb] = NINE.SLIDER;
  const fill = scene.add.nineslice(x + fillW / 2, y, 'ui-slider-progress', null, fillW, h, sl, sr, st, sb)
    .setScrollFactor(0).setDepth(depth + 1);
  if (tint !== undefined) fill.setTint(tint);
  elements.push(fill);

  /**
   * Update bar fill ratio. Optionally tween.
   * @param {number} ratio - 0..1
   * @param {number} [newTint] - Change tint
   * @param {boolean} [animate=false] - Tween the change
   */
  function setValue(ratio, newTint, animate = false) {
    const newW = Math.max(1, w * Math.max(0, Math.min(1, ratio)));
    if (newTint !== undefined) fill.setTint(newTint);

    if (animate && scene.tweens) {
      scene.tweens.add({
        targets: fill,
        displayWidth: newW,
        x: x + newW / 2,
        duration: 200,
        ease: 'Power2',
      });
    } else {
      fill.setDisplaySize(newW, h);
      fill.setX(x + newW / 2);
    }
  }

  return { bg, fill, setValue, elements };
}

// ─── Separator ───────────────────────────────────────────────
/**
 * Create a thin horizontal separator line.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} w - Width
 * @param {object} opts
 * @param {number} [opts.depth=DEPTH.OVERLAY_UI]
 * @param {number} [opts.alpha=ALPHA.SUBTLE]
 * @returns {Phaser.GameObjects.NineSlice}
 */
export function createSeparator(scene, x, y, w, opts = {}) {
  const depth = opts.depth ?? DEPTH.OVERLAY_UI;
  const alpha = opts.alpha ?? ALPHA.SUBTLE;
  const [sl, sr, st, sb] = NINE.SLIDER;

  return scene.add.nineslice(x, y, 'ui-slider-progress', null, w, 2, sl, sr, st, sb)
    .setScrollFactor(0).setDepth(depth).setAlpha(alpha);
}

// ─── Text ────────────────────────────────────────────────────
/**
 * Create a styled text element from a design token.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} content
 * @param {object} token - One of FONT.TITLE_LG, FONT.BODY, etc.
 * @param {object} opts
 * @param {string} [opts.fill=COLOR.TEXT_PRIMARY]
 * @param {number} [opts.depth=DEPTH.OVERLAY_TEXT]
 * @param {number} [opts.originX=0.5]
 * @param {number} [opts.originY=0.5]
 * @param {string} [opts.stroke]
 * @param {number} [opts.strokeThickness]
 * @returns {Phaser.GameObjects.Text}
 */
export function createText(scene, x, y, content, token, opts = {}) {
  const fill            = opts.fill ?? COLOR.TEXT_PRIMARY;
  const depth           = opts.depth ?? DEPTH.OVERLAY_TEXT;
  const originX         = opts.originX ?? 0.5;
  const originY         = opts.originY ?? 0.5;

  const style = textStyle(token, { fill });
  if (opts.stroke) style.stroke = opts.stroke;
  if (opts.strokeThickness) style.strokeThickness = opts.strokeThickness;

  return scene.add.text(x, y, content, style)
    .setScrollFactor(0).setDepth(depth).setOrigin(originX, originY);
}

// ─── Animate In ──────────────────────────────────────────────
/**
 * Smoothly animate an element appearing (scale + fade).
 * Preserves target's original alpha (important for hit areas at 0.001).
 */
export function animateIn(scene, target, opts = {}) {
  const delay = opts.delay || 0;
  const duration = opts.duration || 250;
  const from = opts.from || 'scale'; // 'scale', 'slideUp', 'slideDown', 'fadeOnly'

  // Capture original alpha BEFORE modifying
  const origAlpha = target.alpha;

  // Skip elements that are nearly invisible (hit areas at 0.001, etc.)
  if (origAlpha < 0.01) return;

  if (from === 'scale') {
    const origSX = target.scaleX;
    const origSY = target.scaleY;
    target.setScale(origSX * 0.85, origSY * 0.85);
    target.setAlpha(0);
    scene.tweens.add({
      targets: target, scaleX: origSX, scaleY: origSY,
      alpha: origAlpha, duration, delay, ease: 'Back.easeOut',
    });
  } else if (from === 'slideUp') {
    const origY = target.y;
    target.setY(origY + 20);
    target.setAlpha(0);
    scene.tweens.add({
      targets: target, y: origY, alpha: origAlpha, duration, delay, ease: 'Power2',
    });
  } else if (from === 'slideDown') {
    const origY = target.y;
    target.setY(origY - 15);
    target.setAlpha(0);
    scene.tweens.add({
      targets: target, y: origY, alpha: origAlpha, duration, delay, ease: 'Power2',
    });
  } else {
    target.setAlpha(0);
    scene.tweens.add({ targets: target, alpha: origAlpha, duration, delay, ease: 'Linear' });
  }
}

// ─── Legacy Compat ───────────────────────────────────────────
/**
 * Backward-compatible wrapper for code that still calls createNinesliceButton.
 * Delegates to the new createButton.
 */
export function createNinesliceButton(scene, x, y, label, opts = {}) {
  return createButton(scene, x, y, label, {
    width: opts.width || 160,
    height: opts.height || 34,
    depth: opts.depth || 10,
    fontToken: { fontSize: opts.fontSize || '16px', fontFamily: FONT.FAMILY, fontStyle: 'bold' },
    enabled: opts.enabled,
    onClick: opts.onClick,
    sfx: opts.sfx,
  });
}
