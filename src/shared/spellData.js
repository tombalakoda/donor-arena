// Spell type constants and base spell definitions shared between client and server.
// Actual spell stats are computed dynamically from the skill tree (skillTreeData.js).
// This file provides the type system, slot mappings, and FX definitions.

export const SPELL_TYPES = {
  PROJECTILE: 'projectile',
  ZONE: 'zone',
  WALL: 'wall',
  INSTANT: 'instant',
  BLINK: 'blink',
  DASH: 'dash',
  HOOK: 'hook',
  BUFF: 'buff',
  SWAP: 'swap',
  RECALL: 'recall',
  HOMING: 'homing',
  BOOMERANG: 'boomerang',
};

// Which spells are available in each slot
export const SLOT_SPELLS = {
  Q: ['fireball-focus', 'fireball-speed', 'fireball-power'],
  W: ['blink', 'dash', 'flash', 'ghost', 'swap', 'timeshift'],
  E: ['frostbolt', 'blizzard', 'icewall', 'bouncer', 'shield'],
  R: ['hook', 'grappling', 'lightning', 'homing', 'meteor', 'rocketswarm', 'boomerang'],
};

// Reverse map: spell ID → slot
export const SPELL_TO_SLOT = {};
for (const [slot, spells] of Object.entries(SLOT_SPELLS)) {
  for (const spellId of spells) {
    SPELL_TO_SLOT[spellId] = slot;
  }
}

