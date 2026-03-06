import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { UI_FONT } from '../config.js';
import { createNinesliceButton } from './UIHelpers.js';

/**
 * Shop Overlay — tab-based skill tree shown during SHOP phase.
 * Single-slot view with tabs for Q/W/E/R.  Much more spacious than
 * the old 4-column layout — eliminates text overlap issues.
 *
 * Layout (1280×720):
 * ┌──────────────────────────────────────────┐
 * │  HÜNER DÜKKÂNI    İlham: 12   Timer: 18s│  ← title bar
 * │  [Q SÖZ] [W EL] [E DİL] [R BEL]        │  ← tab row
 * │ ┌────────────────────────────────────────┐│
 * │ │  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ││  ← spell cells (horizontal)
 * │ │  │🔥│  │⚡│  │🧊│  │💨│  │🛡│  │..│  ││
 * │ │  └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  ││
 * │ │  name  name  name  name  name  name   ││
 * │ │────────────────────────────────────────││
 * │ │  Chosen: Uzun Hava         DMG:3 KB:70││  ← detail panel
 * │ │  CD:3.5s  Spd:8  Rng:450             ││
 * │ │  [■][■][□][□]  Tier 2/4              ││  ← tier progress
 * │ │  ┌─ Next: Heavy Round ───────────────┐││
 * │ │  │ Increased knockback               │││  ← upgrade box
 * │ │  │ knockbackForce: +0.02             │││
 * │ │  └───────────────────────────────────┘││
 * │ │        [ Pişir (3 İlham) ]           ││  ← upgrade button
 * │ └────────────────────────────────────────┘│
 * └──────────────────────────────────────────┘
 */

const DEPTH = 300;
const SLOTS = ['Q', 'W', 'E', 'R'];
const SLOT_NAMES = { Q: 'SÖZ', W: 'EL', E: 'DİL', R: 'BEL' };
const SLOT_COLORS = {
  Q: { hex: '#ff6644', tint: 0xff6644 },
  W: { hex: '#44bbff', tint: 0x44bbff },
  E: { hex: '#44ddaa', tint: 0x44ddaa },
  R: { hex: '#cc66ff', tint: 0xcc66ff },
};

