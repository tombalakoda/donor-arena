/**
 * ShopOverlay.js — Three-column sprite-based spell shop.
 *
 * Layout (1280×720):
 *   HEADER     — title + SP counter + timer (no tabs)
 *   LEFT COL   — panel2: Spell animation on top + Tier / Upgrade below
 *   CENTER COL — Q/W/E/R slot buttons + Spell carousel (icy frame + name) + arrows
 *   RIGHT COL  — panel2: Spell info (name + desc + stats)
 *
 * All UI built from sprite assets — no Graphics-drawn rectangles.
 */

import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { COLOR, FONT, SPACE, DEPTH, ALPHA, SLOT_COLOR, SCREEN, textStyle } from './UIConfig.js';
import { createBar, createDimmer, createText, createTexturedButton, animateIn } from './UIHelpers.js';
import { getSfxVolume } from '../config.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const CX = SCREEN.CX;               // 640
const CY = SCREEN.CY;               // 360
const SLOTS = ['Q', 'W', 'E', 'R'];
const SLOT_NAMES = { Q: 'SÖZ', W: 'EL', E: 'DİL', R: 'BEL' };

// Shop uses Press Start 2P everywhere, white text
const SHOP_FONT = FONT.FAMILY_HEADING;
const SHOP_WHITE = '#FFFFFF';

// ─── Layout coordinates ─────────────────────────────────
// Header (just title + SP + timer, no tabs)
const HEADER_Y = 36;
const HEADER_W = 800;

// Three columns — panel2 native size: 229×329
const PANEL_W  = 229;
const PANEL_H  = 329;
const COL_Y    = 385;              // vertical center of content area

// Left column (Spell display + Tier)
const LEFT_X   = 190;

// Center column (Tabs + Carousel)
const MID_X    = CX;              // 640

// Center: Slot tab buttons
const SLOT_BTN_Y = 185;           // Y for Q/W/E/R buttons in center
const SLOT_BTN_W = 120;
const SLOT_BTN_H = 34;
const SLOT_BTN_GAP = 10;

// Right column (Spell Info)
const RIGHT_X  = 1070;

// Icy frame native: 111×138 per frame (2 frames in spritesheet)
const FRAME_W  = 111;
const FRAME_H  = 138;

// Arrow button sizes (ui-shop-btn rotated 90°)
const ARROW_W  = 76;
const ARROW_H  = 38;

