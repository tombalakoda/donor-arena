/**
 * UIConfig.js — Single source of truth for ALL UI design tokens.
 * Colors, typography, spacing, slot colors, and shared constants.
 *
 * Cool ice palette — white/ice-blue text with strokes for readability.
 */

// Font defined here (NOT imported from config.js to avoid circular dependency)
const UI_FONT = "'Alkhemikal', monospace";

// ─── Color Palette ───────────────────────────────────────────
export const COLOR = {
  // Primary text (white — readable over any background with stroke)
  TEXT_PRIMARY:   '#ffffff',
  TEXT_SECONDARY: '#dce8ef',
  TEXT_DISABLED:  '#7a8e9c',

  // Warm text variants
  TEXT_LIGHT:     '#ffffff',
  TEXT_CREAM:     '#f0e6d2',
  TEXT_ICE:       '#b8e4f0',

  // Stroke colors
  STROKE_DARK:    '#000000',
  STROKE_BROWN:   '#2a1a0a',

  // Accent colors (CSS strings)
  ACCENT_GOLD:    '#ffdd44',
  ACCENT_INFO:    '#44ddff',
  ACCENT_DANGER:  '#ff6644',
  ACCENT_SUCCESS: '#1a7733',

  // Tint values (hex numbers for Phaser tint)
  TINT_GOLD:      0xffdd44,
  TINT_INFO:      0x44ddff,
  TINT_DANGER:    0xff6644,
  TINT_SUCCESS:   0x1a7733,
  TINT_HOVER:     0xddccaa,
  TINT_PRESS:     0xbbaa88,
  TINT_DISABLED:  0x777777,

  // Dimmer only
  DIMMER_TINT:    0x000000,

  // HP bar gradient tints
  HP_FULL:        0x40c090,
  HP_MID:         0xe0b040,
  HP_LOW:         0xe84040,
};

// ─── Slot Colors ─────────────────────────────────────────────
export const SLOT_COLOR = {
  Q: { hex: '#ff6644', tint: 0xff6644 },
  W: { hex: '#44bbff', tint: 0x44bbff },
  E: { hex: '#44ddaa', tint: 0x44ddaa },
  R: { hex: '#cc66ff', tint: 0xcc66ff },
};

// ─── Typography ──────────────────────────────────────────────
export const FONT = {
  FAMILY: UI_FONT,

  TITLE_LG: { fontSize: '46px', fontFamily: UI_FONT, fontStyle: 'bold' },
  TITLE_SM: { fontSize: '30px', fontFamily: UI_FONT, fontStyle: 'bold' },
  BODY:     { fontSize: '20px', fontFamily: UI_FONT },
  BODY_BOLD:{ fontSize: '20px', fontFamily: UI_FONT, fontStyle: 'bold' },
  SMALL:    { fontSize: '16px', fontFamily: UI_FONT },
  TINY:     { fontSize: '14px', fontFamily: UI_FONT, fontStyle: 'bold' },
  NUMBER_LG:{ fontSize: '40px', fontFamily: UI_FONT, fontStyle: 'bold' },
  DAMAGE:   { fontSize: '20px', fontFamily: UI_FONT, fontStyle: 'bold' },
};

// ─── Spacing ─────────────────────────────────────────────────
export const SPACE = {
  XS: 4,
  SM: 8,
  MD: 12,
  LG: 16,
  XL: 24,
};

// ─── Layout Constants ────────────────────────────────────────
export const SCREEN = {
  W: 1280,
  H: 720,
  CX: 640,
  CY: 360,
};

// ─── Nineslice Configs ───────────────────────────────────────
// { left, right, top, bottom } corner sizes for each asset
export const NINE = {
  PANEL:    [4, 4, 4, 4],
  BUTTON:   [4, 4, 2, 2],
  SLIDER:   [4, 4, 2, 2],
  CELL:     [4, 4, 4, 4],
  TAB:      [4, 4, 4, 4],
};

// ─── Depth Layers ────────────────────────────────────────────
export const DEPTH = {
  HUD_BG:       100,
  HUD:          101,
  HUD_TEXT:     102,
  HUD_OVERLAY:  103,
  OVERLAY_DIM:  200,
  OVERLAY_PANEL:201,
  OVERLAY_UI:   202,
  OVERLAY_TEXT: 203,
  OVERLAY_TOP:  204,
};

// ─── Alpha Presets ───────────────────────────────────────────
export const ALPHA = {
  PANEL:    0.85,
  DIMMER:   0.55,
  BAR_BG:   0.6,
  LOCKED:   0.8,
  COOLDOWN: 0.7,
  SUBTLE:   0.4,
  HINT:     0.3,
};

/**
 * Utility: get HP bar tint based on ratio (0..1)
 */
export function getHpTint(ratio) {
  if (ratio > 0.5) return COLOR.HP_FULL;
  if (ratio > 0.25) return COLOR.HP_MID;
  return COLOR.HP_LOW;
}

/**
 * Utility: build a Phaser text style from a FONT token + overrides.
 * Default fill is white with black stroke for readability over any background.
 */
export function textStyle(token, overrides = {}) {
  return { ...token, fill: COLOR.TEXT_PRIMARY, stroke: COLOR.STROKE_DARK, strokeThickness: 3, ...overrides };
}
