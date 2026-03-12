/**
 * ShopOverlay.js — Scene-based floating spell shop.
 *
 * No big panels. Character stands center-stage. Spell options float
 * as horizontal cards. Arena visible behind a very light dimmer.
 * Matches the MenuScene "Arena Entrance" aesthetic.
 */

import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SLOT_COLOR, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createBar, createPanel, createDimmer, createSeparator, createText, animateIn } from './UIHelpers.js';
import { getSfxVolume } from '../config.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const SLOTS = ['Q', 'W', 'E', 'R'];
const SLOT_NAMES = { Q: 'SÖZ', W: 'EL', E: 'DİL', R: 'BEL' };

// Layout Y positions
const TITLE_Y      = 22;
const SP_Y         = 46;
const TAB_Y        = 76;
const EQUIP_Y      = 112;
const CHAR_Y       = 230;
const STRIP_Y      = 380;
const DETAIL_Y     = 490;
const TIMER_BAR_Y  = 708;

// Card dimensions
const CARD_W       = 78;
const CARD_CELL    = 68;
const CARD_ICON    = 46;
const CARD_GAP     = 10;

// Equipped row
const EQ_SIZE      = 30;
const EQ_GAP       = 10;

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
    this.shopDuration = 20;
    this.activeSlot = 'Q';
    this.chrome = [];    // persistent: dimmer, top bar, tabs, character, timer bar
    this.content = [];   // rebuilt on tab switch / progression update
    this._timerText = null;
    this._spText = null;
    this._timerBar = null;
    this._equipCells = [];
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════
  show(progression, shopDuration) {
    if (this.visible) this.destroy();
    this.visible = true;
    this.progression = progression;
    this.shopDuration = shopDuration || 20;
    this.shopTimer = this.shopDuration;
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
      this._updateSP();
      this._updateEquippedRow();
    }
  }

  updateTimer(remaining) {
    this.shopTimer = remaining;
    if (this._timerText && !this._timerText.destroyed) {
      const t = Math.ceil(remaining);
      this._timerText.setText(`${t}s`);
      this._timerText.setFill(t <= 5 ? COLOR.ACCENT_DANGER : COLOR.TEXT_ICE);
    }
    // Update timer bar
    if (this._timerBar && this._timerBar.setValue) {
      const ratio = Math.max(0, remaining / this.shopDuration);
      const tint = remaining <= 5 ? COLOR.TINT_DANGER : COLOR.TINT_INFO;
      this._timerBar.setValue(ratio, tint);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  BUILD — full overlay
  // ═══════════════════════════════════════════════════════
  _build() {
    this._buildDimmer();
    this._buildTopBar();
    this._buildSlotTabs();
    this._buildEquippedRow();
    this._buildTimerBar();
    this._buildContent();
  }

  // ═══════════════════════════════════════════════════════
  //  DIMMER — very light, arena stays visible
  // ═══════════════════════════════════════════════════════
  _buildDimmer() {
    const dimmer = createDimmer(this.scene, { depth: D, alpha: 0.25 });
    dimmer.setInteractive();
    this.chrome.push(dimmer);
  }

  // ═══════════════════════════════════════════════════════
  //  TOP BAR — floating text, no panel background
  // ═══════════════════════════════════════════════════════
  _buildTopBar() {
    const s = this.scene;

    // Title
    const title = createText(s, CX, TITLE_Y, 'HÜNER DÜKKÂNI', FONT.TITLE_SM, {
      fill: COLOR.ACCENT_GOLD, depth: D + 3,
      stroke: '#000000', strokeThickness: 4,
    });
    this.chrome.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 50, duration: 250 });

    // SP counter
    const sp = this.progression ? this.progression.sp : 0;
    this._spText = createText(s, CX, SP_Y, `◆ ${sp} İlham`, FONT.BODY_BOLD, {
      fill: COLOR.TEXT_ICE, depth: D + 3,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._spText);
    animateIn(s, this._spText, { from: 'slideDown', delay: 80, duration: 250 });

    // Timer (right side)
    this._timerText = createText(s, SCREEN.W - 40, TITLE_Y, `${Math.ceil(this.shopTimer)}s`, FONT.TITLE_SM, {
      fill: COLOR.TEXT_ICE, depth: D + 3, originX: 1,
      stroke: '#000000', strokeThickness: 3,
    });
    this.chrome.push(this._timerText);
    animateIn(s, this._timerText, { from: 'slideDown', delay: 50, duration: 250 });
  }

  // ═══════════════════════════════════════════════════════
  //  SLOT TABS — 4 floating pill buttons
  // ═══════════════════════════════════════════════════════
  _buildSlotTabs() {
    const s = this.scene;
    const tabW = 110, tabH = 32, tabGap = 10;
    const totalW = SLOTS.length * tabW + (SLOTS.length - 1) * tabGap;
    const startX = CX - totalW / 2;

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = startX + i * (tabW + tabGap) + tabW / 2;
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);

      // Tab background (icy Graphics-drawn)
      const bg = s.add.graphics().setScrollFactor(0).setDepth(D + 2);
      const tabColor = isLocked ? 0x607880 : (isActive ? SLOT_COLOR[slot].tint : 0x8ad4e8);
      const tabAlpha = isActive ? 0.85 : (isLocked ? 0.35 : 0.50);
      bg.fillStyle(tabColor, tabAlpha);
      bg.fillRoundedRect(cx - tabW / 2, TAB_Y - tabH / 2, tabW, tabH, 4);
      bg.lineStyle(1.5, 0xd0eef6, isActive ? 0.6 : 0.25);
      bg.strokeRoundedRect(cx - tabW / 2, TAB_Y - tabH / 2, tabW, tabH, 4);
      this.chrome.push(bg);

      // Tab label
      const label = s.add.text(cx, TAB_Y, `${slot} ${SLOT_NAMES[slot]}`, textStyle(FONT.SMALL, {
        fill: isActive ? COLOR.TEXT_LIGHT : (isLocked ? COLOR.TEXT_DISABLED : COLOR.TEXT_SECONDARY),
        fontStyle: 'bold',
        stroke: isActive ? '#000000' : undefined,
        strokeThickness: isActive ? 2 : 0,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5);
      this.chrome.push(label);

      // Hit area
      const hit = s.add.rectangle(cx, TAB_Y, tabW, tabH)
        .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
        .setInteractive({ useHandCursor: !isLocked });
      hit.on('pointerdown', () => {
        if (this.activeSlot !== slot) {
          this._playSfx('sfx-move');
          this.activeSlot = slot;
          this._rebuildAll();
        }
      });
      this.chrome.push(hit);

      // Entrance animation
      animateIn(s, bg, { from: 'scale', delay: 100 + i * 40, duration: 200 });
      animateIn(s, label, { from: 'scale', delay: 100 + i * 40, duration: 200 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  EQUIPPED ROW — 4 small cells showing current build
  // ═══════════════════════════════════════════════════════
  _buildEquippedRow() {
    const s = this.scene;
    const totalW = SLOTS.length * EQ_SIZE + (SLOTS.length - 1) * EQ_GAP;
    const startX = CX - totalW / 2 + EQ_SIZE / 2;
    this._equipCells = [];

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = startX + i * (EQ_SIZE + EQ_GAP);
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);
      const spellState = this.progression ? this.progression.spells[slot] : null;
      const chosenId = spellState ? spellState.chosenSpell : null;

      // Gold highlight for active slot
      const highlight = s.add.nineslice(cx, EQUIP_Y, 'ui-focus', null,
        EQ_SIZE + 4, EQ_SIZE + 4, 2, 2, 2, 2)
        .setTint(SLOT_COLOR[slot].tint).setScrollFactor(0).setDepth(D + 2)
        .setVisible(isActive);
      this.chrome.push(highlight);

      // Cell background
      const cell = s.add.nineslice(cx, EQUIP_Y, 'ui-inventory-cell', null,
        EQ_SIZE, EQ_SIZE, ...NINE.CELL)
        .setScrollFactor(0).setDepth(D + 2).setAlpha(isLocked ? 0.4 : 0.8);
      this.chrome.push(cell);

      // Spell icon or slot key
      let iconEl = null;
      if (chosenId && SPELLS[chosenId]) {
        const def = SPELLS[chosenId];
        if (def.icon && s.textures.exists(def.icon)) {
          iconEl = s.add.image(cx, EQUIP_Y, def.icon).setScrollFactor(0).setDepth(D + 3);
          const sc = 22 / Math.max(iconEl.width, iconEl.height);
          iconEl.setScale(sc);
        }
      }
      if (!iconEl) {
        // Show slot key letter
        iconEl = s.add.text(cx, EQUIP_Y, isLocked ? '🔒' : slot, textStyle(FONT.SMALL, {
          fill: isLocked ? COLOR.TEXT_DISABLED : COLOR.TEXT_SECONDARY,
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5);
      }
      this.chrome.push(iconEl);

      this._equipCells.push({ cell, highlight, icon: iconEl });

      // Entrance animation
      animateIn(s, cell, { from: 'scale', delay: 150 + i * 30, duration: 200 });
      animateIn(s, iconEl, { from: 'scale', delay: 160 + i * 30, duration: 200 });
    }
  }

  _updateEquippedRow() {
    // Just rebuild the whole thing since it's part of chrome
    // (updateProgression already rebuilds)
  }

  _updateSP() {
    const sp = this.progression ? this.progression.sp : 0;
    if (this._spText && !this._spText.destroyed) {
      this._spText.setText(`◆ ${sp} İlham`);
      // Pulse animation on SP change
      const s = this.scene;
      if (s.tweens) {
        s.tweens.add({
          targets: this._spText,
          scaleX: 1.3, scaleY: 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CENTER SPELL — hero FX sprite at center with glow
  // ═══════════════════════════════════════════════════════
  _buildCenterSpell() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const spellState = this.progression ? this.progression.spells[slot] : null;
    const chosenId = spellState ? spellState.chosenSpell : null;
    const def = chosenId ? SPELLS[chosenId] : null;

    // Glow ellipse beneath spell
    const glow = s.add.graphics().setDepth(D + 1).setScrollFactor(0);
    const glowColor = (def && def.fx) ? def.fx.color || slotColor.tint : slotColor.tint;
    glow.fillStyle(0x000000, 0.25);
    glow.fillEllipse(CX, CHAR_Y + 36, 60, 14);
    glow.fillStyle(glowColor, 0.10);
    glow.fillEllipse(CX, CHAR_Y + 32, 110, 28);
    glow.fillStyle(glowColor, 0.18);
    glow.fillEllipse(CX, CHAR_Y + 34, 70, 18);
    this.content.push(glow);

    if (def && def.fx && def.fx.sprite && s.textures.exists(def.fx.sprite)) {
      // Use display sprite if available, otherwise fall back to in-game sprite
      const dispSprite = def.fx.displaySprite && s.textures.exists(def.fx.displaySprite)
        ? def.fx.displaySprite : def.fx.sprite;
      const dispAnim = def.fx.displayAnimKey && s.anims.exists(def.fx.displayAnimKey)
        ? def.fx.displayAnimKey : def.fx.animKey;

      const fxSprite = s.add.sprite(CX, CHAR_Y, dispSprite, 0)
        .setScale(def.fx.scale ? def.fx.scale * 5.5 : 5.5)
        .setDepth(D + 2).setScrollFactor(0);
      if (dispAnim && s.anims.exists(dispAnim)) {
        fxSprite.play(dispAnim);
      }
      this.content.push(fxSprite);
      animateIn(s, fxSprite, { from: 'scale', delay: 0, duration: 300 });
    } else {
      // No spell chosen — show slot letter as placeholder
      const placeholder = createText(s, CX, CHAR_Y, slot, {
        fontSize: '72px', fontFamily: FONT.FAMILY, fontStyle: 'bold',
      }, {
        fill: slotColor.hex, depth: D + 2,
        stroke: '#000000', strokeThickness: 4,
        alpha: 0.3,
      });
      this.content.push(placeholder);
      animateIn(s, placeholder, { from: 'scale', delay: 0, duration: 300 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  TIMER BAR — thin progress bar at bottom
  // ═══════════════════════════════════════════════════════
  _buildTimerBar() {
    const s = this.scene;
    const barW = 1000;
    const barX = CX - barW / 2;
    const bar = createBar(s, barX, TIMER_BAR_Y, barW, 4, {
      depth: D + 2,
      tint: COLOR.TINT_INFO,
      value: 1,
    });
    this._timerBar = bar;
    this.chrome.push(...bar.elements);
    bar.elements.forEach(el => animateIn(s, el, { from: 'fadeOnly', delay: 300, duration: 250 }));
  }

  // ═══════════════════════════════════════════════════════
  //  CONTENT — rebuilt on tab switch / progression update
  // ═══════════════════════════════════════════════════════
  _buildContent() {
    const slot = this.activeSlot;
    this._buildCenterSpell();
    if (this._isSlotLocked(slot)) {
      this._buildLockedContent();
      return;
    }
    this._buildSpellStrip();
    this._buildDetailZone();
  }

  // ═══════════════════════════════════════════════════════
  //  SPELL STRIP — horizontal spell cards
  // ═══════════════════════════════════════════════════════
  _buildSpellStrip() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const isAutoEquipped = spellState ? spellState.autoEquipped : false;
    const isFirstChoice = chosenSpellId === null || isAutoEquipped;
    const availableSpells = SLOT_SPELLS[slot] || [];

    // Calculate strip positioning
    const totalW = availableSpells.length * CARD_W + (availableSpells.length - 1) * CARD_GAP;
    const startX = CX - totalW / 2 + CARD_W / 2;

    for (let i = 0; i < availableSpells.length; i++) {
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const cx = startX + i * (CARD_W + CARD_GAP);
      const isChosen = chosenSpellId === spellId;
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;

      // ── Gold selection border (chosen spell) ──
      if (isChosen) {
        const selBorder = s.add.nineslice(cx, STRIP_Y - 6, 'ui-focus', null,
          CARD_CELL + 8, CARD_CELL + 8, 2, 2, 2, 2)
          .setTint(COLOR.TINT_GOLD).setScrollFactor(0).setDepth(D + 2);
        this.content.push(selBorder);

        // Pulsing alpha on selection border
        s.tweens.add({
          targets: selBorder,
          alpha: { from: 0.6, to: 1 },
          duration: 800, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // ── Card cell ──
      const cell = s.add.nineslice(cx, STRIP_Y - 6, 'ui-inventory-cell', null,
        CARD_CELL, CARD_CELL, ...NINE.CELL)
        .setScrollFactor(0).setDepth(D + 3)
        .setAlpha((!isChosen && !canAfford) ? 0.4 : 0.85);
      if (!isChosen && !canAfford) cell.setTint(COLOR.TINT_DISABLED);
      this.content.push(cell);

      // ── Spell icon ──
      if (def.icon && s.textures.exists(def.icon)) {
        const icon = s.add.image(cx, STRIP_Y - 8, def.icon)
          .setScrollFactor(0).setDepth(D + 4);
        const sc = CARD_ICON / Math.max(icon.width, icon.height);
        icon.setScale(sc);
        if (!isChosen && !canAfford) icon.setAlpha(0.5);
        this.content.push(icon);
      }

      // ── Spell name below card ──
      const nameText = s.add.text(cx, STRIP_Y + 30, def.name, textStyle(FONT.SMALL, {
        fill: isChosen ? COLOR.ACCENT_GOLD : COLOR.TEXT_SECONDARY,
        fontStyle: isChosen ? 'bold' : 'normal',
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(nameText);

      // ── Cost badge for unchosen first-choice spells ──
      if (!isChosen && isFirstChoice) {
        const costBadge = s.add.text(cx + CARD_CELL / 2 - 2, STRIP_Y - CARD_CELL / 2 - 4,
          `${SP.SPELL_CHOICE_COST}◆`, textStyle(FONT.TINY, {
            fill: canAfford ? COLOR.ACCENT_INFO : COLOR.TEXT_DISABLED,
            strokeThickness: 3,
          })).setScrollFactor(0).setDepth(D + 5).setOrigin(1, 0);
        this.content.push(costBadge);
      }

      // ── Hit area ──
      const hit = s.add.rectangle(cx, STRIP_Y - 6, CARD_W, CARD_CELL + 10)
        .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
        .setInteractive({ useHandCursor: canAfford || isChosen });
      this.content.push(hit);

      // Hover & click behavior
      if (!isChosen && canAfford) {
        hit.on('pointerover', () => {
          cell.setTint(COLOR.TINT_HOVER);
          s.tweens.add({ targets: cell, scaleX: 1.08, scaleY: 1.08, duration: 100 });
          nameText.setFill(COLOR.TEXT_PRIMARY);
        });
        hit.on('pointerout', () => {
          cell.clearTint();
          s.tweens.add({ targets: cell, scaleX: 1, scaleY: 1, duration: 100 });
          nameText.setFill(COLOR.TEXT_SECONDARY);
        });
        hit.on('pointerdown', () => {
          this._playSfx('sfx-accept');
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, spellId);
          }
        });
      } else if (isChosen) {
        hit.on('pointerover', () => {
          cell.setTint(COLOR.TINT_HOVER);
        });
        hit.on('pointerout', () => {
          cell.clearTint();
        });
      }

      // Entrance animation — staggered
      animateIn(s, cell, { from: 'slideUp', delay: 200 + i * 50, duration: 250 });
      animateIn(s, nameText, { from: 'slideUp', delay: 220 + i * 50, duration: 250 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  DETAIL ZONE — contextual tier/upgrade info
  // ═══════════════════════════════════════════════════════
  _buildDetailZone() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;

    // No spell chosen — show prompt
    if (!chosenSpellId) {
      const prompt = createText(s, CX, DETAIL_Y, 'Bir hüner seç', FONT.TITLE_SM, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(prompt);
      animateIn(s, prompt, { from: 'fadeOnly', delay: 400, duration: 250 });

      const costHint = createText(s, CX, DETAIL_Y + 26, `(${SP.SPELL_CHOICE_COST} İlham)`, FONT.BODY, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
      });
      this.content.push(costHint);
      animateIn(s, costHint, { from: 'fadeOnly', delay: 420, duration: 250 });
      return;
    }

    const def = SPELLS[chosenSpellId];
    const tree = SKILL_TREES[chosenSpellId];
    if (!def || !tree) return;

    const stats = computeSpellStats(chosenSpellId, currentTier);
    const maxTier = getMaxTier(chosenSpellId);
    let y = DETAIL_Y;

    // ── Spell name (slot color) ──
    const spellName = createText(s, CX, y, def.name, FONT.TITLE_SM, {
      fill: SLOT_COLOR[slot].hex, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.content.push(spellName);
    animateIn(s, spellName, { from: 'slideUp', delay: 400, duration: 200 });

    // ── Description ──
    y += 30;
    if (def.description) {
      const desc = s.add.text(CX, y, def.description, textStyle(FONT.BODY_BOLD, {
        fill: COLOR.TEXT_SECONDARY,
        wordWrap: { width: 600 },
        align: 'center',
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(desc);
      animateIn(s, desc, { from: 'fadeOnly', delay: 420, duration: 200 });
      y += desc.height + 8;
    } else {
      y += 4;
    }

    // ── Tier dots ──
    const dotSize = 16;
    const dotGap = 7;
    const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;
    const dotStartX = CX - dotsW / 2 + dotSize / 2;

    // Tier label
    const tierLabel = createText(s, CX - dotsW / 2 - 10, y + dotSize / 2,
      `Pâye ${currentTier}/${maxTier}`, FONT.BODY_BOLD, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3, originX: 1,
      });
    this.content.push(tierLabel);

    for (let t = 0; t < maxTier; t++) {
      const filled = t < currentTier;
      const dx = dotStartX + t * (dotSize + dotGap);
      const dot = s.add.nineslice(
        dx + dotsW / 2 + 20, y + dotSize / 2,
        filled ? 'ui-focus' : 'ui-inventory-cell', null,
        dotSize, dotSize, ...(filled ? [2, 2, 2, 2] : NINE.CELL)
      ).setScrollFactor(0).setDepth(D + 3);
      if (filled) dot.setTint(SLOT_COLOR[slot].tint);
      this.content.push(dot);
    }

    y += dotSize + 10;

    // ── Key stats (compact, horizontal) ──
    const visibleStats = STAT_DEFS.filter(sd => stats[sd.key] != null && stats[sd.key] !== 0);
    if (visibleStats.length > 0) {
      const statParts = visibleStats.slice(0, 5).map(sd => `${sd.label}: ${sd.fmt(stats[sd.key])}`);
      const statLine = s.add.text(CX, y, statParts.join('   '), textStyle(FONT.SMALL, {
        fill: COLOR.TEXT_SECONDARY,
        align: 'center',
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(statLine);
      y += 22;
    }

    // ── Next tier info + upgrade button ──
    const nextTier = getNextTierInfo(chosenSpellId, currentTier);

    if (nextTier) {
      // Next tier mods
      const modText = Object.entries(nextTier.mods)
        .map(([k, v]) => typeof v === 'boolean'
          ? `${MOD_LABELS[k] || k}: ${v ? 'evet' : 'hayır'}`
          : `${MOD_LABELS[k] || k}: ${v > 0 ? '+' : ''}${v}`)
        .join('  ');

      if (modText) {
        const mods = s.add.text(CX, y, `Sonraki: ${modText}`, textStyle(FONT.SMALL, {
          fill: COLOR.ACCENT_INFO,
          wordWrap: { width: 700 },
          align: 'center',
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.content.push(mods);
        y += mods.height + 8;
      }

      // Upgrade button
      const cost = nextTier.cost;
      const canUpgrade = prog && prog.sp >= cost;
      const { elements: btnEls } = createButton(s, CX, y + 14, `Pişir (${cost}◆)`, {
        width: 180, height: 36, depth: D + 4, enabled: canUpgrade,
        onClick: () => {
          this._playSfx('sfx-accept');
          if (s.network && s.network.connected) {
            s.network.sendShopUpgradeTier(slot);
          }
        },
      });
      this.content.push(...btnEls);
      btnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 450, duration: 200 }));
    } else {
      // Max tier badge
      const badge = createText(s, CX, y, '★ EN ÜST PÂYE ★', FONT.BODY_BOLD, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(badge);

      // Gentle pulse
      s.tweens.add({
        targets: badge,
        alpha: { from: 0.7, to: 1 },
        duration: 800, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  LOCKED SLOT CONTENT
  // ═══════════════════════════════════════════════════════
  _buildLockedContent() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;

    // Lock icon
    const lockY = 400;
    if (s.textures.exists('spell-BookDarkness-off')) {
      const lockIcon = s.add.image(CX, lockY - 30, 'spell-BookDarkness-off')
        .setDisplaySize(40, 40).setScrollFactor(0).setDepth(D + 3);
      this.content.push(lockIcon);
      animateIn(s, lockIcon, { from: 'scale', delay: 200, duration: 250 });
    }

    const label = createText(s, CX, lockY + 10, `${SLOT_NAMES[slot]} — KİLİTLİ`, FONT.TITLE_SM, {
      fill: COLOR.TEXT_DISABLED, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.content.push(label);
    animateIn(s, label, { from: 'slideUp', delay: 250, duration: 250 });

    const costLabel = createText(s, CX, lockY + 38, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, FONT.BODY, {
      fill: COLOR.TEXT_SECONDARY, depth: D + 3,
    });
    this.content.push(costLabel);
    animateIn(s, costLabel, { from: 'fadeOnly', delay: 300, duration: 250 });

    // Unlock button
    const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
    const { elements: btnEls } = createButton(s, CX, lockY + 74, `Kilidi Aç (${SP.SLOT_UNLOCK_COST}◆)`, {
      width: 200, height: 38, depth: D + 4, enabled: canUnlock,
      onClick: () => {
        this._playSfx('sfx-accept');
        if (s.network && s.network.connected) {
          s.network.sendShopUnlockSlot(slot);
        }
      },
    });
    this.content.push(...btnEls);
    btnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 350, duration: 200 }));
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

  _playSfx(key) {
    try { this.scene.sound.play(key, { volume: 0.5 * getSfxVolume() }); } catch (_) { /* */ }
  }

  _rebuildAll() {
    this.destroy();
    this._build();
  }

  _destroyContent() {
    for (const el of this.content) {
      if (el && !el.destroyed) {
        if (el.removeAllListeners) el.removeAllListeners();
        el.destroy();
      }
    }
    this.content = [];
  }

  destroy() {
    for (const el of [...this.chrome, ...this.content]) {
      if (el && !el.destroyed) {
        if (el.removeAllListeners) el.removeAllListeners();
        el.destroy();
      }
    }
    this.chrome = [];
    this.content = [];
    this._timerText = null;
    this._spText = null;
    this._timerBar = null;
    this._equipCells = [];
  }
}
