import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { CHARACTERS } from './BootScene.js';
import { getPassive } from '../../shared/characterPassives.js';
import { MSG } from '../../shared/messageTypes.js';
import { TIPS, getMusicVolume, getSfxVolume } from '../config.js';
import {
  COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle,
} from '../ui/UIConfig.js';
import {
  createButton, createIconButton, createPanel, createDimmer,
  createSeparator, createText, createIcyFrame, createTexturedButton, animateIn,
} from '../ui/UIHelpers.js';

const CX = SCREEN.CX;
const CY = SCREEN.CY;

// Consistent style: Press Start 2P, white text
const PS2P = FONT.FAMILY_HEADING;
const WHITE = '#FFFFFF';

// ─── Hero Banner Layout ─────────────────────────────────
// Logo top-center, face sidebar left, sprite center-left, info panel right

// Face sidebar (vertical)
const FACE_SIZE = 40;
const FACE_INNER = 32;
const FACE_GAP = 6;
const FACE_COUNT = CHARACTERS.length;
const FACE_X = 60;                // Far left sidebar
const FACE_START_Y = 220;         // Top of vertical strip

// Logo
const LOGO_Y = 150;               // Top center (logo ~255px tall, top edge at ~23px)
const LOGO_W = 500;

// Character sprite (dead center of canvas)
const SPRITE_X = CX;
const SPRITE_Y = 370;
const ARROW_LEFT_X = SPRITE_X - 100;
const ARROW_RIGHT_X = SPRITE_X + 100;

// Right info panel (pushed to far right)
const PANEL_X = 1100;
const PANEL_Y = 390;
const PANEL_W = 280;              // stretched from native 229
const PANEL_H = 420;              // stretched from native 329 to fit buttons

