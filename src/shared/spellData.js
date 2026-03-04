// Spell type constants and base spell definitions shared between client and server.
// Actual spell stats are computed dynamically from the skill tree (skillTreeData.js).
// This file provides the type system, key mappings, and FX definitions.

export const SPELL_TYPES = {
  PROJECTILE: 'projectile',
  ZONE: 'zone',
  WALL: 'wall',
  INSTANT: 'instant',
  BLINK: 'blink',
  DASH: 'dash',
  HOOK: 'hook',
};

// Base spell definitions — used for FX, icons, and slot mapping.
// Actual numeric stats come from computeSpellStats() in skillTreeData.js.
export const SPELLS = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      scale: 0.9,
      sound: 'sfx-fireball',
      color: 0xff4400,
      glowColor: 0xff8800,
    },
    icon: 'spell-BookFire',
  },

  blink: {
    id: 'blink',
    name: 'Blink',
    type: SPELL_TYPES.BLINK,
    slot: 'W',
    fx: {
      sprite: 'fx-spirit',
      animKey: 'fx-spirit-play',
      scale: 1.2,
      sound: 'sfx-blink',
      color: 0x44ddff,
    },
    icon: 'spell-BookLight',
  },

  frostBolt: {
    id: 'frostBolt',
    name: 'Frost Bolt',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'E',
    fx: {
      sprite: 'fx-ice',
      animKey: 'fx-ice-play',
      scale: 0.9,
      sound: 'sfx-ice',
      color: 0x44ddff,
      glowColor: 0x88eeff,
    },
    icon: 'spell-BookIce',
  },

  hook: {
    id: 'hook',
    name: 'Hook',
    type: SPELL_TYPES.HOOK,
    slot: 'R',
    fx: {
      sprite: 'fx-rock',
      animKey: 'fx-rock-play',
      scale: 0.9,
      sound: 'sfx-hook',
      color: 0x886644,
      chainColor: 0xaaaaaa,
    },
    icon: 'spell-BookDeath',
  },
};

// Map keyboard keys to spell IDs
export const SPELL_KEYS = {
  Q: 'fireball',
  W: 'blink',
  E: 'frostBolt',
  R: 'hook',
};

// Get spell by slot key
export function getSpellForKey(key) {
  const spellId = SPELL_KEYS[key.toUpperCase()];
  return spellId ? SPELLS[spellId] : null;
}
