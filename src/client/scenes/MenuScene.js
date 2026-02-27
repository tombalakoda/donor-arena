import Phaser from 'phaser';
import { CHARACTERS } from './BootScene.js';

const SPRITE_SCALE = 3;

// Loading-screen style tips for re-use
const TIPS = [
  'Right-click to move on ice',
  'Q / W / E / R to cast spells',
  'Stay inside the ring!',
  'Upgrade spells in the shop',
  'Knock enemies out of bounds!',
  'Ice physics: plan your path!',
  'Heavier hits send you flying',
];

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedCharIndex = 0;
    this.playerName = 'Player';
    this.charCells = [];      // { bg, sprite, nameText, highlight }
    this.previewSprite = null;
    this.nameInput = null;
    this.transitioning = false; // prevent double-clicks during fade
    this.menuMusic = null;
    this.fxCircleSprite = null;
  }

  create() {
    const cam = this.cameras.main;
    const camW = cam.width;
    const camH = cam.height;

    this.transitioning = false;

    // Fade in from black
    cam.fadeIn(500, 0, 0, 0);

    // Background
    this.add.rectangle(camW / 2, camH / 2, camW, camH, 0x0a0a1e);

    // --- Decorative particles / stars ---
    this.createBackgroundStars(camW, camH);

    // --- Title ---
    const titleText = this.add.text(camW / 2, 44, 'DÖNER FIGHT', {
      fontSize: '56px',
      fontFamily: 'monospace',
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Subtle title pulsing
    this.tweens.add({
      targets: titleText,
      scaleX: 1.03,
      scaleY: 1.03,
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });

    // Subtitle
    this.add.text(camW / 2, 92, '🥙 Choose your döner 🥙', {
      fontSize: '16px',
      fontFamily: 'monospace',
      fill: '#888899',
    }).setOrigin(0.5);

    // --- Character Selection Grid ---
    this.createCharacterGrid(camW, camH);

    // --- Walk Preview with FX decoration ---
    this.createPreview(camW, camH);

    // --- Player Name Input ---
    this.createNameInput(camW, camH);

    // --- Buttons ---
    this.createButtons(camW, camH);

    // --- Bottom tip ---
    const tipText = this.add.text(camW / 2, camH - 20, TIPS[0], {
      fontSize: '12px',
      fontFamily: 'monospace',
      fill: '#555577',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    let tipIndex = 0;
    this._tipTimer = this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        tipIndex = (tipIndex + 1) % TIPS.length;
        tipText.setText(TIPS[tipIndex]);
      },
    });

    // Select default character
    this.selectCharacter(0);

    // --- Start menu music ---
    this.startMenuMusic();
  }

  createBackgroundStars(camW, camH) {
    const g = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, camW);
      const y = Phaser.Math.Between(0, camH);
      const alpha = 0.1 + Math.random() * 0.3;
      const size = Math.random() < 0.3 ? 2 : 1;
      g.fillStyle(0x6688cc, alpha);
      g.fillRect(x, y, size, size);
    }
  }

  startMenuMusic() {
    // Don't restart if already playing
    if (this.menuMusic && this.menuMusic.isPlaying) return;

    if (this.sound.get('music-menu')) {
      this.menuMusic = this.sound.get('music-menu');
      if (!this.menuMusic.isPlaying) {
        this.menuMusic.play({ loop: true, volume: 0.35 });
      }
    } else {
      try {
        this.menuMusic = this.sound.add('music-menu', { loop: true, volume: 0.35 });
        this.menuMusic.play();
      } catch (e) {
        // Audio not available, that's fine
      }
    }
  }

  stopMenuMusic() {
    if (this.menuMusic && this.menuMusic.isPlaying) {
      this.tweens.add({
        targets: this.menuMusic,
        volume: 0,
        duration: 400,
        onComplete: () => {
          this.menuMusic.stop();
        },
      });
    }
  }

  playSfx(key) {
    try {
      this.sound.play(key, { volume: 0.5 });
    } catch (e) {
      // Audio not available
    }
  }

  createCharacterGrid(camW, _camH) {
    const gridY = 170;
    const cellSize = 78;
    const gap = 10;
    const totalWidth = CHARACTERS.length * cellSize + (CHARACTERS.length - 1) * gap;
    const startX = (camW - totalWidth) / 2 + cellSize / 2;

    this.charCells = [];

    for (let i = 0; i < CHARACTERS.length; i++) {
      const char = CHARACTERS[i];
      const x = startX + i * (cellSize + gap);
      const y = gridY;

      // Cell background — wood-toned
      const bg = this.add.rectangle(x, y, cellSize, cellSize, 0x1a1428, 0.9)
        .setStrokeStyle(2, 0x3d2e1e);

      // Character face portrait (if loaded, fallback to idle sprite)
      let portrait;
      if (this.textures.exists(`${char.id}-face`)) {
        portrait = this.add.image(x, y - 6, `${char.id}-face`)
          .setScale(1.8);
      } else {
        portrait = this.add.sprite(x, y - 6, `${char.id}-idle`, 0)
          .setScale(SPRITE_SCALE);
      }

      // Character name
      const nameText = this.add.text(x, y + 32, char.name, {
        fontSize: '10px',
        fontFamily: 'monospace',
        fill: '#998877',
      }).setOrigin(0.5);

      // Selection highlight (hidden by default)
      const highlight = this.add.rectangle(x, y, cellSize + 4, cellSize + 4)
        .setStrokeStyle(3, 0xffdd44)
        .setFillStyle(0xffdd44, 0.08);
      highlight.setVisible(false);

      // Make cell interactive
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        this.playSfx('sfx-accept');
        this.selectCharacter(i);
      });
      bg.on('pointerover', () => {
        this.playSfx('sfx-move');
        if (this.selectedCharIndex !== i) {
          bg.setFillStyle(0x2a2438, 0.95);
        }
      });
      bg.on('pointerout', () => {
        if (this.selectedCharIndex !== i) {
          bg.setFillStyle(0x1a1428, 0.9);
        }
      });

      this.charCells.push({ bg, sprite: portrait, nameText, highlight });
    }
  }

  createPreview(camW, _camH) {
    const previewY = 330;

    // Preview background panel
    const panelG = this.add.graphics();
    panelG.fillStyle(0x111122, 0.7);
    panelG.fillRoundedRect(camW / 2 - 68, previewY - 68, 136, 136, 8);
    panelG.lineStyle(2, 0x3d2e1e, 0.8);
    panelG.strokeRoundedRect(camW / 2 - 68, previewY - 68, 136, 136, 8);

    // Spinning FX circle decoration behind the preview
    if (this.textures.exists('fx-circle')) {
      this.fxCircleSprite = this.add.sprite(camW / 2, previewY, 'fx-circle', 0)
        .setScale(4)
        .setAlpha(0.2)
        .setTint(0xffaa33);
      // Play the circle animation (looping)
      const circleAnimKey = 'fx-circle-play';
      if (this.anims.exists(circleAnimKey)) {
        this.fxCircleSprite.play({ key: circleAnimKey, repeat: -1 });
      }
    }

    // Preview sprite (larger, walking animation)
    this.previewSprite = this.add.sprite(camW / 2, previewY, 'boy-walk', 0)
      .setScale(5);

    // Selected character name (larger)
    this.previewName = this.add.text(camW / 2, previewY + 80, 'Boy', {
      fontSize: '22px',
      fontFamily: 'monospace',
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
  }

  createNameInput(camW, _camH) {
    const nameY = 445;

    // Label
    this.add.text(camW / 2 - 125, nameY, 'Name:', {
      fontSize: '18px',
      fontFamily: 'monospace',
      fill: '#ddccaa',
    }).setOrigin(0, 0.5);

    // DOM text input — styled to match wood/warm theme
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Player';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 16px;
      font-family: monospace;
      padding: 6px 12px;
      width: 180px;
      background: #1a1428;
      color: #ffdd44;
      border: 2px solid #3d2e1e;
      border-radius: 4px;
      outline: none;
    `;
    inputElement.addEventListener('focus', () => {
      inputElement.style.borderColor = '#ffdd44';
    });
    inputElement.addEventListener('blur', () => {
      inputElement.style.borderColor = '#3d2e1e';
    });

    this.nameInput = this.add.dom(camW / 2 + 30, nameY, inputElement);
  }

  createButtons(camW, _camH) {
    const btnY = 525;
    const btnGap = 190;

    // Play button — warm green/gold
    this.createButton(camW / 2 - btnGap / 2, btnY, '⚔️ PLAY', 0x448833, () => {
      this.startGame('normal');
    });

    // Sandbox button — blue
    this.createButton(camW / 2 + btnGap / 2, btnY, '🏋️ SANDBOX', 0x335588, () => {
      this.startGame('sandbox');
    });

    // Hint text
    this.add.text(camW / 2, btnY + 48, 'Sandbox: Free SP, training dummies, no ring shrink', {
      fontSize: '12px',
      fontFamily: 'monospace',
      fill: '#555566',
    }).setOrigin(0.5);
  }

  createButton(x, y, label, color, callback) {
    const w = 160;
    const h = 48;

    const bg = this.add.rectangle(x, y, w, h, color, 1)
      .setStrokeStyle(2, 0xffdd44)
      .setInteractive({ useHandCursor: true });

    // Rounded corners effect via graphics
    const glow = this.add.graphics();
    glow.lineStyle(1, 0xffdd44, 0.15);
    glow.strokeRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 6);

    const text = this.add.text(x, y, label, {
      fontSize: '18px',
      fontFamily: 'monospace',
      fill: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

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
      this.playSfx('sfx-accept');
      callback();
    });

    return { bg, text };
  }

  selectCharacter(index) {
    // Deselect previous
    if (this.charCells[this.selectedCharIndex]) {
      const prev = this.charCells[this.selectedCharIndex];
      prev.highlight.setVisible(false);
      prev.bg.setFillStyle(0x1a1428, 0.9);
      prev.nameText.setColor('#998877');
    }

    this.selectedCharIndex = index;
    const cell = this.charCells[index];
    const char = CHARACTERS[index];

    // Highlight selected
    cell.highlight.setVisible(true);
    cell.bg.setFillStyle(0x2a2438, 0.95);
    cell.nameText.setColor('#ffdd44');

    // Update preview
    if (this.previewSprite) {
      this.previewSprite.play(`${char.id}-walk-down`);
    }
    if (this.previewName) {
      this.previewName.setText(char.name);
    }
  }

  startGame(mode) {
    if (this.transitioning) return;
    this.transitioning = true;

    const char = CHARACTERS[this.selectedCharIndex];
    const name = this.nameInput ? this.nameInput.node.value.trim() || 'Player' : 'Player';

    // Play accept SFX
    this.playSfx('sfx-accept');

    // Destroy the DOM input before scene transition (prevents floating over black)
    if (this.nameInput) {
      this.nameInput.destroy();
      this.nameInput = null;
    }

    // Stop menu music
    this.stopMenuMusic();

    // Clean up tip timer
    if (this._tipTimer) {
      this._tipTimer.destroy();
      this._tipTimer = null;
    }

    // Fade out then transition
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', {
        characterId: char.id,
        playerName: name,
        mode: mode,
      });
    });
  }
}
