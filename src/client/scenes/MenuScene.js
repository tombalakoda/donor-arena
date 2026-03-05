import Phaser from 'phaser';
import { CHARACTERS } from './BootScene.js';
import { getPassive } from '../../shared/characterPassives.js';

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
    this.charCells = [];
    this.previewSprite = null;
    this.nameInput = null;
    this.transitioning = false;
    this.menuMusic = null;
    this.fxCircleSprite = null;
    this.particleEmitter = null;
    this.floatTween = null;
  }

  create() {
    const cam = this.cameras.main;
    const camW = cam.width;
    const camH = cam.height;

    this.transitioning = false;

    // Fade in from black
    cam.fadeIn(500, 0, 0, 0);

    // --- Background (tiled floor + overlay + particles) ---
    this.createBackground(camW, camH);

    // --- Title ---
    this.createTitleArea(camW);

    // --- Character Selection Grid (left side) ---
    this.createCharacterGrid(camW, camH);

    // --- Preview Panel (right side) ---
    this.createPreview(camW, camH);

    // --- Player Name Input ---
    this.createNameInput(camW, camH);

    // --- Buttons ---
    this.createButtons(camW, camH);

    // --- Bottom tip bar ---
    this.createBottomBar(camW, camH);

    // --- Sound Toggle ---
    this.createSoundToggle(camW);

    // Select default character
    this.selectCharacter(0);

    // --- Start menu music ---
    this.startMenuMusic();
  }

  // =========================================================================
  // BACKGROUND
  // =========================================================================

  createBackground(camW, camH) {
    // Layer 1: Tiled wood floor via RenderTexture
    const rt = this.add.renderTexture(0, 0, camW, camH).setOrigin(0).setDepth(0);
    // Use tile-floor frame 113 — brown wood plank tile from mid rows
    const stamp = this.make.sprite({ x: 0, y: 0, key: 'tile-floor', frame: 113, add: false });
    stamp.setOrigin(0);
    const tileW = 16;
    const tileH = 16;
    for (let y = 0; y < camH; y += tileH) {
      for (let x = 0; x < camW; x += tileW) {
        rt.draw(stamp, x, y);
      }
    }
    stamp.destroy();

    // Layer 2: Dark warm overlay
    const overlay = this.add.graphics().setDepth(1);
    overlay.fillStyle(0x0d0a06, 0.68);
    overlay.fillRect(0, 0, camW, camH);

    // Layer 3: Atmospheric floating spirit particles
    if (this.textures.exists('fx-spirit')) {
      const frameCount = this.textures.get('fx-spirit').frameTotal - 1;
      const frames = [];
      for (let i = 0; i < Math.min(frameCount, 4); i++) frames.push(i);

      this.particleEmitter = this.add.particles(0, 0, 'fx-spirit', {
        frame: frames,
        x: { min: 0, max: camW },
        y: { min: camH + 10, max: camH + 30 },
        scale: { start: 0.5, end: 0.15 },
        alpha: { start: 0.12, end: 0 },
        speed: { min: 8, max: 20 },
        angle: { min: 260, max: 280 },
        lifespan: { min: 5000, max: 9000 },
        frequency: 900,
        quantity: 1,
        blendMode: 'ADD',
      });
      this.particleEmitter.setDepth(2);
    }
  }

  // =========================================================================
  // TITLE
  // =========================================================================

  createTitleArea(camW) {
    // Panel backing behind title
    this.add.nineslice(camW / 2, 46, 'ui-panel', null, 420, 64, 4, 4, 4, 4)
      .setAlpha(0.6).setDepth(15);

    // Glow text (pulsing behind main title)
    const titleGlow = this.add.text(camW / 2, 44, 'DÖNER FIGHT', {
      fontSize: '52px',
      fontFamily: 'monospace',
      fill: '#ffaa33',
      stroke: '#ffaa33',
      strokeThickness: 14,
    }).setOrigin(0.5).setAlpha(0.12).setDepth(16);

    this.tweens.add({
      targets: titleGlow,
      alpha: { from: 0.08, to: 0.22 },
      yoyo: true,
      repeat: -1,
      duration: 1500,
      ease: 'Sine.easeInOut',
    });

    // Main title
    const titleText = this.add.text(camW / 2, 44, 'DÖNER FIGHT', {
      fontSize: '52px',
      fontFamily: 'monospace',
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(17);

    // Subtle pulsing
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
    this.add.text(camW / 2, 88, 'Choose your fighter', {
      fontSize: '14px',
      fontFamily: 'monospace',
      fill: '#887766',
    }).setOrigin(0.5).setDepth(17);
  }

  // =========================================================================
  // CHARACTER GRID (4x2, left side)
  // =========================================================================

  createCharacterGrid(_camW, _camH) {
    const gridOriginX = 90;
    const gridOriginY = 130;
    const cellSize = 96;
    const gap = 12;
    const cols = 4;

    this.charCells = [];

    for (let i = 0; i < CHARACTERS.length; i++) {
      const char = CHARACTERS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridOriginX + col * (cellSize + gap) + cellSize / 2;
      const y = gridOriginY + row * (cellSize + gap) + cellSize / 2;

      // Cell background — nine-patch inventory cell
      const bg = this.add.nineslice(x, y, 'ui-inventory-cell', null, cellSize, cellSize, 4, 4, 4, 4)
        .setDepth(10);

      // Face portrait
      let portrait;
      if (this.textures.exists(`${char.id}-face`)) {
        portrait = this.add.image(x, y - 6, `${char.id}-face`)
          .setScale(1.9).setDepth(11);
      } else {
        portrait = this.add.sprite(x, y - 6, `${char.id}-idle`, 0)
          .setScale(3).setDepth(11);
      }

      // Character name
      const nameText = this.add.text(x, y + 36, char.name, {
        fontSize: '10px',
        fontFamily: 'monospace',
        fill: '#c4a882',
      }).setOrigin(0.5).setDepth(12);

      // Selection highlight — gold glow frame (hidden by default)
      const highlight = this.add.nineslice(x, y, 'ui-focus', null, cellSize + 8, cellSize + 8, 3, 3, 3, 3)
        .setDepth(13).setVisible(false);

      // Invisible hit area for interaction
      const hitArea = this.add.rectangle(x, y, cellSize, cellSize, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(14);

      hitArea.on('pointerdown', () => {
        this.playSfx('sfx-accept');
        this.selectCharacter(i);
      });
      hitArea.on('pointerover', () => {
        this.playSfx('sfx-move');
        if (this.selectedCharIndex !== i) {
          this.tweens.add({
            targets: [bg, portrait, nameText],
            scaleX: '*=1.04',
            scaleY: '*=1.04',
            duration: 100,
            ease: 'Back.easeOut',
          });
        }
      });
      hitArea.on('pointerout', () => {
        if (this.selectedCharIndex !== i) {
          // Reset scale
          bg.setScale(1);
          portrait.setScale(this.textures.exists(`${char.id}-face`) ? 1.9 : 3);
          nameText.setScale(1);
        }
      });

      this.charCells.push({ bg, portrait, nameText, highlight, hitArea, baseY: portrait.y });
    }
  }

  // =========================================================================
  // PREVIEW PANEL (right side)
  // =========================================================================

  createPreview(_camW, _camH) {
    // Outer bordered panel
    this.add.nineslice(880, 216, 'ui-panel', null, 520, 210, 4, 4, 4, 4)
      .setDepth(10);

    // Inner dark inset area for character sprite
    this.add.nineslice(700, 216, 'ui-panel-interior', null, 150, 180, 4, 4, 4, 4)
      .setDepth(11);

    // FX circle decoration behind character
    if (this.textures.exists('fx-circle')) {
      this.fxCircleSprite = this.add.sprite(700, 210, 'fx-circle', 0)
        .setScale(4.5)
        .setAlpha(0.2)
        .setTint(0xffaa33)
        .setDepth(12);

      const circleAnimKey = 'fx-circle-play';
      if (this.anims.exists(circleAnimKey)) {
        this.fxCircleSprite.play({ key: circleAnimKey, repeat: -1 });
      }
    }

    // Preview walking sprite (larger)
    this.previewSprite = this.add.sprite(700, 210, 'boy-walk', 0)
      .setScale(6).setDepth(13);

    // --- Text area (right of sprite) ---

    // Character name
    this.previewName = this.add.text(810, 145, 'Boy', {
      fontSize: '26px',
      fontFamily: 'monospace',
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(14);

    // Decorative separator line
    const sep = this.add.graphics().setDepth(14);
    sep.lineStyle(1, 0xffdd44, 0.3);
    sep.lineBetween(810, 165, 1100, 165);

    // Passive name
    this.passiveName = this.add.text(810, 190, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      fill: '#88ddff',
    }).setOrigin(0, 0.5).setDepth(14);

    // Passive description
    this.passiveDesc = this.add.text(810, 215, '', {
      fontSize: '12px',
      fontFamily: 'monospace',
      fill: '#9999bb',
      fontStyle: 'italic',
      wordWrap: { width: 260 },
    }).setOrigin(0, 0.5).setDepth(14);
  }

  // =========================================================================
  // NAME INPUT
  // =========================================================================

  createNameInput(camW, _camH) {
    const nameY = 360;

    // Panel container
    this.add.nineslice(camW / 2, nameY, 'ui-panel', null, 380, 46, 4, 4, 4, 4)
      .setDepth(10);

    // Label
    this.add.text(camW / 2 - 150, nameY, 'Name:', {
      fontSize: '16px',
      fontFamily: 'monospace',
      fill: '#ddccaa',
    }).setOrigin(0, 0.5).setDepth(12);

    // DOM text input — transparent bg so nine-patch panel shows through
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Player';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 16px;
      font-family: monospace;
      padding: 4px 10px;
      width: 200px;
      background: transparent;
      color: #ffdd44;
      border: none;
      outline: none;
      caret-color: #ffdd44;
    `;

    this.nameInput = this.add.dom(camW / 2 + 40, nameY, inputElement).setDepth(12);
  }

  // =========================================================================
  // BUTTONS (nine-patch textures)
  // =========================================================================

  createButtons(camW, _camH) {
    const btnY = 420;

    this.createButton(camW / 2 - 100, btnY, 'PLAY', () => {
      this.startGame('normal');
    });

    this.createButton(camW / 2 + 100, btnY, 'SANDBOX', () => {
      this.startGame('sandbox');
    });

    // Hint text
    this.add.text(camW / 2, btnY + 38, 'Sandbox: Free SP, training dummies, no ring shrink', {
      fontSize: '11px',
      fontFamily: 'monospace',
      fill: '#665544',
    }).setOrigin(0.5).setDepth(12);
  }

  createButton(x, y, label, callback) {
    const w = 170;
    const h = 44;

    // Normal state
    const btnNormal = this.add.nineslice(x, y, 'ui-button', null, w, h, 4, 4, 2, 2)
      .setDepth(10);
    // Hover state (hidden)
    const btnHover = this.add.nineslice(x, y, 'ui-button-hover', null, w, h, 4, 4, 2, 2)
      .setDepth(10).setVisible(false);
    // Pressed state (hidden)
    const btnPressed = this.add.nineslice(x, y, 'ui-button-pressed', null, w, h, 4, 4, 2, 2)
      .setDepth(10).setVisible(false);

    // Button label
    const text = this.add.text(x, y - 1, label, {
      fontSize: '16px',
      fontFamily: 'monospace',
      fill: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(11);

    // Invisible hit area
    const hitArea = this.add.rectangle(x, y, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(12);

    hitArea.on('pointerover', () => {
      btnNormal.setVisible(false);
      btnHover.setVisible(true);
      btnPressed.setVisible(false);
      this.playSfx('sfx-move');
    });
    hitArea.on('pointerout', () => {
      btnNormal.setVisible(true);
      btnHover.setVisible(false);
      btnPressed.setVisible(false);
      text.setY(y - 1);
    });
    hitArea.on('pointerdown', () => {
      btnNormal.setVisible(false);
      btnHover.setVisible(false);
      btnPressed.setVisible(true);
      text.setY(y + 1);
    });
    hitArea.on('pointerup', () => {
      btnNormal.setVisible(true);
      btnHover.setVisible(false);
      btnPressed.setVisible(false);
      text.setY(y - 1);
      this.playSfx('sfx-accept');
      callback();
    });
  }

  // =========================================================================
  // BOTTOM BAR (tips + sound)
  // =========================================================================

  createBottomBar(camW, camH) {
    // Panel behind tips
    this.add.nineslice(camW / 2, camH - 22, 'ui-panel', null, 480, 28, 4, 4, 4, 4)
      .setAlpha(0.35).setDepth(10);

    const tipText = this.add.text(camW / 2, camH - 22, TIPS[0], {
      fontSize: '11px',
      fontFamily: 'monospace',
      fill: '#887766',
      fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(12);

    let tipIndex = 0;
    this._tipTimer = this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        tipIndex = (tipIndex + 1) % TIPS.length;
        tipText.setText(TIPS[tipIndex]);
      },
    });
  }

  createSoundToggle(camW) {
    const isMuted = this.sound.mute;
    const btnSize = 34;
    const x = camW - 28;
    const y = 28;

    // Nine-patch panel background
    const bg = this.add.nineslice(x, y, 'ui-panel', null, btnSize, btnSize, 4, 4, 4, 4)
      .setDepth(10);

    const icon = this.add.text(x, y, isMuted ? '🔇' : '🔊', {
      fontSize: '16px',
    }).setOrigin(0.5).setDepth(12);

    const hitArea = this.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(14);

    hitArea.on('pointerover', () => bg.setTint(0xddddaa));
    hitArea.on('pointerout', () => bg.clearTint());
    hitArea.on('pointerdown', () => {
      this.sound.mute = !this.sound.mute;
      localStorage.setItem('soundMuted', this.sound.mute);
      icon.setText(this.sound.mute ? '🔇' : '🔊');
    });
  }

  // =========================================================================
  // CHARACTER SELECTION LOGIC
  // =========================================================================

  selectCharacter(index) {
    // Deselect previous
    const prev = this.charCells[this.selectedCharIndex];
    if (prev) {
      prev.highlight.setVisible(false);
      prev.nameText.setColor('#c4a882');
      prev.bg.setScale(1);
      prev.portrait.setScale(this.textures.exists(`${CHARACTERS[this.selectedCharIndex].id}-face`) ? 1.9 : 3);
      prev.nameText.setScale(1);
      // Stop floating tween on previous
      if (this.floatTween) {
        this.floatTween.stop();
        this.floatTween = null;
        prev.portrait.setY(prev.baseY);
      }
    }

    this.selectedCharIndex = index;
    const cell = this.charCells[index];
    const char = CHARACTERS[index];

    // Highlight selected cell
    cell.highlight.setVisible(true);
    cell.nameText.setColor('#ffdd44');

    // Selection bounce
    this.tweens.add({
      targets: [cell.bg, cell.portrait, cell.nameText],
      scaleX: '*=1.06',
      scaleY: '*=1.06',
      yoyo: true,
      duration: 120,
      ease: 'Back.easeOut',
    });

    // Gentle floating tween on selected portrait
    this.floatTween = this.tweens.add({
      targets: cell.portrait,
      y: cell.baseY - 2,
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });

    // Update preview panel — fade transition
    if (this.previewSprite) {
      this.tweens.add({
        targets: this.previewSprite,
        alpha: 0,
        duration: 80,
        onComplete: () => {
          this.previewSprite.play(`${char.id}-walk-down`);
          this.tweens.add({
            targets: this.previewSprite,
            alpha: 1,
            duration: 120,
          });
        },
      });
    }

    if (this.previewName) {
      this.previewName.setText(char.name);
    }

    // Update passive display
    const passive = getPassive(char.id);
    if (this.passiveName) {
      this.passiveName.setText(passive.name || '');
    }
    if (this.passiveDesc) {
      this.passiveDesc.setText(passive.description || '');
    }
  }

  // =========================================================================
  // GAME START
  // =========================================================================

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

    // Clean up particles
    if (this.particleEmitter) {
      this.particleEmitter.destroy();
      this.particleEmitter = null;
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

  // =========================================================================
  // AUDIO
  // =========================================================================

  startMenuMusic() {
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
        // Audio not available
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
}
