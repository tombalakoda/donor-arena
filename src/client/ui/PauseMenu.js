import { UI_FONT } from '../config.js';
import { createNinesliceButton } from './UIHelpers.js';

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
    const bg = scene.add.nineslice(camW / 2, camH / 2, 'ui-bg-2', null, camW, camH, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(DEPTH).setTint(0x000000).setAlpha(0.7).setInteractive();
    this.elements.push(bg);

    // Panel — nineslice
    const panelW = 280;
    const panelH = 220;
    const panel = scene.add.nineslice(camW / 2, camH / 2, 'ui-panel', null, panelW, panelH, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(panel);

    // Title
    const title = scene.add.text(camW / 2, camH / 2 - 90, 'ARA', {
      fontSize: '24px',
      fontFamily: UI_FONT,
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(title);

    // Subtitle
    const sub = scene.add.text(camW / 2, camH / 2 - 55, 'ÂŞIKLAR MEYDANE', {
      fontSize: '13px',
      fontFamily: UI_FONT,
      fill: '#3a2218',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(sub);

    // Resume button
    const { elements: resumeEls } = createNinesliceButton(scene, camW / 2, camH / 2, 'Devam', {
      width: 200, height: 36, depth: DEPTH + 2, fontSize: '13px',
      onClick: () => {
        this.playSfx('sfx-accept');
        this.hide();
      },
      sfx: true,
    });
    this.elements.push(...resumeEls);

    // Return to Menu button
    const { elements: menuEls } = createNinesliceButton(scene, camW / 2, camH / 2 + 60, 'Meydana Dön', {
      width: 200, height: 36, depth: DEPTH + 2, fontSize: '13px',
      onClick: () => {
        this.playSfx('sfx-accept');
        this.showConfirm();
      },
      sfx: true,
    });
    this.elements.push(...menuEls);
  }

  showConfirm() {
    this.confirmActive = true;
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const DEPTH = 410;

    // Darken more
    const overlay = scene.add.nineslice(camW / 2, camH / 2, 'ui-bg-2', null, camW, camH, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(DEPTH).setTint(0x000000).setAlpha(0.5).setInteractive();
    this.elements.push(overlay);

    // Confirm panel — nineslice (panel-2 variant)
    const pw = 260;
    const ph = 140;
    const confirmPanel = scene.add.nineslice(camW / 2, camH / 2, 'ui-panel-2', null, pw, ph, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(confirmPanel);

    const msg = scene.add.text(camW / 2, camH / 2 - 35, 'Atışmadan ayrılacak mısın?', {
      fontSize: '13px',
      fontFamily: UI_FONT,
      fill: '#ffdd44',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(msg);

    // Yes button
    const { elements: yesEls } = createNinesliceButton(scene, camW / 2 - 70, camH / 2 + 25, 'He', {
      width: 100, height: 34, depth: DEPTH + 2, fontSize: '13px',
      onClick: () => {
        this.returnToMenu();
      },
      sfx: true,
    });
    this.elements.push(...yesEls);

    // No button
    const { elements: noEls } = createNinesliceButton(scene, camW / 2 + 70, camH / 2 + 25, 'Yok', {
      width: 100, height: 34, depth: DEPTH + 2, fontSize: '13px',
      onClick: () => {
        this.playSfx('sfx-cancel');
        // Remove confirm elements (rebuild the pause menu)
        this.destroy();
        this.confirmActive = false;
        this.build();
      },
      sfx: true,
    });
    this.elements.push(...noEls);
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
