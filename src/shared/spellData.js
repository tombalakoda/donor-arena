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
  BARREL: 'barrel',
};

// Which spells are available in each slot
export const SLOT_SPELLS = {
  Q: ['fireball-focus', 'fireball-speed', 'fireball-power'],
  W: ['blink', 'dash', 'flash', 'ghost', 'swap', 'timeshift', 'grappling'],
  E: ['frostbolt', 'blizzard', 'icewall', 'bouncer', 'shield'],
  R: ['hook', 'lightning', 'homing', 'meteor', 'rocketswarm', 'boomerang', 'bade'],
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
  // Q — SÖZ (3 paths)
  // ═══════════════════════════════════════════════════════════════
  'fireball-focus': {
    id: 'fireball-focus',
    name: 'Uzun Hava',
    description: 'Uzun menzil, delici sözler.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      displaySprite: 'fx-fireball-display',
      displayAnimKey: 'fx-fireball-display-play',
      scale: 1.0,
      sound: 'sfx-fireball',
      color: 0xff4400,
      glowColor: 0xff8800,
    },
    icon: 'icon-uzunhava',
  },
  'fireball-speed': {
    id: 'fireball-speed',
    name: 'Tekerleme',
    description: 'Art arda, hızlı sözler.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      displaySprite: 'fx-fireball-display',
      displayAnimKey: 'fx-fireball-display-play',
      scale: 0.23,
      sound: 'sfx-fireball',
      color: 0xff6622,
      glowColor: 0xffaa44,
    },
    icon: 'spell-Fireball',
  },
  'fireball-power': {
    id: 'fireball-power',
    name: 'Taşlama',
    description: 'Ağır nakavt, yıkıcı söz.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'Q',
    fx: {
      sprite: 'fx-flam',
      animKey: 'fx-flam-play',
      displaySprite: 'fx-fireball-display',
      displayAnimKey: 'fx-fireball-display-play',
      scale: 1.0,
      sound: 'sfx-fireball',
      color: 0xdd2200,
      glowColor: 0xff4400,
    },
    icon: 'spell-Explosion',
  },

  // ═══════════════════════════════════════════════════════════════
  // W — EL (6 spells)
  // ═══════════════════════════════════════════════════════════════
  'blink': {
    id: 'blink',
    name: 'Hop',
    description: 'Gözünü açıp kapayıncaya dek ışınlan.',
    type: SPELL_TYPES.BLINK,
    slot: 'W',
    fx: {
      sprite: 'fx-spirit',
      animKey: 'fx-spirit-play',
      scale: 1.2,
      sound: 'sfx-blink',
      color: 0x44ddff,
    },
    icon: 'spell-OrbLight',
  },
  'dash': {
    id: 'dash',
    name: 'Koşma',
    description: 'İleri atıl, yolundaki rakipleri savur.',
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
    icon: 'icon-kosma',
  },
  'flash': {
    id: 'flash',
    name: 'Seğirtme',
    description: 'Kısa süre hız patlaması.',
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
    icon: 'icon-segirtme',
  },
  'ghost': {
    id: 'ghost',
    name: 'Gayb',
    description: 'Gayba karış. Hünerler senden geçer.',
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
    icon: 'icon-gayb',
  },
  'swap': {
    id: 'swap',
    name: 'Çelme',
    description: 'Söz fırlat. İsabet ederse yer değiştir.',
    type: SPELL_TYPES.SWAP,
    slot: 'W',
    fx: {
      sprite: 'fx-canonball',
      animKey: 'fx-canonball-play',
      scale: 0.9,
      sound: 'sfx-blink',
      color: 0xcc44ff,
      glowColor: 0xdd88ff,
    },
    icon: 'icon-celme',
  },
  'timeshift': {
    id: 'timeshift',
    name: 'Devir',
    description: 'Üç sâniye evvelki yerine dön.',
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
    icon: 'icon-devir',
  },

  // ═══════════════════════════════════════════════════════════════
  // E — DİL (5 spells)
  // ═══════════════════════════════════════════════════════════════
  'frostbolt': {
    id: 'frostbolt',
    name: 'Yârin Gözü',
    description: 'Yavaşlatır, kısa süre dili bağlar.',
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
    icon: 'spell-Vision',
  },
  'blizzard': {
    id: 'blizzard',
    name: 'Yârin Sözü',
    description: 'Ayaz bölgesi bırakır, içindeki herkesi yavaşlatır.',
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
    icon: 'spell-WaterCanon',
  },
  'icewall': {
    id: 'icewall',
    name: 'Mâni',
    description: 'Geçici set kurar; yol ve hünerleri engeller.',
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
    icon: 'icon-mani',
  },
  'bouncer': {
    id: 'bouncer',
    name: 'Karşılama',
    description: 'Duvardan sekerken rakip hünerlerini yok eder.',
    type: SPELL_TYPES.PROJECTILE,
    slot: 'E',
    fx: {
      sprite: 'fx-shuriken-magic',
      animKey: 'fx-shuriken-magic-play',
      scale: 0.9,
      sound: 'sfx-hook',
      color: 0x66bbff,
      glowColor: 0x99ddff,
    },
    icon: 'icon-karsilama',
  },
  'shield': {
    id: 'shield',
    name: 'Himmet',
    description: 'Geçici siper; gelen darbeleri emer.',
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
    icon: 'spell-DefenseUpgrade',
  },

  // ═══════════════════════════════════════════════════════════════
  // R — BEL (7 spells)
  // ═══════════════════════════════════════════════════════════════
  'hook': {
    id: 'hook',
    name: 'Bağlama',
    description: 'Rakibi yakala, çek, karşı tarafa savur.',
    type: SPELL_TYPES.HOOK,
    slot: 'R',
    fx: {
      sprite: 'fx-kunai',
      scale: 1.8,
      sound: 'sfx-hook',
      color: 0x886644,
      chainColor: 0xaaaaaa,
    },
    icon: 'icon-baglama',
  },
  'grappling': {
    id: 'grappling',
    name: 'Sallama',
    description: 'Bir noktaya tutun, kendini çek, yoldakilere çarp.',
    type: SPELL_TYPES.HOOK,
    slot: 'W',
    fx: {
      sprite: 'fx-kunai',
      scale: 1.8,
      sound: 'sfx-hook',
      color: 0x666688,
      chainColor: 0x888888,
    },
    icon: 'icon-sallama',
  },
  'lightning': {
    id: 'lightning',
    name: 'Sitem',
    description: 'Yakın mesafede anlık itme.',
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
    icon: 'icon-sitem',
  },
  'homing': {
    id: 'homing',
    name: 'Hasret',
    description: 'Rakibi kovalayan güdümlü söz.',
    type: SPELL_TYPES.HOMING,
    slot: 'R',
    fx: {
      sprite: 'fx-magicball',
      animKey: 'fx-magicball-play',
      scale: 0.7,
      sound: 'sfx-fireball',
      color: 0xaa44ff,
      glowColor: 0xcc88ff,
    },
    icon: 'icon-hasret',
  },
  'meteor': {
    id: 'meteor',
    name: 'Nazar',
    description: 'Gecikmeli, geniş alan etkili ağır darbe.',
    type: SPELL_TYPES.ZONE,
    slot: 'R',
    fx: {
      sprite: 'fx-puf',
      animKey: 'fx-puf-play',
      scale: 2.0,
      sound: 'sfx-meteor',
      color: 0xaa66ff,
      glowColor: 0xcc88ff,
    },
    icon: 'icon-nazar',
  },
  'rocketswarm': {
    id: 'rocketswarm',
    name: 'Gıybet',
    description: 'Bir yığın küçük söz, yakındaki herkesi kovalar.',
    type: SPELL_TYPES.HOMING,
    slot: 'R',
    fx: {
      sprite: 'fx-giybet',
      animKey: 'fx-giybet-play',
      scale: 0.5,
      sound: 'sfx-fireball',
      color: 0x88cc44,
      glowColor: 0xaaee66,
    },
    icon: 'icon-giybet',
  },
  'boomerang': {
    id: 'boomerang',
    name: 'Beddua',
    description: 'Gidip döner. Ne kadar uzağa gittiyse o kadar sert döner.',
    type: SPELL_TYPES.BOOMERANG,
    slot: 'R',
    fx: {
      sprite: 'fx-shuriken',
      animKey: 'fx-shuriken-play',
      scale: 1.0,
      sound: 'sfx-hook',
      color: 0x888899,
      glowColor: 0xaaaacc,
    },
    icon: 'icon-beddua',
  },
  'bade': {
    id: 'bade',
    name: 'Bade',
    description: 'Varil yuvarla, yolundakileri it.',
    type: SPELL_TYPES.BARREL,
    slot: 'R',
    fx: {
      sprite: 'fx-canonball-bade',
      animKey: 'fx-canonball-bade-play',
      scale: 2.5,
      sound: 'sfx-fireball',
      color: 0x885522,
      glowColor: 0xcc8844,
    },
    icon: 'icon-bade',
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
