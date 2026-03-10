import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { CHARACTERS } from './BootScene.js';
import { getPassive } from '../../shared/characterPassives.js';
import { MSG } from '../../shared/messageTypes.js';
import { TIPS } from '../config.js';
import {
  COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SCREEN, textStyle,
} from '../ui/UIConfig.js';
import { createButton, createIconButton, createPanel, createDimmer, createSeparator, createText } from '../ui/UIHelpers.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedCharIndex = 0;
    this.playerName = 'Âşık';
    this.charRows = [];
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
    this.createCharacterList();
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
      const bg = this.add.image(SCREEN.CX, SCREEN.CY, 'menu-bg').setDepth(0);
      const scale = Math.max(SCREEN.W / bg.width, SCREEN.H / bg.height);
      bg.setScale(scale);
    } else {
      this.cameras.main.setBackgroundColor('#0a0a1e');
    }

    // Dark overlay for readability
    this.add.nineslice(SCREEN.CX, SCREEN.CY, 'ui-bg-2', null, SCREEN.W, SCREEN.H, 4, 4, 4, 4)
      .setDepth(1).setTint(COLOR.BG_DARK).setAlpha(0.35);
  }

  // ═══════════════════════════════════════════════════════════
  // TITLE
  // ═══════════════════════════════════════════════════════════

  createTitle() {
    // Simple title — no glow, no pulsing, just clean text
    createText(this, SCREEN.CX, 38, 'ÂŞIKLAR MEYDANE', FONT.TITLE_LG, {
      fill: COLOR.ACCENT_GOLD, depth: 17, originX: 0.5, originY: 0.5,
      stroke: '#000000', strokeThickness: 3,
    });

    createText(this, SCREEN.CX, 64, 'Aşığını seç', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: 17, originX: 0.5, originY: 0.5,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CHARACTER LIST (left side — vertical, 1 column × 8 rows)
  // ═══════════════════════════════════════════════════════════

  createCharacterList() {
    const listX = 30;
    const listY = 92;
    const rowW = 160;
    const rowH = 28;
    const gap = 4;

    // List panel background
    createPanel(this, listX + rowW / 2, listY + (CHARACTERS.length * (rowH + gap)) / 2 - gap / 2,
      rowW + SPACE.LG, CHARACTERS.length * (rowH + gap) + SPACE.SM, {
        texture: 'ui-panel', depth: 9, alpha: 0.7,
      });

    this.charRows = [];

    for (let i = 0; i < CHARACTERS.length; i++) {
      const char = CHARACTERS[i];
      const y = listY + i * (rowH + gap) + rowH / 2;
      const x = listX + rowW / 2;

      // Row background (inventory cell)
      const bg = this.add.nineslice(x, y, 'ui-inventory-cell', null, rowW, rowH, ...NINE.CELL)
        .setDepth(10).setAlpha(0.6);

      // Face (small, left side)
      const faceX = listX + 18;
      let face;
      if (this.textures.exists(`${char.id}-face`)) {
        face = this.add.image(faceX, y, `${char.id}-face`)
          .setDisplaySize(20, 20).setDepth(11);
      } else {
        face = this.add.sprite(faceX, y, `${char.id}-idle`, 0)
          .setDisplaySize(20, 20).setDepth(11);
      }

      // Name text (right of face)
      const nameText = createText(this, listX + 36, y, char.name, FONT.BODY, {
        fill: COLOR.TEXT_SECONDARY, depth: 12, originX: 0, originY: 0.5,
      });

      // Selection highlight (gold left border accent via focus)
      const highlight = this.add.nineslice(x, y, 'ui-focus', null, rowW + 2, rowH + 2, 2, 2, 2, 2)
        .setTint(COLOR.TINT_GOLD).setDepth(13).setVisible(false);

      // Hit area
      const hitArea = this.add.nineslice(x, y, 'ui-button', null, rowW, rowH, ...NINE.BUTTON)
        .setDepth(14).setAlpha(0.001).setInteractive({ useHandCursor: true });

      hitArea.on('pointerdown', () => { this.playSfx('sfx-accept'); this.selectCharacter(i); });
      hitArea.on('pointerover', () => {
        this.playSfx('sfx-move');
        if (this.selectedCharIndex !== i) bg.setAlpha(0.85);
      });
      hitArea.on('pointerout', () => {
        if (this.selectedCharIndex !== i) bg.setAlpha(0.6);
      });

      this.charRows.push({ bg, face, nameText, highlight, hitArea });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PREVIEW PANEL (center-right)
  // ═══════════════════════════════════════════════════════════

  createPreview() {
    const panelCX = 720;
    const panelCY = 280;
    const panelW = 540;
    const panelH = 300;

    // Outer panel
    createPanel(this, panelCX, panelCY, panelW, panelH, {
      texture: 'ui-panel', depth: 10, alpha: 0.8,
    });

    // Inner content area
    createPanel(this, panelCX, panelCY, panelW - 16, panelH - 16, {
      texture: 'ui-panel-interior', depth: 11, alpha: 0.5,
    });

    // ── Left: walking sprite ──
    const spriteAreaX = panelCX - panelW / 2 + 100;
    const spriteAreaY = panelCY - 10;

    // Dark backdrop
    createPanel(this, spriteAreaX, panelCY, 140, panelH - 40, {
      texture: 'ui-bg', depth: 12, alpha: 0.3,
    });

    // Walking sprite
    this.previewSprite = this.add.sprite(spriteAreaX, spriteAreaY, 'boy-walk', 0)
      .setScale(5).setDepth(13);

    // ── Right: character info ──
    const rightX = panelCX - panelW / 2 + 200;

    // Name
    this.previewName = createText(this, rightX, panelCY - 110, 'Cevheri', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: 14, originX: 0, originY: 0.5,
    });

    // Separator
    createSeparator(this, panelCX + 40, panelCY - 92, 310, { depth: 14, alpha: 0.25 });

    // Passive label
    createText(this, rightX, panelCY - 72, 'HÜNER:', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: 14, originX: 0, originY: 0.5,
    });

    // Passive name
    this.passiveName = createText(this, rightX, panelCY - 52, '', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_INFO, depth: 14, originX: 0, originY: 0.5,
    });

    // Passive description
    this.passiveDesc = this.add.text(rightX, panelCY - 30, '', textStyle(FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, wordWrap: { width: 280 },
    })).setScrollFactor(0).setDepth(14).setOrigin(0, 0.5);

    // ── Face portrait (right side) ──
    const faceX = panelCX + panelW / 2 - 80;
    const faceY = panelCY + 40;

    // Frame
    this.add.nineslice(faceX, faceY, 'ui-inventory-cell', null, 100, 100, ...NINE.CELL)
      .setDepth(12);

    this.previewFace = null;
    if (this.textures.exists('boy-face')) {
      this.previewFace = this.add.image(faceX, faceY, 'boy-face')
        .setScale(2.2).setDepth(13);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NAME INPUT
  // ═══════════════════════════════════════════════════════════

  createNameInput() {
    const nameY = 490;

    // Simple underline-style input
    createPanel(this, SCREEN.CX, nameY, 300, 30, {
      texture: 'ui-panel-interior', depth: 10, alpha: 0.6,
    });

    createText(this, SCREEN.CX - 130, nameY, 'Mahlas:', FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: 12, originX: 0, originY: 0.5,
    });

    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = 'Âşık';
    inputElement.maxLength = 16;
    inputElement.style.cssText = `
      font-size: 12px; font-family: 'KiwiSoda', monospace;
      padding: 3px 8px; width: 180px;
      background: transparent; color: ${COLOR.ACCENT_GOLD};
      border: none; outline: none; caret-color: ${COLOR.ACCENT_GOLD};
    `;

    this.nameInput = this.add.dom(SCREEN.CX + 30, nameY, inputElement).setDepth(12);
  }

  // ═══════════════════════════════════════════════════════════
  // BUTTONS
  // ═══════════════════════════════════════════════════════════

  createButtons() {
    const btnY = 540;

    createButton(this, SCREEN.CX - 160, btnY, 'MEYDANE', {
      width: 140, height: 28, depth: 10,
      onClick: () => this.startGame('normal'),
    });

    createButton(this, SCREEN.CX, btnY, 'ODALAR', {
      width: 140, height: 28, depth: 10,
      onClick: () => this.showRoomList(),
    });

    createButton(this, SCREEN.CX + 160, btnY, 'SERBEST', {
      width: 140, height: 28, depth: 10,
      onClick: () => this.startGame('sandbox'),
    });

    createText(this, SCREEN.CX, btnY + 24, 'Serbest: Sınırsız ilham, talim kuklaları, meydan daralmasız', FONT.SMALL, {
      fill: COLOR.TEXT_DISABLED, depth: 12, originX: 0.5, originY: 0.5,
    });

    // Room list state
    this.roomListElements = [];
    this.roomListSocket = null;
    this.selectedRoomId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // BOTTOM TIP
  // ═══════════════════════════════════════════════════════════

  createBottomTip() {
    const tipText = createText(this, SCREEN.CX, SCREEN.H - 16, TIPS[0], FONT.SMALL, {
      fill: COLOR.TEXT_DISABLED, depth: 12, originX: 0.5, originY: 0.5,
    });

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

  createSoundToggle() {
    const isMuted = this.sound.mute;
    createIconButton(this, SCREEN.W - 24, 24,
      isMuted ? 'spell-BookThunder-off' : 'spell-BookThunder', {
        size: 18, depth: 20,
        onClick: () => {
          this.sound.mute = !this.sound.mute;
          localStorage.setItem('soundMuted', this.sound.mute);
          // Icon will update on scene rebuild
        },
      });
  }

  // ═══════════════════════════════════════════════════════════
  // CHARACTER SELECTION
  // ═══════════════════════════════════════════════════════════

  selectCharacter(index) {
    // Deselect previous
    const prev = this.charRows[this.selectedCharIndex];
    if (prev) {
      prev.highlight.setVisible(false);
      prev.nameText.setFill(COLOR.TEXT_SECONDARY);
      prev.bg.setAlpha(0.6);
    }

    this.selectedCharIndex = index;
    const row = this.charRows[index];
    const char = CHARACTERS[index];

    // Select new
    row.highlight.setVisible(true);
    row.nameText.setFill(COLOR.ACCENT_GOLD);
    row.bg.setAlpha(0.9);

    // Update preview
    if (this.previewSprite) {
      this.tweens.add({
        targets: this.previewSprite,
        alpha: 0, duration: 60,
        onComplete: () => {
          this.previewSprite.play(`${char.id}-walk-down`);
          this.tweens.add({ targets: this.previewSprite, alpha: 1, duration: 100 });
        },
      });
    }

    // Update face
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

    if (this.previewName) this.previewName.setText(char.name);

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
    const panelW = 380;
    const panelH = 320;
    const panel = createPanel(this, SCREEN.CX, SCREEN.CY, panelW, panelH, {
      texture: 'ui-panel', depth: DPT + 1, alpha: 0.95,
    });
    this.roomListElements.push(panel);

    // Title
    const py = SCREEN.CY - panelH / 2;
    const title = createText(this, SCREEN.CX, py + 24, 'AÇIK ODALAR', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: DPT + 2, originX: 0.5, originY: 0.5,
      stroke: '#000000', strokeThickness: 2,
    });
    this.roomListElements.push(title);

    // Separator
    const sep = createSeparator(this, SCREEN.CX, py + 42, panelW - 32, { depth: DPT + 2 });
    this.roomListElements.push(sep);

    // Loading text
    this.roomListLoading = createText(this, SCREEN.CX, SCREEN.CY, 'Yükleniyor...', FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, depth: DPT + 3, originX: 0.5, originY: 0.5,
    });
    this.roomListElements.push(this.roomListLoading);

    // YENİLE button
    const { elements: refreshEls } = createButton(this, SCREEN.CX - 70, py + panelH - 30, 'YENİLE', {
      width: 110, height: 26, depth: DPT + 2,
      onClick: () => this.refreshRoomList(),
    });
    this.roomListElements.push(...refreshEls);

    // KAPAT button
    const { elements: closeEls } = createButton(this, SCREEN.CX + 70, py + panelH - 30, 'KAPAT', {
      width: 110, height: 26, depth: DPT + 2,
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
    const panelH = 320;
    const py = SCREEN.CY - panelH / 2;

    if (rooms.length === 0) {
      const emptyText = createText(this, SCREEN.CX, SCREEN.CY - 10, 'Açık oda yok', FONT.BODY, {
        fill: COLOR.TEXT_SECONDARY, depth: DPT + 3, originX: 0.5, originY: 0.5,
      });
      this.roomRowElements.push(emptyText);
      this.roomListElements.push(emptyText);

      const hintText = createText(this, SCREEN.CX, SCREEN.CY + 12, "MEYDANE'ye basıp oda kur!", FONT.SMALL, {
        fill: COLOR.ACCENT_SUCCESS, depth: DPT + 3, originX: 0.5, originY: 0.5,
      });
      this.roomRowElements.push(hintText);
      this.roomListElements.push(hintText);
      return;
    }

    const rowH = 30;
    const rowW = 340;
    const startY = py + 60;
    const maxVisible = Math.min(rooms.length, 6);

    for (let i = 0; i < maxVisible; i++) {
      const room = rooms[i];
      const rowY = startY + i * (rowH + 4);

      const rowBg = this.add.nineslice(SCREEN.CX, rowY, 'ui-inventory-cell', null, rowW, rowH, ...NINE.CELL)
        .setDepth(DPT + 2).setAlpha(0.7);
      this.roomRowElements.push(rowBg);
      this.roomListElements.push(rowBg);

      const hostText = createText(this, SCREEN.CX - rowW / 2 + 12, rowY, room.hostName, FONT.BODY_BOLD, {
        fill: COLOR.ACCENT_GOLD, depth: DPT + 3, originX: 0, originY: 0.5,
      });
      this.roomRowElements.push(hostText);
      this.roomListElements.push(hostText);

      const countText = createText(this, SCREEN.CX + 50, rowY, `${room.playerCount}/${room.maxPlayers}`, FONT.BODY, {
        fill: COLOR.TEXT_SECONDARY, depth: DPT + 3, originX: 0.5, originY: 0.5,
      });
      this.roomRowElements.push(countText);
      this.roomListElements.push(countText);

      // KATIL button
      const btnX = SCREEN.CX + rowW / 2 - 44;
      const { elements: joinEls, btn: joinBtn } = createButton(this, btnX, rowY, 'KATIL', {
        width: 60, height: 24, depth: DPT + 3,
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
