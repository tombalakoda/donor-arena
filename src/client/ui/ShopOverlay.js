/**
 * ShopOverlay.js — Two-column spell shop aligned to panel1.png zones.
 *
 * Panel layout (499×556, centered at 640,360 → top-left 391,82):
 *   HEADER    — title + SP + timer         y≈92..138
 *   TABS      — 4 slot tabs                y≈140..168
 *   LEFT COL  — spell card list             x≈407..635, y≈172..488
 *   RIGHT COL — spell detail / preview      x≈649..877, y≈172..488
 *   TIMER BAR — countdown progress          y≈500..530
 *   BUTTONS   — action buttons              y≈542..578
 */

import { SKILL_TREES, computeSpellStats, getNextTierInfo, getMaxTier } from '../../shared/skillTreeData.js';
import { SPELLS, SLOT_SPELLS } from '../../shared/spellData.js';
import { SP } from '../../shared/constants.js';
import { COLOR, FONT, SPACE, NINE, DEPTH, ALPHA, SLOT_COLOR, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createBar, createPanel, createDimmer, createText, createTexturedButton, createIcyFrame, animateIn } from './UIHelpers.js';
import { getSfxVolume } from '../config.js';

// ─── Constants ───────────────────────────────────────────
const D = DEPTH.OVERLAY_DIM;
const CX = SCREEN.CX;               // 640
const CY = SCREEN.CY;               // 360
const SLOTS = ['Q', 'W', 'E', 'R'];
const SLOT_NAMES = { Q: 'SÖZ', W: 'EL', E: 'DİL', R: 'BEL' };

// ─── Panel zone coordinates (screen space) ───────────────
// Panel: 499×556, centered at (640, 360). Top-left ≈ (391, 82).
const PX = CX;                       // panel center x
const PY = CY;                       // panel center y
const PW = 499;
const PH = 556;
const PT = PY - PH / 2;             // panel top ≈ 82

// Header zone
const HEADER_Y  = PT + 42;          // ≈ 124 center of header strip
const HEADER_W  = 420;

// Slot tabs — between header and columns
const TAB_Y     = PT + 84;          // ≈ 166
const TAB_W     = 104;
const TAB_H     = 28;
const TAB_GAP   = 6;

// Left column — spell card list
const LC_CX     = PX - 116;         // ≈ 524 center of left column
const LC_W      = 218;
const LC_TOP    = PT + 100;         // ≈ 182  just below tabs
const LC_BOT    = PT + 406;         // ≈ 488
const LC_H      = LC_BOT - LC_TOP;  // ≈ 306

// Right column — spell detail
const RC_CX     = PX + 116;         // ≈ 756 center of right column
const RC_W      = 218;
const RC_TOP    = LC_TOP;
const RC_BOT    = LC_BOT;

// Timer bar zone
const TBAR_Y    = PT + 428;         // ≈ 510
const TBAR_W    = 440;

// Action buttons
const BTN_LEFT_CX  = PX - 113;      // ≈ 527
const BTN_RIGHT_CX = PX + 113;      // ≈ 753
const BTN_Y     = PT + 472;         // ≈ 554
const BTN_W     = 160;
const BTN_H     = 38;

// Card dimensions (inside left column)
const CARD_W    = 200;
const CARD_H    = 44;
const CARD_GAP  = 5;
const CARD_STEP = CARD_H + CARD_GAP; // 49
const VISIBLE_CARDS = 6;             // 6 × 49 = 294 fits in 310

