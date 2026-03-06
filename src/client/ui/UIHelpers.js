import { UI_FONT } from '../config.js';

/**
 * Create a nineslice button with tint-based hover/pressed states.
 * Uses a single nineslice with setTint() for state changes.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {string} label - Button text
 * @param {object} opts
 * @param {number} [opts.width=180]
 * @param {number} [opts.height=40]
 * @param {number} [opts.depth=10]
 * @param {string} [opts.fontSize='14px']
 * @param {boolean} [opts.enabled=true]
 * @param {function} [opts.onClick]
 * @param {boolean} [opts.sfx=true] - Play hover SFX
 * @returns {{ elements: Phaser.GameObjects.GameObject[] }}
 */
export function createNinesliceButton(scene, x, y, label, opts = {}) {
  const w = opts.width || 180;
  const h = opts.height || 40;
  const depth = opts.depth || 10;
  const fontSize = opts.fontSize || '16px';
  const enabled = opts.enabled !== false;
  const onClick = opts.onClick || (() => {});
  const sfx = opts.sfx !== false;
  const elements = [];

  // Single nineslice button — tint-based states
  const btn = scene.add.nineslice(x, y, 'ui-button', null, w, h, 16, 16, 2, 4)
    .setScrollFactor(0).setDepth(depth);

  if (!enabled) {
    btn.setTint(0x888888).setAlpha(0.6);
    const text = scene.add.text(x, y - 1, label, {
      fontSize, fontFamily: UI_FONT, fill: '#666666', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(depth + 1).setOrigin(0.5);
    elements.push(btn, text);
    return { elements };
  }

  const text = scene.add.text(x, y - 1, label, {
    fontSize, fontFamily: UI_FONT, fill: '#ffffff', fontStyle: 'bold',
    stroke: '#000000', strokeThickness: 2,
  }).setScrollFactor(0).setDepth(depth + 1).setOrigin(0.5);

  const hitArea = scene.add.rectangle(x, y, w, h, 0xffffff, 0)
    .setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(depth + 2);

  hitArea.on('pointerover', () => {
    btn.setTint(0xffe8cc);
    if (sfx) try { scene.sound.play('sfx-move', { volume: 0.5 }); } catch (e) { /* audio unavailable */ }
  });
  hitArea.on('pointerout', () => {
    btn.clearTint();
    text.setY(y - 1);
  });
  hitArea.on('pointerdown', () => {
    btn.setTint(0xccaa88);
    text.setY(y + 1);
  });
  hitArea.on('pointerup', () => {
    btn.clearTint();
    text.setY(y - 1);
    onClick();
  });

  elements.push(btn, text, hitArea);
  return { elements };
}
