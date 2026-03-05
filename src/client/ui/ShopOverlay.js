import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier, getUpgradeCost } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';

/**
 * Shop Overlay — shown during SHOP phase between rounds.
 * Renders 4 spell slot columns (Q/W/E/R).
 * Each column shows available spells for that slot as a grid, with tier upgrade UI.
 */
export class ShopOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.progression = null;
    this.shopTimer = 0;
    this.elements = [];
  }

  show(progression, shopDuration) {
    if (this.visible) this.destroy();
    this.visible = true;
    this.progression = progression;
    this.shopTimer = shopDuration || 20;
    this.build();
  }

  hide() {
    this.visible = false;
    this.destroy();
  }

  updateProgression(progression) {
    this.progression = progression;
    if (this.visible) {
      this.destroy();
      this.build();
    }
  }

  updateTimer(remaining) {
    this.shopTimer = remaining;
    if (this.timerText && !this.timerText.destroyed) {
      this.timerText.setText(`Shop closes in ${Math.ceil(remaining)}s`);
    }
  }

  build() {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const prog = this.progression;

    // Semi-transparent background
    this.bg = scene.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.80)
      .setScrollFactor(0).setDepth(300).setInteractive();
    this.elements.push(this.bg);

    // Title
    const title = scene.add.text(camW / 2, 16, 'SPELL SHOP', {
      fontSize: '22px', fill: '#ffdd44', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(301).setOrigin(0.5, 0);
    this.elements.push(title);

    // SP counter
    const sp = prog ? prog.sp : 0;
    this.spText = scene.add.text(camW / 2, 42, `✦ ${sp} SP`, {
      fontSize: '16px', fill: '#44ddff', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(301).setOrigin(0.5, 0);
    this.elements.push(this.spText);

    // Timer
    this.timerText = scene.add.text(camW / 2, 62, `Shop closes in ${Math.ceil(this.shopTimer)}s`, {
      fontSize: '11px', fill: '#888888',
    }).setScrollFactor(0).setDepth(301).setOrigin(0.5, 0);
    this.elements.push(this.timerText);

    // Build 4 slot columns
    const slots = ['Q', 'W', 'E', 'R'];
    const panelWidth = 280;
    const panelGap = 8;
    const totalWidth = slots.length * panelWidth + (slots.length - 1) * panelGap;
    const startX = (camW - totalWidth) / 2;
    const panelY = 84;
    const panelHeight = camH - panelY - 16;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const x = startX + i * (panelWidth + panelGap);
      this.buildSlotPanel(slot, x, panelY, panelWidth, panelHeight);
    }
  }

  buildSlotPanel(slot, x, y, width, height) {
    const scene = this.scene;
    const prog = this.progression;
    const isLocked = prog ? prog.slots[slot] === 'locked' : slot !== 'Q';
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;
    const availableSpells = SLOT_SPELLS[slot] || [];

    // Panel background
    const panelBg = scene.add.rectangle(x + width / 2, y + height / 2, width, height, 0x0f0f20, 0.95)
      .setScrollFactor(0).setDepth(301).setStrokeStyle(2, isLocked ? 0x333333 : 0x445566);
    this.elements.push(panelBg);

    // Slot header
    const slotColors = { Q: '#ff6644', W: '#44bbff', E: '#44ddaa', R: '#ff44aa' };
    const slotLabel = scene.add.text(x + 10, y + 8, `[${slot}]`, {
      fontSize: '16px', fill: slotColors[slot] || '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(302);
    this.elements.push(slotLabel);

    const slotNames = { Q: 'ATTACK', W: 'MOBILITY', E: 'CONTROL', R: 'ULTIMATE' };
    const slotNameLabel = scene.add.text(x + 40, y + 8, slotNames[slot], {
      fontSize: '14px', fill: '#aaaaaa', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(302);
    this.elements.push(slotNameLabel);

    let contentY = y + 34;

    // --- LOCKED STATE ---
    if (isLocked) {
      const lockY = y + height / 2 - 30;
      const lockIcon = scene.add.text(x + width / 2, lockY, '🔒', {
        fontSize: '28px',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(lockIcon);

      const lockLabel = scene.add.text(x + width / 2, lockY + 35, 'LOCKED', {
        fontSize: '16px', fill: '#555555', fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(lockLabel);

      const costLabel = scene.add.text(x + width / 2, lockY + 56, `Unlock: ${SP.SLOT_UNLOCK_COST} SP`, {
        fontSize: '13px', fill: '#888888',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(costLabel);

      const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
      this.createButton(x + width / 2, lockY + 85, 'Unlock', canUnlock ? 0x44aa44 : 0x333333, canUnlock, () => {
        if (scene.network && scene.network.connected) {
          scene.network.sendShopUnlockSlot(slot);
        }
      });
      return;
    }

    // --- SPELL SELECTION GRID ---
    const gridCols = slot === 'Q' ? 3 : Math.min(4, availableSpells.length);
    const cellSize = 56;
    const cellGap = 4;
    const gridWidth = gridCols * cellSize + (gridCols - 1) * cellGap;
    const gridStartX = x + (width - gridWidth) / 2;

    for (let i = 0; i < availableSpells.length; i++) {
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const cellX = gridStartX + col * (cellSize + cellGap) + cellSize / 2;
      const cellY = contentY + row * (cellSize + cellGap + 16) + cellSize / 2;

      const isChosen = chosenSpellId === spellId;
      const borderColor = isChosen ? 0x44ddff : 0x334455;
      const bgColor = isChosen ? 0x1a2a3a : 0x151525;

      // Cell background
      const cellBg = scene.add.rectangle(cellX, cellY, cellSize, cellSize, bgColor, 0.9)
        .setScrollFactor(0).setDepth(302).setStrokeStyle(isChosen ? 2 : 1, borderColor);
      this.elements.push(cellBg);

      // Spell icon
      if (def.icon && scene.textures.exists(def.icon)) {
        const icon = scene.add.image(cellX, cellY - 4, def.icon)
          .setScrollFactor(0).setDepth(303);
        const s = (cellSize - 14) / Math.max(icon.width, icon.height);
        icon.setScale(s);
        this.elements.push(icon);
      }

      // Spell name below cell
      const nameLabel = scene.add.text(cellX, cellY + cellSize / 2 + 3, def.name, {
        fontSize: '8px', fill: isChosen ? '#44ddff' : '#888888',
        fontStyle: isChosen ? 'bold' : 'normal',
      }).setScrollFactor(0).setDepth(303).setOrigin(0.5, 0);
      this.elements.push(nameLabel);

      // Click to choose spell
      if (!isChosen) {
        const isFirstChoice = chosenSpellId === null;
        const canAfford = isFirstChoice ? prog.sp >= SP.SPELL_CHOICE_COST : true; // switching is free
        const costStr = isFirstChoice ? `${SP.SPELL_CHOICE_COST} SP` : 'Free';

        cellBg.setInteractive({ useHandCursor: canAfford });
        if (canAfford) {
          cellBg.on('pointerover', () => {
            cellBg.setStrokeStyle(2, 0x88aacc);
            // Show tooltip
            this._showTooltip(cellX, cellY - cellSize / 2 - 10, def, spellId, costStr);
          });
          cellBg.on('pointerout', () => {
            cellBg.setStrokeStyle(1, 0x334455);
            this._hideTooltip();
          });
          cellBg.on('pointerdown', () => {
            if (scene.network && scene.network.connected) {
              scene.network.sendShopChooseSpell(slot, spellId);
            }
          });
        }
      } else {
        // Hover tooltip for chosen spell
        cellBg.setInteractive({ useHandCursor: false });
        cellBg.on('pointerover', () => {
          this._showTooltip(cellX, cellY - cellSize / 2 - 10, def, spellId, null);
        });
        cellBg.on('pointerout', () => {
          this._hideTooltip();
        });
      }
    }

    // Calculate grid height
    const rows = Math.ceil(availableSpells.length / gridCols);
    contentY += rows * (cellSize + cellGap + 16) + 8;

    // --- TIER UPGRADE SECTION (only if spell is chosen) ---
    if (chosenSpellId) {
      const tree = SKILL_TREES[chosenSpellId];
      if (!tree) return;

      const maxTier = getMaxTier(chosenSpellId);

      // Divider
      const divider = scene.add.rectangle(x + width / 2, contentY, width - 20, 1, 0x334455)
        .setScrollFactor(0).setDepth(302);
      this.elements.push(divider);
      contentY += 10;

      // Current spell stats
      const stats = computeSpellStats(chosenSpellId, currentTier);
      const statsStr = this.formatStats(stats);
      const statsLabel = scene.add.text(x + 10, contentY, statsStr, {
        fontSize: '10px', fill: '#88aacc', lineSpacing: 2,
      }).setScrollFactor(0).setDepth(302);
      this.elements.push(statsLabel);
      contentY += statsLabel.height + 8;

      // Tier dots
      const dotSize = 14;
      const dotGap = 6;
      const dotsWidth = maxTier * (dotSize + dotGap) - dotGap;
      const dotsStartX = x + (width - dotsWidth) / 2;

      for (let t = 0; t < maxTier; t++) {
        const filled = t < currentTier;
        const color = filled ? 0x44ddff : 0x222233;
        const dot = scene.add.rectangle(
          dotsStartX + t * (dotSize + dotGap) + dotSize / 2,
          contentY + dotSize / 2,
          dotSize, dotSize, color, filled ? 1 : 0.5
        ).setScrollFactor(0).setDepth(302).setStrokeStyle(1, filled ? 0x66eeff : 0x444466);
        this.elements.push(dot);

        const tNum = scene.add.text(
          dotsStartX + t * (dotSize + dotGap) + dotSize / 2,
          contentY + dotSize / 2,
          `${t + 1}`,
          { fontSize: '9px', fill: filled ? '#000000' : '#555555', fontStyle: 'bold' }
        ).setScrollFactor(0).setDepth(303).setOrigin(0.5);
        this.elements.push(tNum);
      }
      contentY += dotSize + 10;

      // Show completed tiers
      for (let t = 0; t < currentTier && t < tree.tiers.length; t++) {
        const tier = tree.tiers[t];
        const tierLabel = scene.add.text(x + 12, contentY, `✓ T${t + 1}: ${tier.name}`, {
          fontSize: '10px', fill: '#44dd66',
        }).setScrollFactor(0).setDepth(302);
        this.elements.push(tierLabel);
        contentY += 14;
      }

      // Next upgrade
      const nextTier = getNextTierInfo(chosenSpellId, currentTier);
      if (nextTier) {
        contentY += 4;
        const nextBox = scene.add.rectangle(x + width / 2, contentY + 30, width - 20, 60, 0x1a1a30, 0.9)
          .setScrollFactor(0).setDepth(302).setStrokeStyle(1, 0x445566);
        this.elements.push(nextBox);

        const nextLabel = scene.add.text(x + 15, contentY + 8, `Next: ${nextTier.name}`, {
          fontSize: '12px', fill: '#ffffff', fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(303);
        this.elements.push(nextLabel);

        const nextDesc = scene.add.text(x + 15, contentY + 24, nextTier.description, {
          fontSize: '9px', fill: '#aaaaaa', wordWrap: { width: width - 30 },
        }).setScrollFactor(0).setDepth(303);
        this.elements.push(nextDesc);

        // Mod preview
        const modText = Object.entries(nextTier.mods)
          .map(([k, v]) => {
            if (typeof v === 'boolean') return `${k}: ${v}`;
            return `${k}: ${v > 0 ? '+' : ''}${v}`;
          })
          .join(', ');
        const modLabel = scene.add.text(x + 15, contentY + 40, modText, {
          fontSize: '8px', fill: '#88aacc', wordWrap: { width: width - 30 },
        }).setScrollFactor(0).setDepth(303);
        this.elements.push(modLabel);

        contentY += 70;

        // Upgrade button
        const cost = nextTier.cost;
        const canUpgrade = prog && prog.sp >= cost;
        this.createButton(x + width / 2, contentY, `Upgrade (${cost} SP)`,
          canUpgrade ? 0x44aa44 : 0x333333, canUpgrade, () => {
            if (scene.network && scene.network.connected) {
              scene.network.sendShopUpgradeTier(slot);
            }
          }
        );
      } else {
        contentY += 10;
        const maxLabel = scene.add.text(x + width / 2, contentY, '★ MAX LEVEL ★', {
          fontSize: '13px', fill: '#ffdd44', fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
        this.elements.push(maxLabel);
      }
    } else {
      // No spell chosen yet — prompt
      contentY += 10;
      const promptLabel = scene.add.text(x + width / 2, contentY, `Choose a spell (${SP.SPELL_CHOICE_COST} SP)`, {
        fontSize: '12px', fill: '#888888',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(promptLabel);
    }
  }

  // --- Tooltip ---
  _showTooltip(x, y, def, spellId, costStr) {
    this._hideTooltip();
    const scene = this.scene;
    const tree = SKILL_TREES[spellId];
    if (!tree) return;

    const stats = computeSpellStats(spellId, 0);
    const lines = [def.name, def.description, '', this.formatStats(stats)];
    if (costStr) lines.push('', `Cost: ${costStr}`);

    const text = lines.join('\n');
    const tipBg = scene.add.rectangle(x, y - 5, 200, 80, 0x111122, 0.95)
      .setScrollFactor(0).setDepth(310).setOrigin(0.5, 1).setStrokeStyle(1, 0x445566);
    const tipText = scene.add.text(x, y - 78, text, {
      fontSize: '9px', fill: '#cccccc', lineSpacing: 2,
      wordWrap: { width: 190 }, align: 'center',
    }).setScrollFactor(0).setDepth(311).setOrigin(0.5, 0);

    // Adjust bg height
    tipBg.setSize(200, tipText.height + 16);
    tipBg.setY(y - 5);
    tipBg.setOrigin(0.5, 1);
    tipText.setY(y - tipText.height - 10);

    this._tooltip = [tipBg, tipText];
    this.elements.push(tipBg, tipText);
  }

  _hideTooltip() {
    if (this._tooltip) {
      for (const el of this._tooltip) {
        if (el && !el.destroyed) el.destroy();
      }
      this._tooltip = null;
    }
  }

  createButton(x, y, text, color, enabled, onClick) {
    const scene = this.scene;
    const btn = scene.add.rectangle(x, y, 140, 28, color, enabled ? 0.9 : 0.4)
      .setScrollFactor(0).setDepth(303).setOrigin(0.5)
      .setStrokeStyle(1, enabled ? 0xffffff : 0x444444, enabled ? 0.3 : 0.1);

    if (enabled) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setFillStyle(color, 1));
      btn.on('pointerout', () => btn.setFillStyle(color, 0.9));
      btn.on('pointerdown', onClick);
    }
    this.elements.push(btn);

    const label = scene.add.text(x, y, text, {
      fontSize: '12px', fill: enabled ? '#ffffff' : '#666666', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(304).setOrigin(0.5);
    this.elements.push(label);

    return btn;
  }

  formatStats(stats) {
    if (!stats) return '';
    const lines = [];
    if (stats.damage) lines.push(`DMG: ${stats.damage}`);
    if (stats.knockbackForce) lines.push(`KB: ${(stats.knockbackForce * 1000).toFixed(0)}`);
    if (stats.cooldown) lines.push(`CD: ${(stats.cooldown / 1000).toFixed(1)}s`);
    if (stats.speed) lines.push(`Spd: ${stats.speed}`);
    if (stats.range) lines.push(`Rng: ${stats.range}`);
    if (stats.slowAmount) lines.push(`Slow: ${(stats.slowAmount * 100).toFixed(0)}%`);
    if (stats.pullForce) lines.push(`Pull: ${(stats.pullForce * 1000).toFixed(0)}`);
    if (stats.buffDuration) lines.push(`Dur: ${(stats.buffDuration / 1000).toFixed(1)}s`);
    if (stats.shieldHits) lines.push(`Hits: ${stats.shieldHits}`);
    if (stats.missileCount && stats.missileCount > 1) lines.push(`Missiles: ${stats.missileCount}`);
    if (stats.maxBounces) lines.push(`Bounces: ${stats.maxBounces}`);
    return lines.join(' | ');
  }

  destroy() {
    this._hideTooltip();
    for (const el of this.elements) {
      if (el && !el.destroyed) {
        el.removeAllListeners();
        el.destroy();
      }
    }
    this.elements = [];
    this.timerText = null;
    this.spText = null;
    this.bg = null;
  }
}
