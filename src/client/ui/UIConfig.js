/**
 * UIConfig.js — Single source of truth for ALL UI design tokens.
 * Colors, typography, spacing, slot colors, and shared constants.
 */

import { UI_FONT } from '../config.js';

// ─── Color Palette ───────────────────────────────────────────
export const COLOR = {
  // Tint values (hex numbers for Phaser tint)
  BG_DARK:        0x0d0b09,
  BG_PANEL:       0x1a1510,
  BG_OVERLAY:     0x000000,
  DIMMER_TINT:    0x000000,

  // Text colors (CSS strings for Phaser text)
  TEXT_PRIMARY:   '#f0e6d2',
  TEXT_SECONDARY: '#8a7e6c',
  TEXT_DISABLED:  '#4a4438',

  // Accent colors (CSS strings)
  ACCENT_GOLD:    '#f0c040',
  ACCENT_INFO:    '#5cb8d6',
  ACCENT_DANGER:  '#e84040',
  ACCENT_SUCCESS: '#48c878',

  // Accent tints (hex numbers)
  TINT_GOLD:      0xf0c040,
  TINT_INFO:      0x5cb8d6,
  TINT_DANGER:    0xe84040,
  TINT_SUCCESS:   0x48c878,
  TINT_HOVER:     0xffe8cc,
  TINT_PRESS:     0xccaa88,
  TINT_DISABLED:  0x888888,

  // HP bar gradient tints
  HP_FULL:        0x40c090,
  HP_MID:         0xe0b040,
  HP_LOW:         0xe84040,
};

// ─── Slot Colors ─────────────────────────────────────────────
export const SLOT_COLOR = {
  Q: { hex: '#e85840', tint: 0xe85840 },
  W: { hex: '#40a8e0', tint: 0x40a8e0 },
  E: { hex: '#40c890', tint: 0x40c890 },
  R: { hex: '#b060e0', tint: 0xb060e0 },
};

// ─── Typography ──────────────────────────────────────────────
export const FONT = {
  FAMILY: UI_FONT,

  TITLE_LG: { fontSize: '28px', fontFamily: UI_FONT, fontStyle: 'bold' },
  TITLE_SM: { fontSize: '18px', fontFamily: UI_FONT, fontStyle: 'bold' },
  BODY:     { fontSize: '12px', fontFamily: UI_FONT },
  BODY_BOLD:{ fontSize: '12px', fontFamily: UI_FONT, fontStyle: 'bold' },
  SMALL:    { fontSize: '10px', fontFamily: UI_FONT },
  TINY:     { fontSize: '9px',  fontFamily: UI_FONT, fontStyle: 'bold' },
  NUMBER_LG:{ fontSize: '24px', fontFamily: UI_FONT, fontStyle: 'bold' },
  DAMAGE:   { fontSize: '13px', fontFamily: UI_FONT, fontStyle: 'bold' },
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
  DIMMER:   0.75,
  BAR_BG:   0.5,
  LOCKED:   0.8,
  COOLDOWN: 0.7,
  SUBTLE:   0.3,
  HINT:     0.2,
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
 * @param {object} token - One of FONT.TITLE_LG, FONT.BODY, etc.
 * @param {object} overrides - e.g. { fill: COLOR.ACCENT_GOLD, stroke: '#000', strokeThickness: 2 }
 */
export function textStyle(token, overrides = {}) {
  return { ...token, fill: COLOR.TEXT_PRIMARY, ...overrides };
}
