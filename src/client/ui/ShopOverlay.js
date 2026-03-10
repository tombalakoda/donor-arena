/**
 * ShopOverlay.js — Spell shop overlay (redesigned).
 *
 * Layout: 80% viewport panel, compact tabs, left spell list + right detail,
 * bottom action bar. All visuals use Ninja Adventure nineslice/sprite assets.
 */

import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SLOT_COLOR, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createPanel, createDimmer, createSeparator, createText } from './UIHelpers.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const SLOTS = ['Q', 'W', 'E', 'R'];
const SLOT_NAMES = { Q: 'SÖZ', W: 'EL', E: 'DİL', R: 'BEL' };

// Panel geometry — ~80% of viewport
const PW = 1020;
const PH = 540;
const PL = SCREEN.CX - PW / 2;
const PR = SCREEN.CX + PW / 2;
const PT = SCREEN.CY - PH / 2;
const PB = SCREEN.CY + PH / 2;
const PAD = SPACE.MD;

// Internal layout zones
const TITLE_Y  = PT + 24;
const TAB_Y    = PT + 56;
const BODY_TOP = PT + 74;
const BODY_BOT = PB - 42;
const BOT_Y    = PB - 20;

// Left/right column split
const LEFT_W  = 250;
const LEFT_L  = PL + PAD;
const LEFT_R  = LEFT_L + LEFT_W;
const LEFT_CX = LEFT_L + LEFT_W / 2;
const RIGHT_L  = LEFT_R + SPACE.SM;
const RIGHT_R  = PR - PAD;
const RIGHT_W  = RIGHT_R - RIGHT_L;
const RIGHT_CX = RIGHT_L + RIGHT_W / 2;