// Countdown bar (bottom of screen)
const TBAR_Y   = 690;
const TBAR_W   = 700;

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
    this.chrome = [];     // persistent: dimmer, header
    this.content = [];    // rebuilt on tab switch / spell change
    this.previewSpellId = null;
    this._timerText = null;
    this._spText = null;
    this._timerBar = null;
    this._scrollOffset = 0;
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC API (same contract as before)
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
      this._timerText.setFill('#FFFFFF');
      // Pulse effect when low time
      if (t <= 5 && this.scene.tweens) {
        this.scene.tweens.addCounter({ from: 1.3, to: 1, duration: 200, ease: 'Sine.easeOut',
          onUpdate: (tw) => { if (this._timerText && !this._timerText.destroyed) this._timerText.setScale(tw.getValue()); }
        });
      }
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
    this._buildHeader();
    this._buildCountdownBar();
    this._buildContent();
  }

  // ═══════════════════════════════════════════════════════
  //  DIMMER
  // ═══════════════════════════════════════════════════════
  _buildDimmer() {
    const dimmer = createDimmer(this.scene, { depth: D, alpha: 0.85 });
    dimmer.setInteractive();
    this.chrome.push(dimmer);
  }

  // ═══════════════════════════════════════════════════════
  //  HEADER — title + SP + timer (no tabs here)
  // ═══════════════════════════════════════════════════════
  _buildHeader() {
    const s = this.scene;
    const leftEdge = CX - HEADER_W / 2;
    const rightEdge = CX + HEADER_W / 2;

    // Title (centered, pixel font)
    const title = createText(s, CX, HEADER_Y, 'HÜNER DÜKKÂNI', FONT.H2, {
      fill: SHOP_WHITE, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.chrome.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 50, duration: 250 });

    // SP counter (left)
    const sp = this.progression ? this.progression.sp : 0;
    this._spText = createText(s, leftEdge + 10, HEADER_Y, `◆ ${sp}`, FONT.H3, {
      fill: SHOP_WHITE, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._spText);
    animateIn(s, this._spText, { from: 'slideDown', delay: 80, duration: 250 });

    // Timer (right)
    this._timerText = createText(s, rightEdge - 10, HEADER_Y, `${Math.ceil(this.shopTimer)}s`, FONT.H3, {
      fill: SHOP_WHITE, depth: D + 3, originX: 1,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._timerText);
    animateIn(s, this._timerText, { from: 'slideDown', delay: 80, duration: 250 });
  }

  // ═══════════════════════════════════════════════════════
  //  COUNTDOWN BAR — bottom of screen (persistent chrome)
  // ═══════════════════════════════════════════════════════
  _buildCountdownBar() {
    const s = this.scene;
    const barX = CX - TBAR_W / 2;
    const ratio = Math.max(0, this.shopTimer / this.shopDuration);
    const bar = createBar(s, barX, TBAR_Y, TBAR_W, 6, {
      depth: D + 2,
      tint: this.shopTimer <= 5 ? COLOR.TINT_DANGER : COLOR.TINT_INFO,
      value: ratio,
    });
    this._timerBar = bar;
    this.chrome.push(...bar.elements);
    bar.elements.forEach(el => animateIn(s, el, { from: 'fadeOnly', delay: 300, duration: 250 }));
  }

  // ═══════════════════════════════════════════════════════
  //  CONTENT — rebuilt on tab switch / spell change
  // ═══════════════════════════════════════════════════════
  _buildContent() {
    // Always build center slot tabs (they're content, rebuilt on switch)
    this._buildSlotTabs();

    const slot = this.activeSlot;
    if (this._isSlotLocked(slot)) {
      this._buildLockedContent();
      return;
    }
    this._buildLeftColumn();
    this._buildCenterCarousel();
    this._buildRightColumn();
  }

  // ═══════════════════════════════════════════════════════
  //  CENTER: SLOT TABS — Q/W/E/R as sprite buttons
  // ═══════════════════════════════════════════════════════
  _buildSlotTabs() {
    const s = this.scene;
    const totalW = SLOTS.length * SLOT_BTN_W + (SLOTS.length - 1) * SLOT_BTN_GAP;
    const startX = MID_X - totalW / 2 + SLOT_BTN_W / 2;

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const cx = startX + i * (SLOT_BTN_W + SLOT_BTN_GAP);
      const isActive = slot === this.activeSlot;
      const isLocked = this._isSlotLocked(slot);

      // Button sprite background
      const frame = isActive ? 1 : 0;
      const bg = s.add.sprite(cx, SLOT_BTN_Y, 'ui-shop-btn', frame)
        .setDisplaySize(SLOT_BTN_W, SLOT_BTN_H).setScrollFactor(0).setDepth(D + 2);
      if (isActive) bg.setTint(SLOT_COLOR[slot].tint);
      else if (isLocked) { bg.setTint(0x607880); bg.setAlpha(0.35); }
      else bg.setAlpha(0.65);
      this.content.push(bg);

      // Label text
      const label = s.add.text(cx, SLOT_BTN_Y, `${slot}  ${SLOT_NAMES[slot]}`, textStyle({ fontSize: '12px', fontFamily: SHOP_FONT }, {
        fill: isActive ? SHOP_WHITE : (isLocked ? '#888888' : '#CCCCCC'),
        stroke: '#000000',
        strokeThickness: isActive ? 3 : 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5);
      this.content.push(label);

      // Hit area
      const hit = s.add.rectangle(cx, SLOT_BTN_Y, SLOT_BTN_W, SLOT_BTN_H)
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
      this.content.push(hit);

      animateIn(s, bg, { from: 'scale', delay: 100 + i * 40, duration: 200 });
      animateIn(s, label, { from: 'scale', delay: 100 + i * 40, duration: 200 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  LEFT COLUMN — Spell Animation + Tier / Upgrade (panel2)
  // ═══════════════════════════════════════════════════════
  //  LEFT COLUMN — Icy Frame Carousel + Tier / Upgrade (panel2)
  // ═══════════════════════════════════════════════════════
  _buildLeftColumn() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;
    const isAutoEquipped = spellState ? spellState.autoEquipped : false;
    const isFirstChoice = chosenSpellId === null || isAutoEquipped;

    const availableSpells = SLOT_SPELLS[slot] || [];
    const total = availableSpells.length;
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, total - 1));
    const spellId = total > 0 ? availableSpells[this._scrollOffset] : null;
    const browseDef = spellId ? SPELLS[spellId] : null;
    const isChosen = chosenSpellId === spellId;

    // Panel background sprite
    const panel = s.add.image(LEFT_X, COL_Y, 'ui-panel2')
      .setScrollFactor(0).setDepth(D + 1);
    this.content.push(panel);
    animateIn(s, panel, { from: 'scale', delay: 50, duration: 300 });

    const panelTop = COL_Y - PANEL_H / 2;
    const panelBot = COL_Y + PANEL_H / 2;

    // ── TOP ZONE: Icy frame with spell icon + name ──
    const frameY = panelTop + 80;
    const LEFT_FRAME_SCALE = 1.3;
    const LEFT_ICON_SIZE = 110; // icon display size

    if (browseDef) {
      const frameIdx = isChosen ? 1 : 0;

      // Spell icon first (behind frame overlay) — 160×160 display
      // Subtle icy tint to blend with the frost frame
      const iconKey = browseDef.icon;
      if (iconKey && s.textures.exists(iconKey)) {
        const icon = s.add.image(LEFT_X, frameY - 8, iconKey)
          .setDisplaySize(LEFT_ICON_SIZE, LEFT_ICON_SIZE)
          .setScrollFactor(0).setDepth(D + 2)
          .setTint(0xd8eeff);
        this.content.push(icon);
        animateIn(s, icon, { from: 'scale', delay: 80, duration: 250 });
      }

      // Frame2 overlay on top (transparent center, border only)
      const frame = s.add.sprite(LEFT_X, frameY, 'ui-frame-icy2', frameIdx)
        .setScale(LEFT_FRAME_SCALE)
        .setScrollFactor(0).setDepth(D + 3);
      if (isChosen) frame.setTint(slotColor.tint);
      this.content.push(frame);
      animateIn(s, frame, { from: 'scale', delay: 80, duration: 250 });

      // Chosen indicator
      if (isChosen) {
        const chosenLabel = createText(s, LEFT_X, frameY + FRAME_H * LEFT_FRAME_SCALE / 2 + 6, '— seçili —',
          { fontSize: '10px', fontFamily: SHOP_FONT }, {
          fill: SHOP_WHITE, depth: D + 3,
          stroke: '#000000', strokeThickness: 2,
        });
        this.content.push(chosenLabel);
        s.tweens.add({ targets: chosenLabel, alpha: { from: 0.5, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    } else {
      // No spells — slot letter placeholder
      const placeholder = createText(s, LEFT_X, frameY, slot, {
        fontSize: '48px', fontFamily: SHOP_FONT,
      }, {
        fill: SHOP_WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 4,
        alpha: 0.25,
      });
      this.content.push(placeholder);
    }

    // ── Arrow buttons (left/right of frame) ──
    if (total > 1) {
      const arrowOffsetX = FRAME_W * LEFT_FRAME_SCALE / 2 + 24;
      const canGoLeft = this._scrollOffset > 0;
      const canGoRight = this._scrollOffset < total - 1;

      this._buildArrowButton(LEFT_X - arrowOffsetX, frameY, -90, canGoLeft, () => {
        this._playSfx('sfx-move');
        this._scrollOffset--;
        this.previewSpellId = null;
        this._destroyContent();
        this._buildContent();
      });

      this._buildArrowButton(LEFT_X + arrowOffsetX, frameY, 90, canGoRight, () => {
        this._playSfx('sfx-move');
        this._scrollOffset++;
        this.previewSpellId = null;
        this._destroyContent();
        this._buildContent();
      });
    }

    // ── Page indicator ──
    if (total > 0) {
      const pageY = frameY + FRAME_H * LEFT_FRAME_SCALE / 2 + (isChosen ? 22 : 6);
      const pageText = s.add.text(LEFT_X, pageY,
        `${this._scrollOffset + 1} / ${total}`, textStyle({ fontSize: '10px', fontFamily: SHOP_FONT }, {
          fill: SHOP_WHITE, strokeThickness: 2,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(pageText);
    }

    // ── BOTTOM ZONE: Tier info + action button ──
    let y = panelTop + 200;

    // If no spell chosen yet, show prompt (but continue to build button below)
    if (!chosenSpellId) {
      const prompt = createText(s, LEFT_X, y, 'Bir hüner seç', { fontSize: '12px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(prompt);
      const hint = createText(s, LEFT_X, y + 28, `(${SP.SPELL_CHOICE_COST} İlham)`, { fontSize: '10px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE, depth: D + 3,
      });
      this.content.push(hint);
    }

    // Tier info only shown when a spell is already chosen
    let nextTier = null;
    if (chosenSpellId) {
      // Tier progress label
      const maxTier = getMaxTier(chosenSpellId);
      const tierLabel = createText(s, LEFT_X, y, `Pâye ${currentTier}/${maxTier}`, { fontSize: '10px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(tierLabel);
      y += 20;

      // Tier dots
      const dotSize = 10;
      const dotGap = 6;
      const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;
      const dotStartX = LEFT_X - dotsW / 2 + dotSize / 2;
      for (let t = 0; t < maxTier; t++) {
        const filled = t < currentTier;
        const dx = dotStartX + t * (dotSize + dotGap);
        const dot = s.add.graphics().setDepth(D + 3).setScrollFactor(0);
        dot.fillStyle(filled ? slotColor.tint : 0x334455, filled ? 0.9 : 0.5);
        dot.fillCircle(dx, y, dotSize / 2);
        if (filled) {
          dot.lineStyle(1, 0xffffff, 0.3);
          dot.strokeCircle(dx, y, dotSize / 2);
        }
        this.content.push(dot);
      }
      y += 22;

      // Next tier mods
      nextTier = getNextTierInfo(chosenSpellId, currentTier);
      if (nextTier) {
        const modEntries = Object.entries(nextTier.mods);
        const modLines = modEntries.slice(0, 4).map(([k, v]) =>
          typeof v === 'boolean'
            ? `${MOD_LABELS[k] || k}: ${v ? 'evet' : 'hayır'}`
            : `${MOD_LABELS[k] || k}: ${v > 0 ? '+' : ''}${v}`
        );
        for (const line of modLines) {
          const modText = s.add.text(LEFT_X, y, line, textStyle({ fontSize: '10px', fontFamily: SHOP_FONT }, {
            fill: SHOP_WHITE,
            strokeThickness: 2,
          })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
          this.content.push(modText);
          y += 18;
        }
      } else if (currentTier >= maxTier) {
        const badge = createText(s, LEFT_X, y, '★ EN ÜST PÂYE ★', { fontSize: '10px', fontFamily: SHOP_FONT }, {
          fill: SHOP_WHITE, depth: D + 3,
          stroke: '#000000', strokeThickness: 2,
        });
        this.content.push(badge);
        s.tweens.add({ targets: badge, alpha: { from: 0.6, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        y += 22;
      }
    }

    // ── Action Button (bottom of left panel) ──
    const btnY = panelBot - 50;

    const viewedSpellId = availableSpells[this._scrollOffset];
    const previewId = this.previewSpellId;
    const isPreviewingDifferent = previewId && previewId !== chosenSpellId;
    const isViewingDifferent = viewedSpellId && viewedSpellId !== chosenSpellId;

    if (isPreviewingDifferent || isViewingDifferent) {
      const targetSpell = isPreviewingDifferent ? previewId : viewedSpellId;
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
      const costLabel = isFirstChoice ? ` (${SP.SPELL_CHOICE_COST}◆)` : '';
      const { elements: btnEls } = createTexturedButton(s, LEFT_X, btnY, `Seç${costLabel}`, 'ui-shop-btn', {
        width: 180, height: 36, depth: D + 4, enabled: canAfford,
        fontToken: { fontSize: '12px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playSfx('sfx-accept');
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, targetSpell);
          }
        },
      });
      this.content.push(...btnEls);
      btnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 350, duration: 200 }));

      if (!isFirstChoice && currentTier > 0) {
        const warn = createText(s, LEFT_X, btnY - 20, '⚠ pâye sıfırlanır', { fontSize: '10px', fontFamily: SHOP_FONT }, {
          fill: SHOP_WHITE, depth: D + 4,
        });
        this.content.push(warn);
      }
    } else if (chosenSpellId && nextTier) {
      const cost = nextTier.cost;
      const canUpgrade = prog && prog.sp >= cost;
      const { elements: btnEls } = createTexturedButton(s, LEFT_X, btnY, `Pişir (${cost}◆)`, 'ui-shop-btn', {
        width: 180, height: 36, depth: D + 4, enabled: canUpgrade,
        fontToken: { fontSize: '12px', fontFamily: SHOP_FONT },
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
  }

  // ═══════════════════════════════════════════════════════
  //  CENTER — Spell Animation Showcase
  // ═══════════════════════════════════════════════════════
  _buildCenterCarousel() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const displaySpellId = this._getDisplaySpellId();

    const animY = COL_Y - 20;

    if (displaySpellId) {
      // Big animated spell FX in the center — the visual star of the shop
      this._buildSpellAnimation(MID_X, animY, displaySpellId, 5.0, 2.5);

      // Spell name below the animation
      const def = SPELLS[displaySpellId];
      if (def) {
        const nameY = animY + 70;
        const nameText = createText(s, MID_X, nameY, def.name, FONT.H2, {
          fill: SHOP_WHITE, depth: D + 3,
          stroke: '#000000', strokeThickness: 4,
        });
        this.content.push(nameText);
        animateIn(s, nameText, { from: 'fadeOnly', delay: 150, duration: 250 });

        // Short description
        if (def.description) {
          const descText = s.add.text(MID_X, nameY + 24, def.description, textStyle({ fontSize: '10px', fontFamily: SHOP_FONT }, {
            fill: SHOP_WHITE,
            wordWrap: { width: 300 },
            align: 'center',
            strokeThickness: 2,
          })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
          this.content.push(descText);
          animateIn(s, descText, { from: 'fadeOnly', delay: 200, duration: 250 });
        }
      }
    } else {
      // No spell — show slot letter placeholder
      const placeholder = createText(s, MID_X, animY, slot, {
        fontSize: '64px', fontFamily: SHOP_FONT,
      }, {
        fill: SHOP_WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 4,
        alpha: 0.2,
      });
      this.content.push(placeholder);
    }

    // ── Hint text at bottom of center ──
    const hintY = COL_Y + PANEL_H / 2 - 10;
    const hint = s.add.text(MID_X, hintY,
      'Q / W / E / R ile hünerlerini göster', textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE,
        strokeThickness: 2,
      })
    ).setScrollFactor(0).setDepth(D + 2).setOrigin(0.5, 0);
    this.content.push(hint);
  }

  // ═══════════════════════════════════════════════════════
  //  RIGHT COLUMN — Spell Info (panel2) — unchanged
  // ═══════════════════════════════════════════════════════
  _buildRightColumn() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;

    const displaySpellId = this._getDisplaySpellId();

    // Panel background sprite
    const panel = s.add.image(RIGHT_X, COL_Y, 'ui-panel2')
      .setScrollFactor(0).setDepth(D + 1);
    this.content.push(panel);
    animateIn(s, panel, { from: 'scale', delay: 50, duration: 300 });

    const panelTop = COL_Y - PANEL_H / 2;

    if (!displaySpellId) {
      const prompt = createText(s, RIGHT_X, COL_Y, '?', {
        fontSize: '48px', fontFamily: SHOP_FONT,
      }, {
        fill: SHOP_WHITE, depth: D + 3,
        stroke: '#000000', strokeThickness: 4,
      });
      this.content.push(prompt);
      return;
    }

    const def = SPELLS[displaySpellId];
    const tree = SKILL_TREES[displaySpellId];
    if (!def || !tree) return;

    const isPreviewingDifferent = this.previewSpellId && this.previewSpellId !== chosenSpellId;
    const displayTier = isPreviewingDifferent ? 0 : (displaySpellId === chosenSpellId ? currentTier : 0);
    const stats = computeSpellStats(displaySpellId, displayTier);

    const RIGHT_INNER_X = RIGHT_X + 8; // nudge text right off the frame edge

    // Panel divider is at native y=136 of 329px panel
    const dividerY = panelTop + 136;
    const upperCenterY = panelTop + 68; // center of upper half

    // ── UPPER HALF: Spell name + description ──
    const spellNameY = panelTop + 40;
    const nameColor = isPreviewingDifferent ? COLOR.ACCENT_INFO : slotColor.hex;
    const spellNameText = createText(s, RIGHT_INNER_X, spellNameY, def.name, { fontSize: '14px', fontFamily: SHOP_FONT }, {
      fill: SHOP_WHITE, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.content.push(spellNameText);
    animateIn(s, spellNameText, { from: 'slideUp', delay: 100, duration: 200 });

    if (def.description) {
      const desc = s.add.text(RIGHT_INNER_X, spellNameY + 26, def.description, textStyle({ fontSize: '10px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE,
        wordWrap: { width: PANEL_W - 40 },
        align: 'center',
        strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(desc);
      animateIn(s, desc, { from: 'fadeOnly', delay: 150, duration: 200 });
    }

    // ── LOWER HALF: Stats ──
    let y = dividerY + 16;
    const visibleStats = STAT_DEFS.filter(sd => stats[sd.key] != null && stats[sd.key] !== 0);
    const statsToShow = visibleStats.slice(0, 6);
    for (const sd of statsToShow) {
      const leftX = RIGHT_X - PANEL_W / 2 + 35;
      const rightX = RIGHT_X + PANEL_W / 2 - 35;

      const labelText = s.add.text(leftX, y, sd.label, textStyle({ fontSize: '10px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE, strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
      this.content.push(labelText);

      const valText = s.add.text(rightX, y, sd.fmt(stats[sd.key]), textStyle({ fontSize: '10px', fontFamily: SHOP_FONT }, {
        fill: SHOP_WHITE, strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(1, 0.5);
      this.content.push(valText);

      y += 18;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  LOCKED SLOT CONTENT — centered layout
  // ═══════════════════════════════════════════════════════
  _buildLockedContent() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;

    if (s.textures.exists('spell-BookDarkness-off')) {
      const lockIcon = s.add.image(CX, COL_Y - 50, 'spell-BookDarkness-off')
        .setDisplaySize(64, 64).setScrollFactor(0).setDepth(D + 3);
      this.content.push(lockIcon);
      animateIn(s, lockIcon, { from: 'scale', delay: 200, duration: 250 });
    }

    const label = createText(s, CX, COL_Y + 10, `${SLOT_NAMES[slot]} — KİLİTLİ`, FONT.H2, {
      fill: SHOP_WHITE, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.content.push(label);
    animateIn(s, label, { from: 'slideUp', delay: 250, duration: 250 });

    // Show which round this slot unlocks
    const unlockRounds = SP.SLOT_UNLOCK_ROUNDS || {};
    const unlockRound = unlockRounds[slot] || '?';
    const costLabel = createText(s, CX, COL_Y + 42, `${unlockRound}. elde açılır`, { fontSize: '10px', fontFamily: SHOP_FONT }, {
      fill: SHOP_WHITE, depth: D + 3,
      stroke: '#000000', strokeThickness: 2,
    });
    this.content.push(costLabel);
    animateIn(s, costLabel, { from: 'fadeOnly', delay: 300, duration: 250 });
  }

  // ═══════════════════════════════════════════════════════
  //  HELPERS — Spell Animation Builder
  // ═══════════════════════════════════════════════════════

  /** Place an animated spell FX sprite at (x, y) with given scale.
   *  minScale ensures tiny spells (e.g. Tekerleme 0.23) are still visible in UI. */
  _buildSpellAnimation(x, y, spellId, scale, minScale = 0) {
    const s = this.scene;
    const def = SPELLS[spellId];
    if (!def || !def.fx || !def.fx.sprite || !s.textures.exists(def.fx.sprite)) return;

    const slotColor = SLOT_COLOR[def.slot] || SLOT_COLOR.Q;
    const dispSprite = def.fx.displaySprite && s.textures.exists(def.fx.displaySprite)
      ? def.fx.displaySprite : def.fx.sprite;
    const dispAnim = def.fx.displayAnimKey && s.anims.exists(def.fx.displayAnimKey)
      ? def.fx.displayAnimKey : def.fx.animKey;

    // Subtle glow underneath
    const glowColor = def.fx.color || slotColor.tint;
    const glow = s.add.graphics().setDepth(D + 2).setScrollFactor(0);
    glow.fillStyle(glowColor, 0.15);
    glow.fillEllipse(x, y + scale * 6, scale * 12, scale * 3.5);
    this.content.push(glow);

    // Animated sprite — enforce minimum scale for small spells
    const rawScale = def.fx.scale ? def.fx.scale * scale : scale;
    const finalScale = minScale > 0 ? Math.max(rawScale, minScale) : rawScale;
    const fxSprite = s.add.sprite(x, y, dispSprite, 0)
      .setScale(finalScale)
      .setDepth(D + 3).setScrollFactor(0);
    if (dispAnim && s.anims.exists(dispAnim)) fxSprite.play(dispAnim);
    this.content.push(fxSprite);
    animateIn(s, fxSprite, { from: 'scale', delay: 80, duration: 300 });
  }

  /** Build a rotated arrow button using ui-shop-btn sprite */
  _buildArrowButton(x, y, angle, enabled, onClick) {
    const s = this.scene;
    const isLeft = angle < 0;
    const glyph = isLeft ? '◀' : '▶';

    const arrow = s.add.sprite(x, y, 'ui-shop-btn', 0)
      .setDisplaySize(ARROW_W, ARROW_H)
      .setAngle(angle)
      .setScrollFactor(0).setDepth(D + 4);

    // Arrow glyph label on top of button
    const label = s.add.text(x, y, glyph, textStyle({ fontSize: '16px', fontFamily: SHOP_FONT }, {
      fill: SHOP_WHITE,
      strokeThickness: 3,
    })).setScrollFactor(0).setDepth(D + 5).setOrigin(0.5);

    if (!enabled) {
      arrow.setTint(0x607880).setAlpha(0.25);
      label.setAlpha(0.2);
      this.content.push(arrow, label);
      return;
    }

    arrow.setAlpha(0.85);
    this.content.push(arrow, label);

    const hitSize = Math.max(ARROW_W, ARROW_H) + 20;
    const hit = s.add.rectangle(x, y, hitSize, hitSize)
      .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
      .setInteractive({ useHandCursor: true });

    const origSX = arrow.scaleX;
    const origSY = arrow.scaleY;

    hit.on('pointerover', () => {
      arrow.setFrame(1);
      arrow.setScale(origSX * 1.1, origSY * 1.1);
      arrow.setAlpha(1);
      label.setScale(1.15);
    });
    hit.on('pointerout', () => {
      arrow.setFrame(0);
      arrow.setScale(origSX, origSY);
      arrow.setAlpha(0.85);
      label.setScale(1);
    });
    hit.on('pointerdown', () => {
      arrow.setScale(origSX * 0.9, origSY * 0.9);
      label.setScale(0.9);
    });
    hit.on('pointerup', () => {
      arrow.setScale(origSX * 1.1, origSY * 1.1);
      label.setScale(1);
      onClick();
    });

    this.content.push(hit);
    animateIn(s, arrow, { from: 'scale', delay: 200, duration: 200 });
    animateIn(s, label, { from: 'fadeOnly', delay: 220, duration: 200 });
  }

  // ═══════════════════════════════════════════════════════
  //  HELPERS — Data
  // ═══════════════════════════════════════════════════════

  _getDisplaySpellId() {
    if (this.previewSpellId) return this.previewSpellId;
    const slot = this.activeSlot;
    const availableSpells = SLOT_SPELLS[slot] || [];
    const idx = Math.max(0, Math.min(this._scrollOffset, availableSpells.length - 1));
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    return availableSpells[idx] || chosenSpellId;
  }

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