// Tip text
const TIP_Y = SCREEN.H - 20;

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
    this._createKeyboardNav();

    this._selectCharacter(0, true);
    this._startMenuMusic();

    this._soundSettingsElements = [];
    this.events.once('shutdown', () => {
      this._destroyRoomList();
      this._destroySoundSettings();
    }, this);
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
      this.cameras.main.setBackgroundColor('#E8F0F8');
    }

    // Light frosted veil — bright icy tint over the background art
    this.add.nineslice(CX, CY, 'ui-bg-2', null, SCREEN.W, SCREEN.H, 4, 4, 4, 4)
      .setDepth(1).setTint(0xE8F0F8).setAlpha(0.35);
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
  // TITLE — floating white pixel text
  // ═══════════════════════════════════════════════════════════════

  _createTitle() {
    // Logo image — native 1270x649, big cinematic banner
    const logoH = Math.round(LOGO_W * (649 / 1270));
    const logo = this.add.image(CX, LOGO_Y, 'ui-logo')
      .setDisplaySize(LOGO_W, logoH).setOrigin(0.5).setDepth(17);

    // Gentle float
    this.tweens.add({
      targets: logo,
      y: '+=3',
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    animateIn(this, logo, { from: 'slideDown', delay: 100, duration: 400 });
  }

  // ═══════════════════════════════════════════════════════════════
  // CHARACTER INFO — name + passive floating above character
  // ═══════════════════════════════════════════════════════════════

  _createCharInfo() {
    // Info panel background (panel2.png — stretched to fit all content)
    this.infoPanel = this.add.image(PANEL_X, PANEL_Y, 'ui-panel2')
      .setDisplaySize(PANEL_W, PANEL_H).setDepth(12);
    animateIn(this, this.infoPanel, { from: 'scale', delay: 150, duration: 300 });

    // Text inside the panel
    const textX = PANEL_X;
    const panelTop = PANEL_Y - PANEL_H / 2;

    this.charNameText = createText(this, textX, panelTop + 40, '', { fontSize: '14px', fontFamily: PS2P }, {
      fill: WHITE, depth: 15,
      stroke: '#000000', strokeThickness: 4,
    });

    this.charPassiveText = createText(this, textX, panelTop + 70, '', { fontSize: '9px', fontFamily: PS2P }, {
      fill: WHITE, depth: 15,
      stroke: '#000000', strokeThickness: 2,
    });

    this.charDescText = this.add.text(textX, panelTop + 96, '', textStyle({ fontSize: '8px', fontFamily: PS2P }, {
      fill: WHITE,
      stroke: '#000000', strokeThickness: 2,
      wordWrap: { width: 230 },
      align: 'center',
    })).setDepth(15).setOrigin(0.5, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  // BIG CHARACTER DISPLAY — center stage hero
  // ═══════════════════════════════════════════════════════════════

  _createCharDisplay() {
    // Glow/shadow beneath character — simple graphics ellipse
    this.charGlow = this.add.graphics().setDepth(8);
    this._drawCharGlow(0xC8963E);

    // Walking sprite — big and proud, left-center
    this.charSprite = this.add.sprite(SPRITE_X, SPRITE_Y, 'boy-walk', 0)
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
    g.fillEllipse(SPRITE_X, SPRITE_Y + 46, 80, 18);

    // Colored glow (outer)
    g.fillStyle(color, 0.08);
    g.fillEllipse(SPRITE_X, SPRITE_Y + 40, 140, 36);

    // Colored glow (inner)
    g.fillStyle(color, 0.15);
    g.fillEllipse(SPRITE_X, SPRITE_Y + 42, 90, 22);
  }

  // ═══════════════════════════════════════════════════════════════
  // LEFT/RIGHT ARROWS — cycle characters
  // ═══════════════════════════════════════════════════════════════

  _createArrows() {
    this._createArrow('left', ARROW_LEFT_X, SPRITE_Y, -1);
    this._createArrow('right', ARROW_RIGHT_X, SPRITE_Y, 1);
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
  // FACE STRIP — vertical sidebar on the left
  // ═══════════════════════════════════════════════════════════════

  _createFaceStrip() {
    this.faceCells = [];

    for (let i = 0; i < FACE_COUNT; i++) {
      const char = CHARACTERS[i];
      const x = FACE_X;
      const y = FACE_START_Y + i * (FACE_SIZE + FACE_GAP);

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
    // ── Name input inside right panel area ──────────────
    const panelTop = PANEL_Y - PANEL_H / 2;
    const ny = panelTop + 195;

    // Sprite background for name input (cardasset — native 254×53 pixel art)
    const nameBg = this.add.image(PANEL_X, ny, 'ui-shop-card')
      .setDisplaySize(200, 42).setDepth(14);
    animateIn(this, nameBg, { from: 'slideUp', delay: 400, duration: 250 });

    // "Mahlas:" label
    const label = createText(this, PANEL_X - 86, ny, 'Mahlas:', { fontSize: '8px', fontFamily: PS2P }, {
      fill: WHITE, depth: 16, originX: 0,
      stroke: '#000000', strokeThickness: 2,
    });
    animateIn(this, label, { from: 'slideUp', delay: 420, duration: 250 });

    // DOM input element
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Âşık';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 10px; font-family: 'Press Start 2P', cursive;
      padding: 4px 6px; width: 100px;
      background: transparent; color: #ffffff;
      border: none; outline: none; caret-color: #C8963E;
      text-shadow: 0 0 4px rgba(0,0,0,0.5);
    `;
    this.nameInput = this.add.dom(PANEL_X + 30, ny, inputElement).setDepth(17);

    // ── Action buttons (stacked vertically below panel) ────
    const btnW = 170, btnH = 40, btnGap = 10;
    const btns = [
      { label: 'MEYDANE', onClick: () => this._startGame('normal') },
      { label: 'ODALAR',  onClick: () => this._showRoomList() },
      { label: 'SERBEST', onClick: () => this._startGame('sandbox') },
    ];

    const btnStartY = panelTop + 250;

    btns.forEach((b, i) => {
      const by = btnStartY + i * (btnH + btnGap);
      const { elements } = createTexturedButton(this, PANEL_X, by, b.label, 'ui-shop-btn', {
        width: btnW, height: btnH, depth: 15,
        fontToken: { fontSize: '10px', fontFamily: PS2P }, onClick: b.onClick,
      });
      elements.forEach(el => animateIn(this, el, {
        from: 'slideUp', delay: 480 + i * 70, duration: 250,
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
    const tipText = createText(this, CX, TIP_Y, TIPS[0], { fontSize: '8px', fontFamily: PS2P }, {
      fill: WHITE, depth: 15, alpha: 0.5,
      stroke: '#000000', strokeThickness: 2,
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
            this.tweens.add({ targets: tipText, alpha: 0.5, duration: 200 });
          },
        });
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
    this.input.keyboard.on('keydown-ESC', () => {
      // Close room list overlay if open
      if (this.roomListElements && this.roomListElements.length > 0) {
        this._destroyRoomList();
        return;
      }
      // Toggle sound settings
      if (this._soundSettingsElements && this._soundSettingsElements.length > 0) {
        this._destroySoundSettings();
      } else {
        this._showSoundSettings();
      }
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
    this._drawCharGlow(glowColors[passive.id] || 0xC8963E);

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
    const title = createText(this, CX, py + 26, 'AÇIK ODALAR', FONT.H2, {
      fill: WHITE, depth: DPT + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.roomListElements.push(title);
    animateIn(this, title, { from: 'slideDown', delay: 100, duration: 200 });

    const sep = createSeparator(this, CX, py + 46, panelW - 32, { depth: DPT + 2 });
    this.roomListElements.push(sep);

    this.roomListLoading = createText(this, CX, CY, 'Yükleniyor...', { fontSize: '12px', fontFamily: PS2P }, {
      fill: WHITE, depth: DPT + 3,
      stroke: '#000000', strokeThickness: 2,
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
      const emptyText = createText(this, CX, CY - 10, 'Açık oda yok', { fontSize: '12px', fontFamily: PS2P }, {
        fill: WHITE, depth: DPT + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.roomRowElements.push(emptyText);
      this.roomListElements.push(emptyText);

      const hintText = createText(this, CX, CY + 14, "MEYDANE'ye basıp oda kur!", { fontSize: '8px', fontFamily: PS2P }, {
        fill: WHITE, depth: DPT + 3,
        stroke: '#000000', strokeThickness: 2,
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

      const hostText = createText(this, CX - rowW / 2 + 14, rowY, room.hostName, { fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE, depth: DPT + 3, originX: 0,
        stroke: '#000000', strokeThickness: 2,
      });
      this.roomRowElements.push(hostText);
      this.roomListElements.push(hostText);

      const countText = createText(this, CX + 50, rowY, `${room.playerCount}/${room.maxPlayers}`, { fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE, depth: DPT + 3,
        stroke: '#000000', strokeThickness: 2,
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
  // SOUND SETTINGS — ESC overlay
  // ═══════════════════════════════════════════════════════════════

  _showSoundSettings() {
    if (this._soundSettingsElements && this._soundSettingsElements.length > 0) return;
    this._soundSettingsElements = [];

    const DPT = DEPTH.OVERLAY_DIM;
    const s = this;

    // Dimmer
    const dimmer = createDimmer(s, { depth: DPT, alpha: 0.6 });
    dimmer.setInteractive();
    dimmer.on('pointerdown', () => this._destroySoundSettings());
    this._soundSettingsElements.push(dimmer);

    // Panel
    const pw = 340, ph = 200;
    const panel = createPanel(s, CX, CY, pw, ph, { depth: DPT + 1 });
    this._soundSettingsElements.push(panel);
    animateIn(s, panel, { from: 'scale', duration: 200 });

    // Title
    const title = createText(s, CX, CY - ph / 2 + 32, 'SES AYARLARI', FONT.H2, {
      fill: WHITE, depth: DPT + 2,
      stroke: '#000000', strokeThickness: 3,
    });
    this._soundSettingsElements.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 80, duration: 200 });

    // Sound sliders
    this._buildMenuSoundSliders(s, DPT, CY - 16);

    // Close button
    const { elements: closeEls } = createButton(s, CX, CY + ph / 2 - 36, 'KAPAT', {
      width: 160, height: 38, depth: DPT + 2,
      onClick: () => {
        this._playSfx('sfx-accept');
        this._destroySoundSettings();
      },
    });
    this._soundSettingsElements.push(...closeEls);
    closeEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 120, duration: 200 }));
  }

  _buildMenuSoundSliders(s, DPT, baseY) {
    const sliderW = 140;
    const sliderH = 8;
    const trackX = CX - 20;
    const labelX = trackX - 12;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    const buildSlider = (y, label, storageKey, defaultVal, onChange) => {
      const val = parseFloat(localStorage.getItem(storageKey) ?? String(defaultVal));

      const lbl = createText(s, labelX, y, label, { fontSize: '10px', fontFamily: PS2P }, {
        fill: WHITE, depth: DPT + 3, originX: 1, originY: 0.5,
        stroke: '#000000', strokeThickness: 2,
      });
      this._soundSettingsElements.push(lbl);

      const trackBg = s.add.graphics().setDepth(DPT + 2).setScrollFactor(0);
      trackBg.fillStyle(0x334455, 0.6);
      trackBg.fillRoundedRect(trackX, y - sliderH / 2, sliderW, sliderH, 3);
      this._soundSettingsElements.push(trackBg);

      const fill = s.add.graphics().setDepth(DPT + 3).setScrollFactor(0);
      const drawFill = (v) => {
        fill.clear();
        fill.fillStyle(0x88ccff, 0.8);
        fill.fillRoundedRect(trackX, y - sliderH / 2, sliderW * v, sliderH, 3);
      };
      drawFill(val);
      this._soundSettingsElements.push(fill);

      const zone = s.add.zone(trackX + sliderW / 2, y, sliderW + 20, 26)
        .setOrigin(0.5).setDepth(DPT + 4).setScrollFactor(0).setInteractive({ useHandCursor: true });
      this._soundSettingsElements.push(zone);

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
    buildSlider(baseY, 'Ezgi', 'musicVolume', 0.35, (v) => {
      try {
        (s.sound.sounds || []).forEach(snd => {
          if (snd.key && snd.key.startsWith('music-') && snd.isPlaying) {
            snd.volume = v;
          }
        });
      } catch (_) { /* */ }
    });

    // SFX slider
    buildSlider(baseY + 38, 'Efekt', 'sfxVolume', 0.5, (_v) => {
      // SFX volume is read per-call via getSfxVolume()
    });
  }

  _destroySoundSettings() {
    if (this._soundSettingsElements) {
      for (const el of this._soundSettingsElements) {
        if (el && !el.destroyed) {
          if (el.removeAllListeners) el.removeAllListeners();
          el.destroy();
        }
      }
      this._soundSettingsElements = [];
    }
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
    const vol = getMusicVolume();
    if (this.sound.get('music-menu')) {
      this.menuMusic = this.sound.get('music-menu');
      if (!this.menuMusic.isPlaying) this.menuMusic.play({ loop: true, volume: vol });
    } else {
      try {
        this.menuMusic = this.sound.add('music-menu', { loop: true, volume: vol });
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
    try { this.sound.play(key, { volume: 0.5 * getSfxVolume() }); } catch (e) { /* */ }
  }
}
