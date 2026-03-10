import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { CHARACTERS } from './BootScene.js';
import { getPassive } from '../../shared/characterPassives.js';
import { MSG } from '../../shared/messageTypes.js';
import { UI_FONT, TIPS } from '../config.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedCharIndex = 0;
    this.playerName = 'Âşık';
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
    cam.fadeIn(500, 0, 0, 0);

    this.createBackground(camW, camH);
    this.createTitleArea(camW);
    this.createCharacterGrid(camW, camH);
    this.createPreview(camW, camH);
    this.createNameInput(camW, camH);
    this.createButtons(camW, camH);
    this.createBottomBar(camW, camH);
    this.createSoundToggle(camW);
    this.selectCharacter(0);
    this.startMenuMusic();

    this.events.once('shutdown', () => {
      this.destroyRoomList();
    }, this);
  }

  // =========================================================================
  // BACKGROUND
  // =========================================================================

  createBackground(camW, camH) {
    // Layer 1: Full-bleed background image — scale to cover the canvas
    if (this.textures.exists('menu-bg')) {
      const bg = this.add.image(camW / 2, camH / 2, 'menu-bg').setDepth(0);
      const scaleX = camW / bg.width;
      const scaleY = camH / bg.height;
      const scale = Math.max(scaleX, scaleY); // cover, not contain
      bg.setScale(scale);
    } else {
      // Fallback: solid dark background
      this.cameras.main.setBackgroundColor('#0a0a1e');
    }

    // Layer 2: Subtle dark vignette overlay so UI text is readable
    this.add.nineslice(camW / 2, camH / 2, 'ui-bg-2', null, camW, camH, 4, 4, 4, 4)
      .setDepth(1).setTint(0x000000).setAlpha(0.25);

    // Layer 3: Atmospheric floating spirit particles
    if (this.textures.exists('fx-spirit')) {
      const frameCount = this.textures.get('fx-spirit').frameTotal - 1;
      const frames = [];
      for (let i = 0; i < Math.min(frameCount, 4); i++) frames.push(i);

      this.particleEmitter = this.add.particles(0, 0, 'fx-spirit', {
        frame: frames,
        x: { min: 0, max: camW },
        y: { min: camH + 10, max: camH + 30 },
        scale: { start: 0.8, end: 0.15 },
        alpha: { start: 0.22, end: 0 },
        speed: { min: 10, max: 25 },
        angle: { min: 255, max: 285 },
        lifespan: { min: 5000, max: 9000 },
        frequency: 500,
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
    // Panel backing
    this.add.nineslice(camW / 2, 44, 'ui-panel', null, 360, 48, 4, 4, 4, 4)
      .setAlpha(0.55).setDepth(15);

    // Glow text
    const titleGlow = this.add.text(camW / 2, 42, 'ÂŞIKLAR MEYDANE', {
      fontSize: '36px', fontFamily: UI_FONT,
      fill: '#ffaa33', stroke: '#ffaa33', strokeThickness: 16,
    }).setOrigin(0.5).setAlpha(0.12).setDepth(16);

    this.tweens.add({
      targets: titleGlow,
      alpha: { from: 0.08, to: 0.22 },
      yoyo: true, repeat: -1, duration: 1500,
      ease: 'Sine.easeInOut',
    });

    // Main title
    const titleText = this.add.text(camW / 2, 42, 'ÂŞIKLAR MEYDANE', {
      fontSize: '36px', fontFamily: UI_FONT,
      fill: '#ffdd44', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(17);

    this.tweens.add({
      targets: titleText,
      scaleX: 1.02, scaleY: 1.02,
      yoyo: true, repeat: -1, duration: 1200,
      ease: 'Sine.easeInOut',
    });

    this.add.text(camW / 2, 80, 'Aşığını seç', {
      fontSize: '12px', fontFamily: UI_FONT, fill: '#3a2218',
    }).setOrigin(0.5).setDepth(17);
  }

  // =========================================================================
  // CHARACTER GRID (left side, 2 columns x 4 rows)
  // =========================================================================

  createCharacterGrid(_camW, _camH) {
    // 2 columns x 4 rows on the left — tall & narrow to pair with tall preview
    const gridOriginX = 60;
    const gridOriginY = 108;
    const cellW = 100;
    const cellH = 68;
    const gapX = 8;
    const gapY = 6;
    const cols = 2;

    this.charCells = [];

    for (let i = 0; i < CHARACTERS.length; i++) {
      const char = CHARACTERS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridOriginX + col * (cellW + gapX) + cellW / 2;
      const y = gridOriginY + row * (cellH + gapY) + cellH / 2;

      // Cell background
      const bg = this.add.nineslice(x, y, 'ui-inventory-cell', null, cellW, cellH, 4, 4, 4, 4)
        .setDepth(10);

      // Face portrait (centered, shifted up)
      let portrait;
      if (this.textures.exists(`${char.id}-face`)) {
        portrait = this.add.image(x, y - 10, `${char.id}-face`)
          .setScale(1.6).setDepth(11);
      } else {
        portrait = this.add.sprite(x, y - 10, `${char.id}-idle`, 0)
          .setScale(3).setDepth(11);
      }

      // Character name (centered below portrait)
      const nameText = this.add.text(x, y + 26, char.name, {
        fontSize: '12px', fontFamily: UI_FONT, fill: '#3a2218',
      }).setOrigin(0.5, 0.5).setDepth(12);

      // Selection highlight
      const highlight = this.add.nineslice(x, y, 'ui-focus', null, cellW + 4, cellH + 4, 2, 2, 2, 2)
        .setTint(0xffdd44).setDepth(13).setVisible(false);

      // Hit area
      const hitArea = this.add.rectangle(x, y, cellW, cellH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(14);

      hitArea.on('pointerdown', () => {
        this.playSfx('sfx-accept');
        this.selectCharacter(i);
      });
      hitArea.on('pointerover', () => {
        this.playSfx('sfx-move');
        if (this.selectedCharIndex !== i) {
          bg.setTint(0xccccaa);
        }
      });
      hitArea.on('pointerout', () => {
        if (this.selectedCharIndex !== i) {
          bg.clearTint();
        }
      });

      this.charCells.push({ bg, portrait, nameText, highlight, hitArea, baseY: portrait.y });
    }
  }

  // =========================================================================
  // PREVIEW PANEL (center-right, large character showcase)
  // =========================================================================

  createPreview(camW, _camH) {
    const panelCX = 730;
    const panelCY = 290;
    const panelW = 580;
    const panelH = 300;

    // Outer wood frame panel
    this.add.nineslice(panelCX, panelCY, 'ui-panel', null, panelW, panelH, 4, 4, 4, 4)
      .setDepth(10);

    // Parchment interior — warm beige using nineslice
    this.add.nineslice(panelCX, panelCY, 'ui-bg', null, panelW - 20, panelH - 20, 4, 4, 4, 4)
      .setDepth(11).setTint(0xd4c4a0);
    // Subtle texture overlay using bg panel
    this.add.nineslice(panelCX, panelCY, 'ui-bg', null, panelW - 20, panelH - 20, 4, 4, 4, 4)
      .setAlpha(0.15).setDepth(11);

    // ── Left side: walking sprite with FX ──
    const spriteAreaX = 475;
    const spriteAreaY = panelCY - 10;

    // Soft dark backdrop behind sprite (vignette look)
    this.add.nineslice(spriteAreaX, panelCY - 3, 'ui-bg-2', null, 160, panelH - 60, 4, 4, 4, 4)
      .setDepth(11).setTint(0x3a2a18).setAlpha(0.2);

    // Subtle circle FX behind character
    if (this.textures.exists('fx-circle')) {
      this.fxCircleSprite = this.add.sprite(spriteAreaX, spriteAreaY + 10, 'fx-circle', 0)
        .setScale(4).setAlpha(0.08).setTint(0xddaa44).setDepth(12);
      const circleAnimKey = 'fx-circle-play';
      if (this.anims.exists(circleAnimKey)) {
        this.fxCircleSprite.play({ key: circleAnimKey, repeat: -1 });
      }
    }

    // Aura glow at feet
    if (this.textures.exists('fx-aura')) {
      this.previewAura = this.add.sprite(spriteAreaX, spriteAreaY + 50, 'fx-aura', 0)
        .setScale(3).setAlpha(0.18).setTint(0xddaa44).setDepth(12);
      const auraKey = 'fx-aura-play';
      if (this.anims.exists(auraKey)) {
        this.previewAura.play({ key: auraKey, repeat: -1 });
      }
    }

    // Walking sprite preview
    this.previewSprite = this.add.sprite(spriteAreaX, spriteAreaY, 'boy-walk', 0)
      .setScale(7).setDepth(13);

    // ── Right side: character info ──
    const rightX = 630;

    // Character name — large italic serif-style
    this.previewName = this.add.text(rightX, panelCY - 115, 'Boy', {
      fontSize: '24px', fontFamily: UI_FONT,
      fill: '#2a1a08', fontStyle: 'italic',
    }).setOrigin(0, 0.5).setDepth(14);

    // Separator line (dark, like ink)
    this.previewSep = this.add.image(rightX + 175, panelCY - 96, 'ui-slider-progress')
      .setDisplaySize(350, 1).setTint(0x5a4a38).setAlpha(0.4).setDepth(14);

    // PASSIVE label
    this.add.text(rightX, panelCY - 75, 'HÜNER:', {
      fontSize: '13px', fontFamily: UI_FONT, fill: '#5a3a28',
    }).setOrigin(0, 0.5).setDepth(14);

    // Passive icon + name (with shield emoji)
    this.passiveName = this.add.text(rightX + 4, panelCY - 52, '', {
      fontSize: '13px', fontFamily: UI_FONT,
      fill: '#1a3388', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(14);

    // Passive description
    this.passiveDesc = this.add.text(rightX + 4, panelCY - 30, '', {
      fontSize: '13px', fontFamily: UI_FONT,
      fill: '#3a2a18', fontStyle: 'italic',
      wordWrap: { width: 190 },
    }).setOrigin(0, 0.5).setDepth(14);

    // ── Large face portrait (hero element, like the reference) ──
    this.previewFace = null;
    const faceX = rightX + 160;
    const faceY = panelCY + 50;
    // Dark inventory cell frame behind portrait
    this.previewFaceFrame = this.add.nineslice(faceX, faceY, 'ui-inventory-cell', null, 120, 120, 4, 4, 4, 4)
      .setDepth(12);
    if (this.textures.exists('boy-face')) {
      this.previewFace = this.add.image(faceX, faceY, 'boy-face')
        .setScale(2.7).setDepth(13);
    }

    // ── Character parade at bottom of panel ──
    const paradeY = panelCY + panelH / 2 - 26;
    this.paradeSprites = [];
    for (let i = 0; i < CHARACTERS.length; i++) {
      const char = CHARACTERS[i];
      const totalW = CHARACTERS.length * 44;
      const startX = panelCX - totalW / 2 + 22;
      const px = startX + i * 44;
      const sprite = this.add.sprite(px, paradeY, `${char.id}-walk`, 0)
        .setScale(2).setAlpha(0.35).setDepth(14);
      sprite.play(`${char.id}-walk-down`);
      this.tweens.add({
        targets: sprite,
        y: paradeY - 2,
        yoyo: true, repeat: -1,
        duration: 900 + i * 80,
        ease: 'Sine.easeInOut',
      });
      this.paradeSprites.push(sprite);
    }

    // Thin ink separator above parade
    const totalW = CHARACTERS.length * 44;
    const sepStartX = panelCX - totalW / 2;
    this.add.image(sepStartX + totalW / 2, paradeY - 14, 'ui-slider-progress')
      .setDisplaySize(totalW, 1).setTint(0x8a7a68).setAlpha(0.2).setDepth(12);
  }

  // =========================================================================
  // NAME INPUT
  // =========================================================================

  createNameInput(camW, _camH) {
    const nameY = 510;

    this.add.nineslice(camW / 2, nameY, 'ui-panel', null, 340, 36, 4, 4, 4, 4)
      .setDepth(10);

    this.add.text(camW / 2 - 150, nameY, 'Mahlas:', {
      fontSize: '13px', fontFamily: UI_FONT, fill: '#3a2218',
    }).setOrigin(0, 0.5).setDepth(12);

    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Âşık';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 13px; font-family: 'KiwiSoda', monospace;
      padding: 4px 10px; width: 200px;
      background: transparent; color: #ffdd44;
      border: none; outline: none; caret-color: #ffdd44;
    `;

    this.nameInput = this.add.dom(camW / 2 + 40, nameY, inputElement).setDepth(12);
  }

  // =========================================================================
  // BUTTONS
  // =========================================================================

  createButtons(camW, _camH) {
    const btnY = 570;

    this.createButton(camW / 2 - 180, btnY, 'MEYDANE', () => {
      this.startGame('normal');
    });

    this.createButton(camW / 2, btnY, 'ODALAR', () => {
      this.showRoomList();
    });

    this.createButton(camW / 2 + 180, btnY, 'SERBEST', () => {
      this.startGame('sandbox');
    });

    this.add.text(camW / 2, btnY + 36, 'Serbest Meydan: Sınırsız İlham, talim kuklaları, meydan daralmasız', {
      fontSize: '12px', fontFamily: UI_FONT, fill: '#3a2218',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);

    // Room list panel elements (hidden initially)
    this.roomListElements = [];
    this.roomListSocket = null;
    this.selectedRoomId = null;
  }

  createButton(x, y, label, callback) {
    const w = 180;
    const h = 40;

    // Single nineslice button — tint-based states
    const btn = this.add.nineslice(x, y, 'ui-button', null, w, h, 4, 4, 2, 2)
      .setDepth(10);

    const text = this.add.text(x, y - 1, label, {
      fontSize: '20px', fontFamily: UI_FONT,
      fill: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(11);

    const hitArea = this.add.rectangle(x, y, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(12);

    hitArea.on('pointerover', () => {
      btn.setTint(0xffe8cc);
      this.playSfx('sfx-move');
    });
    hitArea.on('pointerout', () => {
      btn.clearTint();
      text.setY(y - 1);
    });
    hitArea.on('pointerdown', () => {
      btn.setTint(0xccaa88);
      text.setY(y + 2);
    });
    hitArea.on('pointerup', () => {
      btn.clearTint();
      text.setY(y - 1);
      this.playSfx('sfx-accept');
      callback();
    });
  }

  // =========================================================================
  // BOTTOM BAR
  // =========================================================================

  createBottomBar(camW, camH) {
    // Bottom bar: wood panel with gold decorative line
    this.add.nineslice(camW / 2, camH - 18, 'ui-panel', null, 480, 24, 4, 4, 4, 4)
      .setDepth(10);

    // Gold line above the tip panel
    this.add.image(camW / 2, camH - 34, 'ui-slider-progress')
      .setDisplaySize(540, 1).setTint(0xddaa44).setAlpha(0.5).setDepth(11);

    const tipText = this.add.text(camW / 2, camH - 18, TIPS[0], {
      fontSize: '12px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(12);

    let tipIndex = 0;
    this._tipTimer = this.time.addEvent({
      delay: 3000, loop: true,
      callback: () => {
        tipIndex = (tipIndex + 1) % TIPS.length;
        this.tweens.add({
          targets: tipText, alpha: 0, duration: 200,
          onComplete: () => {
            tipText.setText(TIPS[tipIndex]);
            this.tweens.add({ targets: tipText, alpha: 1, duration: 200 });
          },
        });
      },
    });
  }

  createSoundToggle(camW) {
    const isMuted = this.sound.mute;
    const x = camW - 28;
    const y = 28;

    const bg = this.add.nineslice(x, y, 'ui-panel', null, 28, 28, 4, 4, 4, 4).setDepth(10);
    const icon = this.add.image(x, y, isMuted ? 'spell-BookThunder-off' : 'spell-BookThunder')
      .setDepth(12).setDisplaySize(20, 20);
    const hitArea = this.add.rectangle(x, y, 28, 28, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(14);

    hitArea.on('pointerover', () => bg.setTint(0xddddaa));
    hitArea.on('pointerout', () => bg.clearTint());
    hitArea.on('pointerdown', () => {
      this.sound.mute = !this.sound.mute;
      localStorage.setItem('soundMuted', this.sound.mute);
      icon.setTexture(this.sound.mute ? 'spell-BookThunder-off' : 'spell-BookThunder');
    });
  }

  // =========================================================================
  // CHARACTER SELECTION LOGIC
  // =========================================================================

  selectCharacter(index) {
    const prev = this.charCells[this.selectedCharIndex];
    if (prev) {
      prev.highlight.setVisible(false);
      prev.nameText.setColor('#c4a882');
      prev.bg.clearTint();
      if (this.floatTween) {
        this.floatTween.stop();
        this.floatTween = null;
        prev.portrait.setY(prev.baseY);
      }
    }

    this.selectedCharIndex = index;
    const cell = this.charCells[index];
    const char = CHARACTERS[index];

    cell.highlight.setVisible(true);
    cell.nameText.setColor('#ffdd44');
    cell.bg.setTint(0xbbbbaa);

    // Gentle floating tween on selected portrait
    this.floatTween = this.tweens.add({
      targets: cell.portrait,
      y: cell.baseY - 3,
      yoyo: true, repeat: -1, duration: 1000,
      ease: 'Sine.easeInOut',
    });

    // Update preview — fade transition
    if (this.previewSprite) {
      this.tweens.add({
        targets: this.previewSprite,
        alpha: 0, duration: 60,
        onComplete: () => {
          this.previewSprite.play(`${char.id}-walk-down`);
          this.tweens.add({
            targets: this.previewSprite,
            alpha: 1, duration: 100,
          });
        },
      });
    }

    // Update face portrait
    if (this.previewFace && this.textures.exists(`${char.id}-face`)) {
      this.tweens.add({
        targets: this.previewFace,
        alpha: 0, duration: 50,
        onComplete: () => {
          this.previewFace.setTexture(`${char.id}-face`);
          this.tweens.add({ targets: this.previewFace, alpha: 1, duration: 100 });
        },
      });
    }

    // Highlight this character in the parade
    if (this.paradeSprites) {
      this.paradeSprites.forEach((s, i) => {
        s.setAlpha(i === index ? 0.8 : 0.3);
        s.setScale(i === index ? 2.5 : 2);
      });
    }

    if (this.previewName) this.previewName.setText(char.name);

    const passive = getPassive(char.id);
    if (this.passiveName) {
      const icon = this.getPassiveIcon(passive);
      this.passiveName.setText(`${icon} ${passive.name || ''}`);
    }
    if (this.passiveDesc) this.passiveDesc.setText(passive.description || '');
  }

  // =========================================================================
  // ROOM LIST
  // =========================================================================

  showRoomList() {
    // If already showing, just refresh
    if (this.roomListElements && this.roomListElements.length > 0) {
      this.refreshRoomList();
      return;
    }

    const cam = this.cameras.main;
    const camW = cam.width;
    const camH = cam.height;
    const DEPTH = 50;

    // Dimmer
    const dimmer = this.add.nineslice(camW / 2, camH / 2, 'ui-bg-2', null, camW, camH, 4, 4, 4, 4)
      .setTint(0x000000).setAlpha(0.5).setDepth(DEPTH).setInteractive();
    this.roomListElements.push(dimmer);

    // Panel
    const panelW = 400;
    const panelH = 340;
    const panel = this.add.nineslice(camW / 2, camH / 2, 'ui-panel', null, panelW, panelH, 4, 4, 4, 4)
      .setDepth(DEPTH + 1);
    this.roomListElements.push(panel);

    // Title
    const py = camH / 2 - panelH / 2;
    const title = this.add.text(camW / 2, py + 28, 'AÇIK ODALAR', {
      fontSize: '24px', fontFamily: UI_FONT,
      fill: '#ffdd44', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH + 2);
    this.roomListElements.push(title);

    // Loading text (will be replaced by room rows)
    this.roomListLoading = this.add.text(camW / 2, camH / 2, 'Yükleniyor...', {
      fontSize: '13px', fontFamily: UI_FONT, fill: '#5a3a28',
    }).setOrigin(0.5).setDepth(DEPTH + 3);
    this.roomListElements.push(this.roomListLoading);

    // YENİLE button
    this.createRoomListButton(camW / 2 - 80, py + panelH - 36, 'YENİLE', () => {
      this.refreshRoomList();
    }, DEPTH);

    // KAPAT button
    this.createRoomListButton(camW / 2 + 80, py + panelH - 36, 'KAPAT', () => {
      this.destroyRoomList();
    }, DEPTH);

    // Connect temporary socket and fetch rooms
    this.connectAndFetchRooms();
  }

  connectAndFetchRooms() {
    if (this.roomListSocket) {
      this.roomListSocket.disconnect();
    }

    const serverUrl = window.location.origin;
    this.roomListSocket = io(serverUrl, { transports: ['websocket'] });

    this.roomListSocket.on('connect', () => {
      this.roomListSocket.emit(MSG.CLIENT_LIST_ROOMS);
    });

    this.roomListSocket.on(MSG.SERVER_ROOM_LIST, (data) => {
      this.renderRoomList(data.rooms || []);
    });
  }

  refreshRoomList() {
    if (this.roomListSocket && this.roomListSocket.connected) {
      this.roomListSocket.emit(MSG.CLIENT_LIST_ROOMS);
    } else {
      this.connectAndFetchRooms();
    }
  }

  renderRoomList(rooms) {
    // Remove old room row elements (keep panel, title, buttons)
    if (this.roomRowElements) {
      for (const el of this.roomRowElements) {
        if (el && !el.destroyed) el.destroy();
      }
    }
    this.roomRowElements = [];

    // Hide loading text
    if (this.roomListLoading && !this.roomListLoading.destroyed) {
      this.roomListLoading.setVisible(false);
    }

    const cam = this.cameras.main;
    const camW = cam.width;
    const camH = cam.height;
    const panelH = 340;
    const py = camH / 2 - panelH / 2;
    const DEPTH = 50;

    if (rooms.length === 0) {
      const emptyText = this.add.text(camW / 2, camH / 2 - 10, 'Açık oda yok', {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#5a3a28',
      }).setOrigin(0.5).setDepth(DEPTH + 3);
      this.roomRowElements.push(emptyText);
      this.roomListElements.push(emptyText);

      const hintText = this.add.text(camW / 2, camH / 2 + 16, 'MEYDANE\'ye basıp oda kur!', {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#3a6a28', fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(DEPTH + 3);
      this.roomRowElements.push(hintText);
      this.roomListElements.push(hintText);
      return;
    }

    const rowH = 36;
    const rowW = 360;
    const startY = py + 70;
    const maxVisible = Math.min(rooms.length, 6);

    for (let i = 0; i < maxVisible; i++) {
      const room = rooms[i];
      const rowY = startY + i * (rowH + 6);

      // Row background
      const rowBg = this.add.nineslice(camW / 2, rowY, 'ui-inventory-cell', null, rowW, rowH, 4, 4, 4, 4)
        .setDepth(DEPTH + 2);
      this.roomRowElements.push(rowBg);
      this.roomListElements.push(rowBg);

      // Host name
      const hostText = this.add.text(camW / 2 - rowW / 2 + 16, rowY, room.hostName, {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#ffdd44',
      }).setOrigin(0, 0.5).setDepth(DEPTH + 3);
      this.roomRowElements.push(hostText);
      this.roomListElements.push(hostText);

      // Player count
      const countText = this.add.text(camW / 2 + 60, rowY, `${room.playerCount}/${room.maxPlayers}`, {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#cccccc',
      }).setOrigin(0.5).setDepth(DEPTH + 3);
      this.roomRowElements.push(countText);
      this.roomListElements.push(countText);

      // KATIL button
      const btnX = camW / 2 + rowW / 2 - 54;
      const btnW = 70;
      const btnH = 26;
      const joinBtn = this.add.nineslice(btnX, rowY, 'ui-button', null, btnW, btnH, 4, 4, 2, 2)
        .setDepth(DEPTH + 3);
      this.roomRowElements.push(joinBtn);
      this.roomListElements.push(joinBtn);

      const joinText = this.add.text(btnX, rowY - 1, 'KATIL', {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(DEPTH + 4);
      this.roomRowElements.push(joinText);
      this.roomListElements.push(joinText);

      const joinHit = this.add.rectangle(btnX, rowY, btnW, btnH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH + 5);
      this.roomRowElements.push(joinHit);
      this.roomListElements.push(joinHit);

      joinHit.on('pointerover', () => joinBtn.setTint(0xffe8cc));
      joinHit.on('pointerout', () => joinBtn.clearTint());
      joinHit.on('pointerdown', () => joinBtn.setTint(0xccaa88));
      joinHit.on('pointerup', () => {
        joinBtn.clearTint();
        this.playSfx('sfx-accept');
        this.selectedRoomId = room.roomId;
        this.startGame('join');
      });
    }
  }

  createRoomListButton(x, y, label, callback, depth) {
    const w = 120;
    const h = 32;
    const btn = this.add.nineslice(x, y, 'ui-button', null, w, h, 4, 4, 2, 2)
      .setDepth(depth + 2);
    this.roomListElements.push(btn);

    const text = this.add.text(x, y - 1, label, {
      fontSize: '13px', fontFamily: UI_FONT, fill: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(depth + 3);
    this.roomListElements.push(text);

    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 4);
    this.roomListElements.push(hit);

    hit.on('pointerover', () => { btn.setTint(0xffe8cc); this.playSfx('sfx-move'); });
    hit.on('pointerout', () => btn.clearTint());
    hit.on('pointerdown', () => btn.setTint(0xccaa88));
    hit.on('pointerup', () => {
      btn.clearTint();
      this.playSfx('sfx-accept');
      callback();
    });
  }

  destroyRoomList() {
    if (this.roomListSocket) {
      this.roomListSocket.removeAllListeners();
      this.roomListSocket.disconnect();
      this.roomListSocket = null;
    }
    if (this.roomListElements) {
      for (const el of this.roomListElements) {
        if (el && !el.destroyed) el.destroy();
      }
      this.roomListElements = [];
    }
    if (this.roomRowElements) {
      for (const el of this.roomRowElements) {
        if (el && !el.destroyed) el.destroy();
      }
      this.roomRowElements = [];
    }
    this.roomListLoading = null;
    this.selectedRoomId = null;
  }

  // =========================================================================
  // GAME START
  // =========================================================================

  startGame(mode) {
    if (this.transitioning) return;
    this.transitioning = true;

    const char = CHARACTERS[this.selectedCharIndex];
    const name = this.nameInput ? this.nameInput.node.value.trim() || 'Âşık' : 'Âşık';
    const roomId = this.selectedRoomId || null;  // Save before cleanup

    this.playSfx('sfx-accept');

    // Clean up room list socket if open
    this.destroyRoomList();

    if (this.nameInput) { this.nameInput.destroy(); this.nameInput = null; }
    this.stopMenuMusic();
    if (this._tipTimer) { this._tipTimer.destroy(); this._tipTimer = null; }
    if (this.particleEmitter) { this.particleEmitter.destroy(); this.particleEmitter = null; }

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', {
        characterId: char.id,
        playerName: name,
        mode: mode,
        roomId: roomId,
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
      if (!this.menuMusic.isPlaying) this.menuMusic.play({ loop: true, volume: 0.35 });
    } else {
      try {
        this.menuMusic = this.sound.add('music-menu', { loop: true, volume: 0.35 });
        this.menuMusic.play();
      } catch (e) { /* Audio not available */ }
    }
  }

  stopMenuMusic() {
    if (this.menuMusic && this.menuMusic.isPlaying) {
      this.tweens.add({
        targets: this.menuMusic, volume: 0, duration: 400,
        onComplete: () => { this.menuMusic.stop(); },
      });
    }
  }

  getPassiveIcon(passive) {
    if (!passive || !passive.id) return '';
    const icons = {
      'demonic-vitality': '\u2764',  // heart
      'iron-armor': '\uD83D\uDEE1',  // shield
      'frost-resistance': '\u2744',  // snowflake
      'fire-resistance': '\uD83D\uDD25',  // fire
      'quick-learner': '\u26A1',  // lightning
      'shadow-step': '\uD83D\uDC63',  // footprints
      'bully': '\uD83D\uDCA5',  // collision
      'rush': '\uD83D\uDCA8',  // dash
    };
    return icons[passive.id] || '\u2728';
  }

  playSfx(key) {
    try { this.sound.play(key, { volume: 0.5 }); } catch (e) { /* */ }
  }
}