export class ShopOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.progression = null;
    this.shopTimer = 0;
    this.activeSlot = 'Q';
    this.elements = [];       // persistent chrome (bg, title, tabs)
    this.slotElements = [];   // rebuilt when switching tabs
  }

  show(progression, shopDuration) {
    if (this.visible) this.destroy();
    this.visible = true;
    this.progression = progression;
    this.shopTimer = shopDuration || 20;
    // Auto-select first unlocked slot that has a chosen spell, or just Q
    this.activeSlot = this._pickDefaultSlot();
    this.build();
  }

  hide() {
    this.visible = false;
    this.destroy();
  }

  updateProgression(progression) {
    this.progression = progression;
    if (this.visible) {
      this._destroySlotElements();
      this._buildSlotContent();
    }
  }

  updateTimer(remaining) {
    this.shopTimer = remaining;
    if (this.timerText && !this.timerText.destroyed) {
      this.timerText.setText(`${Math.ceil(remaining)}s`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BUILD — persistent chrome
  // ═══════════════════════════════════════════════════════════════════
  build() {
    const s = this.scene;
    const W = s.cameras.main.width;   // 1280
    const H = s.cameras.main.height;  // 720

    // --- Dim background ---
    this.bg = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.elements.push(this.bg);

    // --- Title bar (nineslice across top) ---
    const titleBar = s.add.nineslice(
      W / 2, 28, 'ui-panel-interior', null,
      W - 40, 48, 7, 7, 7, 7
    ).setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(titleBar);

    const title = s.add.text(W / 2, 22, 'HÜNER DÜKKÂNI', {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#ffdd44', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5, 0);
    this.elements.push(title);

    // SP counter (left side of title bar)
    const sp = this.progression ? this.progression.sp : 0;
    this.spText = s.add.text(50, 28, `İlham: ${sp}`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#44ddff', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0, 0.5);
    this.elements.push(this.spText);

    // Timer (right side of title bar)
    this.timerText = s.add.text(W - 50, 28, `${Math.ceil(this.shopTimer)}s`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#aaaaaa',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(1, 0.5);
    this.elements.push(this.timerText);

    // --- Slot tabs ---
    this._buildTabs();

    // --- Slot content ---
    this._buildSlotContent();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TABS
  // ═══════════════════════════════════════════════════════════════════
  _buildTabs() {
    const s = this.scene;
    const W = s.cameras.main.width;
    const tabW = 160;
    const tabH = 36;
    const tabGap = 8;
    const totalTabW = SLOTS.length * tabW + (SLOTS.length - 1) * tabGap;
    const tabStartX = (W - totalTabW) / 2;
    const tabY = 68;

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = tabStartX + i * (tabW + tabGap) + tabW / 2;
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);

      // Tab background
      const tabBg = s.add.nineslice(
        cx, tabY,
        isActive ? 'ui-tab' : 'ui-tab-unselected', null,
        tabW, tabH, 8, 8, 4, 4
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      if (isLocked) tabBg.setTint(0x777777);
      else if (isActive) tabBg.setTint(SLOT_COLORS[slot].tint);
      this.elements.push(tabBg);

      // Tab label
      const labelColor = isActive ? '#ffffff' : (isLocked ? '#666666' : '#cccccc');
      const lockPrefix = isLocked ? '🔒 ' : '';
      const tabLabel = s.add.text(cx, tabY, `${lockPrefix}[${slot}] ${SLOT_NAMES[slot]}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: labelColor, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: isActive ? 2 : 0,
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
      this.elements.push(tabLabel);

      // Tab click handler
      const hitArea = s.add.rectangle(cx, tabY, tabW, tabH, 0xffffff, 0)
        .setScrollFactor(0).setDepth(DEPTH + 4).setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => {
        if (this.activeSlot !== slot) {
          this.activeSlot = slot;
          this._rebuildAll();
        }
      });
      hitArea.on('pointerover', () => {
        if (!isActive) tabBg.setAlpha(0.8);
      });
      hitArea.on('pointerout', () => {
        tabBg.setAlpha(1);
      });
      this.elements.push(hitArea);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SLOT CONTENT — rebuilt on tab switch
  // ═══════════════════════════════════════════════════════════════════
  _buildSlotContent() {
    const s = this.scene;
    const W = s.cameras.main.width;
    const H = s.cameras.main.height;
    const slot = this.activeSlot;
    const prog = this.progression;
    const isLocked = this._isSlotLocked(slot);
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;
    const availableSpells = SLOT_SPELLS[slot] || [];

    // Main panel
    const panelX = W / 2;
    const panelY = 98;
    const panelW = W - 60;
    const panelH = H - panelY - 16;
    const panelCX = panelX;
    const panelCY = panelY + panelH / 2;

    const mainPanel = s.add.nineslice(
      panelCX, panelCY,
      'ui-panel', null,
      panelW, panelH, 7, 7, 7, 7
    ).setScrollFactor(0).setDepth(DEPTH + 1);
    this.slotElements.push(mainPanel);

    // ── LOCKED STATE ──
    if (isLocked) {
      this._buildLockedContent(panelCX, panelCY, slot);
      return;
    }

    // ── SPELL GRID (top section) ──
    const gridY = panelY + 24;
    const cellSize = 64;
    const cellGapX = 16;    // horizontal gap between cells
    const spellCount = availableSpells.length;
    const gridWidth = spellCount * cellSize + (spellCount - 1) * cellGapX;
    const gridStartX = panelCX - gridWidth / 2 + cellSize / 2;

    for (let i = 0; i < spellCount; i++) {
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const cx = gridStartX + i * (cellSize + cellGapX);
      const cy = gridY + cellSize / 2;
      const isChosen = chosenSpellId === spellId;

      // Cell background
      const cellBg = s.add.nineslice(
        cx, cy,
        'ui-inventory-cell', null,
        cellSize, cellSize, 7, 7, 7, 7
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      this.slotElements.push(cellBg);

      // Chosen highlight
      if (isChosen) {
        const focus = s.add.nineslice(
          cx, cy,
          'ui-focus', null,
          cellSize + 6, cellSize + 6, 7, 7, 7, 7
        ).setTint(0xffdd44).setScrollFactor(0).setDepth(DEPTH + 2);
        this.slotElements.push(focus);
      }

      // Spell icon
      if (def.icon && s.textures.exists(def.icon)) {
        const icon = s.add.image(cx, cy, def.icon).setScrollFactor(0).setDepth(DEPTH + 3);
        const scale = (cellSize - 16) / Math.max(icon.width, icon.height);
        icon.setScale(scale);
        this.slotElements.push(icon);
      }

      // Spell name below cell
      const nameColor = isChosen ? SLOT_COLORS[slot].hex : '#8a7a6a';
      const nameLabel = s.add.text(cx, cy + cellSize / 2 + 6, def.name, {
        fontSize: '16px', fontFamily: UI_FONT, fill: nameColor,
        fontStyle: isChosen ? 'bold' : 'normal',
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
      this.slotElements.push(nameLabel);

      // Click/hover hit area
      const hit = s.add.rectangle(cx, cy, cellSize, cellSize, 0xffffff, 0)
        .setScrollFactor(0).setDepth(DEPTH + 5);
      this.slotElements.push(hit);

      if (!isChosen) {
        const isFirstChoice = chosenSpellId === null;
        const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
        hit.setInteractive({ useHandCursor: canAfford });
        if (canAfford) {
          hit.on('pointerover', () => {
            cellBg.setTint(0xddccaa);
            this._showTooltip(cx, cy - cellSize / 2 - 8, def, spellId, isFirstChoice ? `${SP.SPELL_CHOICE_COST} İlham` : 'Bedava');
          });
          hit.on('pointerout', () => {
            cellBg.clearTint();
            this._hideTooltip();
          });
          hit.on('pointerdown', () => {
            if (s.network && s.network.connected) {
              s.network.sendShopChooseSpell(slot, spellId);
            }
          });
        }
      } else {
        hit.setInteractive({ useHandCursor: false });
        hit.on('pointerover', () => {
          this._showTooltip(cx, cy - cellSize / 2 - 8, def, spellId, null);
        });
        hit.on('pointerout', () => {
          this._hideTooltip();
        });
      }
    }

    // ── DIVIDER ──
    const dividerY = gridY + cellSize + 32;
    const divider = s.add.rectangle(panelCX, dividerY, panelW - 60, 2, 0x44382a, 0.4)
      .setScrollFactor(0).setDepth(DEPTH + 2);
    this.slotElements.push(divider);

    // ── DETAIL SECTION (below divider) ──
    if (chosenSpellId) {
      this._buildDetailSection(chosenSpellId, currentTier, slot, panelCX, dividerY + 12, panelW);
    } else {
      // No spell chosen — prompt
      const prompt = s.add.text(panelCX, dividerY + 40, `Yukarıdan bir hüner seç (${SP.SPELL_CHOICE_COST} İlham)`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
      }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5);
      this.slotElements.push(prompt);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LOCKED SLOT
  // ═══════════════════════════════════════════════════════════════════
  _buildLockedContent(cx, cy, slot) {
    const s = this.scene;
    const prog = this.progression;

    const lockIcon = s.add.text(cx, cy - 32, '🔒', {
      fontSize: '48px', fontFamily: UI_FONT,
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5);
    this.slotElements.push(lockIcon);

    const label = s.add.text(cx, cy + 16, `[${slot}] ${SLOT_NAMES[slot]} — KİLİTLİ`, {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#5a3a28', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5);
    this.slotElements.push(label);

    const costLabel = s.add.text(cx, cy + 56, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#8a7a6a',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5);
    this.slotElements.push(costLabel);

    const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
    const { elements: btnEls } = createNinesliceButton(s, cx, cy + 96, `Kilidi Aç (${SP.SLOT_UNLOCK_COST} İlham)`, {
      width: 240, height: 48, depth: DEPTH + 3, fontSize: '16px',
      enabled: canUnlock,
      onClick: () => {
        if (s.network && s.network.connected) {
          s.network.sendShopUnlockSlot(slot);
        }
      },
    });
    this.slotElements.push(...btnEls);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DETAIL SECTION — stats, tiers, upgrade
  // ═══════════════════════════════════════════════════════════════════
  _buildDetailSection(spellId, currentTier, slot, centerX, topY, panelW) {
    const s = this.scene;
    const prog = this.progression;
    const def = SPELLS[spellId];
    const tree = SKILL_TREES[spellId];
    if (!def || !tree) return;

    const maxTier = getMaxTier(spellId);
    const stats = computeSpellStats(spellId, currentTier);
    const halfW = panelW / 2 - 40;

    // Left column: chosen spell info + stats
    const leftX = centerX - halfW / 2 - 20;
    // Right column: tier progress + upgrade
    const rightX = centerX + halfW / 2 + 20;

    // ── LEFT: Spell name & description ──
    let ly = topY;

    const chosenName = s.add.text(leftX, ly, def.name, {
      fontSize: '32px', fontFamily: UI_FONT, fill: SLOT_COLORS[slot].hex, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5, 0);
    this.slotElements.push(chosenName);
    ly += 40;

    const descText = s.add.text(leftX, ly, def.description, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
      wordWrap: { width: halfW }, align: 'center',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5, 0);
    this.slotElements.push(descText);
    ly += descText.height + 16;

    // Stats — formatted as a compact block
    const statsLines = this._formatStatsBlock(stats);
    const statsPanel = s.add.nineslice(
      leftX, ly + 60,
      'ui-bg', null,
      halfW, 120, 7, 7, 7, 7
    ).setScrollFactor(0).setDepth(DEPTH + 2);
    this.slotElements.push(statsPanel);

    const statsText = s.add.text(leftX, ly + 16, statsLines, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#2a4466', lineSpacing: 6,
      align: 'center',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
    this.slotElements.push(statsText);

    // Adjust stats panel height to content
    const statsH = statsText.height + 24;
    statsPanel.setSize(halfW, statsH);
    statsPanel.setY(ly + statsH / 2);

    // ── RIGHT: Tier progress ──
    let ry = topY;

    // Tier title
    const tierTitle = s.add.text(rightX, ry, `Pâye ${currentTier}/${maxTier}`, {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5, 0);
    this.slotElements.push(tierTitle);
    ry += 42;

    // Tier dots — larger, spaced out
    const dotSize = 32;
    const dotGap = 8;
    const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;
    const dotsStartX = rightX - dotsW / 2 + dotSize / 2;

    for (let t = 0; t < maxTier; t++) {
      const filled = t < currentTier;
      const dx = dotsStartX + t * (dotSize + dotGap);
      const dy = ry + dotSize / 2;

      const dot = s.add.nineslice(
        dx, dy,
        filled ? 'ui-focus' : 'ui-inventory-cell', null,
        dotSize, dotSize, 5, 5, 5, 5
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      if (filled) dot.setTint(SLOT_COLORS[slot].tint);
      this.slotElements.push(dot);

      const num = s.add.text(dx, dy, `${t + 1}`, {
        fontSize: '16px', fontFamily: UI_FONT,
        fill: filled ? '#ffffff' : '#666666', fontStyle: 'bold',
        stroke: filled ? '#000000' : undefined,
        strokeThickness: filled ? 2 : 0,
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
      this.slotElements.push(num);
    }
    ry += dotSize + 16;

    // Completed tiers list
    for (let t = 0; t < currentTier && t < tree.tiers.length; t++) {
      const tier = tree.tiers[t];
      const checkmark = s.add.text(rightX - halfW / 2 + 10, ry, `✓ T${t + 1}: ${tier.name}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#1a7733',
      }).setScrollFactor(0).setDepth(DEPTH + 2);
      this.slotElements.push(checkmark);
      ry += 22;
    }

    // ── NEXT UPGRADE BOX ──
    const nextTier = getNextTierInfo(spellId, currentTier);
    if (nextTier) {
      ry += 8;

      // Upgrade box background
      const boxW = halfW;
      const upgradeBox = s.add.nineslice(
        rightX, ry + 50,
        'ui-panel-2', null,
        boxW, 100, 7, 7, 7, 7
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      this.slotElements.push(upgradeBox);

      const nextLabel = s.add.text(rightX, ry + 14, `Sonraki: ${nextTier.name}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#2a1a08', fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
      this.slotElements.push(nextLabel);

      const nextDesc = s.add.text(rightX, ry + 34, nextTier.description, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
        wordWrap: { width: boxW - 24 }, align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
      this.slotElements.push(nextDesc);

      // Mod preview
      const modText = Object.entries(nextTier.mods)
        .map(([k, v]) => {
          if (typeof v === 'boolean') return `${k}: ${v}`;
          return `${k}: ${v > 0 ? '+' : ''}${v}`;
        })
        .join(', ');
      const modLabel = s.add.text(rightX, ry + 56, modText, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#2a4466',
        wordWrap: { width: boxW - 24 }, align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
      this.slotElements.push(modLabel);

      // Size the upgrade box to fit content
      const boxH = modLabel.y + modLabel.height - ry + 16;
      upgradeBox.setSize(boxW, boxH);
      upgradeBox.setY(ry + boxH / 2);

      ry += boxH + 12;

      // Upgrade button
      const cost = nextTier.cost;
      const canUpgrade = prog && prog.sp >= cost;
      const { elements: btnEls } = createNinesliceButton(s, rightX, ry, `Pişir (${cost} İlham)`, {
        width: 220, height: 48, depth: DEPTH + 3, fontSize: '16px',
        enabled: canUpgrade,
        onClick: () => {
          if (s.network && s.network.connected) {
            s.network.sendShopUpgradeTier(slot);
          }
        },
      });
      this.slotElements.push(...btnEls);
    } else {
      // MAX TIER
      ry += 16;
      const maxBadge = s.add.nineslice(
        rightX, ry + 20,
        'ui-panel-interior', null,
        200, 48, 7, 7, 7, 7
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      this.slotElements.push(maxBadge);

      const maxLabel = s.add.text(rightX, ry + 20, '✦ EN ÜST PÂYE ✦', {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#ffdd44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
      this.slotElements.push(maxLabel);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TOOLTIP
  // ═══════════════════════════════════════════════════════════════════
  _showTooltip(x, y, def, spellId, costStr) {
    this._hideTooltip();
    const s = this.scene;
    const tree = SKILL_TREES[spellId];
    if (!tree) return;

    const stats = computeSpellStats(spellId, 0);
    const lines = [def.name, def.description, '', this._formatStatsInline(stats)];
    if (costStr) lines.push('', `Bedel: ${costStr}`);

    const text = lines.join('\n');

    // Tooltip text (create first to measure)
    const tipText = s.add.text(x, y, text, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#2a1a08', lineSpacing: 4,
      wordWrap: { width: 280 }, align: 'center',
    }).setScrollFactor(0).setDepth(DEPTH + 11).setOrigin(0.5, 1);

    const tipH = tipText.height + 16;
    const tipBg = s.add.nineslice(
      x, y - tipH / 2,
      'ui-panel-2', null,
      300, tipH, 7, 7, 7, 7
    ).setScrollFactor(0).setDepth(DEPTH + 10);

    // Reposition text inside panel
    tipText.setY(y - tipH + 8);
    tipText.setOrigin(0.5, 0);

    this._tooltip = [tipBg, tipText];
    this.slotElements.push(tipBg, tipText);
  }

  _hideTooltip() {
    if (this._tooltip) {
      for (const el of this._tooltip) {
        if (el && !el.destroyed) el.destroy();
      }
      this._tooltip = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STAT FORMATTING
  // ═══════════════════════════════════════════════════════════════════
  _formatStatsInline(stats) {
    if (!stats) return '';
    const parts = [];
    if (stats.damage) parts.push(`DMG: ${stats.damage}`);
    if (stats.knockbackForce) parts.push(`KB: ${(stats.knockbackForce * 1000).toFixed(0)}`);
    if (stats.cooldown) parts.push(`CD: ${(stats.cooldown / 1000).toFixed(1)}s`);
    if (stats.speed) parts.push(`Spd: ${stats.speed}`);
    if (stats.range) parts.push(`Rng: ${stats.range}`);
    if (stats.slowAmount) parts.push(`Slow: ${(stats.slowAmount * 100).toFixed(0)}%`);
    if (stats.pullForce) parts.push(`Pull: ${(stats.pullForce * 1000).toFixed(0)}`);
    if (stats.buffDuration) parts.push(`Dur: ${(stats.buffDuration / 1000).toFixed(1)}s`);
    if (stats.shieldHits) parts.push(`Hits: ${stats.shieldHits}`);
    if (stats.missileCount && stats.missileCount > 1) parts.push(`Missiles: ${stats.missileCount}`);
    if (stats.maxBounces) parts.push(`Bounces: ${stats.maxBounces}`);
    return parts.join(' | ');
  }

  _formatStatsBlock(stats) {
    if (!stats) return '';
    const lines = [];
    if (stats.damage) lines.push(`Hasar: ${stats.damage}`);
    if (stats.knockbackForce) lines.push(`İtme: ${(stats.knockbackForce * 1000).toFixed(0)}`);
    if (stats.cooldown) lines.push(`Bekleme: ${(stats.cooldown / 1000).toFixed(1)}s`);
    if (stats.speed) lines.push(`Hız: ${stats.speed}`);
    if (stats.range) lines.push(`Menzil: ${stats.range}`);
    if (stats.slowAmount) lines.push(`Yavaşlatma: ${(stats.slowAmount * 100).toFixed(0)}%`);
    if (stats.pullForce) lines.push(`Çekim: ${(stats.pullForce * 1000).toFixed(0)}`);
    if (stats.buffDuration) lines.push(`Süre: ${(stats.buffDuration / 1000).toFixed(1)}s`);
    if (stats.shieldHits) lines.push(`Darbe: ${stats.shieldHits}`);
    if (stats.missileCount && stats.missileCount > 1) lines.push(`Mermi: ${stats.missileCount}`);
    if (stats.maxBounces) lines.push(`Sekme: ${stats.maxBounces}`);
    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════
  _isSlotLocked(slot) {
    const prog = this.progression;
    if (!prog) return slot !== 'Q';
    return prog.slots[slot] === 'locked';
  }

  _pickDefaultSlot() {
    const prog = this.progression;
    if (!prog) return 'Q';
    // Prefer a slot that has a chosen spell (to show upgrade UI)
    for (const slot of SLOTS) {
      if (prog.slots[slot] !== 'locked' && prog.spells[slot] && prog.spells[slot].chosenSpell) {
        return slot;
      }
    }
    // Otherwise first unlocked slot
    for (const slot of SLOTS) {
      if (prog.slots[slot] !== 'locked') return slot;
    }
    return 'Q';
  }

  _rebuildAll() {
    // Destroy everything and rebuild (tabs change visually too)
    this.destroy();
    this.build();
  }

  _destroySlotElements() {
    this._hideTooltip();
    for (const el of this.slotElements) {
      if (el && !el.destroyed) {
        el.removeAllListeners();
        el.destroy();
      }
    }
    this.slotElements = [];
  }

  destroy() {
    this._hideTooltip();
    for (const el of [...this.elements, ...this.slotElements]) {
      if (el && !el.destroyed) {
        el.removeAllListeners();
        el.destroy();
      }
    }
    this.elements = [];
    this.slotElements = [];
    this.timerText = null;
    this.spText = null;
    this.bg = null;
  }
}
