import { CHARACTERS } from '../scenes/BootScene.js';
import { MATCH } from '../../shared/constants.js';
import { UI_FONT } from '../config.js';

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
 */
export class LobbyOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
    this.playerSlots = [];  // { bg, focusHighlight, faceSprite, nameText, placeholder }
    this.countText = null;
    this.tipText = null;
    this.tipIndex = 0;
    this.tipTimer = null;
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

    // Main panel — nineslice
    const panelW = 440;
    const panelH = 350;
    const panel = scene.add.nineslice(camW / 2, camH / 2, 'ui-panel', null, panelW, panelH, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(panel);

    // Title
    const py = camH / 2 - panelH / 2;
    const title = scene.add.text(camW / 2, py + 30, 'ÂŞIKLAR BEKLENİYOR', {
      fontSize: '22px',
      fontFamily: UI_FONT,
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(title);

    // Pulsing dots animation on title
    let dots = 0;
    const dotsTimer = scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        if (title && !title.destroyed) {
          title.setText('ÂŞIKLAR BEKLENİYOR' + '.'.repeat(dots));
        }
      },
    });
    this.elements.push(dotsTimer);

    // Subtitle
    const sub = scene.add.text(camW / 2, py + 55, 'ÂŞIKLAR MEYDANE', {
      fontSize: '12px',
      fontFamily: UI_FONT,
      fill: '#555577',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(sub);

    // Player count
    this.countText = scene.add.text(camW / 2, py + 80, `0 / ${MATCH.MAX_PLAYERS} âşık`, {
      fontSize: '15px',
      fontFamily: UI_FONT,
      fill: '#44aadd',
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
        const focusHighlight = scene.add.nineslice(sx, sy, 'ui-focus', null, slotSize + 6, slotSize + 6, 3, 3, 3, 3)
          .setScrollFactor(0).setDepth(DEPTH + 2).setVisible(false);
        this.elements.push(focusHighlight);

        // Slot background — nineslice inventory cell
        const slotBg = scene.add.nineslice(sx, sy, 'ui-inventory-cell', null, slotSize, slotSize, 4, 4, 4, 4)
          .setScrollFactor(0).setDepth(DEPTH + 2);
        this.elements.push(slotBg);

        // Placeholder "?"
        const placeholder = scene.add.text(sx, sy - 8, '?', {
          fontSize: '28px',
          fontFamily: UI_FONT,
          fill: '#333355',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
        this.elements.push(placeholder);

        // Name (empty initially)
        const nameText = scene.add.text(sx, sy + 28, '', {
          fontSize: '9px',
          fontFamily: UI_FONT,
          fill: '#888899',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
        this.elements.push(nameText);

        this.playerSlots.push({ bg: slotBg, focusHighlight, placeholder, nameText, faceSprite: null });
      }
    }

    // --- Tip text ---
    this.tipIndex = 0;
    this.tipText = scene.add.text(camW / 2, py + panelH - 30, TIPS[0], {
      fontSize: '11px',
      fontFamily: UI_FONT,
      fill: '#555577',
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

        if (slot.faceSprite) {
          slot.faceSprite.destroy();
          slot.faceSprite = null;
        }
      }
    }
  }
}
