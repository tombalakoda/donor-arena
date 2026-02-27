/**
 * PauseMenu — ESC key overlay during gameplay.
 * Shows Resume / Return to Menu buttons.
 * Blocks all game input while visible.
 */
export class PauseMenu {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
    this.confirmActive = false;
  }

  toggle() {
    if (this.confirmActive) return; // don't toggle while confirm dialog is showing
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
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
      if (el && !el.destroyed) el.destroy();
    }
    this.elements = [];
  }

  playSfx(key) {
    try {
      this.scene.sound.play(key, { volume: 0.5 });
    } catch (e) { /* audio not available */ }
  }

  build() {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const DEPTH = 400;

    // Dark overlay
    const bg = scene.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.elements.push(bg);

    // Panel
    const panelW = 320;
    const panelH = 260;
    const panelG = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
    panelG.fillStyle(0x1a1428, 0.95);
    panelG.fillRoundedRect(camW / 2 - panelW / 2, camH / 2 - panelH / 2, panelW, panelH, 12);
    panelG.lineStyle(3, 0x3d2e1e, 1);
    panelG.strokeRoundedRect(camW / 2 - panelW / 2, camH / 2 - panelH / 2, panelW, panelH, 12);
    // Inner glow
    panelG.lineStyle(1, 0xffdd44, 0.15);
    panelG.strokeRoundedRect(camW / 2 - panelW / 2 + 4, camH / 2 - panelH / 2 + 4, panelW - 8, panelH - 8, 10);
    this.elements.push(panelG);

    // Title
    const title = scene.add.text(camW / 2, camH / 2 - 90, 'PAUSED', {
      fontSize: '36px',
      fontFamily: 'monospace',
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(title);

    // Subtitle
    const sub = scene.add.text(camW / 2, camH / 2 - 55, 'DÖNER FIGHT', {
      fontSize: '14px',
      fontFamily: 'monospace',
      fill: '#666688',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(sub);

    // Resume button
    this.buildButton(camW / 2, camH / 2, '▶ Resume', 0x448833, () => {
      this.playSfx('sfx-accept');
      this.hide();
    }, DEPTH + 2);

    // Return to Menu button
    this.buildButton(camW / 2, camH / 2 + 60, '🏠 Return to Menu', 0x884433, () => {
      this.playSfx('sfx-accept');
      this.showConfirm();
    }, DEPTH + 2);
  }

  buildButton(x, y, label, color, callback, depth) {
    const scene = this.scene;
    const w = 240;
    const h = 44;

    const bg = scene.add.rectangle(x, y, w, h, color, 1)
      .setStrokeStyle(2, 0xffdd44)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0).setDepth(depth);

    const text = scene.add.text(x, y, label, {
      fontSize: '16px',
      fontFamily: 'monospace',
      fill: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);

    const darkerColor = Phaser.Display.Color.ValueToColor(color).darken(20).color;
    const lighterColor = Phaser.Display.Color.ValueToColor(color).lighten(15).color;

    bg.on('pointerover', () => {
      bg.setFillStyle(lighterColor);
      this.playSfx('sfx-move');
    });
    bg.on('pointerout', () => bg.setFillStyle(color));
    bg.on('pointerdown', () => bg.setFillStyle(darkerColor));
    bg.on('pointerup', () => {
      bg.setFillStyle(color);
      callback();
    });

    this.elements.push(bg, text);
    return { bg, text };
  }

  showConfirm() {
    this.confirmActive = true;
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const DEPTH = 410;

    // Darken more
    const overlay = scene.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.5)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.elements.push(overlay);

    // Confirm panel
    const pw = 300;
    const ph = 160;
    const pg = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
    pg.fillStyle(0x1a1428, 0.98);
    pg.fillRoundedRect(camW / 2 - pw / 2, camH / 2 - ph / 2, pw, ph, 10);
    pg.lineStyle(2, 0xffdd44, 0.5);
    pg.strokeRoundedRect(camW / 2 - pw / 2, camH / 2 - ph / 2, pw, ph, 10);
    this.elements.push(pg);

    const msg = scene.add.text(camW / 2, camH / 2 - 35, 'Leave the match?', {
      fontSize: '18px',
      fontFamily: 'monospace',
      fill: '#ffdd44',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(msg);

    // Yes
    this.buildButton(camW / 2 - 70, camH / 2 + 25, 'Yes', 0x884433, () => {
      this.returnToMenu();
    }, DEPTH + 2);

    // No
    this.buildButton(camW / 2 + 70, camH / 2 + 25, 'No', 0x448833, () => {
      this.playSfx('sfx-cancel');
      // Remove confirm elements (rebuild the pause menu)
      this.destroy();
      this.confirmActive = false;
      this.build();
    }, DEPTH + 2);
  }

  returnToMenu() {
    const scene = this.scene;

    // Disconnect from server
    if (scene.network) {
      scene.network.disconnect();
    }
    window.__networkConnected = false;

    // Stop any game music
    scene.sound.stopAll();

    // Fade to menu
    scene.cameras.main.fadeOut(400, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start('MenuScene');
    });
  }
}

// Need Phaser for color utils
import Phaser from 'phaser';