// Full spell metadata — name, description, type, FX, icons
export const SPELLS = {
  // ═══════════════════════════════════════════════════════════════
  // Q — FIREBALL VARIANTS (3 paths)
  // ═══════════════════════════════════════════════════════════════
  'fireball-focus': {
    id: 'fireball-focus',
    name: 'Focus',
    description: 'Long range, piercing shots.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      scale: 1.0,
      sound: 'sfx-fireball',
      color: 0xff4400,
      glowColor: 0xff8800,
    },
    icon: 'spell-BookFire',
  },
  'fireball-speed': {
    id: 'fireball-speed',
    name: 'Speed',
    description: 'Rapid fire, fast cooldown.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      scale: 0.7,
      sound: 'sfx-fireball',
      color: 0xff6622,
      glowColor: 0xffaa44,
    },
    icon: 'spell-Fireball',
  },
  'fireball-power': {
    id: 'fireball-power',
    name: 'Power',
    description: 'Heavy knockback, explosive impact.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      scale: 1.0,
      sound: 'sfx-fireball',
      color: 0xdd2200,
      glowColor: 0xff4400,
    },
    icon: 'spell-Explosion',
  },

  // ═══════════════════════════════════════════════════════════════
  // W — MOBILITY (6 spells)
  // ═══════════════════════════════════════════════════════════════
  'blink': {
    id: 'blink',
    name: 'Blink',
    description: 'Instant teleport to target position.',
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
  'dash': {
    id: 'dash',
    name: 'Dash',
    description: 'Charge forward, slamming enemies in your path.',
    type: SPELL_TYPES.DASH,
    slot: 'W',
    fx: {
      sprite: 'fx-boost',
      animKey: 'fx-boost-play',
      scale: 1.0,
      sound: 'sfx-blink',
      color: 0xff8844,
      glowColor: 0xffaa66,
    },
    icon: 'spell-BookWind',
  },
  'flash': {
    id: 'flash',
    name: 'Flash',
    description: 'Burst of speed for a short duration.',
    type: SPELL_TYPES.BUFF,
    slot: 'W',
    fx: {
      sprite: 'fx-boost',
      animKey: 'fx-boost-play',
      scale: 1.0,
      sound: 'sfx-blink',
      color: 0xffdd00,
      glowColor: 0xffee44,
    },
    icon: 'spell-AttackUpgrade',
  },
  'ghost': {
    id: 'ghost',
    name: 'Ghost',
    description: 'Become intangible. Spells pass through you.',
    type: SPELL_TYPES.BUFF,
    slot: 'W',
    fx: {
      sprite: 'fx-spirit',
      animKey: 'fx-spirit-play',
      scale: 1.5,
      sound: 'sfx-blink',
      color: 0xaabbff,
      glowColor: 0xccddff,
    },
    icon: 'spell-BookDarkness',
  },
  'swap': {
    id: 'swap',
    name: 'Swap',
    description: 'Fire a projectile. On hit, swap positions with the enemy.',
    type: SPELL_TYPES.SWAP,
    slot: 'W',
    fx: {
      sprite: 'fx-spirit',
      animKey: 'fx-spirit-play',
      scale: 0.9,
      sound: 'sfx-blink',
      color: 0xcc44ff,
      glowColor: 0xdd88ff,
    },
    icon: 'spell-Alchemy',
  },
  'timeshift': {
    id: 'timeshift',
    name: 'Time Shift',
    description: 'Teleport back to where you were 3 seconds ago.',
    type: SPELL_TYPES.RECALL,
    slot: 'W',
    fx: {
      sprite: 'fx-circle',
      animKey: 'fx-circle-play',
      scale: 1.0,
      sound: 'sfx-blink',
      color: 0x44ff88,
      glowColor: 0x88ffaa,
    },
    icon: 'spell-BookPlant',
  },

  // ═══════════════════════════════════════════════════════════════
  // E — DEBUFF / CONTROL (5 spells)
  // ═══════════════════════════════════════════════════════════════
  'frostbolt': {
    id: 'frostbolt',
    name: 'Frostbolt',
    description: 'Slows and briefly roots enemies on hit.',
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
  'blizzard': {
    id: 'blizzard',
    name: 'Blizzard',
    description: 'Drop a frost zone that slows all enemies inside.',
    type: SPELL_TYPES.ZONE,
    slot: 'E',
    fx: {
      sprite: 'fx-ice',
      animKey: 'fx-ice-play',
      scale: 1.2,
      sound: 'sfx-ice',
      color: 0x66ccff,
      glowColor: 0xaaddff,
    },
    icon: 'spell-Mist',
  },
  'icewall': {
    id: 'icewall',
    name: 'Ice Wall',
    description: 'Create a temporary barrier that blocks movement and projectiles.',
    type: SPELL_TYPES.WALL,
    slot: 'E',
    fx: {
      sprite: 'fx-ice',
      animKey: 'fx-ice-play',
      scale: 1.5,
      sound: 'sfx-ice',
      color: 0x88ccee,
      glowColor: 0xbbddff,
    },
    icon: 'spell-BookRock',
  },
  'bouncer': {
    id: 'bouncer',
    name: 'Bouncer',
    description: 'Bounces off obstacles. Destroys enemy spells on contact.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'E',
    fx: {
      sprite: 'fx-rock',
      animKey: 'fx-rock-play',
      scale: 0.9,
      sound: 'sfx-hook',
      color: 0x88aa44,
      glowColor: 0xaacc66,
    },
    icon: 'spell-BookThunder',
  },
  'shield': {
    id: 'shield',
    name: 'Shield',
    description: 'Temporary shield that absorbs incoming hits.',
    type: SPELL_TYPES.BUFF,
    slot: 'E',
    fx: {
      sprite: 'fx-shield',
      animKey: 'fx-shield-play',
      scale: 1.5,
      sound: 'sfx-ice',
      color: 0x44aaff,
      glowColor: 0x88ccff,
    },
    icon: 'spell-BookLight',
  },

  // ═══════════════════════════════════════════════════════════════
  // R — ULTIMATE (7 spells)
  // ═══════════════════════════════════════════════════════════════
  'hook': {
    id: 'hook',
    name: 'Hook',
    description: 'Hook an enemy, swing them around, and fling them.',
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
  'grappling': {
    id: 'grappling',
    name: 'Grappling',
    description: 'Hook a point, pull yourself there, collide with enemies.',
    type: SPELL_TYPES.HOOK,
    slot: 'R',
    fx: {
      sprite: 'fx-rock',
      animKey: 'fx-rock-play',
      scale: 0.9,
      sound: 'sfx-hook',
      color: 0x666688,
      chainColor: 0x888888,
    },
    icon: 'spell-BookDarkness',
  },
  'lightning': {
    id: 'lightning',
    name: 'Lightning',
    description: 'Instant blast that pushes the nearest enemy in close range.',
    type: SPELL_TYPES.INSTANT,
    slot: 'R',
    fx: {
      sprite: 'fx-thunder',
      animKey: 'fx-thunder-play',
      scale: 1.5,
      sound: 'sfx-fireball',
      color: 0xffff44,
      glowColor: 0xffffaa,
    },
    icon: 'spell-BookThunder',
  },
  'homing': {
    id: 'homing',
    name: 'Homing',
    description: 'Missile that chases the nearest enemy.',
    type: SPELL_TYPES.HOMING,
    slot: 'R',
    fx: {
      sprite: 'fx-spark',
      animKey: 'fx-spark-play',
      scale: 0.7,
      sound: 'sfx-fireball',
      color: 0xff4488,
      glowColor: 0xff88aa,
    },
    icon: 'spell-BookFire',
  },
  'meteor': {
    id: 'meteor',
    name: 'Meteor',
    description: 'Call down a meteor. Delayed impact, massive AoE push.',
    type: SPELL_TYPES.ZONE,
    slot: 'R',
    fx: {
      sprite: 'fx-explosion',
      animKey: 'fx-explosion-play',
      scale: 2.0,
      sound: 'sfx-fireball',
      color: 0xff6600,
      glowColor: 0xff8800,
    },
    icon: 'spell-Explosion',
  },
  'rocketswarm': {
    id: 'rocketswarm',
    name: 'Rocket Swarm',
    description: 'Launch a swarm of small missiles that chase nearby enemies.',
    type: SPELL_TYPES.HOMING,
    slot: 'R',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      scale: 0.5,
      sound: 'sfx-fireball',
      color: 0xff8844,
      glowColor: 0xffaa66,
    },
    icon: 'spell-BookWind',
  },
  'boomerang': {
    id: 'boomerang',
    name: 'Boomerang',
    description: 'Projectile that returns. More knockback the further it flew.',
    type: SPELL_TYPES.BOOMERANG,
    slot: 'R',
    fx: {
      sprite: 'fx-rock-spike',
      animKey: 'fx-rock-spike-play',
      scale: 1.0,
      sound: 'sfx-hook',
      color: 0xaa8866,
      glowColor: 0xccaa88,
    },
    icon: 'spell-BookRock',
  },
};

// Helper: Get spell metadata by ID
export function getSpell(spellId) {
  return SPELLS[spellId] || null;
}

// Helper: Get all spells available for a slot
export function getSpellsForSlot(slot) {
  const ids = SLOT_SPELLS[slot] || [];
  return ids.map(id => SPELLS[id]).filter(Boolean);
}

// Helper: Get the slot a spell belongs to
export function getSlotForSpell(spellId) {
  return SPELL_TO_SLOT[spellId] || null;
}
