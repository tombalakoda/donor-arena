import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { CHARACTERS } from './BootScene.js';
import { getPassive } from '../../shared/characterPassives.js';
import { MSG } from '../../shared/messageTypes.js';
import { TIPS } from '../config.js';
import {
  COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle,
} from '../ui/UIConfig.js';
import {
  createButton, createIconButton, createPanel, createDimmer,
  createSeparator, createText, createIcyFrame, animateIn,
} from '../ui/UIHelpers.js';

const CX = SCREEN.CX;
const CY = SCREEN.CY;

// Face strip
const FACE_SIZE = 40;
const FACE_INNER = 32;
const FACE_GAP = 6;
const FACE_COUNT = CHARACTERS.length;
const STRIP_W = FACE_COUNT * FACE_SIZE + (FACE_COUNT - 1) * FACE_GAP;

// Vertical positions
const TITLE_Y = 52;
const CHAR_NAME_Y = 130;
const CHAR_PASSIVE_Y = 168;
const CHAR_DESC_Y = 196;
const CHAR_SPRITE_Y = 310;
const ARROW_Y = 310;
const FACE_STRIP_Y = 455;
const BOTTOM_Y = 530;
const TIP_Y = SCREEN.H - 16;

// Arrow positions
const ARROW_LEFT_X = CX - 170;
const ARROW_RIGHT_X = CX + 170;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedCharIndex = 0;
    this.playerName = 'Âşık';
    this.faceCells = [];
    this.charSprite = null;
    this.charGlow = null;
    this.nameInput = null;
    this.transitioning = false;
    this.switching = false;
    this.menuMusic = null;
  }

  create() {
    this.transitioning = false;
    this.switching = false;
    this.cameras.main.fadeIn(500, 0, 0, 0);

    this._createBackground();
    this._createSnowParticles();
    this._createTitle();
    this._createCharInfo();
    this._createCharDisplay();
    this._createArrows();
    this._createFaceStrip();
    this._createBottomBar();
    this._createBottomTip();
    this._createSoundToggle();
    this._createKeyboardNav();

    this._selectCharacter(0, true);
    this._startMenuMusic();

    this.events.once('shutdown', () => this._destroyRoomList(), this);
  }

  // ═══════════════════════════════════════════════════════════════
  // BACKGROUND — let the art breathe
  // ═══════════════════════════════════════════════════════════════

  _createBackground() {
    if (this.textures.exists('menu-bg')) {
      const bg = this.add.image(CX, CY, 'menu-bg').setDepth(0);
      const scale = Math.max(SCREEN.W / bg.width, SCREEN.H / bg.height);
      bg.setScale(scale);
    } else {
      this.cameras.main.setBackgroundColor('#1a1510');
    }

    // Very subtle dark overlay — lighter than before so the art shows
    this.add.nineslice(CX, CY, 'ui-bg-2', null, SCREEN.W, SCREEN.H, 4, 4, 4, 4)
      .setDepth(1).setTint(0x000000).setAlpha(0.2);
  }

  // ═══════════════════════════════════════════════════════════════
  // SNOW PARTICLES — ambient atmosphere
  // ═══════════════════════════════════════════════════════════════

  _createSnowParticles() {
    if (!this.textures.exists('fx-particle-snow')) return;

    this.snowEmitter = this.add.particles(0, 0, 'fx-particle-snow', {
      x: { min: 0, max: SCREEN.W },
      y: -10,
      lifespan: { min: 4000, max: 7000 },
      speedY: { min: 15, max: 40 },
      speedX: { min: -12, max: 12 },
      scale: { min: 1.0, max: 2.5 },
      alpha: { start: 0.7, end: 0 },
      frequency: 100,
      quantity: 1,
    });
    this.snowEmitter.setDepth(3);
  }

  // ═══════════════════════════════════════════════════════════════
  // TITLE — floating gold text
  // ═══════════════════════════════════════════════════════════════

  _createTitle() {
    // Bigger title font for menu
    const TITLE_FONT = { fontSize: '52px', fontFamily: FONT.FAMILY, fontStyle: 'bold' };

    // Shadow
    const shadow = this.add.text(CX + 3, TITLE_Y + 3, 'ÂŞIKLAR MEYDANE', textStyle(TITLE_FONT, {
      fill: '#000000',
    })).setDepth(16).setOrigin(0.5).setAlpha(0.3);

    // Main title
    const title = createText(this, CX, TITLE_Y, 'ÂŞIKLAR MEYDANE', TITLE_FONT, {
      fill: '#ffffff', depth: 17,
      stroke: '#2a1a0a', strokeThickness: 6,
    });

    // Gentle float
    this.tweens.add({
      targets: [title, shadow],
      y: '+=3',
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    animateIn(this, title, { from: 'slideDown', delay: 100, duration: 400 });
    animateIn(this, shadow, { from: 'slideDown', delay: 100, duration: 400 });
  }

  // ═══════════════════════════════════════════════════════════════
  // CHARACTER INFO — name + passive floating above character
  // ═══════════════════════════════════════════════════════════════

  _createCharInfo() {
    // Character info fonts — large and readable
    const NAME_FONT = { fontSize: '38px', fontFamily: FONT.FAMILY, fontStyle: 'bold' };
    const PASSIVE_FONT = { fontSize: '24px', fontFamily: FONT.FAMILY, fontStyle: 'bold' };
    const DESC_FONT = { fontSize: '20px', fontFamily: FONT.FAMILY };

    this.charNameText = createText(this, CX, CHAR_NAME_Y, '', NAME_FONT, {
      fill: '#ffffff', depth: 15,
      stroke: '#000000', strokeThickness: 5,
    });

    this.charPassiveText = createText(this, CX, CHAR_PASSIVE_Y, '', PASSIVE_FONT, {
      fill: '#b8e4f0', depth: 15,
      stroke: '#000000', strokeThickness: 3,
    });

    this.charDescText = this.add.text(CX, CHAR_DESC_Y, '', textStyle(DESC_FONT, {
      fill: '#dce8ef',
      stroke: '#000000', strokeThickness: 2,
      wordWrap: { width: 420 },
      align: 'center',
    })).setDepth(15).setOrigin(0.5, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // BIG CHARACTER DISPLAY — center stage hero
  // ═══════════════════════════════════════════════════════════════

  _createCharDisplay() {
    // Glow/shadow beneath character — simple graphics ellipse
    this.charGlow = this.add.graphics().setDepth(8);
    this._drawCharGlow(0xffdd44);

    // Walking sprite — big and proud
    this.charSprite = this.add.sprite(CX, CHAR_SPRITE_Y, 'boy-walk', 0)
      .setScale(5.5).setDepth(10);

    if (this.anims.exists('boy-walk-down')) {
      this.charSprite.play('boy-walk-down');
    }

    animateIn(this, this.charSprite, { from: 'scale', delay: 200, duration: 350 });
  }

  _drawCharGlow(color) {
    const g = this.charGlow;
    g.clear();

    // Shadow ellipse
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(CX, CHAR_SPRITE_Y + 46, 80, 18);

    // Colored glow (outer)
    g.fillStyle(color, 0.08);
    g.fillEllipse(CX, CHAR_SPRITE_Y + 40, 140, 36);

    // Colored glow (inner)
    g.fillStyle(color, 0.15);
    g.fillEllipse(CX, CHAR_SPRITE_Y + 42, 90, 22);
  }

  // ═══════════════════════════════════════════════════════════════
  // LEFT/RIGHT ARROWS — cycle characters
  // ═══════════════════════════════════════════════════════════════

  _createArrows() {
    this._createArrow('left', ARROW_LEFT_X, ARROW_Y, -1);
    this._createArrow('right', ARROW_RIGHT_X, ARROW_Y, 1);
  }

  _createArrow(dir, x, y, delta) {
    const key = `ui-arrow-${dir}`;
    const hoverKey = `ui-arrow-${dir}-hover`;
    const hasTexture = this.textures.exists(key);
    if (!hasTexture) return;

    const arrow = this.add.image(x, y, key).setScale(2.5).setDepth(15)
      .setInteractive({ useHandCursor: true });

    arrow.on('pointerover', () => {
      if (this.textures.exists(hoverKey)) arrow.setTexture(hoverKey);
      arrow.setScale(2.8);
      this._playSfx('sfx-move');
    });

    arrow.on('pointerout', () => {
      arrow.setTexture(key);
      arrow.setScale(2.5);
    });

    arrow.on('pointerdown', () => {
      this._cycleCharacter(delta);
      // Bounce animation
      const shift = delta * 5;
      this.tweens.add({
        targets: arrow,
        x: x + shift,
        duration: 80,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    });

    animateIn(this, arrow, { from: 'fadeOnly', delay: 350, duration: 300 });
  }

  // ═══════════════════════════════════════════════════════════════
  // FACE STRIP — 8 character portraits in a row
  // ═══════════════════════════════════════════════════════════════

  _createFaceStrip() {
    this.faceCells = [];
    const startX = CX - STRIP_W / 2 + FACE_SIZE / 2;

    // Icy frosted glass frame behind the face strip
    const frameW = STRIP_W + 28;
    const frameH = FACE_SIZE + 22;
    const faceFrame = createIcyFrame(this,CX, FACE_STRIP_Y, frameW, frameH, 18);
    animateIn(this, faceFrame, { from: 'scale', delay: 130, duration: 250 });

    for (let i = 0; i < FACE_COUNT; i++) {
      const char = CHARACTERS[i];
      const x = startX + i * (FACE_SIZE + FACE_GAP);
      const y = FACE_STRIP_Y;

      // Gold highlight border (hidden by default)
      const highlight = this.add.nineslice(x, y, 'ui-focus', null,
        FACE_SIZE + 6, FACE_SIZE + 6, 2, 2, 2, 2)
        .setTint(COLOR.TINT_GOLD).setDepth(19).setVisible(false);

      // Cell background
      const cell = this.add.nineslice(x, y, 'ui-inventory-cell', null,
        FACE_SIZE, FACE_SIZE, ...NINE.CELL)
        .setDepth(20);

      // Face image
      let face;
      const faceKey = `${char.id}-face`;
      if (this.textures.exists(faceKey)) {
        face = this.add.image(x, y - 1, faceKey)
          .setDisplaySize(FACE_INNER, FACE_INNER).setDepth(21);
      } else {
        face = this.add.sprite(x, y - 1, `${char.id}-idle`, 0)
          .setDisplaySize(FACE_INNER, FACE_INNER).setDepth(21);
      }

      // Hit area (invisible interactive zone)
      const hitArea = this.add.rectangle(x, y, FACE_SIZE + 2, FACE_SIZE + 2)
        .setDepth(25).setAlpha(0.001)
        .setInteractive({ useHandCursor: true });

      const cellIdx = i;

      hitArea.on('pointerover', () => {
        if (this.selectedCharIndex !== cellIdx) {
          cell.setTint(COLOR.TINT_HOVER);
          this.tweens.add({ targets: [cell, face], scaleX: 1.06, scaleY: 1.06, duration: 100 });
        }
        this._playSfx('sfx-move');
      });

      hitArea.on('pointerout', () => {
        if (this.selectedCharIndex !== cellIdx) {
          cell.clearTint();
          const s = FACE_INNER / Math.max(face.width, face.height);
          this.tweens.add({
            targets: face, scaleX: s, scaleY: s, duration: 100,
          });
          this.tweens.add({
            targets: cell, scaleX: 1, scaleY: 1, duration: 100,
          });
        }
      });

      hitArea.on('pointerdown', () => {
        this._playSfx('sfx-accept');
        this._selectCharacter(cellIdx);
      });

      // Staggered entrance
      const delay = 150 + i * 40;
      animateIn(this, cell, { from: 'scale', delay, duration: 200 });
      animateIn(this, face, { from: 'scale', delay: delay + 20, duration: 200 });

      this.faceCells.push({ cell, face, highlight, hitArea });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BOTTOM BAR — name input + action buttons
  // ═══════════════════════════════════════════════════════════════

  _createBottomBar() {
    const y = BOTTOM_Y;

    // Icy frosted glass frame behind entire bottom bar — covers name + buttons
    const barW = 740;
    const pad = 20;  // equal padding on both sides
    const frameL = CX - barW / 2; // 270
    const frameR = CX + barW / 2; // 1010
    const barFrame = createIcyFrame(this,CX, y, barW, 50, 14);
    animateIn(this, barFrame, { from: 'slideUp', delay: 430, duration: 250 });

    // "Mahlas:" label — pinned to left side with padding
    const LABEL_FONT = { fontSize: '14px', fontFamily: FONT.FAMILY, fontStyle: 'bold' };
    const label = createText(this, frameL + pad, y, 'Mahlas:', LABEL_FONT, {
      fill: COLOR.TEXT_ICE, depth: 16, originX: 0,
      stroke: '#000000', strokeThickness: 3,
    });
    animateIn(this, label, { from: 'slideUp', delay: 450, duration: 250 });

    // DOM input element — after label
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Âşık';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 16px; font-family: 'KiwiSoda', monospace;
      padding: 4px 8px; width: 140px;
      background: transparent; color: #ffffff;
      border: none; outline: none; caret-color: #b8e4f0;
      font-weight: bold; text-shadow: 0 0 4px rgba(0,0,0,0.8);
    `;
    this.nameInput = this.add.dom(frameL + pad + 120, y, inputElement).setDepth(17);

    // Action buttons — pinned to right side with same padding
    const BTN_FONT = { fontSize: '15px', fontFamily: FONT.FAMILY, fontStyle: 'bold' };
    const btnW = 130, btnH = 36, btnGap = 8;
    const totalBtnsW = 3 * btnW + 2 * btnGap;
    const btnsStartX = frameR - pad - totalBtnsW + btnW / 2; // first btn center
    const btns = [
      { label: 'MEYDANE', onClick: () => this._startGame('normal') },
      { label: 'ODALAR',  onClick: () => this._showRoomList() },
      { label: 'SERBEST', onClick: () => this._startGame('sandbox') },
    ];

    btns.forEach((b, i) => {
      const bx = btnsStartX + i * (btnW + btnGap);
      const { elements } = createButton(this, bx, y, b.label, {
        width: btnW, height: btnH, depth: 15,
        fontToken: BTN_FONT, onClick: b.onClick,
      });
      elements.forEach(el => animateIn(this, el, {
        from: 'slideUp', delay: 500 + i * 70, duration: 250,
      }));
    });

    // Room list state
    this.roomListElements = [];
    this.roomListSocket = null;
    this.selectedRoomId = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // TIP TEXT
  // ═══════════════════════════════════════════════════════════════

  _createBottomTip() {
    const tipText = createText(this, CX, TIP_Y, TIPS[0], FONT.SMALL, {
      fill: COLOR.TEXT_DISABLED, depth: 15,
    });
    animateIn(this, tipText, { from: 'fadeOnly', delay: 800, duration: 400 });

    let tipIndex = 0;
    this._tipTimer = this.time.addEvent({
      delay: 3500, loop: true,
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

  _createSoundToggle() {
    const isMuted = this.sound.mute;
    createIconButton(this, SCREEN.W - 28, 28,
      isMuted ? 'spell-BookThunder-off' : 'spell-BookThunder', {
        size: 22, depth: 20,
        onClick: () => {
          this.sound.mute = !this.sound.mute;
          localStorage.setItem('soundMuted', this.sound.mute);
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // KEYBOARD NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  _createKeyboardNav() {
    this.input.keyboard.on('keydown-LEFT', () => this._cycleCharacter(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this._cycleCharacter(1));
    this.input.keyboard.on('keydown-ENTER', () => {
      // Don't trigger if typing in name input
      if (document.activeElement === this.nameInput?.node) return;
      this._startGame('normal');
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CHARACTER SELECTION LOGIC
  // ═══════════════════════════════════════════════════════════════

  _cycleCharacter(delta) {
    if (this.switching) return;
    const newIdx = (this.selectedCharIndex + delta + CHARACTERS.length) % CHARACTERS.length;
    this._selectCharacter(newIdx);
  }

  _selectCharacter(index, instant = false) {
    if (this.switching && !instant) return;
    const oldIdx = this.selectedCharIndex;

    // Deselect previous face
    const prev = this.faceCells[oldIdx];
    if (prev) {
      prev.highlight.setVisible(false);
      prev.cell.clearTint();
      // Reset scale
      this.tweens.add({ targets: [prev.cell], scaleX: 1, scaleY: 1, duration: 100 });
      const s = FACE_INNER / Math.max(prev.face.width, prev.face.height);
      this.tweens.add({ targets: prev.face, scaleX: s, scaleY: s, duration: 100 });
    }

    this.selectedCharIndex = index;
    const char = CHARACTERS[index];
    const passive = getPassive(char.id);

    // Highlight new face
    const curr = this.faceCells[index];
    if (curr) {
      curr.highlight.setVisible(true);
      curr.cell.setTint(COLOR.TINT_GOLD);

      // Lift + scale selected face
      this.tweens.add({
        targets: [curr.cell, curr.face],
        scaleX: 1.12, scaleY: 1.12,
        duration: 150,
        ease: 'Back.easeOut',
      });

      // Pulse on highlight
      this.tweens.killTweensOf(curr.highlight);
      this.tweens.add({
        targets: curr.highlight,
        alpha: { from: 0.7, to: 1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Update character info text
    const icon = this._getPassiveIcon(passive);
    if (this.charNameText) this.charNameText.setText(char.name);
    if (this.charPassiveText) this.charPassiveText.setText(`${icon} ${passive.name || ''}`);
    if (this.charDescText) this.charDescText.setText(passive.description || '');

    // Update character glow color
    const glowColors = {
      'demonic-vitality': 0xff4444,
      'iron-armor': 0x88aacc,
      'frost-resistance': 0x66ddff,
      'fire-resistance': 0xff6644,
      'quick-learner': 0xffdd44,
      'shadow-step': 0x88ff88,
      'bully': 0xff8844,
      'rush': 0x44ddff,
    };
    this._drawCharGlow(glowColors[passive.id] || 0xffdd44);

    // Transition sprite
    if (instant) {
      // No animation for initial load
      if (this.charSprite) {
        this.charSprite.play(`${char.id}-walk-down`);
      }
    } else {
      this._transitionCharSprite(char);
    }
  }

  _transitionCharSprite(char) {
    if (!this.charSprite || this.switching) return;
    this.switching = true;

    // Shrink + fade out old
    this.tweens.add({
      targets: this.charSprite,
      scaleX: 4.8, scaleY: 4.8, alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        // Switch sprite and play new walk
        this.charSprite.play(`${char.id}-walk-down`);
        this.charSprite.setScale(6).setAlpha(0);

        // Pop in new
        this.tweens.add({
          targets: this.charSprite,
          scaleX: 5.5, scaleY: 5.5, alpha: 1,
          duration: 160,
          ease: 'Back.easeOut',
          onComplete: () => { this.switching = false; },
        });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ROOM LIST (preserved from current implementation)
  // ═══════════════════════════════════════════════════════════════

  _showRoomList() {
    if (this.roomListElements && this.roomListElements.length > 0) {
      this._refreshRoomList();
      return;
    }

    const DPT = DEPTH.OVERLAY_DIM;

    const dimmer = createDimmer(this, { depth: DPT, alpha: 0.6 });
    dimmer.setInteractive();
    this.roomListElements.push(dimmer);

    const panelW = 400;
    const panelH = 340;
    const panel = createPanel(this, CX, CY, panelW, panelH, {
      texture: 'ui-panel', depth: DPT + 1,
    });
    this.roomListElements.push(panel);
    animateIn(this, panel, { from: 'scale', duration: 250 });

    const py = CY - panelH / 2;
    const title = createText(this, CX, py + 26, 'AÇIK ODALAR', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: DPT + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.roomListElements.push(title);
    animateIn(this, title, { from: 'slideDown', delay: 100, duration: 200 });

    const sep = createSeparator(this, CX, py + 46, panelW - 32, { depth: DPT + 2 });
    this.roomListElements.push(sep);

    this.roomListLoading = createText(this, CX, CY, 'Yükleniyor...', FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, depth: DPT + 3,
    });
    this.roomListElements.push(this.roomListLoading);

    const { elements: refreshEls } = createButton(this, CX - 75, py + panelH - 32, 'YENİLE', {
      width: 120, height: 30, depth: DPT + 2,
      onClick: () => this._refreshRoomList(),
    });
    this.roomListElements.push(...refreshEls);

    const { elements: closeEls } = createButton(this, CX + 75, py + panelH - 32, 'KAPAT', {
      width: 120, height: 30, depth: DPT + 2,
      onClick: () => this._destroyRoomList(),
    });
    this.roomListElements.push(...closeEls);

    this._connectAndFetchRooms();
  }

  _connectAndFetchRooms() {
    if (this.roomListSocket) this.roomListSocket.disconnect();
    const serverUrl = window.location.origin;
    this.roomListSocket = io(serverUrl, { transports: ['websocket'] });
    this.roomListSocket.on('connect', () => {
      this.roomListSocket.emit(MSG.CLIENT_LIST_ROOMS);
    });
    this.roomListSocket.on(MSG.SERVER_ROOM_LIST, (data) => {
      this._renderRoomList(data.rooms || []);
    });
  }

  _refreshRoomList() {
    if (this.roomListSocket && this.roomListSocket.connected) {
      this.roomListSocket.emit(MSG.CLIENT_LIST_ROOMS);
    } else {
      this._connectAndFetchRooms();
    }
  }

  _renderRoomList(rooms) {
    if (this.roomRowElements) {
      for (const el of this.roomRowElements) { if (el && !el.destroyed) el.destroy(); }
    }
    this.roomRowElements = [];

    if (this.roomListLoading && !this.roomListLoading.destroyed) {
      this.roomListLoading.setVisible(false);
    }

    const DPT = DEPTH.OVERLAY_DIM;
    const panelH = 340;
    const py = CY - panelH / 2;

    if (rooms.length === 0) {
      const emptyText = createText(this, CX, CY - 10, 'Açık oda yok', FONT.BODY, {
        fill: COLOR.TEXT_SECONDARY, depth: DPT + 3,
      });
      this.roomRowElements.push(emptyText);
      this.roomListElements.push(emptyText);

      const hintText = createText(this, CX, CY + 14, "MEYDANE'ye basıp oda kur!", FONT.SMALL, {
        fill: COLOR.ACCENT_SUCCESS, depth: DPT + 3,
      });
      this.roomRowElements.push(hintText);
      this.roomListElements.push(hintText);
      return;
    }

    const rowH = 34;
    const rowW = 360;
    const startY = py + 64;
    const maxVisible = Math.min(rooms.length, 6);

    for (let i = 0; i < maxVisible; i++) {
      const room = rooms[i];
      const rowY = startY + i * (rowH + 4);

      const rowBg = this.add.nineslice(CX, rowY, 'ui-inventory-cell', null, rowW, rowH, ...NINE.CELL)
        .setDepth(DPT + 2).setAlpha(0.7);
      this.roomRowElements.push(rowBg);
      this.roomListElements.push(rowBg);

      const hostText = createText(this, CX - rowW / 2 + 14, rowY, room.hostName, FONT.BODY_BOLD, {
        fill: COLOR.ACCENT_GOLD, depth: DPT + 3, originX: 0,
      });
      this.roomRowElements.push(hostText);
      this.roomListElements.push(hostText);

      const countText = createText(this, CX + 50, rowY, `${room.playerCount}/${room.maxPlayers}`, FONT.BODY, {
        fill: COLOR.TEXT_SECONDARY, depth: DPT + 3,
      });
      this.roomRowElements.push(countText);
      this.roomListElements.push(countText);

      const btnX = CX + rowW / 2 - 48;
      const { elements: joinEls } = createButton(this, btnX, rowY, 'KATIL', {
        width: 70, height: 26, depth: DPT + 3,
        onClick: () => {
          this._playSfx('sfx-accept');
          this.selectedRoomId = room.roomId;
          this._startGame('join');
        },
      });
      this.roomRowElements.push(...joinEls);
      this.roomListElements.push(...joinEls);
    }
  }

  _destroyRoomList() {
    if (this.roomListSocket) {
      this.roomListSocket.removeAllListeners();
      this.roomListSocket.disconnect();
      this.roomListSocket = null;
    }
    if (this.roomListElements) {
      for (const el of this.roomListElements) { if (el && !el.destroyed) el.destroy(); }
      this.roomListElements = [];
    }
    if (this.roomRowElements) {
      for (const el of this.roomRowElements) { if (el && !el.destroyed) el.destroy(); }
      this.roomRowElements = [];
    }
    this.roomListLoading = null;
    this.selectedRoomId = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // GAME START
  // ═══════════════════════════════════════════════════════════════

  _startGame(mode) {
    if (this.transitioning) return;
    this.transitioning = true;

    const char = CHARACTERS[this.selectedCharIndex];
    const name = this.nameInput ? this.nameInput.node.value.trim() || 'Âşık' : 'Âşık';
    const roomId = this.selectedRoomId || null;

    this._playSfx('sfx-accept');
    this._destroyRoomList();

    if (this.nameInput) { this.nameInput.destroy(); this.nameInput = null; }
    this._stopMenuMusic();
    if (this._tipTimer) { this._tipTimer.destroy(); this._tipTimer = null; }
    if (this.snowEmitter) { this.snowEmitter.stop(); }

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

  // ═══════════════════════════════════════════════════════════════
  // AUDIO
  // ═══════════════════════════════════════════════════════════════

  _startMenuMusic() {
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

  _stopMenuMusic() {
    if (this.menuMusic && this.menuMusic.isPlaying) {
      this.tweens.add({
        targets: this.menuMusic, volume: 0, duration: 400,
        onComplete: () => { this.menuMusic.stop(); },
      });
    }
  }

  _getPassiveIcon(passive) {
    if (!passive || !passive.id) return '';
    const icons = {
      'demonic-vitality': '\u2764',
      'iron-armor': '\uD83D\uDEE1',
      'frost-resistance': '\u2744',
      'fire-resistance': '\uD83D\uDD25',
      'quick-learner': '\u26A1',
      'shadow-step': '\uD83D\uDC63',
      'bully': '\uD83D\uDCA5',
      'rush': '\uD83D\uDCA8',
    };
    return icons[passive.id] || '\u2728';
  }

  _playSfx(key) {
    try { this.sound.play(key, { volume: 0.5 }); } catch (e) { /* */ }
  }
}
