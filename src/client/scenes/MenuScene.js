import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { CHARACTERS } from './BootScene.js';
import { getPassive } from '../../shared/characterPassives.js';
import { MSG } from '../../shared/messageTypes.js';
import { TIPS } from '../config.js';
import {
  COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle,
} from '../ui/UIConfig.js';
import { createButton, createIconButton, createPanel, createDimmer, createSeparator, createText, animateIn } from '../ui/UIHelpers.js';

// ─── Layout Constants ─────────────────────────────────────────
const CX = SCREEN.CX;
const CY = SCREEN.CY;

// Character grid — 4 cols × 2 rows, big face icons
const GRID_COLS = 4;
const GRID_ROWS = 2;
const CELL_SIZE = 64;
const CELL_GAP = 10;
const GRID_W = GRID_COLS * CELL_SIZE + (GRID_COLS - 1) * CELL_GAP;
const GRID_H = GRID_ROWS * (CELL_SIZE + 22) + (GRID_ROWS - 1) * CELL_GAP;

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
  }

  create() {
    this.transitioning = false;
    this.cameras.main.fadeIn(500, 0, 0, 0);

    this.createBackground();
    this.createTitle();
    this.createMainPanel();
    this.createCharacterGrid();
    this.createPreview();
    this.createNameInput();
    this.createButtons();
    this.createBottomTip();
    this.createSoundToggle();
    this.selectCharacter(0);
    this.startMenuMusic();

    this.events.once('shutdown', () => this.destroyRoomList(), this);
  }

  // ═══════════════════════════════════════════════════════════
  // BACKGROUND
  // ═══════════════════════════════════════════════════════════

  createBackground() {
    if (this.textures.exists('menu-bg')) {
      const bg = this.add.image(CX, CY, 'menu-bg').setDepth(0);
      const scale = Math.max(SCREEN.W / bg.width, SCREEN.H / bg.height);
      bg.setScale(scale);
    } else {
      this.cameras.main.setBackgroundColor('#0a0a1e');
    }

    // Subtle dark overlay
    this.add.nineslice(CX, CY, 'ui-bg-2', null, SCREEN.W, SCREEN.H, 4, 4, 4, 4)
      .setDepth(1).setTint(0x000000).setAlpha(0.3);
  }

  // ═══════════════════════════════════════════════════════════
  // TITLE — big, centered, with gentle float animation
  // ═══════════════════════════════════════════════════════════

  createTitle() {
    const titleY = 50;

    // Shadow/glow duplicate (subtle)
    const shadow = this.add.text(CX + 2, titleY + 2, 'ÂŞIKLAR MEYDANE', textStyle(FONT.TITLE_LG, {
      fill: '#000000',
    })).setDepth(16).setOrigin(0.5).setAlpha(0.3);

    // Main title
    const title = createText(this, CX, titleY, 'ÂŞIKLAR MEYDANE', FONT.TITLE_LG, {
      fill: COLOR.ACCENT_GOLD, depth: 17,
      stroke: '#000000', strokeThickness: 4,
    });

    // Gentle floating animation
    this.tweens.add({
      targets: [title, shadow],
      y: titleY + 3,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Entrance
    animateIn(this, title, { from: 'slideDown', delay: 100, duration: 400 });
    animateIn(this, shadow, { from: 'slideDown', delay: 100, duration: 400 });
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN PANEL — warm wood container
  // ═══════════════════════════════════════════════════════════

  createMainPanel() {
    const panelW = 820;
    const panelH = 265;
    const panelY = CY + 18;

    // Store panel position for other methods
    this._panelY = panelY;
    this._panelH = panelH;

    // Outer panel
    this._mainPanel = createPanel(this, CX, panelY, panelW, panelH, {
      texture: 'ui-panel', depth: 5,
    });
    animateIn(this, this._mainPanel, { from: 'scale', delay: 50, duration: 350 });

    // Inner content area
    const inner = createPanel(this, CX, panelY, panelW - 16, panelH - 16, {
      texture: 'ui-panel-interior', depth: 6, alpha: 0.5,
    });
    animateIn(this, inner, { from: 'fadeOnly', delay: 200, duration: 300 });
  }

  // ═══════════════════════════════════════════════════════════
  // CHARACTER GRID — 4×2 big face icons with names below
  // ═══════════════════════════════════════════════════════════

  createCharacterGrid() {
    const panelY = this._panelY || CY + 20;
    const gridLeftEdge = CX - 420 / 2 - 40;
    const gridTop = panelY - this._panelH / 2 + 30;

    // Section label
    const label = createText(this, gridLeftEdge + GRID_W / 2, gridTop - 18,
      'ÂŞIĞINI SEÇ', FONT.SMALL, {
        fill: COLOR.TEXT_SECONDARY, depth: 12,
        stroke: '#000000', strokeThickness: 1,
      });
    animateIn(this, label, { from: 'fadeOnly', delay: 300, duration: 300 });

    this.charCells = [];
    let idx = 0;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (idx >= CHARACTERS.length) break;
        const char = CHARACTERS[idx];
        const cellIdx = idx;

        const cx = gridLeftEdge + col * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
        const cy = gridTop + row * (CELL_SIZE + 22 + CELL_GAP) + CELL_SIZE / 2;

        // Selection highlight (gold border, behind, hidden by default)
        const highlight = this.add.nineslice(cx, cy, 'ui-focus', null,
          CELL_SIZE + 6, CELL_SIZE + 6, 2, 2, 2, 2)
          .setTint(COLOR.TINT_GOLD).setDepth(9).setVisible(false);

        // Cell background
        const cell = this.add.nineslice(cx, cy, 'ui-inventory-cell', null,
          CELL_SIZE, CELL_SIZE, ...NINE.CELL)
          .setDepth(10);

        // Face portrait (big, fills the cell)
        let face;
        const faceKey = `${char.id}-face`;
        if (this.textures.exists(faceKey)) {
          face = this.add.image(cx, cy - 2, faceKey)
            .setDisplaySize(CELL_SIZE - 8, CELL_SIZE - 8).setDepth(11);
        } else {
          face = this.add.sprite(cx, cy - 2, `${char.id}-idle`, 0)
            .setDisplaySize(CELL_SIZE - 8, CELL_SIZE - 8).setDepth(11);
        }

        // Name below cell
        const nameText = this.add.text(cx, cy + CELL_SIZE / 2 + 8, char.name, textStyle(FONT.SMALL, {
          fill: COLOR.TEXT_SECONDARY,
        })).setDepth(12).setOrigin(0.5, 0);

        // Hit area
        const hitArea = this.add.nineslice(cx, cy, 'ui-button', null,
          CELL_SIZE + 2, CELL_SIZE + 2, ...NINE.BUTTON)
          .setDepth(14).setAlpha(0.001)
          .setInteractive({ useHandCursor: true });

        hitArea.on('pointerover', () => {
          if (this.selectedCharIndex !== cellIdx) {
            cell.setTint(COLOR.TINT_HOVER);
            face.setScale(face.scaleX * 1.05, face.scaleY * 1.05);
          }
          this.playSfx('sfx-move');
        });
        hitArea.on('pointerout', () => {
          if (this.selectedCharIndex !== cellIdx) {
            cell.clearTint();
            const s = (CELL_SIZE - 8) / Math.max(face.width, face.height);
            face.setScale(s, s);
          }
        });
        hitArea.on('pointerdown', () => {
          this.playSfx('sfx-accept');
          this.selectCharacter(cellIdx);
        });

        // Entrance animation — staggered
        const delay = 200 + idx * 50;
        animateIn(this, cell, { from: 'scale', delay, duration: 250 });
        animateIn(this, face, { from: 'scale', delay: delay + 30, duration: 250 });
        animateIn(this, nameText, { from: 'fadeOnly', delay: delay + 80, duration: 200 });

        this.charCells.push({ cell, face, nameText, highlight, hitArea, origFaceScale: null });
        idx++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PREVIEW — walking sprite + character info on right side
  // ═══════════════════════════════════════════════════════════

  createPreview() {
    const panelY = this._panelY || CY + 20;
    const panelH = this._panelH || 340;

    // Right side of main panel
    const previewX = CX + 130;
    const previewY = panelY - 20;

    // Compact dark inset for sprite display
    const insetH = 120;
    const inset = createPanel(this, previewX, previewY, 110, insetH, {
      texture: 'ui-bg', depth: 8, alpha: 0.25,
    });
    animateIn(this, inset, { from: 'fadeOnly', delay: 300, duration: 300 });

    // Walking sprite — properly sized and playing animation
    this.previewSprite = this.add.sprite(previewX, previewY + 6, 'boy-walk', 0)
      .setScale(4.5).setDepth(9);

    // Start the animation immediately
    if (this.anims.exists('boy-walk-down')) {
      this.previewSprite.play('boy-walk-down');
    }
    animateIn(this, this.previewSprite, { from: 'scale', delay: 350, duration: 300 });

    // Character info — right of preview
    const infoX = previewX + 80;
    const infoTop = previewY - 40;

    // Name (big, gold, with stroke for readability)
    this.previewName = createText(this, infoX, infoTop, 'Cevheri', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: 12, originX: 0,
      stroke: '#000000', strokeThickness: 3,
    });
    animateIn(this, this.previewName, { from: 'slideUp', delay: 400, duration: 250 });

    // Separator below name
    createSeparator(this, infoX + 75, infoTop + 16, 150, { depth: 12 });

    // Passive label
    createText(this, infoX, infoTop + 30, 'HÜNER:', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: 12, originX: 0,
      stroke: '#000000', strokeThickness: 1,
    });

    // Passive name
    this.passiveName = createText(this, infoX, infoTop + 46, '', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_INFO, depth: 12, originX: 0,
      stroke: '#000000', strokeThickness: 1,
    });

    // Passive description (with word wrap)
    this.passiveDesc = this.add.text(infoX, infoTop + 64, '', textStyle(FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, wordWrap: { width: 180 },
      stroke: '#000000', strokeThickness: 1,
    })).setDepth(12).setOrigin(0, 0);
  }

  // ═══════════════════════════════════════════════════════════
  // NAME INPUT
  // ═══════════════════════════════════════════════════════════

  createNameInput() {
    const panelY = this._panelY || CY + 20;
    const panelH = this._panelH || 340;
    const nameY = panelY + panelH / 2 + 28;

    // Panel behind input
    const bg = createPanel(this, CX, nameY, 320, 34, {
      texture: 'ui-panel-2', depth: 10,
    });
    animateIn(this, bg, { from: 'slideUp', delay: 500, duration: 250 });

    // Label
    createText(this, CX - 135, nameY, 'Mahlas:', FONT.BODY_BOLD, {
      fill: COLOR.TEXT_PRIMARY, depth: 12, originX: 0,
    });

    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Âşık';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 14px; font-family: 'KiwiSoda', monospace;
      padding: 4px 10px; width: 180px;
      background: transparent; color: ${COLOR.ACCENT_GOLD};
      border: none; outline: none; caret-color: ${COLOR.ACCENT_GOLD};
      font-weight: bold;
    `;

    this.nameInput = this.add.dom(CX + 40, nameY, inputElement).setDepth(12);
  }

  // ═══════════════════════════════════════════════════════════
  // BUTTONS — properly sized, with staggered entrance
  // ═══════════════════════════════════════════════════════════

  createButtons() {
    const panelY = this._panelY || CY + 20;
    const panelH = this._panelH || 340;
    const btnY = panelY + panelH / 2 + 68;

    const btns = [
      { label: 'MEYDANE', x: CX - 155, onClick: () => this.startGame('normal') },
      { label: 'ODALAR',  x: CX,       onClick: () => this.showRoomList() },
      { label: 'SERBEST', x: CX + 155, onClick: () => this.startGame('sandbox') },
    ];

    btns.forEach((b, i) => {
      const { elements } = createButton(this, b.x, btnY, b.label, {
        width: 130, height: 34, depth: 10,
        onClick: b.onClick,
      });
      // Staggered entrance
      elements.forEach(el => animateIn(this, el, {
        from: 'slideUp', delay: 550 + i * 80, duration: 250,
      }));
    });

    // Subtle hint text
    const hint = createText(this, CX, btnY + 26,
      'Serbest: Sınırsız ilham, talim kuklaları', FONT.SMALL, {
        fill: COLOR.TEXT_DISABLED, depth: 12,
      });
    animateIn(this, hint, { from: 'fadeOnly', delay: 800, duration: 300 });

    // Room list state
    this.roomListElements = [];
    this.roomListSocket = null;
    this.selectedRoomId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // BOTTOM TIP
  // ═══════════════════════════════════════════════════════════

  createBottomTip() {
    const tipText = createText(this, CX, SCREEN.H - 18, TIPS[0], FONT.SMALL, {
      fill: COLOR.TEXT_DISABLED, depth: 12,
    });
    animateIn(this, tipText, { from: 'fadeOnly', delay: 900, duration: 400 });

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

  createSoundToggle() {
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

  // ═══════════════════════════════════════════════════════════
  // CHARACTER SELECTION
  // ═══════════════════════════════════════════════════════════

  selectCharacter(index) {
    // Deselect previous
    const prev = this.charCells[this.selectedCharIndex];
    if (prev) {
      prev.highlight.setVisible(false);
      prev.cell.clearTint();
      prev.nameText.setFill(COLOR.TEXT_SECONDARY);
      // Reset face scale
      const sz = (CELL_SIZE - 8);
      const w = prev.face.width;
      const h = prev.face.height;
      prev.face.setScale(sz / w, sz / h);
    }

    this.selectedCharIndex = index;
    const row = this.charCells[index];
    const char = CHARACTERS[index];

    // Select new
    row.highlight.setVisible(true);
    row.cell.setTint(COLOR.TINT_GOLD);
    row.nameText.setFill(COLOR.ACCENT_GOLD);

    // Subtle pulse on the selected highlight
    this.tweens.add({
      targets: row.highlight,
      alpha: { from: 0.8, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Update walking sprite
    if (this.previewSprite) {
      this.tweens.add({
        targets: this.previewSprite,
        scaleX: 4, scaleY: 4, alpha: 0.5, duration: 80,
        onComplete: () => {
          this.previewSprite.play(`${char.id}-walk-down`);
          this.tweens.add({
            targets: this.previewSprite,
            scaleX: 4.5, scaleY: 4.5, alpha: 1, duration: 120, ease: 'Back.easeOut',
          });
        },
      });
    }

    // Update name
    if (this.previewName) this.previewName.setText(char.name);

    // Update passive info
    const passive = getPassive(char.id);
    if (this.passiveName) {
      const icon = this.getPassiveIcon(passive);
      this.passiveName.setText(`${icon} ${passive.name || ''}`);
    }
    if (this.passiveDesc) this.passiveDesc.setText(passive.description || '');
  }

  // ═══════════════════════════════════════════════════════════
  // ROOM LIST
  // ═══════════════════════════════════════════════════════════

  showRoomList() {
    if (this.roomListElements && this.roomListElements.length > 0) {
      this.refreshRoomList();
      return;
    }

    const DPT = DEPTH.OVERLAY_DIM;

    // Dimmer
    const dimmer = createDimmer(this, { depth: DPT, alpha: 0.6 });
    dimmer.setInteractive();
    this.roomListElements.push(dimmer);

    // Panel
    const panelW = 400;
    const panelH = 340;
    const panel = createPanel(this, CX, CY, panelW, panelH, {
      texture: 'ui-panel', depth: DPT + 1,
    });
    this.roomListElements.push(panel);
    animateIn(this, panel, { from: 'scale', duration: 250 });

    // Title
    const py = CY - panelH / 2;
    const title = createText(this, CX, py + 26, 'AÇIK ODALAR', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: DPT + 2,
      stroke: '#000000', strokeThickness: 2,
    });
    this.roomListElements.push(title);
    animateIn(this, title, { from: 'slideDown', delay: 100, duration: 200 });

    // Separator
    const sep = createSeparator(this, CX, py + 46, panelW - 32, { depth: DPT + 2 });
    this.roomListElements.push(sep);

    // Loading text
    this.roomListLoading = createText(this, CX, CY, 'Yükleniyor...', FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, depth: DPT + 3,
    });
    this.roomListElements.push(this.roomListLoading);

    // YENİLE button
    const { elements: refreshEls } = createButton(this, CX - 75, py + panelH - 32, 'YENİLE', {
      width: 120, height: 30, depth: DPT + 2,
      onClick: () => this.refreshRoomList(),
    });
    this.roomListElements.push(...refreshEls);

    // KAPAT button
    const { elements: closeEls } = createButton(this, CX + 75, py + panelH - 32, 'KAPAT', {
      width: 120, height: 30, depth: DPT + 2,
      onClick: () => this.destroyRoomList(),
    });
    this.roomListElements.push(...closeEls);

    this.connectAndFetchRooms();
  }

  connectAndFetchRooms() {
    if (this.roomListSocket) this.roomListSocket.disconnect();
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

      // KATIL button
      const btnX = CX + rowW / 2 - 48;
      const { elements: joinEls } = createButton(this, btnX, rowY, 'KATIL', {
        width: 70, height: 26, depth: DPT + 3,
        onClick: () => {
          this.playSfx('sfx-accept');
          this.selectedRoomId = room.roomId;
          this.startGame('join');
        },
      });
      this.roomRowElements.push(...joinEls);
      this.roomListElements.push(...joinEls);
    }
  }

  destroyRoomList() {
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

  // ═══════════════════════════════════════════════════════════
  // GAME START
  // ═══════════════════════════════════════════════════════════

  startGame(mode) {
    if (this.transitioning) return;
    this.transitioning = true;

    const char = CHARACTERS[this.selectedCharIndex];
    const name = this.nameInput ? this.nameInput.node.value.trim() || 'Âşık' : 'Âşık';
    const roomId = this.selectedRoomId || null;

    this.playSfx('sfx-accept');
    this.destroyRoomList();

    if (this.nameInput) { this.nameInput.destroy(); this.nameInput = null; }
    this.stopMenuMusic();
    if (this._tipTimer) { this._tipTimer.destroy(); this._tipTimer = null; }

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

  // ═══════════════════════════════════════════════════════════
  // AUDIO
  // ═══════════════════════════════════════════════════════════

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

  playSfx(key) {
    try { this.sound.play(key, { volume: 0.5 }); } catch (e) { /* */ }
  }
}
