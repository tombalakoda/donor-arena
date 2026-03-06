import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { UI_FONT } from '../config.js';
import { createNinesliceButton } from './UIHelpers.js';

/**
 * Shop Overlay v3 — "Zenith" inspired layout.
 *
 * Left:  vertical spell list (cell + nameplate rows)
 * Right: detail card (portrait frame, title bar, stat bars, tier dots, upgrade box)
 * Top:   title bar + tab row
 * Bottom: action bar (currency + upgrade button)
 *
 * Zero Phaser Graphics — every visual element is a real Humble Gift asset.
 * Sole exception: dimmer rectangle for background darkening.
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

// Stat display config — label, key, max value for bar, format function
const STAT_DEFS = [
  { label: 'Hasar',       key: 'damage',         max: 10,   fmt: v => `${v}` },
  { label: 'İtme',        key: 'knockbackForce',  max: 0.15, fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Bekleme',     key: 'cooldown',        max: 15000, fmt: v => `${(v / 1000).toFixed(1)}s`, invert: true },
  { label: 'Hız',         key: 'speed',           max: 15,   fmt: v => `${v}` },
  { label: 'Menzil',      key: 'range',           max: 600,  fmt: v => `${v}` },
  { label: 'Yavaşlatma',  key: 'slowAmount',      max: 1.0,  fmt: v => `${(v * 100).toFixed(0)}%` },
  { label: 'Çekim',       key: 'pullForce',       max: 0.10, fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Kalkan',      key: 'shieldHits',      max: 5,    fmt: v => `${v}` },
  { label: 'Mermi',       key: 'missileCount',    max: 10,   fmt: v => `${v}` },
  { label: 'Sekme',       key: 'maxBounces',      max: 10,   fmt: v => `${v}` },
  { label: 'Süre',        key: 'buffDuration',    max: 10000, fmt: v => `${(v / 1000).toFixed(1)}s` },
];

export class ShopOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.progression = null;
    this.shopTimer = 0;
    this.activeSlot = 'Q';
    this.chrome = [];      // persistent: bg, title, tabs, bottom bar
    this.content = [];     // rebuilt on tab switch
    this._tooltip = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════
  show(progression, shopDuration) {
    if (this.visible) this.destroy();
    this.visible = true;
    this.progression = progression;
    this.shopTimer = shopDuration || 20;
    this.activeSlot = this._pickDefaultSlot();
    this._build();
  }

  hide() {
    this.visible = false;
    this.destroy();
  }

  updateProgression(progression) {
    this.progression = progression;
    if (this.visible) {
      this._destroyContent();
      this._buildContent();
      this._updateBottomBar();
    }
  }

  updateTimer(remaining) {
    this.shopTimer = remaining;
    if (this._timerText && !this._timerText.destroyed) {
      this._timerText.setText(`${Math.ceil(remaining)}s`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BUILD — full overlay
  // ═══════════════════════════════════════════════════════════════════
  _build() {
    const s = this.scene;
    const W = s.cameras.main.width;
    const H = s.cameras.main.height;

    // Store layout metrics for content builders
    this._W = W;
    this._H = H;
    this._margin = 20;
    this._bodyTop = 112;   // below tab row
    this._bodyBot = 660;   // above bottom bar
    this._bodyCY = (this._bodyTop + this._bodyBot) / 2;
    this._bodyH = this._bodyBot - this._bodyTop;

    // Left/right panel split
    this._leftW = Math.min(340, Math.round(W * 0.28));
    this._leftCX = this._margin + this._leftW / 2;
    this._rightCX = this._leftCX + this._leftW / 2 + (W - 2 * this._margin - this._leftW) / 2;
    this._rightW = W - 2 * this._margin - this._leftW - 10; // 10px gap between panels

    // ── Dimmer ──
    const dimmer = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.chrome.push(dimmer);

    // ── Title Bar ──
    this._buildTitleBar(W);

    // ── Tab Row ──
    this._buildTabRow(W);

    // ── Main Body Panel (outer) ──
    const bodyW = W - 2 * this._margin;
    const body = s.add.nineslice(W / 2, this._bodyCY, 'ui-panel', null, bodyW, this._bodyH, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.chrome.push(body);

    // ── Bottom Bar ──
    this._buildBottomBar(W);

    // ── Slot Content ──
    this._buildContent();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TITLE BAR
  // ═══════════════════════════════════════════════════════════════════
  _buildTitleBar(W) {
    const s = this.scene;

    const bar = s.add.nineslice(W / 2, 44, 'ui-title-bar', null, W - 40, 48, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.chrome.push(bar);

    const title = s.add.text(W / 2, 44, 'HÜNER DÜKKÂNI', {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#ffdd44', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5);
    this.chrome.push(title);

    const sp = this.progression ? this.progression.sp : 0;
    this._spTextTitle = s.add.text(60, 44, `İlham: ${sp}`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#44ddff', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0, 0.5);
    this.chrome.push(this._spTextTitle);

    this._timerText = s.add.text(W - 60, 44, `${Math.ceil(this.shopTimer)}s`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#aaaaaa',
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(1, 0.5);
    this.chrome.push(this._timerText);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TAB ROW
  // ═══════════════════════════════════════════════════════════════════
  _buildTabRow(W) {
    const s = this.scene;

    // Tab bar background
    const tabBar = s.add.nineslice(W / 2, 90, 'ui-panel-interior', null, W - 40, 36, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.chrome.push(tabBar);

    const tabW = 160, tabH = 32, tabGap = 8;
    const totalW = SLOTS.length * tabW + (SLOTS.length - 1) * tabGap;
    const startX = (W - totalW) / 2;

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = startX + i * (tabW + tabGap) + tabW / 2;
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);

      const tabBg = s.add.nineslice(
        cx, 90, isActive ? 'ui-tab' : 'ui-tab-unselected', null,
        tabW, tabH, 8, 8, 4, 4
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      if (isLocked) tabBg.setTint(0x777777);
      else if (isActive) tabBg.setTint(SLOT_COLORS[slot].tint);
      this.chrome.push(tabBg);

      const lockPrefix = isLocked ? '🔒 ' : '';
      const label = s.add.text(cx, 90, `${lockPrefix}[${slot}] ${SLOT_NAMES[slot]}`, {
        fontSize: '16px', fontFamily: UI_FONT,
        fill: isActive ? '#ffffff' : (isLocked ? '#666666' : '#cccccc'),
        fontStyle: 'bold',
        stroke: isActive ? '#000000' : undefined,
        strokeThickness: isActive ? 2 : 0,
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
      this.chrome.push(label);

      const hit = s.add.nineslice(cx, 90, 'ui-tab-unselected', null, tabW, tabH, 8, 8, 4, 4)
        .setScrollFactor(0).setDepth(DEPTH + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (this.activeSlot !== slot) {
          this.activeSlot = slot;
          this._rebuildAll();
        }
      });
      this.chrome.push(hit);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BOTTOM BAR
  // ═══════════════════════════════════════════════════════════════════
  _buildBottomBar(W) {
    const s = this.scene;
    const barY = this._bodyBot + 30;

    const bar = s.add.nineslice(W / 2, barY, 'ui-scroll', null, W - 2 * this._margin, 48, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.chrome.push(bar);

    const sp = this.progression ? this.progression.sp : 0;
    this._spTextBottom = s.add.text(this._margin + 100, barY, `İlham: ${sp}`, {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#44ddff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(DEPTH + 2).setOrigin(0.5);
    this.chrome.push(this._spTextBottom);
  }

  _updateBottomBar() {
    const sp = this.progression ? this.progression.sp : 0;
    if (this._spTextTitle && !this._spTextTitle.destroyed) this._spTextTitle.setText(`İlham: ${sp}`);
    if (this._spTextBottom && !this._spTextBottom.destroyed) this._spTextBottom.setText(`İlham: ${sp}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CONTENT — rebuilt on tab switch
  // ═══════════════════════════════════════════════════════════════════
  _buildContent() {
    const slot = this.activeSlot;
    const isLocked = this._isSlotLocked(slot);

    if (isLocked) {
      this._buildLockedContent();
      return;
    }

    this._buildLeftSpellList();
    this._buildRightDetailCard();
    this._buildActionButton();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LEFT SPELL LIST
  // ═══════════════════════════════════════════════════════════════════
  _buildLeftSpellList() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const availableSpells = SLOT_SPELLS[slot] || [];

    const LCX = this._leftCX;
    const LW = this._leftW;
    const panelTop = this._bodyTop + 8;
    const panelBot = this._bodyBot - 8;
    const panelH = panelBot - panelTop;
    const panelCY = (panelTop + panelBot) / 2;

    // Left panel background
    const leftPanel = s.add.nineslice(LCX, panelCY, 'ui-panel-2', null, LW, panelH, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 2);
    this.content.push(leftPanel);

    // Section header — inside panel, near top
    const headerY = panelTop + 22;
    const headerBg = s.add.nineslice(LCX, headerY, 'ui-nameplate', null, LW - 40, 32, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(headerBg);

    const headerText = s.add.text(LCX, headerY, `${SLOT_NAMES[slot]} Hünerleri`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(headerText);

    // Spell rows — below header, centered vertically in remaining space
    const listTop = headerY + 28;
    const listBot = panelBot - 10;
    const listH = listBot - listTop;
    const spellCount = availableSpells.length;
    const rowH = Math.min(66, Math.floor(listH / Math.max(spellCount, 1)));
    const totalListH = spellCount * rowH;
    const listStartY = listTop + (listH - totalListH) / 2 + rowH / 2;

    const cellX = LCX - LW / 2 + 44;       // icon cell position
    const nameX = LCX + 20;                  // nameplate center
    const nameW = LW - 100;                  // nameplate width

    for (let i = 0; i < spellCount; i++) {
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const rowY = listStartY + i * rowH;
      const isChosen = chosenSpellId === spellId;
      const isFirstChoice = chosenSpellId === null;
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;

      // Cell background
      const cellBg = s.add.nineslice(cellX, rowY, 'ui-inventory-cell', null, 56, 56, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(cellBg);

      // Chosen highlight
      if (isChosen) {
        const focus = s.add.nineslice(cellX, rowY, 'ui-focus', null, 62, 62, 7, 7, 7, 7)
          .setTint(0xffdd44).setScrollFactor(0).setDepth(DEPTH + 3);
        this.content.push(focus);
      }

      // Spell icon
      if (def.icon && s.textures.exists(def.icon)) {
        const icon = s.add.image(cellX, rowY, def.icon).setScrollFactor(0).setDepth(DEPTH + 4);
        const scale = 40 / Math.max(icon.width, icon.height);
        icon.setScale(scale);
        this.content.push(icon);
      }

      // Spell name (nameplate)
      const nameBg = s.add.nineslice(nameX, rowY, 'ui-nameplate', null, nameW, 28, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      if (isChosen) nameBg.setTint(SLOT_COLORS[slot].tint);
      this.content.push(nameBg);

      const nameColor = isChosen ? '#ffffff' : '#3a2218';
      const nameText = s.add.text(nameX, rowY, def.name, {
        fontSize: '16px', fontFamily: UI_FONT, fill: nameColor,
        fontStyle: isChosen ? 'bold' : 'normal',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
      this.content.push(nameText);

      // Hit area for the whole row
      const hit = s.add.nineslice(LCX, rowY, 'ui-inventory-cell', null, LW - 10, rowH - 4, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 5).setAlpha(0.001)
        .setInteractive({ useHandCursor: !isChosen && canAfford });
      this.content.push(hit);

      const tooltipX = LCX + LW / 2 + 10;
      if (!isChosen && canAfford) {
        hit.on('pointerover', () => {
          cellBg.setTint(0xddccaa);
          nameBg.setTint(0xddccaa);
          this._showTooltip(tooltipX, rowY, def, spellId, isFirstChoice);
        });
        hit.on('pointerout', () => {
          cellBg.clearTint();
          nameBg.clearTint();
          this._hideTooltip();
        });
        hit.on('pointerdown', () => {
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, spellId);
          }
        });
      } else if (isChosen) {
        hit.on('pointerover', () => {
          this._showTooltip(tooltipX, rowY, def, spellId, false);
        });
        hit.on('pointerout', () => {
          this._hideTooltip();
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RIGHT DETAIL CARD
  // ═══════════════════════════════════════════════════════════════════
  _buildRightDetailCard() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;

    const RCX = this._rightCX;
    const RW = this._rightW;
    const panelTop = this._bodyTop + 8;
    const panelBot = this._bodyBot - 8;
    const panelH = panelBot - panelTop;
    const panelCY = (panelTop + panelBot) / 2;
    const RL = RCX - RW / 2;  // right panel left edge
    const RR = RCX + RW / 2;  // right panel right edge

    // Right panel background
    const rightPanel = s.add.nineslice(RCX, panelCY, 'ui-panel', null, RW, panelH, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 2);
    this.content.push(rightPanel);

    if (!chosenSpellId) {
      const prompt = s.add.text(RCX, panelCY, `Soldan bir hüner seç\n(${SP.SPELL_CHOICE_COST} İlham)`, {
        fontSize: '32px', fontFamily: UI_FONT, fill: '#5a3a28', align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
      this.content.push(prompt);
      return;
    }

    const def = SPELLS[chosenSpellId];
    const tree = SKILL_TREES[chosenSpellId];
    if (!def || !tree) return;

    const stats = computeSpellStats(chosenSpellId, currentTier);
    const maxTier = getMaxTier(chosenSpellId);

    // ── Top: Spell Identity ──
    const frameX = RL + 60;
    const frameY = panelTop + 60;

    const frameBg = s.add.nineslice(frameX, frameY, 'ui-inventory-cell', null, 80, 80, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(frameBg);

    if (def.icon && s.textures.exists(def.icon)) {
      const bigIcon = s.add.image(frameX, frameY, def.icon)
        .setScrollFactor(0).setDepth(DEPTH + 4);
      const iconScale = 56 / Math.max(bigIcon.width, bigIcon.height);
      bigIcon.setScale(iconScale);
      this.content.push(bigIcon);
    }

    // Spell name title bar — to the right of the icon
    const nameCX = frameX + 50 + (RR - frameX - 50) / 2;
    const nameTitleW = Math.min(RR - frameX - 70, 400);
    const nameBar = s.add.nineslice(nameCX, frameY - 15, 'ui-title-bar', null, nameTitleW, 44, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(nameBar);

    const nameText = s.add.text(nameCX, frameY - 15, def.name, {
      fontSize: '32px', fontFamily: UI_FONT, fill: SLOT_COLORS[slot].hex, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(nameText);

    // Description
    const desc = s.add.text(nameCX, frameY + 10, def.description, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
      wordWrap: { width: nameTitleW - 20 }, align: 'center',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
    this.content.push(desc);

    // ── Middle: Stat Bars ──
    const statsStartY = frameY + 60;
    const statsHeaderBg = s.add.nineslice(RCX, statsStartY, 'ui-nameplate', null, Math.min(320, RW - 60), 28, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(statsHeaderBg);

    const statsHeader = s.add.text(RCX, statsStartY, 'Değerler', {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(statsHeader);

    let statY = statsStartY + 28;
    const visibleStats = STAT_DEFS.filter(sd => stats[sd.key] != null && stats[sd.key] !== 0);

    for (const sd of visibleStats) {
      statY += 32;
      this._buildStatBar(sd, stats[sd.key], statY, slot);
    }

    // ── Tier Progress ──
    const tierY = statY + 44;
    const tierLeftX = RL + 30;
    const tierCX = tierLeftX + 100;

    // Tier header
    const tierHeaderBg = s.add.nineslice(tierCX, tierY, 'ui-nameplate', null, 160, 28, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(tierHeaderBg);

    const tierHeader = s.add.text(tierCX, tierY, `Pâye ${currentTier}/${maxTier}`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(tierHeader);

    // Tier dots
    const dotSize = 28;
    const dotGap = 6;
    const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;
    const dotsStartX = tierCX - dotsW / 2 + dotSize / 2;

    for (let t = 0; t < maxTier; t++) {
      const filled = t < currentTier;
      const dx = dotsStartX + t * (dotSize + dotGap);
      const dy = tierY + 34;

      const dot = s.add.nineslice(
        dx, dy, filled ? 'ui-focus' : 'ui-inventory-cell', null,
        dotSize, dotSize, 5, 5, 5, 5
      ).setScrollFactor(0).setDepth(DEPTH + 3);
      if (filled) dot.setTint(SLOT_COLORS[slot].tint);
      this.content.push(dot);

      const num = s.add.text(dx, dy, `${t + 1}`, {
        fontSize: '16px', fontFamily: UI_FONT,
        fill: filled ? '#ffffff' : '#666666', fontStyle: 'bold',
        stroke: filled ? '#000000' : undefined,
        strokeThickness: filled ? 2 : 0,
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
      this.content.push(num);
    }

    // Completed tier list
    let completedY = tierY + 58;
    for (let t = 0; t < currentTier && t < tree.tiers.length; t++) {
      const tier = tree.tiers[t];
      const check = s.add.text(tierLeftX, completedY, `✓ T${t + 1}: ${tier.name}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#1a7733',
      }).setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(check);
      completedY += 22;
    }

    // ── Upgrade Box ──
    const nextTier = getNextTierInfo(chosenSpellId, currentTier);
    const upgradeX = RCX + RW / 4 + 20;
    const upgBoxW = Math.min(340, RW / 2 - 20);

    if (nextTier) {
      const upgradeY = tierY;

      const upgBox = s.add.nineslice(upgradeX, upgradeY + 20, 'ui-panel-2', null, upgBoxW, 96, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(upgBox);

      const upgTitle = s.add.text(upgradeX, upgradeY - 2, `Sonraki: ${nextTier.name}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#2a1a08', fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5, 0);
      this.content.push(upgTitle);

      const upgDesc = s.add.text(upgradeX, upgradeY + 18, nextTier.description, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
        wordWrap: { width: upgBoxW - 30 }, align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5, 0);
      this.content.push(upgDesc);

      const modText = Object.entries(nextTier.mods)
        .map(([k, v]) => typeof v === 'boolean' ? `${k}: ${v}` : `${k}: ${v > 0 ? '+' : ''}${v}`)
        .join(', ');
      const upgMods = s.add.text(upgradeX, upgradeY + 38, modText, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#2a4466',
        wordWrap: { width: upgBoxW - 30 }, align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5, 0);
      this.content.push(upgMods);

      const boxBottom = upgMods.y + upgMods.height + 8;
      const boxH = boxBottom - (upgradeY - 10);
      upgBox.setSize(upgBoxW, boxH);
      upgBox.setY(upgradeY - 10 + boxH / 2);

    } else {
      const maxBadge = s.add.nineslice(upgradeX, tierY + 20, 'ui-panel-interior', null, 240, 48, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(maxBadge);

      const maxLabel = s.add.text(upgradeX, tierY + 20, '✦ EN ÜST PÂYE ✦', {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#ffdd44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
      this.content.push(maxLabel);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STAT BAR
  // ═══════════════════════════════════════════════════════════════════
  _buildStatBar(statDef, value, y, slot) {
    const s = this.scene;
    const RCX = this._rightCX;
    const RW = this._rightW;
    const RL = RCX - RW / 2;
    const RR = RCX + RW / 2;

    const labelX = RL + 20;
    const labelW = 100;
    const barL = labelX + labelW + 8;
    const barR = RR - 60;
    const barW = barR - barL;
    const barCX = barL + barW / 2;
    const barH = 22;
    const fillMaxW = barW - 20;

    // Label
    const label = s.add.text(labelX, y, `${statDef.label}:`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0, 0.5);
    this.content.push(label);

    // Bar container
    const container = s.add.nineslice(barCX, y, 'ui-panel-interior', null, barW, barH, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(container);

    // Bar fill
    let ratio = statDef.invert
      ? 1 - (value / statDef.max)
      : value / statDef.max;
    ratio = Math.max(0, Math.min(1, ratio));
    const fillW = Math.max(4, ratio * fillMaxW);
    const fillLeftEdge = barCX - barW / 2 + 10;

    const fill = s.add.nineslice(
      fillLeftEdge + fillW / 2, y,
      'ui-slider-progress', null,
      fillW, 10, 2, 2, 1, 1
    ).setScrollFactor(0).setDepth(DEPTH + 4).setTint(SLOT_COLORS[slot].tint);
    this.content.push(fill);

    // Value text
    const displayVal = statDef.fmt(value);
    const valText = s.add.text(barR + 6, y, displayVal, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#2a4466',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0, 0.5);
    this.content.push(valText);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ACTION BUTTON (in bottom bar)
  // ═══════════════════════════════════════════════════════════════════
  _buildActionButton() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;

    if (!chosenSpellId) return;

    const nextTier = getNextTierInfo(chosenSpellId, spellState.tier);
    if (!nextTier) return; // max tier, no button needed

    const cost = nextTier.cost;
    const canUpgrade = prog && prog.sp >= cost;

    const barY = this._bodyBot + 30;
    const btnX = this._W - this._margin - 140;
    const { elements: btnEls } = createNinesliceButton(s, btnX, barY, `Pişir (${cost} İlham)`, {
      width: 240, height: 40, depth: DEPTH + 3, fontSize: '16px',
      enabled: canUpgrade,
      onClick: () => {
        if (s.network && s.network.connected) {
          s.network.sendShopUpgradeTier(slot);
        }
      },
    });
    this.content.push(...btnEls);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LOCKED SLOT
  // ═══════════════════════════════════════════════════════════════════
  _buildLockedContent() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;

    // Use relative layout metrics
    const cx = this._W / 2;
    const cy = this._bodyCY;

    const lockIcon = s.add.text(cx, cy - 46, '🔒', { fontSize: '48px' })
      .setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
    this.content.push(lockIcon);

    const label = s.add.text(cx, cy + 14, `[${slot}] ${SLOT_NAMES[slot]} — KİLİTLİ`, {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#5a3a28', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
    this.content.push(label);

    const costLabel = s.add.text(cx, cy + 54, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#8a7a6a',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
    this.content.push(costLabel);

    // Unlock button in bottom bar
    const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
    const barY = this._bodyBot + 30;
    const btnX = this._W - this._margin - 140;
    const { elements: btnEls } = createNinesliceButton(s, btnX, barY, `Kilidi Aç (${SP.SLOT_UNLOCK_COST} İlham)`, {
      width: 260, height: 40, depth: DEPTH + 3, fontSize: '16px',
      enabled: canUnlock,
      onClick: () => {
        if (s.network && s.network.connected) {
          s.network.sendShopUnlockSlot(slot);
        }
      },
    });
    this.content.push(...btnEls);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TOOLTIP
  // ═══════════════════════════════════════════════════════════════════
  _showTooltip(x, y, def, spellId, isFirstChoice) {
    this._hideTooltip();
    const s = this.scene;
    const stats = computeSpellStats(spellId, 0);

    const lines = [def.name];
    if (def.description) lines.push(def.description);
    lines.push('');

    // Inline stats
    const statParts = [];
    if (stats.damage) statParts.push(`DMG:${stats.damage}`);
    if (stats.knockbackForce) statParts.push(`KB:${(stats.knockbackForce * 1000).toFixed(0)}`);
    if (stats.cooldown) statParts.push(`CD:${(stats.cooldown / 1000).toFixed(1)}s`);
    if (stats.speed) statParts.push(`Spd:${stats.speed}`);
    if (stats.range) statParts.push(`Rng:${stats.range}`);
    if (statParts.length) lines.push(statParts.join(' | '));

    if (isFirstChoice) lines.push('', `Bedel: ${SP.SPELL_CHOICE_COST} İlham`);
    else lines.push('', 'Bedel: Bedava');

    const text = lines.join('\n');

    const tipText = s.add.text(x, y, text, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#2a1a08', lineSpacing: 4,
      wordWrap: { width: 260 }, align: 'center',
    }).setScrollFactor(0).setDepth(DEPTH + 11).setOrigin(0, 0.5);

    const tipH = tipText.height + 16;
    const tipW = 280;
    const tipBg = s.add.nineslice(
      x + tipW / 2, y, 'ui-panel-2', null, tipW, tipH, 7, 7, 7, 7
    ).setScrollFactor(0).setDepth(DEPTH + 10);

    tipText.setX(x + 10);

    this._tooltip = [tipBg, tipText];
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
    for (const slot of SLOTS) {
      if (prog.slots[slot] !== 'locked' && prog.spells[slot] && prog.spells[slot].chosenSpell) {
        return slot;
      }
    }
    for (const slot of SLOTS) {
      if (prog.slots[slot] !== 'locked') return slot;
    }
    return 'Q';
  }

  _rebuildAll() {
    this.destroy();
    this._build();
  }

  _destroyContent() {
    this._hideTooltip();
    for (const el of this.content) {
      if (el && !el.destroyed) {
        el.removeAllListeners();
        el.destroy();
      }
    }
    this.content = [];
  }

  destroy() {
    this._hideTooltip();
    for (const el of [...this.chrome, ...this.content]) {
      if (el && !el.destroyed) {
        el.removeAllListeners();
        el.destroy();
      }
    }
    this.chrome = [];
    this.content = [];
    this._timerText = null;
    this._spTextTitle = null;
    this._spTextBottom = null;
  }
}
