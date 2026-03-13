/**
 * ShopOverlay.js — Vertical-stack spell shop with single-spell carousel.
 *
 * Panel layout (499×556, centered at 640,360):
 *   HEADER   — title + SP + timer
 *   TABS     — 4 slot tabs
 *   ZONE 1   — FX display sprite (hero, big)
 *   ZONE 2   — Spell name + description + stats
 *   ZONE 3   — Single spell card with < > arrows
 *   ZONE 4   — Countdown progress bar
 *   ZONE 5   — Upgrade / tier info
 *   ZONE 6   — Action button (Seç / Pişir / Kilidi Aç)
 */

import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SLOT_COLOR, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createBar, createDimmer, createText, createTexturedButton, animateIn } from './UIHelpers.js';
import { getSfxVolume } from '../config.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const CX = SCREEN.CX;               // 640
const CY = SCREEN.CY;               // 360
const SLOTS = ['Q', 'W', 'E', 'R'];
const SLOT_NAMES = { Q: 'SÖZ', W: 'EL', E: 'DİL', R: 'BEL' };

// ─── Panel zone coordinates ──────────────────────────────
const PX = CX;
const PY = CY;
const PW = 499;
const PH = 556;
const PT = PY - PH / 2;             // panel top ≈ 82

// Full-width content area
const CONTENT_W = 440;

// Header
const HEADER_Y = PT + 42;
const HEADER_W = 420;

// Tabs
const TAB_Y    = PT + 84;
const TAB_W    = 104;
const TAB_H    = 28;
const TAB_GAP  = 6;

// Zone 1 — FX sprite
const SPRITE_Y = PT + 160;          // center of sprite

// Zone 2 — Explanations
const INFO_Y   = PT + 228;          // top of info zone

// Zone 3 — Single spell card
const SPELL_Y  = PT + 338;          // center of spell card
const CARD_W   = 300;
const CARD_H   = 48;

// Zone 4 — Timer bar
const TBAR_Y   = PT + 378;
const TBAR_W   = CONTENT_W;

// Zone 5 — Upgrade info
const UPGRADE_Y = PT + 405;

// Zone 6 — Action button
const BTN_Y    = PT + 458;
const BTN_W    = 200;
const BTN_H    = 40;

