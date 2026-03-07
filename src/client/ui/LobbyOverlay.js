import { CHARACTERS } from '../scenes/BootScene.js';
import { MATCH } from '../../shared/constants.js';
import { UI_FONT } from '../config.js';
import { createNinesliceButton } from './UIHelpers.js';

// Loading-screen style tips
const TIPS = [
  'Sağ tıkla buzda yürü',
  'Q / W / E / R ile hünerlerini göster',
  'Meydanın içinde kal!',
  'Dükkânda hünerlerini pişir',
  'Rakibi meydandan aşağı düşür!',
  'Buz zemini: yolunu iyi hesapla!',
  'Sert vuruş seni uçurur',
];

/**
 * LobbyOverlay — Shown during the 'waiting' phase before the match starts.
 * Displays connected players with their character sprites and a waiting message.
 * In lobby mode, also shows a BAŞLAT button for the host.
 */
export class LobbyOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
    this.playerSlots = [];  // { bg, focusHighlight, faceSprite, nameText, placeholder, hostIcon }
    this.countText = null;
    this.tipText = null;
    this.tipIndex = 0;
    this.tipTimer = null;

    // Lobby mode state
    this.lobbyMode = false;
    this.isHost = false;
    this.hostId = null;
    this.startButtonElements = [];
    this.titleText = null;
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.build();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.destroy();
  }

  destroy() {
    if (this.tipTimer) {
      this.tipTimer.destroy();
      this.tipTimer = null;
    }
    for (const el of this.elements) {
      if (el && !el.destroyed) el.destroy();
    }
    this.elements = [];
    this.playerSlots = [];
    this.countText = null;
    this.tipText = null;
    this.titleText = null;
    this.startButtonElements = [];
  }

  /**
   * Show in lobby mode (with host controls).
   * @param {Array} players — [{ id, name, characterId }, ...]
   * @param {boolean} isHost — whether the local player is the host
   * @param {string} hostId — socket id of the host
   */
  showLobbyMode(players, isHost, hostId) {
    // If already visible (HUDManager auto-showed during waiting phase),
    // destroy and rebuild with lobby mode enabled
    if (this.visible) {
      this.visible = false;
      this.destroy();
    }
    this.lobbyMode = true;
    this.isHost = isHost;
    this.hostId = hostId;
    this.show();
    this.buildLobbyExtras();
    this.updatePlayers(players);
  }

  /**
   * Update lobby mode with new player list.
   * @param {Array} players — [{ id, name, characterId }, ...]
   * @param {boolean} isHost — whether the local player is the host
   * @param {string} hostId — socket id of the host
   */
  updateLobbyMode(players, isHost, hostId) {
    this.isHost = isHost;
    this.hostId = hostId;
    this.updatePlayers(players);

    // Show/hide start button based on host status
    for (const el of this.startButtonElements) {
      if (el && !el.destroyed) el.setVisible(this.isHost);
    }
  }

  build() {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const DEPTH = 280;

    // Semi-transparent overlay
    const bg = scene.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.elements.push(bg);

    // Main panel — nineslice (taller for lobby mode to fit start button)
    const panelW = 440;
    const panelH = this.lobbyMode ? 400 : 350;
    const panel = scene.add.nineslice(camW / 2, camH / 2, 'ui-panel', null, panelW, panelH, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(panel);

    // Title
    const py = camH / 2 - panelH / 2;
    const titleLabel = this.lobbyMode ? 'ODA HAZIR' : 'ÂŞIKLAR BEKLENİYOR';
    this.titleText = scene.add.text(camW / 2, py + 30, titleLabel, {
      fontSize: '32px',
      fontFamily: UI_FONT,
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(this.titleText);

    // Pulsing dots animation on title (only in non-lobby mode)
    if (!this.lobbyMode) {
      let dots = 0;
      const dotsTimer = scene.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => {
          dots = (dots + 1) % 4;
          if (this.titleText && !this.titleText.destroyed) {
            this.titleText.setText('ÂŞIKLAR BEKLENİYOR' + '.'.repeat(dots));
          }
        },
      });
      this.elements.push(dotsTimer);
    }

    // Subtitle
    const sub = scene.add.text(camW / 2, py + 55, 'ÂŞIKLAR MEYDANE', {
      fontSize: '16px',
      fontFamily: UI_FONT,
      fill: '#3a2218',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(sub);

    // Player count
    this.countText = scene.add.text(camW / 2, py + 80, `0 / ${MATCH.MAX_PLAYERS} âşık`, {
      fontSize: '16px',
      fontFamily: UI_FONT,
      fill: '#1a5588',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(this.countText);

    // --- Player slots grid (2 rows x 4 cols) ---
    const slotSize = 72;
    const gap = 12;
    const gridCols = 4;
    const gridRows = 2;
    const gridW = gridCols * slotSize + (gridCols - 1) * gap;
    const gridStartX = camW / 2 - gridW / 2 + slotSize / 2;
    const gridStartY = py + 115;

    this.playerSlots = [];
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const sx = gridStartX + col * (slotSize + gap);
        const sy = gridStartY + row * (slotSize + gap + 8);

        // Focus highlight (behind slot, initially hidden)
        const focusHighlight = scene.add.nineslice(sx, sy, 'ui-focus', null, slotSize + 6, slotSize + 6, 7, 7, 7, 7)
          .setTint(0xffdd44).setScrollFactor(0).setDepth(DEPTH + 2).setVisible(false);
        this.elements.push(focusHighlight);

        // Slot background — nineslice inventory cell
        const slotBg = scene.add.nineslice(sx, sy, 'ui-inventory-cell', null, slotSize, slotSize, 7, 7, 7, 7)
          .setScrollFactor(0).setDepth(DEPTH + 2);
        this.elements.push(slotBg);

        // Placeholder "?"
        const placeholder = scene.add.text(sx, sy - 8, '?', {
          fontSize: '32px',
          fontFamily: UI_FONT,
          fill: '#5a3a28',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
        this.elements.push(placeholder);

        // Name (empty initially)
        const nameText = scene.add.text(sx, sy + 28, '', {
          fontSize: '16px',
          fontFamily: UI_FONT,
          fill: '#5a3a28',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
        this.elements.push(nameText);

        // Host crown icon (hidden by default)
        const hostIcon = scene.add.text(sx + slotSize / 2 - 4, sy - slotSize / 2 + 4, '★', {
          fontSize: '16px',
          fill: '#ffdd44',
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(DEPTH + 4).setVisible(false);
        this.elements.push(hostIcon);

        this.playerSlots.push({ bg: slotBg, focusHighlight, placeholder, nameText, faceSprite: null, hostIcon });
      }
    }

    // --- Tip text ---
    this.tipIndex = 0;
    this.tipText = scene.add.text(camW / 2, py + panelH - 30, TIPS[0], {
      fontSize: '16px',
      fontFamily: UI_FONT,
      fill: '#5a3a28',
      fontStyle: 'italic',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(this.tipText);

    this.tipTimer = scene.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        this.tipIndex = (this.tipIndex + 1) % TIPS.length;
        if (this.tipText && !this.tipText.destroyed) {
          this.tipText.setText(TIPS[this.tipIndex]);
        }
      },
    });
  }

  /**
   * Add lobby-specific UI elements (BAŞLAT button for host).
   */
  buildLobbyExtras() {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const DEPTH = 280;

    // BAŞLAT button — only visible to host
    const btnY = camH / 2 + 140;
    const { elements } = createNinesliceButton(scene, camW / 2, btnY, 'BAŞLAT', {
      width: 180,
      height: 44,
      depth: DEPTH + 5,
      fontSize: '16px',
      enabled: true,
      onClick: () => {
        if (scene.network) {
          scene.network.sendStartGame();
        }
      },
    });

    for (const el of elements) {
      el.setVisible(this.isHost);
      this.elements.push(el);
    }
    this.startButtonElements = elements;
  }

  /**
   * Update the lobby with current player list.
   * @param {Array} players — [{ id, name, characterId }, ...]
   */
  updatePlayers(players) {
    if (!this.visible) return;

    // Update count text
    if (this.countText && !this.countText.destroyed) {
      this.countText.setText(`${players.length} / ${MATCH.MAX_PLAYERS} âşık`);
    }

    // Update slots
    for (let i = 0; i < this.playerSlots.length; i++) {
      const slot = this.playerSlots[i];
      const player = players[i];

      if (player) {
        // Show player
        slot.placeholder.setVisible(false);
        slot.nameText.setText(player.name || player.id.slice(-4));
        slot.nameText.setColor('#cccccc');
        slot.bg.setTint(0xbbbbaa);
        slot.focusHighlight.setVisible(true);

        // Show host crown indicator
        if (slot.hostIcon) {
          slot.hostIcon.setVisible(this.lobbyMode && player.id === this.hostId);
        }

        // Add face sprite if not already there
        if (!slot.faceSprite) {
          const charId = player.characterId || 'boy';
          const faceKey = `${charId}-face`;
          if (this.scene.textures.exists(faceKey)) {
            slot.faceSprite = this.scene.add.image(slot.bg.x, slot.bg.y - 6, faceKey)
              .setScale(1.5)
              .setScrollFactor(0).setDepth(slot.bg.depth + 1);
            this.elements.push(slot.faceSprite);
          } else {
            // Fallback: idle sprite
            slot.faceSprite = this.scene.add.sprite(slot.bg.x, slot.bg.y - 6, `${charId}-idle`, 0)
              .setScale(3)
              .setScrollFactor(0).setDepth(slot.bg.depth + 1);
            this.elements.push(slot.faceSprite);
          }
        }
      } else {
        // Empty slot
        slot.placeholder.setVisible(true);
        slot.nameText.setText('');
        slot.bg.clearTint();
        slot.focusHighlight.setVisible(false);

        if (slot.hostIcon) {
          slot.hostIcon.setVisible(false);
        }

        if (slot.faceSprite) {
          slot.faceSprite.destroy();
          slot.faceSprite = null;
        }
      }
    }
  }
}