// Stat display definitions
const STAT_DEFS = [
  { label: 'Hasar',      key: 'damage',        max: 10,    fmt: v => `${v}` },
  { label: 'İtme',       key: 'knockbackForce', max: 0.15,  fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Bekleme',    key: 'cooldown',       max: 15000, fmt: v => `${(v / 1000).toFixed(1)}s`, invert: true },
  { label: 'Hız',        key: 'speed',          max: 15,    fmt: v => `${v}` },
  { label: 'Menzil',     key: 'range',          max: 600,   fmt: v => `${v}` },
  { label: 'Yavaşlatma', key: 'slowAmount',     max: 1.0,   fmt: v => `${(v * 100).toFixed(0)}%` },
  { label: 'Çekim',      key: 'pullForce',      max: 0.10,  fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Kalkan',     key: 'shieldHits',     max: 5,     fmt: v => `${v}` },
  { label: 'Mermi',      key: 'missileCount',   max: 10,    fmt: v => `${v}` },
  { label: 'Sekme',      key: 'maxBounces',     max: 10,    fmt: v => `${v}` },
  { label: 'Süre',       key: 'buffDuration',   max: 10000, fmt: v => `${(v / 1000).toFixed(1)}s` },
];

// Tier mod labels (Turkish)
const MOD_LABELS = {
  damage: 'hasar', knockbackForce: 'itme', cooldown: 'bekleme',
  speed: 'hız', range: 'menzil', radius: 'alan',
  buffDuration: 'süre', lifetime: 'ömür', piercing: 'delici',
  explosionRadius: 'patlama', stunDuration: 'sersemletme',
  slowAmount: 'yavaşlatma', slowDuration: 'yavaşlatma süresi',
  rootDuration: 'köklenme', wallHp: 'duvar canı', wallDuration: 'duvar süresi',
  maxBounces: 'sekme', shieldHits: 'kalkan', dashDamage: 'çarpma hasarı',
  dashKnockback: 'çarpma itmesi', dashWidth: 'çarpma genişliği',
  speedBoost: 'hız artışı', recallDuration: 'geri dönüş süresi',
  missileCount: 'söz sayısı', turnRate: 'dönüş hızı',
  trackingRange: 'takip menzili', pullSpeed: 'çekim hızı',
  throwForce: 'fırlatma gücü', chainCount: 'zincirleme',
  overshootRange: 'aşım menzili', maxKnockbackForce: 'maks itme',
  zoneDuration: 'alan süresi', zoneRadius: 'alan genişliği',
  zoneDamage: 'alan hasarı', impactDelay: 'çarpma gecikmesi',
  impactRadius: 'çarpma alanı', wallRadius: 'duvar boyutu',
  frictionReduction: 'sürtünme azaltma', intangible: 'dokunulmazlık',
  leaveTrail: 'iz bırak', trailSlowAmount: 'iz yavaşlatma',
  trailSlowDuration: 'iz süresi', exitPushForce: 'çıkış itmesi',
  exitPushRadius: 'çıkış alanı', swapStunDuration: 'sersemletme',
  departurePushForce: 'ayrılış itmesi', departurePushRadius: 'ayrılış alanı',
  shatterSlowAmount: 'kırılma yavaşlatma', shatterSlowDuration: 'kırılma süresi',
  shatterRadius: 'kırılma alanı', kbPerBounce: 'sekme başı itme',
  reflectOnBreak: 'yansıtma', pullDuration: 'çekim süresi',
  flightCollision: 'uçuş çarpması', flightDamage: 'uçuş hasarı',
  flightKnockback: 'uçuş itmesi', chainKbFactor: 'zincirleme gücü',
  hitsOnReturn: 'dönüşte vurur', cooldownOnCatch: 'yakalama indirimi',
  burnZoneDuration: 'yanma süresi', burnSlowAmount: 'yanma yavaşlatma',
  destroysSpells: 'söz kırar', launchSpeedBonus: 'fırlatma hızı',
  flightDuration: 'uçuş süresi',
};

// ─── ShopOverlay Class ───────────────────────────────────
export class ShopOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.progression = null;
    this.shopTimer = 0;
    this.activeSlot = 'Q';
    this.chrome = [];    // persistent: dimmer, panel, title, tabs, bottom bar
    this.content = [];   // rebuilt on tab switch / progression update
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════
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
      const t = Math.ceil(remaining);
      this._timerText.setText(`${t}s`);
      this._timerText.setFill(t <= 5 ? COLOR.ACCENT_DANGER : COLOR.TEXT_SECONDARY);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  BUILD — full overlay
  // ═══════════════════════════════════════════════════════
  _build() {
    const s = this.scene;

    // Dimmer
    const dimmer = createDimmer(s, { depth: D, alpha: ALPHA.DIMMER });
    dimmer.setInteractive();
    this.chrome.push(dimmer);

    // Main panel
    const panel = createPanel(s, SCREEN.CX, SCREEN.CY, PW, PH, {
      depth: D + 1, alpha: 0.92,
    });
    this.chrome.push(panel);

    this._buildTitleBar();
    this._buildTabRow();
    this._buildBottomBar();
    this._buildContent();
  }

  // ═══════════════════════════════════════════════════════
  //  TITLE BAR
  // ═══════════════════════════════════════════════════════
  _buildTitleBar() {
    const s = this.scene;

    // Title bar background
    const bar = s.add.nineslice(SCREEN.CX, TITLE_Y, 'ui-panel-interior', null, PW - 24, 28, ...NINE.PANEL)
      .setScrollFactor(0).setDepth(D + 2);
    this.chrome.push(bar);

    // Title text
    const title = createText(s, PL + PAD + 8, TITLE_Y, 'HÜNER DÜKKÂNI', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(title);

    // SP count
    const sp = this.progression ? this.progression.sp : 0;
    this._spTextTitle = createText(s, PR - PAD - 80, TITLE_Y, `İlham: ${sp}`, FONT.BODY_BOLD, {
      fill: '#1a5588', depth: D + 3, originX: 0.5,
    });
    this.chrome.push(this._spTextTitle);

    // Timer
    this._timerText = createText(s, PR - PAD - 12, TITLE_Y, `${Math.ceil(this.shopTimer)}s`, FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, depth: D + 3, originX: 1,
    });
    this.chrome.push(this._timerText);
  }

  // ═══════════════════════════════════════════════════════
  //  TAB ROW
  // ═══════════════════════════════════════════════════════
  _buildTabRow() {
    const s = this.scene;
    const tabW = 110, tabH = 22, tabGap = 6;
    const totalW = SLOTS.length * tabW + (SLOTS.length - 1) * tabGap;
    const startX = SCREEN.CX - totalW / 2;

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = startX + i * (tabW + tabGap) + tabW / 2;
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);

      // Tab background
      const tex = isActive ? 'ui-tab' : 'ui-tab-unselected';
      const bg = s.add.nineslice(cx, TAB_Y, tex, null, tabW, tabH, ...NINE.TAB)
        .setScrollFactor(0).setDepth(D + 2);
      if (isLocked) bg.setTint(COLOR.TINT_DISABLED);
      else if (isActive) bg.setTint(SLOT_COLOR[slot].tint);
      this.chrome.push(bg);

      // Tab label
      const label = s.add.text(cx, TAB_Y, `${slot} ${SLOT_NAMES[slot]}`, textStyle(FONT.SMALL, {
        fill: isActive ? COLOR.TEXT_LIGHT : (isLocked ? COLOR.TEXT_DISABLED : COLOR.TEXT_SECONDARY),
        fontStyle: 'bold',
        stroke: isActive ? '#000000' : undefined,
        strokeThickness: isActive ? 1 : 0,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5);
      this.chrome.push(label);

      // Hit area
      const hit = s.add.nineslice(cx, TAB_Y, tex, null, tabW, tabH, ...NINE.TAB)
        .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
        .setInteractive({ useHandCursor: !isLocked });
      hit.on('pointerdown', () => {
        if (this.activeSlot !== slot) {
          this.activeSlot = slot;
          this._rebuildAll();
        }
      });
      this.chrome.push(hit);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  BOTTOM BAR
  // ═══════════════════════════════════════════════════════
  _buildBottomBar() {
    const s = this.scene;

    const bar = s.add.nineslice(SCREEN.CX, BOT_Y, 'ui-panel-interior', null, PW - 24, 32, ...NINE.PANEL)
      .setScrollFactor(0).setDepth(D + 2);
    this.chrome.push(bar);

    const sp = this.progression ? this.progression.sp : 0;
    this._spTextBottom = createText(s, PL + PAD + 60, BOT_Y, `${sp} İlham`, FONT.BODY_BOLD, {
      fill: '#1a5588', depth: D + 3, originX: 0.5,
    });
    this.chrome.push(this._spTextBottom);
  }

  _updateBottomBar() {
    const sp = this.progression ? this.progression.sp : 0;
    if (this._spTextTitle && !this._spTextTitle.destroyed) this._spTextTitle.setText(`İlham: ${sp}`);
    if (this._spTextBottom && !this._spTextBottom.destroyed) this._spTextBottom.setText(`${sp} İlham`);
  }

  // ═══════════════════════════════════════════════════════
  //  CONTENT — rebuilt on tab switch / progression update
  // ═══════════════════════════════════════════════════════
  _buildContent() {
    const slot = this.activeSlot;
    if (this._isSlotLocked(slot)) {
      this._buildLockedContent();
      return;
    }
    this._buildLeftSpellList();
    this._buildRightDetail();
    this._buildActionButton();
  }

  // ═══════════════════════════════════════════════════════
  //  LEFT — SPELL LIST
  // ═══════════════════════════════════════════════════════
  _buildLeftSpellList() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const availableSpells = SLOT_SPELLS[slot] || [];

    const bodyH = BODY_BOT - BODY_TOP;
    const leftCY = BODY_TOP + bodyH / 2;

    // Panel background
    const leftBg = s.add.nineslice(LEFT_CX, leftCY, 'ui-panel-2', null, LEFT_W, bodyH, ...NINE.PANEL)
      .setScrollFactor(0).setDepth(D + 2).setAlpha(ALPHA.PANEL);
    this.content.push(leftBg);

    // Header
    const headerY = BODY_TOP + 16;
    const header = createText(s, LEFT_CX, headerY, `${SLOT_NAMES[slot]} Hünerleri`, FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: D + 3,
    });
    this.content.push(header);

    const sep = createSeparator(s, LEFT_CX, headerY + 12, LEFT_W - 24, { depth: D + 3 });
    this.content.push(sep);

    // Spell rows
    const listTop = headerY + 24;
    const rowH = 36;

    for (let i = 0; i < availableSpells.length; i++) {
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const rowY = listTop + i * rowH + rowH / 2;
      const isChosen = chosenSpellId === spellId;
      const isAutoEquipped = spellState ? spellState.autoEquipped : false;
      const isFirstChoice = chosenSpellId === null || isAutoEquipped;
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;

      // Chosen row highlight
      if (isChosen) {
        const rowBg = s.add.nineslice(LEFT_CX, rowY, 'ui-focus', null, LEFT_W - 16, rowH - 4, 2, 2, 2, 2)
          .setScrollFactor(0).setDepth(D + 2).setTint(SLOT_COLOR[slot].tint).setAlpha(ALPHA.SUBTLE);
        this.content.push(rowBg);
      }

      // Icon cell
      const cellX = LEFT_L + 24;
      const cell = s.add.nineslice(cellX, rowY, 'ui-inventory-cell', null, 30, 30, ...NINE.CELL)
        .setScrollFactor(0).setDepth(D + 3).setAlpha(0.8);
      this.content.push(cell);

      // Spell icon
      if (def.icon && s.textures.exists(def.icon)) {
        const icon = s.add.image(cellX, rowY, def.icon).setScrollFactor(0).setDepth(D + 4);
        const sc = 22 / Math.max(icon.width, icon.height);
        icon.setScale(sc);
        this.content.push(icon);
      }

      // Spell name
      const nameX = cellX + 24;
      const nameText = s.add.text(nameX, rowY, def.name, textStyle(FONT.BODY, {
        fill: isChosen ? COLOR.TEXT_LIGHT : COLOR.TEXT_SECONDARY,
        fontStyle: isChosen ? 'bold' : 'normal',
      })).setScrollFactor(0).setDepth(D + 4).setOrigin(0, 0.5);
      this.content.push(nameText);

      // Cost hint for unchosen first-choice spells
      if (!isChosen && isFirstChoice) {
        const costHint = s.add.text(LEFT_R - 12, rowY, `${SP.SPELL_CHOICE_COST}◆`, textStyle(FONT.TINY, {
          fill: canAfford ? COLOR.ACCENT_INFO : COLOR.TEXT_DISABLED,
        })).setScrollFactor(0).setDepth(D + 4).setOrigin(1, 0.5);
        this.content.push(costHint);
      }

      // Hit area for row
      const hit = s.add.nineslice(LEFT_CX, rowY, 'ui-inventory-cell', null, LEFT_W - 8, rowH - 2, ...NINE.CELL)
        .setScrollFactor(0).setDepth(D + 5).setAlpha(0.001)
        .setInteractive({ useHandCursor: canAfford || isChosen });
      this.content.push(hit);

      if (!isChosen && canAfford) {
        hit.on('pointerover', () => {
          cell.setTint(COLOR.TINT_HOVER);
          nameText.setFill(COLOR.TEXT_PRIMARY);
        });
        hit.on('pointerout', () => {
          cell.clearTint();
          nameText.setFill(COLOR.TEXT_SECONDARY);
        });
        hit.on('pointerdown', () => {
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, spellId);
          }
        });
      } else if (isChosen) {
        hit.on('pointerover', () => { cell.setTint(COLOR.TINT_HOVER); });
        hit.on('pointerout', () => { cell.clearTint(); });
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  RIGHT — DETAIL CARD
  // ═══════════════════════════════════════════════════════
  _buildRightDetail() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;

    const bodyH = BODY_BOT - BODY_TOP;
    const rightCY = BODY_TOP + bodyH / 2;

    // Right panel background
    const rightBg = s.add.nineslice(RIGHT_CX, rightCY, 'ui-panel', null, RIGHT_W, bodyH, ...NINE.PANEL)
      .setScrollFactor(0).setDepth(D + 2).setAlpha(ALPHA.PANEL);
    this.content.push(rightBg);

    // No spell chosen — prompt
    if (!chosenSpellId) {
      const prompt = createText(s, RIGHT_CX, rightCY - 10, 'Soldan bir hüner seç', FONT.TITLE_SM, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
      });
      this.content.push(prompt);
      const costHint = createText(s, RIGHT_CX, rightCY + 16, `(${SP.SPELL_CHOICE_COST} İlham)`, FONT.BODY, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
      });
      this.content.push(costHint);
      return;
    }

    const def = SPELLS[chosenSpellId];
    const tree = SKILL_TREES[chosenSpellId];
    if (!def || !tree) return;

    const stats = computeSpellStats(chosenSpellId, currentTier);
    const maxTier = getMaxTier(chosenSpellId);

    // ── Spell Identity ──
    let y = BODY_TOP + 20;

    // Icon
    const iconX = RIGHT_L + 32;
    const iconCell = s.add.nineslice(iconX, y + 16, 'ui-inventory-cell', null, 44, 44, ...NINE.CELL)
      .setScrollFactor(0).setDepth(D + 3);
    this.content.push(iconCell);

    if (def.icon && s.textures.exists(def.icon)) {
      const icon = s.add.image(iconX, y + 16, def.icon).setScrollFactor(0).setDepth(D + 4);
      const sc = 32 / Math.max(icon.width, icon.height);
      icon.setScale(sc);
      this.content.push(icon);
    }

    // Spell name
    const nameX = iconX + 34;
    const nameText = createText(s, nameX, y + 8, def.name, FONT.TITLE_SM, {
      fill: SLOT_COLOR[slot].hex, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 2,
    });
    this.content.push(nameText);

    // Description
    if (def.description) {
      const desc = s.add.text(nameX, y + 26, def.description, textStyle(FONT.SMALL, {
        fill: COLOR.TEXT_SECONDARY,
        wordWrap: { width: RIGHT_W - 90 },
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
      this.content.push(desc);
    }

    // ── Separator ──
    y += 54;
    const sep1 = createSeparator(s, RIGHT_CX, y, RIGHT_W - 24, { depth: D + 3 });
    this.content.push(sep1);

    // ── Stat Bars ──
    y += 8;
    const visibleStats = STAT_DEFS.filter(sd => stats[sd.key] != null && stats[sd.key] !== 0);
    const barW = Math.min(280, RIGHT_W - 180);
    const labelX = RIGHT_L + 20;
    const barStartX = labelX + 80;
    const valX = barStartX + barW + 8;

    for (const sd of visibleStats) {
      y += 18;
      this._buildStatRow(sd, stats[sd.key], y, slot, barW, labelX, barStartX, valX);
    }

    // ── Tier Progress ──
    y += 24;
    const sep2 = createSeparator(s, RIGHT_CX, y, RIGHT_W - 24, { depth: D + 3 });
    this.content.push(sep2);
    y += 14;

    // Tier label
    const tierLabel = createText(s, RIGHT_L + 20, y, `Pâye ${currentTier}/${maxTier}`, FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: D + 3, originX: 0,
    });
    this.content.push(tierLabel);

    // Tier dots
    const dotSize = 16;
    const dotGap = 4;
    const dotsStartX = RIGHT_L + 120;
    for (let t = 0; t < maxTier; t++) {
      const filled = t < currentTier;
      const dx = dotsStartX + t * (dotSize + dotGap);
      const dot = s.add.nineslice(
        dx, y, filled ? 'ui-focus' : 'ui-inventory-cell', null,
        dotSize, dotSize, ...(filled ? [2, 2, 2, 2] : NINE.CELL)
      ).setScrollFactor(0).setDepth(D + 3);
      if (filled) dot.setTint(SLOT_COLOR[slot].tint);
      this.content.push(dot);
    }

    // ── Next Tier Info ──
    const nextTier = getNextTierInfo(chosenSpellId, currentTier);
    y += 24;

    if (nextTier) {
      const nextLabel = createText(s, RIGHT_L + 20, y, `Sonraki: ${nextTier.name}`, FONT.BODY_BOLD, {
        fill: COLOR.TEXT_PRIMARY, depth: D + 3, originX: 0,
      });
      this.content.push(nextLabel);
      y += 16;

      if (nextTier.description) {
        const nextDesc = s.add.text(RIGHT_L + 20, y, nextTier.description, textStyle(FONT.SMALL, {
          fill: COLOR.TEXT_SECONDARY,
          wordWrap: { width: RIGHT_W - 40 },
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
        this.content.push(nextDesc);
        y += nextDesc.height + 6;
      }

      // Mod changes
      const modText = Object.entries(nextTier.mods)
        .map(([k, v]) => typeof v === 'boolean'
          ? `${MOD_LABELS[k] || k}: ${v ? 'evet' : 'hayır'}`
          : `${MOD_LABELS[k] || k}: ${v > 0 ? '+' : ''}${v}`)
        .join('  ');
      if (modText) {
        const mods = s.add.text(RIGHT_L + 20, y, modText, textStyle(FONT.TINY, {
          fill: COLOR.ACCENT_INFO,
          wordWrap: { width: RIGHT_W - 40 },
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
        this.content.push(mods);
      }
    } else {
      // Max tier badge
      const badge = createText(s, RIGHT_CX, y, 'EN ÜST PÂYE', FONT.BODY_BOLD, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(badge);
    }

    // ── Completed tiers (compact) ──
    if (currentTier > 0 && tree.tiers) {
      y += 20;
      for (let t = 0; t < currentTier && t < tree.tiers.length; t++) {
        const tier = tree.tiers[t];
        const check = s.add.text(RIGHT_L + 20, y, `T${t + 1}: ${tier.name}`, textStyle(FONT.TINY, {
          fill: COLOR.ACCENT_SUCCESS,
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
        this.content.push(check);
        y += 14;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  STAT ROW — single stat bar
  // ═══════════════════════════════════════════════════════
  _buildStatRow(sd, value, y, slot, barW, labelX, barStartX, valX) {
    const s = this.scene;

    // Label
    const lbl = s.add.text(labelX, y, sd.label, textStyle(FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY,
    })).setScrollFactor(0).setDepth(D + 4).setOrigin(0, 0.5);
    this.content.push(lbl);

    // Bar background
    const barBg = s.add.nineslice(barStartX + barW / 2, y, 'ui-panel-interior', null, barW, 6, ...NINE.PANEL)
      .setScrollFactor(0).setDepth(D + 3).setAlpha(ALPHA.BAR_BG);
    this.content.push(barBg);

    // Bar fill
    let ratio = sd.invert ? 1 - (value / sd.max) : value / sd.max;
    ratio = Math.max(0, Math.min(1, ratio));
    const fillW = Math.max(2, ratio * barW);
    const fill = s.add.nineslice(barStartX + fillW / 2, y, 'ui-slider-progress', null, fillW, 6, ...NINE.SLIDER)
      .setScrollFactor(0).setDepth(D + 4).setTint(SLOT_COLOR[slot].tint);
    this.content.push(fill);

    // Value text
    const val = s.add.text(valX, y, sd.fmt(value), textStyle(FONT.SMALL, {
      fill: COLOR.TEXT_PRIMARY,
    })).setScrollFactor(0).setDepth(D + 4).setOrigin(0, 0.5);
    this.content.push(val);
  }

  // ═══════════════════════════════════════════════════════
  //  ACTION BUTTON — in bottom bar
  // ═══════════════════════════════════════════════════════
  _buildActionButton() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;

    if (!chosenSpellId) return;

    const nextTier = getNextTierInfo(chosenSpellId, spellState.tier);
    if (!nextTier) return;

    const cost = nextTier.cost;
    const canUpgrade = prog && prog.sp >= cost;

    const { elements } = createButton(s, PR - PAD - 80, BOT_Y, `Pişir (${cost})`, {
      width: 140, height: 26, depth: D + 3, enabled: canUpgrade,
      onClick: () => {
        if (s.network && s.network.connected) {
          s.network.sendShopUpgradeTier(slot);
        }
      },
    });
    this.content.push(...elements);
  }

  // ═══════════════════════════════════════════════════════
  //  LOCKED SLOT CONTENT
  // ═══════════════════════════════════════════════════════
  _buildLockedContent() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;

    const bodyH = BODY_BOT - BODY_TOP;
    const cy = BODY_TOP + bodyH / 2;

    // Lock icon
    const lockIcon = s.add.image(SCREEN.CX, cy - 30, 'spell-BookDarkness-off')
      .setDisplaySize(32, 32).setScrollFactor(0).setDepth(D + 3);
    this.content.push(lockIcon);

    const label = createText(s, SCREEN.CX, cy + 10, `${SLOT_NAMES[slot]} — KİLİTLİ`, FONT.TITLE_SM, {
      fill: COLOR.TEXT_DISABLED, depth: D + 3,
    });
    this.content.push(label);

    const costLabel = createText(s, SCREEN.CX, cy + 36, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, depth: D + 3,
    });
    this.content.push(costLabel);

    // Unlock button in bottom bar
    const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
    const { elements } = createButton(s, PR - PAD - 100, BOT_Y, `Kilidi Aç (${SP.SLOT_UNLOCK_COST})`, {
      width: 160, height: 26, depth: D + 3, enabled: canUnlock,
      onClick: () => {
        if (s.network && s.network.connected) {
          s.network.sendShopUnlockSlot(slot);
        }
      },
    });
    this.content.push(...elements);
  }

  // ═══════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════
  _isSlotLocked(slot) {
    const prog = this.progression;
    if (!prog) return slot !== 'Q';
    return prog.slots[slot] === 'locked';
  }

  _pickDefaultSlot() {
    const prog = this.progression;
    if (!prog) return 'Q';
    for (const slot of SLOTS) {
      if (prog.slots[slot] !== 'locked' && prog.spells[slot] && prog.spells[slot].chosenSpell) return slot;
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
    for (const el of this.content) {
      if (el && !el.destroyed) { el.removeAllListeners(); el.destroy(); }
    }
    this.content = [];
  }

  destroy() {
    for (const el of [...this.chrome, ...this.content]) {
      if (el && !el.destroyed) { el.removeAllListeners(); el.destroy(); }
    }
    this.chrome = [];
    this.content = [];
    this._timerText = null;
    this._spTextTitle = null;
    this._spTextBottom = null;
  }
}
