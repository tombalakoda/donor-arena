import Phaser from 'phaser';
import { SKILL_TREE, SPELL_SLOTS, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';

/**
 * Shop Overlay — shown during SHOP phase between rounds.
 * Renders 4 spell columns (Q/W/E/R) with upgrade trees.
 * Players can unlock slots, choose branches, and upgrade tiers.
 */
export class ShopOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.progression = null;    // current progression state from server
    this.shopTimer = 0;

    // UI containers
    this.container = null;      // main overlay container
    this.elements = [];         // all UI elements for cleanup
    this.spellPanels = {};      // { Q: { ... }, W: { ... }, ... }
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

    // Semi-transparent background
    this.bg = scene.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(300).setInteractive(); // interactive to block clicks through
    this.elements.push(this.bg);

    // Title
    const title = scene.add.text(camW / 2, 20, 'SKILL SHOP', {
      fontSize: '24px',
      fill: '#ffdd44',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(301).setOrigin(0.5, 0);
    this.elements.push(title);

    // SP counter
    const sp = this.progression ? this.progression.sp : 0;
    this.spText = scene.add.text(camW / 2, 50, `SP: ${sp}`, {
      fontSize: '18px',
      fill: '#44ddff',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(301).setOrigin(0.5, 0);
    this.elements.push(this.spText);

    // Timer
    this.timerText = scene.add.text(camW / 2, 72, `Shop closes in ${Math.ceil(this.shopTimer)}s`, {
      fontSize: '12px',
      fill: '#aaaaaa',
    }).setScrollFactor(0).setDepth(301).setOrigin(0.5, 0);
    this.elements.push(this.timerText);

    // Build 4 spell columns
    const slots = ['Q', 'W', 'E', 'R'];
    const panelWidth = 280;
    const totalWidth = slots.length * panelWidth + (slots.length - 1) * 10;
    const startX = (camW - totalWidth) / 2;
    const panelY = 100;
    const panelHeight = camH - 130;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const spellId = SPELL_SLOTS[slot];
      const x = startX + i * (panelWidth + 10);
      this.buildSpellPanel(spellId, slot, x, panelY, panelWidth, panelHeight);
    }
  }

  buildSpellPanel(spellId, slot, x, y, width, height) {
    const scene = this.scene;
    const tree = SKILL_TREE[spellId];
    const def = SPELLS[spellId];
    if (!tree || !def) return;

    const prog = this.progression;
    const isLocked = prog ? prog.slots[slot] === 'locked' : slot !== 'Q';
    const spellProg = prog ? prog.spells[spellId] : { branch: null, tier: 0 };

    // Panel background
    const panelBg = scene.add.rectangle(x + width / 2, y + height / 2, width, height, 0x1a1a2e, 0.9)
      .setScrollFactor(0).setDepth(301).setStrokeStyle(2, isLocked ? 0x333333 : 0x445566);
    this.elements.push(panelBg);

    // Slot key label
    const keyLabel = scene.add.text(x + 10, y + 8, slot, {
      fontSize: '16px',
      fill: isLocked ? '#555555' : '#ffdd44',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(302);
    this.elements.push(keyLabel);

    // Spell name
    const nameLabel = scene.add.text(x + 35, y + 8, tree.name, {
      fontSize: '16px',
      fill: isLocked ? '#555555' : '#ffffff',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(302);
    this.elements.push(nameLabel);

    // Spell icon
    if (def.icon) {
      const iconKey = isLocked ? `${def.icon}-off` : def.icon;
      // Check if texture exists
      const texKey = scene.textures.exists(iconKey) ? iconKey : def.icon;
      if (scene.textures.exists(texKey)) {
        const icon = scene.add.image(x + width - 30, y + 20, texKey)
          .setScrollFactor(0).setDepth(302);
        const iconScale = 28 / Math.max(icon.width, icon.height);
        icon.setScale(iconScale);
        if (isLocked) icon.setAlpha(0.3);
        this.elements.push(icon);
      }
    }

    let contentY = y + 45;

    // --- LOCKED STATE ---
    if (isLocked) {
      const lockText = scene.add.text(x + width / 2, contentY + 40, 'LOCKED', {
        fontSize: '18px',
        fill: '#555555',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(lockText);

      const costText = scene.add.text(x + width / 2, contentY + 65, `Cost: ${SP.SLOT_UNLOCK_COST} SP`, {
        fontSize: '14px',
        fill: '#aaaaaa',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(costText);

      // Unlock button
      const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
      const unlockBtn = this.createButton(
        x + width / 2, contentY + 100,
        'Unlock',
        canUnlock ? 0x44aa44 : 0x333333,
        canUnlock,
        () => {
          if (scene.network && scene.network.connected) {
            scene.network.sendShopUnlockSlot(slot);
          }
        }
      );
      return;
    }

    // --- UNLOCKED: Show base stats ---
    const baseStats = computeSpellStats(spellId, null, 0);
    const currentStats = computeSpellStats(spellId, spellProg.branch, spellProg.tier);
    const statsText = this.formatStats(currentStats);
    const statLabel = scene.add.text(x + 10, contentY, statsText, {
      fontSize: '10px',
      fill: '#88ccff',
      lineSpacing: 2,
    }).setScrollFactor(0).setDepth(302);
    this.elements.push(statLabel);

    contentY += statLabel.height + 10;

    // --- BRANCH CHOICE ---
    if (!spellProg.branch) {
      // Show two branch options
      const chooseLabel = scene.add.text(x + width / 2, contentY, 'Choose Path:', {
        fontSize: '13px',
        fill: '#ffdd44',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(chooseLabel);
      contentY += 22;

      for (const branch of ['A', 'B']) {
        const branchData = tree.branches[branch];
        const canChoose = prog && prog.sp >= SP.BRANCH_CHOICE_COST;

        // Branch card background
        const cardH = 70;
        const cardBg = scene.add.rectangle(x + width / 2, contentY + cardH / 2, width - 20, cardH, 0x222244, 0.8)
          .setScrollFactor(0).setDepth(302).setStrokeStyle(1, canChoose ? 0x445588 : 0x333344);
        this.elements.push(cardBg);

        // Branch name
        const bName = scene.add.text(x + 20, contentY + 6, `${branch}: ${branchData.name}`, {
          fontSize: '13px',
          fill: '#ffffff',
          fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(303);
        this.elements.push(bName);

        // Branch description
        const bDesc = scene.add.text(x + 20, contentY + 24, branchData.description, {
          fontSize: '9px',
          fill: '#aaaaaa',
          wordWrap: { width: width - 40 },
        }).setScrollFactor(0).setDepth(303);
        this.elements.push(bDesc);

        // Choose button
        this.createButton(
          x + width - 50, contentY + cardH - 18,
          `${SP.BRANCH_CHOICE_COST} SP`,
          canChoose ? 0x4488cc : 0x333333,
          canChoose,
          () => {
            if (scene.network && scene.network.connected) {
              scene.network.sendShopChooseBranch(spellId, branch);
            }
          }
        );

        contentY += cardH + 5;
      }
    } else {
      // --- BRANCH CHOSEN: Show tier progression ---
      const branchData = tree.branches[spellProg.branch];
      const branchLabel = scene.add.text(x + width / 2, contentY, `Path: ${branchData.name}`, {
        fontSize: '13px',
        fill: '#44ddff',
        fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
      this.elements.push(branchLabel);
      contentY += 22;

      // Tier progress dots
      const maxTier = getMaxTier(spellId, spellProg.branch);
      const dotSize = 14;
      const dotGap = 6;
      const dotsWidth = maxTier * (dotSize + dotGap) - dotGap;
      const dotsStartX = x + (width - dotsWidth) / 2;

      for (let t = 0; t < maxTier; t++) {
        const filled = t < spellProg.tier;
        const current = t === spellProg.tier;
        const color = filled ? 0x44ddff : current ? 0x445566 : 0x222233;
        const dot = scene.add.rectangle(
          dotsStartX + t * (dotSize + dotGap) + dotSize / 2,
          contentY + dotSize / 2,
          dotSize, dotSize,
          color, filled ? 1 : 0.6
        ).setScrollFactor(0).setDepth(302).setStrokeStyle(1, filled ? 0x66eeff : 0x444455);
        this.elements.push(dot);

        // Tier number
        const tNum = scene.add.text(
          dotsStartX + t * (dotSize + dotGap) + dotSize / 2,
          contentY + dotSize / 2,
          `${t + 1}`,
          { fontSize: '9px', fill: filled ? '#000000' : '#666666', fontStyle: 'bold' }
        ).setScrollFactor(0).setDepth(303).setOrigin(0.5);
        this.elements.push(tNum);
      }
      contentY += dotSize + 12;

      // Show completed tiers
      for (let t = 0; t < spellProg.tier && t < branchData.tiers.length; t++) {
        const tier = branchData.tiers[t];
        const tierLabel = scene.add.text(x + 15, contentY, `T${t + 1}: ${tier.name}`, {
          fontSize: '10px',
          fill: '#44dd44',
        }).setScrollFactor(0).setDepth(302);
        this.elements.push(tierLabel);
        contentY += 16;
      }

      // Show next upgrade
      const nextTier = getNextTierInfo(spellId, spellProg.branch, spellProg.tier);
      if (nextTier) {
        contentY += 5;
        const divider = scene.add.rectangle(x + width / 2, contentY, width - 30, 1, 0x445566)
          .setScrollFactor(0).setDepth(302);
        this.elements.push(divider);
        contentY += 8;

        const nextLabel = scene.add.text(x + 15, contentY, `Next: ${nextTier.name}`, {
          fontSize: '12px',
          fill: '#ffffff',
          fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(302);
        this.elements.push(nextLabel);
        contentY += 18;

        const nextDesc = scene.add.text(x + 15, contentY, nextTier.description, {
          fontSize: '10px',
          fill: '#aaaaaa',
          wordWrap: { width: width - 30 },
        }).setScrollFactor(0).setDepth(302);
        this.elements.push(nextDesc);
        contentY += nextDesc.height + 8;

        // Mod preview
        const modText = Object.entries(nextTier.mods)
          .map(([k, v]) => {
            if (typeof v === 'boolean') return `${k}: ${v}`;
            return `${k}: ${v > 0 ? '+' : ''}${v}`;
          })
          .join(', ');
        const modLabel = scene.add.text(x + 15, contentY, modText, {
          fontSize: '9px',
          fill: '#88ccff',
          wordWrap: { width: width - 30 },
        }).setScrollFactor(0).setDepth(302);
        this.elements.push(modLabel);
        contentY += modLabel.height + 10;

        // Upgrade button
        const canUpgrade = prog && prog.sp >= nextTier.cost;
        this.createButton(
          x + width / 2, contentY + 5,
          `Upgrade (${nextTier.cost} SP)`,
          canUpgrade ? 0x44aa44 : 0x333333,
          canUpgrade,
          () => {
            if (scene.network && scene.network.connected) {
              scene.network.sendShopUpgradeTier(spellId);
            }
          }
        );
      } else {
        // Max tier reached
        contentY += 10;
        const maxLabel = scene.add.text(x + width / 2, contentY, 'MAX LEVEL', {
          fontSize: '14px',
          fill: '#ffdd44',
          fontStyle: 'bold',
        }).setScrollFactor(0).setDepth(302).setOrigin(0.5);
        this.elements.push(maxLabel);
      }
    }
  }

  createButton(x, y, text, color, enabled, onClick) {
    const scene = this.scene;
    const btn = scene.add.rectangle(x, y, 120, 28, color, enabled ? 0.9 : 0.4)
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
      fontSize: '12px',
      fill: enabled ? '#ffffff' : '#666666',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(304).setOrigin(0.5);
    this.elements.push(label);

    return btn;
  }

  formatStats(stats) {
    if (!stats) return '';
    const lines = [];
    if (stats.damage) lines.push(`DMG: ${stats.damage}`);
    if (stats.knockbackForce) lines.push(`Push: ${(stats.knockbackForce * 1000).toFixed(0)}`);
    if (stats.cooldown) lines.push(`CD: ${(stats.cooldown / 1000).toFixed(1)}s`);
    if (stats.speed) lines.push(`Speed: ${stats.speed}`);
    if (stats.range) lines.push(`Range: ${stats.range}`);
    if (stats.slowAmount) lines.push(`Slow: ${(stats.slowAmount * 100).toFixed(0)}%`);
    if (stats.pullForce) lines.push(`Pull: ${(stats.pullForce * 1000).toFixed(0)}`);
    return lines.join(' | ');
  }

  destroy() {
    for (const el of this.elements) {
      if (el && !el.destroyed) {
        el.removeAllListeners();
        el.destroy();
      }
    }
    this.elements = [];
    this.spellPanels = {};
    this.timerText = null;
    this.spText = null;
    this.bg = null;
  }
}