// Stat display definitions
const STAT_DEFS = [
  { label: 'Hasar',      key: 'damage',         fmt: v => `${v}` },
  { label: 'İtme',       key: 'knockbackForce',  fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Bekleme',    key: 'cooldown',        fmt: v => `${(v / 1000).toFixed(1)}s` },
  { label: 'Hız',        key: 'speed',           fmt: v => `${v}` },
  { label: 'Menzil',     key: 'range',           fmt: v => `${v}` },
  { label: 'Yavaşlatma', key: 'slowAmount',      fmt: v => `${(v * 100).toFixed(0)}%` },
  { label: 'Çekim',      key: 'pullForce',       fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Kalkan',     key: 'shieldHits',      fmt: v => `${v}` },
  { label: 'Mermi',      key: 'missileCount',    fmt: v => `${v}` },
  { label: 'Sekme',      key: 'maxBounces',      fmt: v => `${v}` },
  { label: 'Süre',       key: 'buffDuration',    fmt: v => `${(v / 1000).toFixed(1)}s` },
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
    this.chrome = [];     // persistent: dimmer, panel, header, tabs
    this.content = [];    // rebuilt on tab switch / spell change
    this.previewSpellId = null;
    this._timerText = null;
    this._spText = null;
    this._timerBar = null;
    this._scrollOffset = 0;  // index into SLOT_SPELLS[slot]
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
    this._scrollOffset = this._getChosenIndex();
    this._build();
  }

  hide() {
    this.visible = false;
    this.destroy();
  }

  updateProgression(progression) {
    this.progression = progression;
    this.previewSpellId = null;
    if (this.visible) {
      this._destroyContent();
      this._buildContent();
      this._updateSP();
    }
  }

  updateTimer(remaining) {
    this.shopTimer = remaining;
    if (this._timerText && !this._timerText.destroyed) {
      const t = Math.ceil(remaining);
      this._timerText.setText(`${t}s`);
      this._timerText.setFill(t <= 5 ? COLOR.ACCENT_DANGER : COLOR.TEXT_ICE);
    }
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
    this._buildPanel();
    this._buildHeader();
    this._buildSlotTabs();
    this._buildContent();
  }

  // ═══════════════════════════════════════════════════════
  //  DIMMER
  // ═══════════════════════════════════════════════════════
  _buildDimmer() {
    const dimmer = createDimmer(this.scene, { depth: D, alpha: 0.45 });
    dimmer.setInteractive();
    this.chrome.push(dimmer);
  }

  // ═══════════════════════════════════════════════════════
  //  PANEL — centered panel1.png
  // ═══════════════════════════════════════════════════════
  _buildPanel() {
    const s = this.scene;
    const panel = s.add.image(PX, PY, 'ui-shop-panel')
      .setScrollFactor(0).setDepth(D + 1);
    this.chrome.push(panel);
  }

  // ═══════════════════════════════════════════════════════
  //  HEADER — title + SP + timer
  // ═══════════════════════════════════════════════════════
  _buildHeader() {
    const s = this.scene;
    const leftEdge = PX - HEADER_W / 2;
    const rightEdge = PX + HEADER_W / 2;

    // Title (centered)
    const title = createText(s, PX, HEADER_Y, 'HÜNER DÜKKÂNI', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.chrome.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 50, duration: 250 });

    // SP counter (left)
    const sp = this.progression ? this.progression.sp : 0;
    this._spText = createText(s, leftEdge + 10, HEADER_Y, `◆ ${sp}`, FONT.SMALL, {
      fill: COLOR.TEXT_ICE, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._spText);
    animateIn(s, this._spText, { from: 'slideDown', delay: 80, duration: 250 });

    // Timer (right)
    this._timerText = createText(s, rightEdge - 10, HEADER_Y, `${Math.ceil(this.shopTimer)}s`, FONT.SMALL, {
      fill: COLOR.TEXT_ICE, depth: D + 3, originX: 1,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._timerText);
    animateIn(s, this._timerText, { from: 'slideDown', delay: 80, duration: 250 });
  }

  // ═══════════════════════════════════════════════════════
  //  SLOT TABS
  // ═══════════════════════════════════════════════════════
  _buildSlotTabs() {
    const s = this.scene;
    const totalW = SLOTS.length * TAB_W + (SLOTS.length - 1) * TAB_GAP;
    const startX = PX - totalW / 2 + TAB_W / 2;

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = startX + i * (TAB_W + TAB_GAP);
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);

      const frame = isActive ? 1 : 0;
      const bg = s.add.sprite(cx, TAB_Y, 'ui-shop-btn', frame)
        .setDisplaySize(TAB_W, TAB_H).setScrollFactor(0).setDepth(D + 2);
      if (isActive) bg.setTint(SLOT_COLOR[slot].tint);
      else if (isLocked) { bg.setTint(0x607880); bg.setAlpha(0.35); }
      else bg.setAlpha(0.6);
      this.chrome.push(bg);

      const label = s.add.text(cx, TAB_Y, `${slot} ${SLOT_NAMES[slot]}`, textStyle(FONT.TINY, {
        fill: isActive ? COLOR.TEXT_LIGHT : (isLocked ? COLOR.TEXT_DISABLED : COLOR.TEXT_SECONDARY),
        fontStyle: 'bold',
        stroke: isActive ? '#000000' : undefined,
        strokeThickness: isActive ? 2 : 0,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5);
      this.chrome.push(label);

      const hit = s.add.rectangle(cx, TAB_Y, TAB_W, TAB_H)
        .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
        .setInteractive({ useHandCursor: !isLocked });
      hit.on('pointerdown', () => {
        if (this.activeSlot !== slot) {
          this._playSfx('sfx-move');
          this.activeSlot = slot;
          this.previewSpellId = null;
          this._scrollOffset = this._getChosenIndex();
          this._rebuildAll();
        }
      });
      this.chrome.push(hit);

      animateIn(s, bg, { from: 'scale', delay: 100 + i * 40, duration: 200 });
      animateIn(s, label, { from: 'scale', delay: 100 + i * 40, duration: 200 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CONTENT — rebuilt on tab switch / spell change
  // ═══════════════════════════════════════════════════════
  _buildContent() {
    const slot = this.activeSlot;
    if (this._isSlotLocked(slot)) {
      this._buildLockedContent();
      return;
    }
    this._buildSprite();
    this._buildInfo();
    this._buildSpellCard();
    this._buildCountdownBar();
    this._buildUpgrade();
    this._buildActionButton();
  }

  // ═══════════════════════════════════════════════════════
  //  ZONE 1 — FX Display Sprite (hero)
  // ═══════════════════════════════════════════════════════
  _buildSprite() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const displaySpellId = this._getDisplaySpellId();

    if (!displaySpellId) {
      // No spell — show slot letter placeholder
      const placeholder = createText(s, PX, SPRITE_Y, slot, {
        fontSize: '72px', fontFamily: FONT.FAMILY, fontStyle: 'bold',
      }, {
        fill: slotColor.hex, depth: D + 3,
        stroke: '#000000', strokeThickness: 4,
        alpha: 0.25,
      });
      this.content.push(placeholder);
      animateIn(s, placeholder, { from: 'scale', delay: 0, duration: 300 });
      return;
    }

    const def = SPELLS[displaySpellId];
    if (!def || !def.fx || !def.fx.sprite || !s.textures.exists(def.fx.sprite)) return;

    const dispSprite = def.fx.displaySprite && s.textures.exists(def.fx.displaySprite)
      ? def.fx.displaySprite : def.fx.sprite;
    const dispAnim = def.fx.displayAnimKey && s.anims.exists(def.fx.displayAnimKey)
      ? def.fx.displayAnimKey : def.fx.animKey;

    // Glow underneath
    const glowColor = def.fx.color || slotColor.tint;
    const glow = s.add.graphics().setDepth(D + 2).setScrollFactor(0);
    glow.fillStyle(0x000000, 0.2);
    glow.fillEllipse(PX, SPRITE_Y + 30, 60, 14);
    glow.fillStyle(glowColor, 0.15);
    glow.fillEllipse(PX, SPRITE_Y + 26, 90, 22);
    this.content.push(glow);

    // Animated sprite
    const fxSprite = s.add.sprite(PX, SPRITE_Y, dispSprite, 0)
      .setScale(def.fx.scale ? def.fx.scale * 4.0 : 4.0)
      .setDepth(D + 3).setScrollFactor(0);
    if (dispAnim && s.anims.exists(dispAnim)) fxSprite.play(dispAnim);
    this.content.push(fxSprite);
    animateIn(s, fxSprite, { from: 'scale', delay: 50, duration: 300 });
  }

  // ═══════════════════════════════════════════════════════
  //  ZONE 2 — Spell Info (name + description + stats)
  // ═══════════════════════════════════════════════════════
  _buildInfo() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;

    const previewId = this.previewSpellId;
    const isPreviewingDifferent = previewId && previewId !== chosenSpellId;
    const displaySpellId = this._getDisplaySpellId();

    // Empty state
    if (!displaySpellId) {
      const prompt = createText(s, PX, INFO_Y + 20, 'Bir hüner seç', FONT.BODY_BOLD, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(prompt);
      animateIn(s, prompt, { from: 'fadeOnly', delay: 200, duration: 250 });

      const hint = createText(s, PX, INFO_Y + 46, `(${SP.SPELL_CHOICE_COST} İlham)`, FONT.SMALL, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
      });
      this.content.push(hint);
      return;
    }

    const def = SPELLS[displaySpellId];
    const tree = SKILL_TREES[displaySpellId];
    if (!def || !tree) return;

    const displayTier = isPreviewingDifferent ? 0 : currentTier;
    const stats = computeSpellStats(displaySpellId, displayTier);
    let y = INFO_Y;

    // Spell name
    const nameColor = isPreviewingDifferent ? COLOR.ACCENT_INFO : slotColor.hex;
    const spellName = createText(s, PX, y, def.name, FONT.BODY_BOLD, {
      fill: nameColor, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.content.push(spellName);
    animateIn(s, spellName, { from: 'slideUp', delay: 100, duration: 200 });
    y += 24;

    // Description
    if (def.description) {
      const desc = s.add.text(PX, y, def.description, textStyle(FONT.SMALL, {
        fill: COLOR.TEXT_SECONDARY,
        wordWrap: { width: CONTENT_W },
        align: 'center',
        strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(desc);
      animateIn(s, desc, { from: 'fadeOnly', delay: 150, duration: 200 });
      y += desc.height + 6;
    }

    // Stats (horizontal line)
    const visibleStats = STAT_DEFS.filter(sd => stats[sd.key] != null && stats[sd.key] !== 0);
    if (visibleStats.length > 0) {
      const statParts = visibleStats.slice(0, 5).map(sd => `${sd.label}: ${sd.fmt(stats[sd.key])}`);
      const statLine = s.add.text(PX, y, statParts.join('   '), textStyle(FONT.TINY, {
        fill: COLOR.TEXT_SECONDARY,
        align: 'center',
        wordWrap: { width: CONTENT_W },
        strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(statLine);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ZONE 3 — Single Spell Card with < > Arrows
  // ═══════════════════════════════════════════════════════
  _buildSpellCard() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const isAutoEquipped = spellState ? spellState.autoEquipped : false;
    const isFirstChoice = chosenSpellId === null || isAutoEquipped;
    const availableSpells = SLOT_SPELLS[slot] || [];
    const total = availableSpells.length;
    if (total === 0) return;

    // Clamp scroll offset
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, total - 1));

    const spellId = availableSpells[this._scrollOffset];
    const def = SPELLS[spellId];
    if (!def) return;

    const isChosen = chosenSpellId === spellId;
    const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
    const dimmed = !isChosen && !canAfford;

    // ── Card background ──
    const cardBg = s.add.image(PX, SPELL_Y, 'ui-shop-card')
      .setDisplaySize(CARD_W, CARD_H)
      .setScrollFactor(0).setDepth(D + 3)
      .setAlpha(dimmed ? 0.4 : 0.85);
    if (dimmed) cardBg.setTint(0x607880);
    this.content.push(cardBg);

    // Selection border
    if (isChosen) {
      const border = s.add.graphics().setDepth(D + 2).setScrollFactor(0);
      border.lineStyle(2, COLOR.TINT_GOLD, 0.9);
      border.strokeRoundedRect(PX - CARD_W / 2 - 2, SPELL_Y - CARD_H / 2 - 2, CARD_W + 4, CARD_H + 4, 4);
      this.content.push(border);
      s.tweens.add({ targets: border, alpha: { from: 0.5, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // Spell icon (left side)
    const iconX = PX - CARD_W / 2 + 28;
    if (def.icon && s.textures.exists(def.icon)) {
      const icon = s.add.image(iconX, SPELL_Y, def.icon)
        .setScrollFactor(0).setDepth(D + 4);
      const sc = 32 / Math.max(icon.width, icon.height);
      icon.setScale(sc);
      if (dimmed) icon.setAlpha(0.5);
      this.content.push(icon);
    }

    // Spell name (right of icon)
    const nameX = iconX + 28;
    const nameColor = isChosen ? SLOT_COLOR[slot].hex : COLOR.TEXT_SECONDARY;
    const name = s.add.text(nameX, SPELL_Y, def.name, textStyle(FONT.SMALL, {
      fill: nameColor, stroke: '#000000', strokeThickness: 2,
    })).setScrollFactor(0).setDepth(D + 4).setOrigin(0, 0.5);
    if (dimmed) name.setAlpha(0.5);
    this.content.push(name);

    // Cost badge (right side, first choice only)
    if (!isChosen && isFirstChoice) {
      const costBadge = s.add.text(PX + CARD_W / 2 - 10, SPELL_Y,
        `${SP.SPELL_CHOICE_COST}◆`, textStyle(FONT.TINY, {
          fill: canAfford ? COLOR.ACCENT_INFO : COLOR.TEXT_DISABLED,
          strokeThickness: 2,
        })
      ).setScrollFactor(0).setDepth(D + 5).setOrigin(1, 0.5);
      this.content.push(costBadge);
    }

    // Card hit area — clicking selects/previews this spell
    const cardHit = s.add.rectangle(PX, SPELL_Y, CARD_W, CARD_H)
      .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
      .setInteractive({ useHandCursor: !isChosen && canAfford });
    this.content.push(cardHit);

    if (!isChosen && canAfford) {
      cardHit.on('pointerover', () => { cardBg.setAlpha(1); cardBg.setTint(COLOR.TINT_HOVER); });
      cardHit.on('pointerout', () => { cardBg.setAlpha(0.85); cardBg.clearTint(); });
      cardHit.on('pointerdown', () => {
        this._playSfx('sfx-move');
        this.previewSpellId = spellId;
        this._destroyContent();
        this._buildContent();
      });
    }

    // ── Left/Right Arrows ──
    const arrowGap = 24;
    const arrowLeftX = PX - CARD_W / 2 - arrowGap;
    const arrowRightX = PX + CARD_W / 2 + arrowGap;
    const canGoLeft = this._scrollOffset > 0;
    const canGoRight = this._scrollOffset < total - 1;

    // Left arrow
    const leftArrow = s.add.graphics().setDepth(D + 5).setScrollFactor(0);
    leftArrow.fillStyle(canGoLeft ? 0xb8e4f0 : 0x607880, canGoLeft ? 0.8 : 0.25);
    leftArrow.fillTriangle(arrowLeftX + 8, SPELL_Y - 10, arrowLeftX + 8, SPELL_Y + 10, arrowLeftX - 4, SPELL_Y);
    this.content.push(leftArrow);
    if (canGoLeft) {
      const leftHit = s.add.rectangle(arrowLeftX, SPELL_Y, 28, 32)
        .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
        .setInteractive({ useHandCursor: true });
      leftHit.on('pointerdown', () => {
        this._playSfx('sfx-move');
        this._scrollOffset--;
        this.previewSpellId = null;
        this._destroyContent();
        this._buildContent();
      });
      this.content.push(leftHit);
    }

    // Right arrow
    const rightArrow = s.add.graphics().setDepth(D + 5).setScrollFactor(0);
    rightArrow.fillStyle(canGoRight ? 0xb8e4f0 : 0x607880, canGoRight ? 0.8 : 0.25);
    rightArrow.fillTriangle(arrowRightX - 8, SPELL_Y - 10, arrowRightX - 8, SPELL_Y + 10, arrowRightX + 4, SPELL_Y);
    this.content.push(rightArrow);
    if (canGoRight) {
      const rightHit = s.add.rectangle(arrowRightX, SPELL_Y, 28, 32)
        .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
        .setInteractive({ useHandCursor: true });
      rightHit.on('pointerdown', () => {
        this._playSfx('sfx-move');
        this._scrollOffset++;
        this.previewSpellId = null;
        this._destroyContent();
        this._buildContent();
      });
      this.content.push(rightHit);
    }

    // Page indicator: "1 / 3"
    const pageText = s.add.text(PX, SPELL_Y + CARD_H / 2 + 10,
      `${this._scrollOffset + 1} / ${total}`, textStyle(FONT.TINY, {
        fill: COLOR.TEXT_DISABLED, strokeThickness: 2,
      })
    ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
    this.content.push(pageText);

    // Entrance animation
    animateIn(s, cardBg, { from: 'scale', delay: 200, duration: 200 });
  }

  // ═══════════════════════════════════════════════════════
  //  ZONE 4 — Countdown Bar
  // ═══════════════════════════════════════════════════════
  _buildCountdownBar() {
    const s = this.scene;
    const barX = PX - TBAR_W / 2;
    const ratio = Math.max(0, this.shopTimer / this.shopDuration);
    const bar = createBar(s, barX, TBAR_Y, TBAR_W, 5, {
      depth: D + 2,
      tint: this.shopTimer <= 5 ? COLOR.TINT_DANGER : COLOR.TINT_INFO,
      value: ratio,
    });
    this._timerBar = bar;
    this.content.push(...bar.elements);
    bar.elements.forEach(el => animateIn(s, el, { from: 'fadeOnly', delay: 300, duration: 250 }));
  }

  // ═══════════════════════════════════════════════════════
  //  ZONE 5 — Upgrade / Tier Info
  // ═══════════════════════════════════════════════════════
  _buildUpgrade() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;
    const previewId = this.previewSpellId;
    const isPreviewingDifferent = previewId && previewId !== chosenSpellId;

    // Only show upgrade info for chosen spell (not when previewing a different one)
    if (!chosenSpellId || isPreviewingDifferent) return;

    const maxTier = getMaxTier(chosenSpellId);
    let y = UPGRADE_Y;

    // Tier dots + label
    const dotSize = 10;
    const dotGap = 5;
    const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;

    // "Pâye 1/4" label + dots on same line
    const tierLabel = s.add.text(PX - dotsW / 2 - 10, y, `Pâye ${currentTier}/${maxTier}`, textStyle(FONT.TINY, {
      fill: COLOR.ACCENT_GOLD, strokeThickness: 2,
    })).setScrollFactor(0).setDepth(D + 3).setOrigin(1, 0.5);
    this.content.push(tierLabel);

    const dotStartX = PX - dotsW / 2 + dotSize / 2;
    for (let t = 0; t < maxTier; t++) {
      const filled = t < currentTier;
      const dx = dotStartX + t * (dotSize + dotGap);
      const dot = s.add.graphics().setDepth(D + 3).setScrollFactor(0);
      dot.fillStyle(filled ? slotColor.tint : 0x334455, filled ? 0.9 : 0.5);
      dot.fillCircle(dx, y, dotSize / 2);
      this.content.push(dot);
    }

    // Next tier mods
    const nextTier = getNextTierInfo(chosenSpellId, currentTier);
    if (nextTier) {
      const modText = Object.entries(nextTier.mods)
        .map(([k, v]) => typeof v === 'boolean'
          ? `${MOD_LABELS[k] || k}: ${v ? 'evet' : 'hayır'}`
          : `${MOD_LABELS[k] || k}: ${v > 0 ? '+' : ''}${v}`)
        .join(', ');
      if (modText) {
        const mods = s.add.text(PX, y + 14, `Sonraki: ${modText}`, textStyle(FONT.TINY, {
          fill: COLOR.ACCENT_INFO, wordWrap: { width: CONTENT_W }, align: 'center', strokeThickness: 2,
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.content.push(mods);
      }
    } else if (currentTier >= maxTier) {
      const badge = createText(s, PX, y + 10, '★ EN ÜST PÂYE ★', FONT.TINY, {
        fill: COLOR.ACCENT_GOLD, depth: D + 3, stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(badge);
      s.tweens.add({ targets: badge, alpha: { from: 0.6, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ZONE 6 — Action Button (Seç / Pişir / none)
  // ═══════════════════════════════════════════════════════
  _buildActionButton() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;
    const isAutoEquipped = spellState ? spellState.autoEquipped : false;
    const isFirstChoice = chosenSpellId === null || isAutoEquipped;

    const previewId = this.previewSpellId;
    const isPreviewingDifferent = previewId && previewId !== chosenSpellId;

    // Get the currently viewed spell from the carousel
    const availableSpells = SLOT_SPELLS[slot] || [];
    const viewedSpellId = availableSpells[this._scrollOffset];

    if (isPreviewingDifferent) {
      // ── Preview mode: "Seç" button ──
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
      const costLabel = isFirstChoice ? ` (${SP.SPELL_CHOICE_COST}◆)` : '';
      const { elements: btnEls } = createTexturedButton(s, PX, BTN_Y, `Seç${costLabel}`, 'ui-shop-btn', {
        width: BTN_W, height: BTN_H, depth: D + 4, enabled: canAfford,
        onClick: () => {
          this._playSfx('sfx-accept');
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, previewId);
          }
        },
      });
      this.content.push(...btnEls);
      btnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 350, duration: 200 }));

      // Tier reset warning
      if (!isFirstChoice && currentTier > 0) {
        const warn = createText(s, PX, BTN_Y - 24, '⚠ pâye sıfırlanır', FONT.TINY, {
          fill: COLOR.ACCENT_DANGER, depth: D + 4,
        });
        this.content.push(warn);
      }

    } else if (viewedSpellId && viewedSpellId !== chosenSpellId) {
      // Viewing an unchosen spell in the carousel — show "Seç" to pick it
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
      const costLabel = isFirstChoice ? ` (${SP.SPELL_CHOICE_COST}◆)` : '';
      const { elements: btnEls } = createTexturedButton(s, PX, BTN_Y, `Seç${costLabel}`, 'ui-shop-btn', {
        width: BTN_W, height: BTN_H, depth: D + 4, enabled: canAfford,
        onClick: () => {
          this._playSfx('sfx-accept');
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, viewedSpellId);
          }
        },
      });
      this.content.push(...btnEls);
      btnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 350, duration: 200 }));

      if (!isFirstChoice && currentTier > 0) {
        const warn = createText(s, PX, BTN_Y - 24, '⚠ pâye sıfırlanır', FONT.TINY, {
          fill: COLOR.ACCENT_DANGER, depth: D + 4,
        });
        this.content.push(warn);
      }

    } else if (chosenSpellId) {
      // ── Chosen spell: "Pişir" upgrade button ──
      const nextTier = getNextTierInfo(chosenSpellId, currentTier);
      if (nextTier) {
        const cost = nextTier.cost;
        const canUpgrade = prog && prog.sp >= cost;
        const { elements: btnEls } = createTexturedButton(s, PX, BTN_Y, `Pişir (${cost}◆)`, 'ui-shop-btn', {
          width: BTN_W, height: BTN_H, depth: D + 4, enabled: canUpgrade,
          onClick: () => {
            this._playSfx('sfx-accept');
            if (s.network && s.network.connected) {
              s.network.sendShopUpgradeTier(slot);
            }
          },
        });
        this.content.push(...btnEls);
        btnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 350, duration: 200 }));
      }
      // Max tier = no button
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
    if (s.textures.exists('spell-BookDarkness-off')) {
      const lockIcon = s.add.image(PX, SPRITE_Y - 10, 'spell-BookDarkness-off')
        .setDisplaySize(48, 48).setScrollFactor(0).setDepth(D + 3);
      this.content.push(lockIcon);
      animateIn(s, lockIcon, { from: 'scale', delay: 200, duration: 250 });
    }

    const label = createText(s, PX, SPRITE_Y + 30, `${SLOT_NAMES[slot]} — KİLİTLİ`, FONT.BODY_BOLD, {
      fill: COLOR.TEXT_DISABLED, depth: D + 3,
      stroke: '#000000', strokeThickness: 2,
    });
    this.content.push(label);
    animateIn(s, label, { from: 'slideUp', delay: 250, duration: 250 });

    const costLabel = createText(s, PX, SPRITE_Y + 56, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: D + 3,
    });
    this.content.push(costLabel);
    animateIn(s, costLabel, { from: 'fadeOnly', delay: 300, duration: 250 });

    // Countdown bar
    this._buildCountdownBar();

    // Unlock button
    const canUnlock = prog && prog.sp >= SP.SLOT_UNLOCK_COST;
    const { elements: btnEls } = createTexturedButton(s, PX, BTN_Y, `Kilidi Aç (${SP.SLOT_UNLOCK_COST}◆)`, 'ui-shop-btn', {
      width: BTN_W + 40, height: BTN_H, depth: D + 4, enabled: canUnlock,
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

  /** Get the spell ID currently being displayed (preview or chosen or carousel current) */
  _getDisplaySpellId() {
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;

    // If previewing a specific spell, show that
    if (this.previewSpellId) return this.previewSpellId;

    // Otherwise show whatever the carousel is pointing at
    const availableSpells = SLOT_SPELLS[slot] || [];
    const idx = Math.max(0, Math.min(this._scrollOffset, availableSpells.length - 1));
    return availableSpells[idx] || chosenSpellId;
  }

  /** Get the index of the chosen spell in the slot's spell list */
  _getChosenIndex() {
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    if (!chosenSpellId) return 0;
    const availableSpells = SLOT_SPELLS[slot] || [];
    const idx = availableSpells.indexOf(chosenSpellId);
    return idx >= 0 ? idx : 0;
  }

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

  _updateSP() {
    const sp = this.progression ? this.progression.sp : 0;
    if (this._spText && !this._spText.destroyed) {
      this._spText.setText(`◆ ${sp}`);
      const s = this.scene;
      if (s.tweens) {
        s.tweens.add({ targets: this._spText, scaleX: 1.3, scaleY: 1.3, duration: 100, yoyo: true, ease: 'Sine.easeOut' });
      }
    }
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
    this._timerBar = null;
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
  }
}
