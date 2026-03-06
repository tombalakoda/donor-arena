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

    // ── Dimmer ──
    const dimmer = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.chrome.push(dimmer);

    // ── Title Bar ──
    this._buildTitleBar(W);

    // ── Tab Row ──
    this._buildTabRow(W);

    // ── Main Body Panel (outer) ──
    const bodyW = W - 40;
    const bodyH = 548;
    const bodyCY = 386;
    const body = s.add.nineslice(W / 2, bodyCY, 'ui-panel', null, bodyW, bodyH, 7, 7, 7, 7)
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

    const bar = s.add.nineslice(W / 2, 688, 'ui-scroll', null, W - 40, 48, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.chrome.push(bar);

    const sp = this.progression ? this.progression.sp : 0;
    this._spTextBottom = s.add.text(120, 688, `İlham: ${sp}`, {
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

    // Left panel background
    const leftPanel = s.add.nineslice(200, 386, 'ui-panel-2', null, 320, 520, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 2);
    this.content.push(leftPanel);

    // Section header
    const headerBg = s.add.nineslice(200, 134, 'ui-nameplate', null, 280, 32, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(headerBg);

    const headerText = s.add.text(200, 134, `${SLOT_NAMES[slot]} Hünerleri`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(headerText);

    // Spell rows
    const spellCount = availableSpells.length;
    // Center the rows vertically within the panel
    const rowH = 66;
    const totalListH = spellCount * rowH;
    const listStartY = 386 - totalListH / 2 + rowH / 2 + 16; // +16 to account for header

    for (let i = 0; i < spellCount; i++) {
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const rowY = listStartY + i * rowH;
      const isChosen = chosenSpellId === spellId;
      const isFirstChoice = chosenSpellId === null;
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;

      // Cell background
      const cellBg = s.add.nineslice(100, rowY, 'ui-inventory-cell', null, 56, 56, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(cellBg);

      // Chosen highlight
      if (isChosen) {
        const focus = s.add.nineslice(100, rowY, 'ui-focus', null, 62, 62, 7, 7, 7, 7)
          .setTint(0xffdd44).setScrollFactor(0).setDepth(DEPTH + 3);
        this.content.push(focus);
      }

      // Spell icon
      if (def.icon && s.textures.exists(def.icon)) {
        const icon = s.add.image(100, rowY, def.icon).setScrollFactor(0).setDepth(DEPTH + 4);
        const scale = 40 / Math.max(icon.width, icon.height);
        icon.setScale(scale);
        this.content.push(icon);
      }

      // Spell name (nameplate)
      const nameBg = s.add.nineslice(248, rowY, 'ui-nameplate', null, 180, 28, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      if (isChosen) nameBg.setTint(SLOT_COLORS[slot].tint);
      this.content.push(nameBg);

      const nameColor = isChosen ? '#ffffff' : '#3a2218';
      const nameText = s.add.text(248, rowY, def.name, {
        fontSize: '16px', fontFamily: UI_FONT, fill: nameColor,
        fontStyle: isChosen ? 'bold' : 'normal',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
      this.content.push(nameText);

      // Hit area for the whole row
      const hit = s.add.nineslice(200, rowY, 'ui-inventory-cell', null, 310, rowH - 4, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 5).setAlpha(0.001)
        .setInteractive({ useHandCursor: !isChosen && canAfford });
      this.content.push(hit);

      if (!isChosen && canAfford) {
        hit.on('pointerover', () => {
          cellBg.setTint(0xddccaa);
          nameBg.setTint(0xddccaa);
          this._showTooltip(350, rowY, def, spellId, isFirstChoice);
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
          this._showTooltip(350, rowY, def, spellId, false);
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

    // Right panel background
    const rightPanel = s.add.nineslice(740, 386, 'ui-panel', null, 860, 520, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 2);
    this.content.push(rightPanel);

    if (!chosenSpellId) {
      // No spell chosen — prompt
      const prompt = s.add.text(740, 386, `Soldan bir hüner seç\n(${SP.SPELL_CHOICE_COST} İlham)`, {
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
    // Large inventory cell as icon frame (portrait_frame.png is a character portrait, not a frame)
    const frameX = 500;
    const frameY = 170;

    const frameBg = s.add.nineslice(frameX, frameY, 'ui-inventory-cell', null, 80, 80, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(frameBg);

    // Spell icon inside the cell
    if (def.icon && s.textures.exists(def.icon)) {
      const bigIcon = s.add.image(frameX, frameY, def.icon)
        .setScrollFactor(0).setDepth(DEPTH + 4);
      const iconScale = 56 / Math.max(bigIcon.width, bigIcon.height);
      bigIcon.setScale(iconScale);
      this.content.push(bigIcon);
    }

    // Spell name title bar
    const nameCX = 800;
    const nameBar = s.add.nineslice(nameCX, 155, 'ui-title-bar', null, 400, 44, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(nameBar);

    const nameText = s.add.text(nameCX, 155, def.name, {
      fontSize: '32px', fontFamily: UI_FONT, fill: SLOT_COLORS[slot].hex, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(nameText);

    // Description
    const desc = s.add.text(nameCX, 190, def.description, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
      wordWrap: { width: 400 }, align: 'center',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5, 0);
    this.content.push(desc);

    // ── Middle: Stat Bars ──
    const statsStartY = 240;
    const statsHeaderBg = s.add.nineslice(740, statsStartY, 'ui-nameplate', null, 320, 28, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(statsHeaderBg);

    const statsHeader = s.add.text(740, statsStartY, 'Değerler', {
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

    // Tier header
    const tierHeaderBg = s.add.nineslice(580, tierY, 'ui-nameplate', null, 160, 28, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(tierHeaderBg);

    const tierHeader = s.add.text(580, tierY, `Pâye ${currentTier}/${maxTier}`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5);
    this.content.push(tierHeader);

    // Tier dots
    const dotSize = 28;
    const dotGap = 6;
    const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;
    const dotsStartX = 580 - dotsW / 2 + dotSize / 2;

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
      const check = s.add.text(500, completedY, `✓ T${t + 1}: ${tier.name}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#1a7733',
      }).setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(check);
      completedY += 22;
    }

    // ── Upgrade Box ──
    const nextTier = getNextTierInfo(chosenSpellId, currentTier);
    if (nextTier) {
      const upgradeX = 900;
      const upgradeY = tierY;

      // Upgrade box
      const upgBox = s.add.nineslice(upgradeX, upgradeY + 20, 'ui-panel-2', null, 340, 96, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(upgBox);

      const upgTitle = s.add.text(upgradeX, upgradeY - 2, `Sonraki: ${nextTier.name}`, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#2a1a08', fontStyle: 'bold',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5, 0);
      this.content.push(upgTitle);

      const upgDesc = s.add.text(upgradeX, upgradeY + 18, nextTier.description, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#5a3a28',
        wordWrap: { width: 300 }, align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5, 0);
      this.content.push(upgDesc);

      // Mod preview
      const modText = Object.entries(nextTier.mods)
        .map(([k, v]) => typeof v === 'boolean' ? `${k}: ${v}` : `${k}: ${v > 0 ? '+' : ''}${v}`)
        .join(', ');
      const upgMods = s.add.text(upgradeX, upgradeY + 38, modText, {
        fontSize: '16px', fontFamily: UI_FONT, fill: '#2a4466',
        wordWrap: { width: 300 }, align: 'center',
      }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0.5, 0);
      this.content.push(upgMods);

      // Resize box to fit content
      const boxBottom = upgMods.y + upgMods.height + 8;
      const boxH = boxBottom - (upgradeY - 10);
      upgBox.setSize(340, boxH);
      upgBox.setY(upgradeY - 10 + boxH / 2);

    } else {
      // MAX TIER badge
      const maxBadge = s.add.nineslice(900, tierY + 20, 'ui-panel-interior', null, 240, 48, 7, 7, 7, 7)
        .setScrollFactor(0).setDepth(DEPTH + 3);
      this.content.push(maxBadge);

      const maxLabel = s.add.text(900, tierY + 20, '✦ EN ÜST PÂYE ✦', {
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
    const barCX = 780;
    const barW = 280;
    const barH = 22;
    const fillMaxW = barW - 20; // padding inside container

    // Label
    const label = s.add.text(560, y, `${statDef.label}:`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#3a2218',
    }).setScrollFactor(0).setDepth(DEPTH + 4).setOrigin(0, 0.5);
    this.content.push(label);

    // Bar container
    const container = s.add.nineslice(barCX, y, 'ui-panel-interior', null, barW, barH, 7, 7, 7, 7)
      .setScrollFactor(0).setDepth(DEPTH + 3);
    this.content.push(container);

    // Bar fill
    let ratio = statDef.invert
      ? 1 - (value / statDef.max)  // lower cooldown = more fill
      : value / statDef.max;
    ratio = Math.max(0, Math.min(1, ratio));
    const fillW = Math.max(4, ratio * fillMaxW);
    const fillLeftEdge = barCX - barW / 2 + 10; // 10px padding from container left

    const fill = s.add.nineslice(
      fillLeftEdge + fillW / 2, y,
      'ui-slider-progress', null,
      fillW, 10, 2, 2, 1, 1
    ).setScrollFactor(0).setDepth(DEPTH + 4).setTint(SLOT_COLORS[slot].tint);
    this.content.push(fill);

    // Value text
    const displayVal = statDef.fmt(value);
    const valText = s.add.text(barCX + barW / 2 + 8, y, displayVal, {
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

    const { elements: btnEls } = createNinesliceButton(s, 1040, 688, `Pişir (${cost} İlham)`, {
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
    const W = s.cameras.main.width;

    const lockIcon = s.add.text(W / 2, 340, '🔒', { fontSize: '48px' })
      .setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
    this.content.push(lockIcon);

    const label = s.add.text(W / 2, 400, `[${slot}] ${SLOT_NAMES[slot]} — KİLİTLİ`, {
      fontSize: '32px', fontFamily: UI_FONT, fill: '#5a3a28', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
    this.content.push(label);

    const costLabel = s.add.text(W / 2, 440, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, {
      fontSize: '16px', fontFamily: UI_FONT, fill: '#8a7a6a',
    }).setScrollFactor(0).setDepth(DEPTH + 3).setOrigin(0.5);
    this.content.push(costLabel);

    // Unlock button in bottom bar
    const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
    const { elements: btnEls } = createNinesliceButton(s, 1040, 688, `Kilidi Aç (${SP.SLOT_UNLOCK_COST} İlham)`, {
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