// Stat display definitions
const STAT_DEFS = [
  { label: 'Hasar',      key: 'damage',        fmt: v => `${v}` },
  { label: 'İtme',       key: 'knockbackForce', fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Bekleme',    key: 'cooldown',       fmt: v => `${(v / 1000).toFixed(1)}s` },
  { label: 'Hız',        key: 'speed',          fmt: v => `${v}` },
  { label: 'Menzil',     key: 'range',          fmt: v => `${v}` },
  { label: 'Yavaşlatma', key: 'slowAmount',     fmt: v => `${(v * 100).toFixed(0)}%` },
  { label: 'Çekim',      key: 'pullForce',      fmt: v => `${(v * 1000).toFixed(0)}` },
  { label: 'Kalkan',     key: 'shieldHits',     fmt: v => `${v}` },
  { label: 'Mermi',      key: 'missileCount',   fmt: v => `${v}` },
  { label: 'Sekme',      key: 'maxBounces',     fmt: v => `${v}` },
  { label: 'Süre',       key: 'buffDuration',   fmt: v => `${(v / 1000).toFixed(1)}s` },
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
    this.chrome = [];     // persistent: dimmer, panel, header, tabs, timer bar
    this.content = [];    // rebuilt on tab switch / progression update
    this.previewSpellId = null;
    this._timerText = null;
    this._spText = null;
    this._timerBar = null;
    this._scrollOffset = 0;
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
    this._scrollOffset = 0;
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
    this._buildTimerBar();
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
  //  PANEL — centered panel1.png image
  // ═══════════════════════════════════════════════════════
  _buildPanel() {
    const s = this.scene;
    const panel = s.add.image(PX, PY, 'ui-shop-panel')
      .setScrollFactor(0).setDepth(D + 1);
    this.chrome.push(panel);
  }

  // ═══════════════════════════════════════════════════════
  //  HEADER — title + SP + timer in header zone
  // ═══════════════════════════════════════════════════════
  _buildHeader() {
    const s = this.scene;
    const leftEdge = PX - HEADER_W / 2;
    const rightEdge = PX + HEADER_W / 2;

    // Title (centered)
    const title = createText(s, PX, HEADER_Y - 4, 'HÜNER DÜKKÂNI', FONT.BODY_BOLD, {
      fill: COLOR.ACCENT_GOLD, depth: D + 3,
      stroke: '#000000', strokeThickness: 3,
    });
    this.chrome.push(title);
    animateIn(s, title, { from: 'slideDown', delay: 50, duration: 250 });

    // SP counter (left of center)
    const sp = this.progression ? this.progression.sp : 0;
    this._spText = createText(s, leftEdge + 10, HEADER_Y - 4, `◆ ${sp}`, FONT.SMALL, {
      fill: COLOR.TEXT_ICE, depth: D + 3, originX: 0,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._spText);
    animateIn(s, this._spText, { from: 'slideDown', delay: 80, duration: 250 });

    // Timer (right side)
    this._timerText = createText(s, rightEdge - 10, HEADER_Y - 4, `${Math.ceil(this.shopTimer)}s`, FONT.SMALL, {
      fill: COLOR.TEXT_ICE, depth: D + 3, originX: 1,
      stroke: '#000000', strokeThickness: 2,
    });
    this.chrome.push(this._timerText);
    animateIn(s, this._timerText, { from: 'slideDown', delay: 80, duration: 250 });
  }

  // ═══════════════════════════════════════════════════════
  //  SLOT TABS — 4 tabs spanning panel width
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

      // Tab background (spritesheet button)
      const frame = isActive ? 1 : 0;
      const bg = s.add.sprite(cx, TAB_Y, 'ui-shop-btn', frame)
        .setDisplaySize(TAB_W, TAB_H).setScrollFactor(0).setDepth(D + 2);

      if (isActive) {
        bg.setTint(SLOT_COLOR[slot].tint);
      } else if (isLocked) {
        bg.setTint(0x607880);
        bg.setAlpha(0.35);
      } else {
        bg.setAlpha(0.6);
      }
      this.chrome.push(bg);

      // Tab label
      const label = s.add.text(cx, TAB_Y, `${slot} ${SLOT_NAMES[slot]}`, textStyle(FONT.TINY, {
        fill: isActive ? COLOR.TEXT_LIGHT : (isLocked ? COLOR.TEXT_DISABLED : COLOR.TEXT_SECONDARY),
        fontStyle: 'bold',
        stroke: isActive ? '#000000' : undefined,
        strokeThickness: isActive ? 2 : 0,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5);
      this.chrome.push(label);

      // Hit area
      const hit = s.add.rectangle(cx, TAB_Y, TAB_W, TAB_H)
        .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
        .setInteractive({ useHandCursor: !isLocked });
      hit.on('pointerdown', () => {
        if (this.activeSlot !== slot) {
          this._playSfx('sfx-move');
          this.activeSlot = slot;
          this.previewSpellId = null;
          this._scrollOffset = 0;
          this._rebuildAll();
        }
      });
      this.chrome.push(hit);

      animateIn(s, bg, { from: 'scale', delay: 100 + i * 40, duration: 200 });
      animateIn(s, label, { from: 'scale', delay: 100 + i * 40, duration: 200 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  TIMER BAR — in lower bar zone
  // ═══════════════════════════════════════════════════════
  _buildTimerBar() {
    const s = this.scene;
    const barX = PX - TBAR_W / 2;
    const bar = createBar(s, barX, TBAR_Y, TBAR_W, 5, {
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
    if (this._isSlotLocked(slot)) {
      this._buildLockedContent();
      return;
    }
    this._buildLeftColumn();
    this._buildRightColumn();
    this._buildButtons();
  }

  // ═══════════════════════════════════════════════════════
  //  LEFT COLUMN — spell card list (vertical, scrollable)
  // ═══════════════════════════════════════════════════════
  _buildLeftColumn() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const isAutoEquipped = spellState ? spellState.autoEquipped : false;
    const isFirstChoice = chosenSpellId === null || isAutoEquipped;
    const availableSpells = SLOT_SPELLS[slot] || [];
    const total = availableSpells.length;
    const needsScroll = total > VISIBLE_CARDS;

    // Clamp scroll offset
    if (needsScroll) {
      this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, total - VISIBLE_CARDS));
    } else {
      this._scrollOffset = 0;
    }

    const visibleCount = Math.min(total, VISIBLE_CARDS);
    const listH = visibleCount * CARD_STEP - CARD_GAP;
    const listTop = LC_TOP + (LC_H - listH) / 2;  // vertically center in column

    // ── Scroll arrows (up/down) ──
    if (needsScroll) {
      const arrowX = LC_CX;
      const canGoUp = this._scrollOffset > 0;
      const canGoDown = this._scrollOffset < total - VISIBLE_CARDS;

      // Up arrow
      const upArrow = s.add.graphics().setDepth(D + 5).setScrollFactor(0);
      const upY = listTop - 14;
      upArrow.fillStyle(canGoUp ? 0xb8e4f0 : 0x607880, canGoUp ? 0.8 : 0.3);
      upArrow.fillTriangle(arrowX - 8, upY + 6, arrowX + 8, upY + 6, arrowX, upY - 4);
      this.content.push(upArrow);
      if (canGoUp) {
        const upHit = s.add.rectangle(arrowX, upY, 30, 18)
          .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
          .setInteractive({ useHandCursor: true });
        upHit.on('pointerdown', () => {
          this._playSfx('sfx-move');
          this._scrollOffset = Math.max(0, this._scrollOffset - 1);
          this._destroyContent();
          this._buildContent();
        });
        this.content.push(upHit);
      }

      // Down arrow
      const downArrow = s.add.graphics().setDepth(D + 5).setScrollFactor(0);
      const downY = listTop + listH + 14;
      downArrow.fillStyle(canGoDown ? 0xb8e4f0 : 0x607880, canGoDown ? 0.8 : 0.3);
      downArrow.fillTriangle(arrowX - 8, downY - 6, arrowX + 8, downY - 6, arrowX, downY + 4);
      this.content.push(downArrow);
      if (canGoDown) {
        const downHit = s.add.rectangle(arrowX, downY, 30, 18)
          .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
          .setInteractive({ useHandCursor: true });
        downHit.on('pointerdown', () => {
          this._playSfx('sfx-move');
          this._scrollOffset = Math.min(total - VISIBLE_CARDS, this._scrollOffset + 1);
          this._destroyContent();
          this._buildContent();
        });
        this.content.push(downHit);
      }
    }

    // ── Render visible cards ──
    const startIdx = this._scrollOffset;
    const endIdx = Math.min(startIdx + VISIBLE_CARDS, total);

    for (let vi = 0; vi < endIdx - startIdx; vi++) {
      const i = startIdx + vi;
      const spellId = availableSpells[i];
      const def = SPELLS[spellId];
      if (!def) continue;

      const cy = listTop + vi * CARD_STEP + CARD_H / 2;
      const isChosen = chosenSpellId === spellId;
      const isPreviewing = this.previewSpellId === spellId;
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
      const dimmed = !isChosen && !canAfford;

      // Card background image
      const cardBg = s.add.image(LC_CX, cy, 'ui-shop-card')
        .setDisplaySize(CARD_W, CARD_H)
        .setScrollFactor(0).setDepth(D + 3)
        .setAlpha(dimmed ? 0.4 : 0.75);
      if (dimmed) cardBg.setTint(0x607880);
      this.content.push(cardBg);

      // Selected/preview highlight border
      if (isChosen || isPreviewing) {
        const borderColor = isChosen ? COLOR.TINT_GOLD : COLOR.TINT_INFO;
        const border = s.add.graphics().setDepth(D + 2).setScrollFactor(0);
        border.lineStyle(2, borderColor, 0.9);
        border.strokeRoundedRect(
          LC_CX - CARD_W / 2 - 2, cy - CARD_H / 2 - 2,
          CARD_W + 4, CARD_H + 4, 4
        );
        this.content.push(border);

        // Pulse
        s.tweens.add({
          targets: border,
          alpha: { from: 0.5, to: 1 },
          duration: 800, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Spell icon (left side of card)
      const iconX = LC_CX - CARD_W / 2 + 24;
      if (def.icon && s.textures.exists(def.icon)) {
        const icon = s.add.image(iconX, cy, def.icon)
          .setScrollFactor(0).setDepth(D + 4);
        const sc = 30 / Math.max(icon.width, icon.height);
        icon.setScale(sc);
        if (dimmed) icon.setAlpha(0.5);
        this.content.push(icon);
      }

      // Spell name (right of icon)
      const nameX = iconX + 24;
      const name = s.add.text(nameX, cy, def.name, textStyle(FONT.TINY, {
        fill: isChosen ? SLOT_COLOR[slot].hex : (isPreviewing ? COLOR.ACCENT_INFO : COLOR.TEXT_SECONDARY),
        stroke: '#000000', strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 4).setOrigin(0, 0.5);
      if (dimmed) name.setAlpha(0.5);
      this.content.push(name);

      // Cost badge (top-right, only for first-choice unchosen)
      if (!isChosen && isFirstChoice) {
        const costBadge = s.add.text(
          LC_CX + CARD_W / 2 - 8, cy - 2,
          `${SP.SPELL_CHOICE_COST}◆`, textStyle(FONT.TINY, {
            fill: canAfford ? COLOR.ACCENT_INFO : COLOR.TEXT_DISABLED,
            strokeThickness: 2,
          })
        ).setScrollFactor(0).setDepth(D + 5).setOrigin(1, 0.5);
        this.content.push(costBadge);
      }

      // Hit area
      const hit = s.add.rectangle(LC_CX, cy, CARD_W, CARD_H)
        .setScrollFactor(0).setDepth(D + 6).setAlpha(0.001)
        .setInteractive({ useHandCursor: canAfford || isChosen });
      this.content.push(hit);

      // Hover & click
      if (!isChosen && canAfford) {
        hit.on('pointerover', () => {
          cardBg.setAlpha(1);
          cardBg.setTint(COLOR.TINT_HOVER);
        });
        hit.on('pointerout', () => {
          cardBg.setAlpha(dimmed ? 0.4 : 0.75);
          cardBg.clearTint();
          if (dimmed) cardBg.setTint(0x607880);
        });
        hit.on('pointerdown', () => {
          this._playSfx('sfx-move');
          this.previewSpellId = spellId;
          this._destroyContent();
          this._buildContent();
        });
      } else if (isChosen) {
        hit.on('pointerover', () => { cardBg.setAlpha(1); });
        hit.on('pointerout', () => { cardBg.setAlpha(0.75); });
        hit.on('pointerdown', () => {
          // Click chosen card = clear preview, show chosen details
          if (this.previewSpellId && this.previewSpellId !== spellId) {
            this._playSfx('sfx-move');
            this.previewSpellId = null;
            this._destroyContent();
            this._buildContent();
          }
        });
      }

      // Entrance animation
      animateIn(s, cardBg, { from: 'slideUp', delay: 150 + vi * 40, duration: 200 });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  RIGHT COLUMN — spell detail view
  // ═══════════════════════════════════════════════════════
  _buildRightColumn() {
    const s = this.scene;
    const slot = this.activeSlot;
    const slotColor = SLOT_COLOR[slot] || SLOT_COLOR.Q;
    const prog = this.progression;
    const spellState = prog ? prog.spells[slot] : null;
    const chosenSpellId = spellState ? spellState.chosenSpell : null;
    const currentTier = spellState ? spellState.tier : 0;
    const isAutoEquipped = spellState ? spellState.autoEquipped : false;
    const isFirstChoice = chosenSpellId === null || isAutoEquipped;

    // Determine display spell
    const previewId = this.previewSpellId;
    const isPreviewingDifferent = previewId && previewId !== chosenSpellId;
    const displaySpellId = isPreviewingDifferent ? previewId : chosenSpellId;

    // Empty state
    if (!displaySpellId) {
      const prompt = createText(s, RC_CX, CY - 20, 'Bir hüner seç', FONT.BODY_BOLD, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
        stroke: '#000000', strokeThickness: 2,
      });
      this.content.push(prompt);
      animateIn(s, prompt, { from: 'fadeOnly', delay: 300, duration: 250 });

      const hint = createText(s, RC_CX, CY + 8, `(${SP.SPELL_CHOICE_COST} İlham)`, FONT.SMALL, {
        fill: COLOR.TEXT_DISABLED, depth: D + 3,
      });
      this.content.push(hint);
      animateIn(s, hint, { from: 'fadeOnly', delay: 350, duration: 250 });
      return;
    }

    const def = SPELLS[displaySpellId];
    const tree = SKILL_TREES[displaySpellId];
    if (!def || !tree) return;

    const displayTier = isPreviewingDifferent ? 0 : currentTier;
    const stats = computeSpellStats(displaySpellId, displayTier);
    const maxTier = getMaxTier(displaySpellId);
    let y = RC_TOP + 10;

    // ── FX Preview Sprite ──
    if (def.fx && def.fx.sprite && s.textures.exists(def.fx.sprite)) {
      const dispSprite = def.fx.displaySprite && s.textures.exists(def.fx.displaySprite)
        ? def.fx.displaySprite : def.fx.sprite;
      const dispAnim = def.fx.displayAnimKey && s.anims.exists(def.fx.displayAnimKey)
        ? def.fx.displayAnimKey : def.fx.animKey;

      const fxSprite = s.add.sprite(RC_CX, y + 32, dispSprite, 0)
        .setScale(def.fx.scale ? def.fx.scale * 3.0 : 3.0)
        .setDepth(D + 3).setScrollFactor(0);
      if (dispAnim && s.anims.exists(dispAnim)) {
        fxSprite.play(dispAnim);
      }
      this.content.push(fxSprite);
      animateIn(s, fxSprite, { from: 'scale', delay: 100, duration: 300 });

      // Subtle glow
      const glowColor = def.fx.color || slotColor.tint;
      const glow = s.add.graphics().setDepth(D + 2).setScrollFactor(0);
      glow.fillStyle(glowColor, 0.12);
      glow.fillEllipse(RC_CX, y + 46, 60, 16);
      this.content.push(glow);

      y += 70;
    } else {
      y += 10;
    }

    // ── Spell Name ──
    const nameColor = isPreviewingDifferent ? COLOR.ACCENT_INFO : slotColor.hex;
    const spellName = createText(s, RC_CX, y, def.name, FONT.BODY_BOLD, {
      fill: nameColor, depth: D + 3,
      stroke: '#000000', strokeThickness: 2,
    });
    this.content.push(spellName);
    animateIn(s, spellName, { from: 'slideUp', delay: 200, duration: 200 });
    y += 22;

    // ── Separator ──
    const sep = s.add.graphics().setDepth(D + 3).setScrollFactor(0);
    sep.lineStyle(1, 0xb8e4f0, 0.4);
    sep.lineBetween(RC_CX - 90, y, RC_CX + 90, y);
    this.content.push(sep);
    y += 8;

    // ── Description ──
    if (def.description) {
      const desc = s.add.text(RC_CX, y, def.description, textStyle(FONT.TINY, {
        fill: COLOR.TEXT_SECONDARY,
        wordWrap: { width: RC_W - 12 },
        align: 'center',
        strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(desc);
      animateIn(s, desc, { from: 'fadeOnly', delay: 250, duration: 200 });
      y += desc.height + 8;
    }

    // ── Stats grid (2-column) ──
    const visibleStats = STAT_DEFS.filter(sd => stats[sd.key] != null && stats[sd.key] !== 0);
    if (visibleStats.length > 0) {
      const statCols = 2;
      const colW = (RC_W - 10) / statCols;
      const startX = RC_CX - (RC_W - 10) / 2;

      for (let si = 0; si < Math.min(visibleStats.length, 6); si++) {
        const sd = visibleStats[si];
        const col = si % statCols;
        const row = Math.floor(si / statCols);
        const sx = startX + col * colW;
        const sy = y + row * 18;

        const statText = s.add.text(sx, sy, `${sd.label}: ${sd.fmt(stats[sd.key])}`, textStyle(FONT.TINY, {
          fill: COLOR.TEXT_SECONDARY,
          strokeThickness: 2,
        })).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
        this.content.push(statText);
      }
      y += Math.ceil(Math.min(visibleStats.length, 6) / statCols) * 18 + 8;
    }

    // ── Tier dots (only for chosen spells, not previewing a different one) ──
    if (!isPreviewingDifferent && chosenSpellId) {
      const dotSize = 10;
      const dotGap = 5;
      const dotsW = maxTier * dotSize + (maxTier - 1) * dotGap;
      const dotStartX = RC_CX - dotsW / 2 + dotSize / 2;

      // Tier label
      const tierLabel = s.add.text(RC_CX, y, `Pâye ${currentTier}/${maxTier}`, textStyle(FONT.TINY, {
        fill: COLOR.ACCENT_GOLD,
        strokeThickness: 2,
      })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.content.push(tierLabel);
      y += 18;

      // Dots
      for (let t = 0; t < maxTier; t++) {
        const filled = t < currentTier;
        const dx = dotStartX + t * (dotSize + dotGap);
        const dot = s.add.graphics().setDepth(D + 3).setScrollFactor(0);
        if (filled) {
          dot.fillStyle(slotColor.tint, 0.9);
        } else {
          dot.fillStyle(0x334455, 0.5);
        }
        dot.fillCircle(dx, y + dotSize / 2, dotSize / 2);
        this.content.push(dot);
      }
      y += dotSize + 8;

      // Next tier info
      const nextTier = getNextTierInfo(chosenSpellId, currentTier);
      if (nextTier) {
        const modText = Object.entries(nextTier.mods)
          .map(([k, v]) => typeof v === 'boolean'
            ? `${MOD_LABELS[k] || k}: ${v ? 'evet' : 'hayır'}`
            : `${MOD_LABELS[k] || k}: ${v > 0 ? '+' : ''}${v}`)
          .join(', ');

        if (modText) {
          const mods = s.add.text(RC_CX, y, `Sonraki: ${modText}`, textStyle(FONT.TINY, {
            fill: COLOR.ACCENT_INFO,
            wordWrap: { width: RC_W - 10 },
            align: 'center',
            strokeThickness: 2,
          })).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
          this.content.push(mods);
        }
      } else if (currentTier >= maxTier) {
        const badge = createText(s, RC_CX, y, '★ EN ÜST PÂYE ★', FONT.TINY, {
          fill: COLOR.ACCENT_GOLD, depth: D + 3,
          stroke: '#000000', strokeThickness: 2,
        });
        this.content.push(badge);
        s.tweens.add({
          targets: badge,
          alpha: { from: 0.6, to: 1 },
          duration: 800, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ACTION BUTTONS — bottom button slots
  // ═══════════════════════════════════════════════════════
  _buildButtons() {
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

    if (isPreviewingDifferent) {
      // ── Preview mode: "Seç" + "İptal" ──
      const canAfford = isFirstChoice ? (prog && prog.sp >= SP.SPELL_CHOICE_COST) : true;
      const costLabel = isFirstChoice ? ` (${SP.SPELL_CHOICE_COST}◆)` : '';

      // Choose button (left)
      const { elements: chooseBtnEls } = createTexturedButton(s, BTN_LEFT_CX, BTN_Y, `Seç${costLabel}`, 'ui-shop-btn', {
        width: BTN_W, height: BTN_H, depth: D + 4, enabled: canAfford,
        onClick: () => {
          this._playSfx('sfx-accept');
          if (s.network && s.network.connected) {
            s.network.sendShopChooseSpell(slot, previewId);
          }
        },
      });
      this.content.push(...chooseBtnEls);
      chooseBtnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 300, duration: 200 }));

      // Cancel button (right)
      const { elements: cancelBtnEls } = createTexturedButton(s, BTN_RIGHT_CX, BTN_Y, 'İptal', 'ui-shop-btn', {
        width: BTN_W, height: BTN_H, depth: D + 4,
        onClick: () => {
          this._playSfx('sfx-cancel');
          this.previewSpellId = null;
          this._destroyContent();
          this._buildContent();
        },
      });
      this.content.push(...cancelBtnEls);
      cancelBtnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 350, duration: 200 }));

      // Warning if switching resets tier
      if (!isFirstChoice && currentTier > 0) {
        const warn = createText(s, PX, BTN_Y - 22, '⚠ pâye sıfırlanır', FONT.TINY, {
          fill: COLOR.ACCENT_DANGER, depth: D + 4,
        });
        this.content.push(warn);
      }

    } else if (chosenSpellId) {
      // ── Chosen spell: "Pişir (cost)" upgrade button ──
      const nextTier = getNextTierInfo(chosenSpellId, currentTier);

      if (nextTier) {
        const cost = nextTier.cost;
        const canUpgrade = prog && prog.sp >= cost;
        const { elements: upgradeBtnEls } = createTexturedButton(s, PX, BTN_Y, `Pişir (${cost}◆)`, 'ui-shop-btn', {
          width: BTN_W, height: BTN_H, depth: D + 4, enabled: canUpgrade,
          onClick: () => {
            this._playSfx('sfx-accept');
            if (s.network && s.network.connected) {
              s.network.sendShopUpgradeTier(slot);
            }
          },
        });
        this.content.push(...upgradeBtnEls);
        upgradeBtnEls.forEach(el => animateIn(s, el, { from: 'slideUp', delay: 300, duration: 200 }));
      }
      // Max tier = no button shown
    }
  }

  // ═══════════════════════════════════════════════════════
  //  LOCKED SLOT CONTENT
  // ═══════════════════════════════════════════════════════
  _buildLockedContent() {
    const s = this.scene;
    const slot = this.activeSlot;
    const prog = this.progression;
    const lockY = CY - 20;

    // Lock icon
    if (s.textures.exists('spell-BookDarkness-off')) {
      const lockIcon = s.add.image(PX, lockY - 30, 'spell-BookDarkness-off')
        .setDisplaySize(40, 40).setScrollFactor(0).setDepth(D + 3);
      this.content.push(lockIcon);
      animateIn(s, lockIcon, { from: 'scale', delay: 200, duration: 250 });
    }

    const label = createText(s, PX, lockY + 10, `${SLOT_NAMES[slot]} — KİLİTLİ`, FONT.BODY_BOLD, {
      fill: COLOR.TEXT_DISABLED, depth: D + 3,
      stroke: '#000000', strokeThickness: 2,
    });
    this.content.push(label);
    animateIn(s, label, { from: 'slideUp', delay: 250, duration: 250 });

    const costLabel = createText(s, PX, lockY + 34, `Açmak için ${SP.SLOT_UNLOCK_COST} İlham gerekir`, FONT.SMALL, {
      fill: COLOR.TEXT_SECONDARY, depth: D + 3,
    });
    this.content.push(costLabel);
    animateIn(s, costLabel, { from: 'fadeOnly', delay: 300, duration: 250 });

    // Unlock button (centered, spans both button zones)
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
