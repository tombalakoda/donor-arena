/**
 * UIConfig.js — Single source of truth for ALL UI design tokens.
 * Colors, typography, spacing, slot colors, and shared constants.
 *
 * Cool ice palette — white/ice-blue text with strokes for readability.
 */

// Font — Press Start 2P is the universal UI font across all screens.
const UI_FONT = "'Press Start 2P', cursive";
const UI_FONT_HEADING = "'Press Start 2P', cursive";

// ─── Color Palette (Ottoman Frost — DESIGN_SYSTEM.md) ────────
export const COLOR = {
  // Background & surface
  BG:             '#E8F0F8',
  SURFACE:        '#F4F8FC',
  ICE_ACCENT:     '#B8D8EB',

  // Text hierarchy (dark text on bright icy backgrounds)
  TEXT_PRIMARY:   '#1A2A3A',
  TEXT_SECONDARY: '#5A7A8A',
  TEXT_DISABLED:  '#7a8e9c',

  // Light text variants (for use on dark/colored backgrounds with stroke)
  TEXT_LIGHT:     '#ffffff',
  TEXT_CREAM:     '#f0e6d2',
  TEXT_ICE:       '#B8D8EB',

  // Stroke colors
  STROKE_DARK:    '#000000',
  STROKE_BROWN:   '#2a1a0a',

  // Ottoman accent colors (CSS strings)
  ACCENT_GOLD:    '#C8963E',
  ACCENT_PRIMARY: '#1B4D8A',
  ACCENT_INFO:    '#44ddff',
  ACCENT_DANGER:  '#B83A3A',
  ACCENT_SUCCESS: '#3A8A5A',

  // Tint values (hex numbers for Phaser tint)
  TINT_GOLD:      0xC8963E,
  TINT_PRIMARY:   0x1B4D8A,
  TINT_INFO:      0x44ddff,
  TINT_DANGER:    0xB83A3A,
  TINT_SUCCESS:   0x3A8A5A,
  TINT_HOVER:     0xddccaa,
  TINT_PRESS:     0xbbaa88,
  TINT_DISABLED:  0x777777,
  TINT_ICE:       0xB8D8EB,
  TINT_SURFACE:   0xF4F8FC,

  // Dimmer only
  DIMMER_TINT:    0x000000,

  // Border
  BORDER:         '#A8C8DC',
  TINT_BORDER:    0xA8C8DC,

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
  FAMILY_HEADING: UI_FONT_HEADING,

  // Heading font (Press Start 2P — pixel aesthetic)
  H1:       { fontSize: '24px', fontFamily: UI_FONT_HEADING },
  H2:       { fontSize: '16px', fontFamily: UI_FONT_HEADING },
  H3:       { fontSize: '12px', fontFamily: UI_FONT_HEADING },

  // Body font sizes (Press Start 2P — legacy size tokens)
  TITLE_LG: { fontSize: '54px', fontFamily: UI_FONT, fontStyle: 'bold' },
  TITLE_SM: { fontSize: '36px', fontFamily: UI_FONT, fontStyle: 'bold' },
  BODY:     { fontSize: '24px', fontFamily: UI_FONT },
  BODY_BOLD:{ fontSize: '24px', fontFamily: UI_FONT, fontStyle: 'bold' },
  SMALL:    { fontSize: '22px', fontFamily: UI_FONT },
  TINY:     { fontSize: '20px', fontFamily: UI_FONT, fontStyle: 'bold' },
  NUMBER_LG:{ fontSize: '48px', fontFamily: UI_FONT, fontStyle: 'bold' },
  DAMAGE:   { fontSize: '24px', fontFamily: UI_FONT, fontStyle: 'bold' },
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
  return { ...token, fill: COLOR.TEXT_LIGHT, stroke: COLOR.STROKE_DARK, strokeThickness: 4, ...overrides };
}
