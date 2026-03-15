// Item system data definitions: Materials, Recipes, Hazine (set bonuses)

// ─── MATERIALS ───────────────────────────────────────────────
export const MATERIALS = {
  buz:      { id: 'buz',      name: 'Buz Parcasi', tag: 'ice',      color: 0x4DC9F6 },
  koz:      { id: 'koz',      name: 'Koz',         tag: 'fire',     color: 0xFF6B35 },
  agir:     { id: 'agir',     name: 'Agir Tas',    tag: 'force',    color: 0x8B7355 },
  telek:    { id: 'telek',    name: 'Telek',       tag: 'speed',    color: 0x7FFF7F },
  demir:    { id: 'demir',    name: 'Demir',       tag: 'guard',    color: 0xA0A0A0 },
  kehribar: { id: 'kehribar', name: 'Kehribar',    tag: 'electric', color: 0xFFD700 },
  altin:    { id: 'altin',    name: 'Altin Varak', tag: 'greed',    color: 0xDAA520 },
  gam:      { id: 'gam',      name: 'Gam Yuku',    tag: 'stealth',  color: 0x6B3FA0 },
};

export const MATERIAL_IDS = Object.keys(MATERIALS);

// ─── RECIPES ─────────────────────────────────────────────────
// All 24 recipes: 8 Saz (offense), 8 Yadigar (utility), 8 Pabuc (movement)
// Rarity: beyaz (common, 2 mats), yesil (uncommon, 3 mats), mor (rare, 4 mats)

export const RECIPES = {
  // ── SAZ (Offense) ──────────────────────────────────────────
  'saz-organ': {
    id: 'saz-organ', name: 'Organ', slot: 'saz',
    ingredients: { koz: 2 },
    tags: ['fire'], rarity: 'beyaz',
    effect: { damageDealtMult: 1.12 },
    description: '+%12 buyu hasari',
  },
  'saz-piyano': {
    id: 'saz-piyano', name: 'Piyano', slot: 'saz',
    ingredients: { buz: 1, koz: 1 },
    tags: ['ice', 'fire'], rarity: 'yesil',
    effect: { slowBonusDamage: 1 },
    description: 'Yavaslatan buyuler +1 bonus hasar verir',
  },
  'saz-tokmak': {
    id: 'saz-tokmak', name: 'Tokmak', slot: 'saz',
    ingredients: { agir: 2 },
    tags: ['force'], rarity: 'beyaz',
    effect: { kbDealtMult: 1.12 },
    description: '+%12 itme gucu',
  },
  'saz-santur': {
    id: 'saz-santur', name: 'Santur', slot: 'saz',
    ingredients: { buz: 1, agir: 1 },
    tags: ['ice', 'force'], rarity: 'yesil',
    effect: { kbBonusVsSlowed: 0.15 },
    description: 'Yavaslamis hedeflere +%15 itme',
  },
  'saz-kudum': {
    id: 'saz-kudum', name: 'Kudum', slot: 'saz',
    ingredients: { agir: 1, telek: 1 },
    tags: ['force', 'speed'], rarity: 'yesil',
    effect: { projectileSpeedMult: 1.15, kbBonusAtMaxRange: 0.08 },
    description: 'Mermiler +%15 hizli, menzil sonunda +%8 itme',
  },
  'saz-korg': {
    id: 'saz-korg', name: 'Korg', slot: 'saz',
    ingredients: { koz: 1, kehribar: 1 },
    tags: ['fire', 'electric'], rarity: 'mor',
    effect: { damageDealtMult: 1.20, kbTakenMult: 1.10 },
    description: '+%20 hasar, ama +%10 itme yeme',
  },
  'saz-theremin': {
    id: 'saz-theremin', name: 'Theremin', slot: 'saz',
    ingredients: { gam: 1, koz: 1 },
    tags: ['stealth', 'fire'], rarity: 'yesil',
    effect: { firstHitBonusDamage: 0.40 },
    description: 'Her raundun ilk buyusu +%40 hasar verir',
  },
  'saz-ksilifon': {
    id: 'saz-ksilifon', name: 'Ksilifon', slot: 'saz',
    ingredients: { altin: 1, agir: 1, koz: 1 },
    tags: ['greed', 'force'], rarity: 'mor',
    effect: { spBonusPerKill: 1 },
    description: 'Eleme basina +1 SP',
  },

  // ── YADIGAR (Utility) ─────────────────────────────────────
  'yad-cevsen': {
    id: 'yad-cevsen', name: 'Cevsen', slot: 'yadigar',
    ingredients: { buz: 2 },
    tags: ['ice'], rarity: 'beyaz',
    effect: { slowResistMult: 0.75 },
    description: 'Yavaslamalar %25 daha kisa surer',
  },
  'yad-celik-serhad': {
    id: 'yad-celik-serhad', name: 'Celik Serhad', slot: 'yadigar',
    ingredients: { demir: 2 },
    tags: ['guard'], rarity: 'beyaz',
    effect: { damageTakenMult: 0.92 },
    description: '+%8 hasar azaltma',
  },
  'yad-ampul': {
    id: 'yad-ampul', name: 'Ampul', slot: 'yadigar',
    ingredients: { kehribar: 1, demir: 1 },
    tags: ['electric', 'guard'], rarity: 'yesil',
    effect: { lowHpDamageReduction: 0.15, lowHpThreshold: 0.30 },
    description: '%30 HP altinda +%15 hasar azaltma',
  },
  'yad-saat': {
    id: 'yad-saat', name: 'Saat', slot: 'yadigar',
    ingredients: { gam: 2 },
    tags: ['stealth'], rarity: 'beyaz',
    effect: { idleCooldownReduction: 0.30 },
    description: '3s saldirmayinca sonraki buyu -%30 bekleme',
  },
  'yad-sikke-kesesi': {
    id: 'yad-sikke-kesesi', name: 'Sikke Kesesi', slot: 'yadigar',
    ingredients: { altin: 2 },
    tags: ['greed'], rarity: 'beyaz',
    effect: { spBonusPerRound: 1 },
    description: 'Her raund +1 SP',
  },
  'yad-kelepce': {
    id: 'yad-kelepce', name: 'Kelepce', slot: 'yadigar',
    ingredients: { buz: 1, demir: 1 },
    tags: ['ice', 'guard'], rarity: 'yesil',
    effect: { slowResistMult: 0.80 },
    description: 'Yavaslatma/kokleme direnci +%20',
  },
  'yad-altin-boru': {
    id: 'yad-altin-boru', name: 'Sari Altindan Bir Boru', slot: 'yadigar',
    ingredients: { altin: 1, gam: 1, demir: 1 },
    tags: ['greed', 'stealth'], rarity: 'mor',
    effect: { disassembleBonus: 1 },
    description: 'Parcalama 1 yerine 2 malzeme verir',
  },
  'yad-kozmatik': {
    id: 'yad-kozmatik', name: 'Kozmatik', slot: 'yadigar',
    ingredients: { koz: 1, kehribar: 1, demir: 1 },
    tags: ['fire', 'electric'], rarity: 'mor',
    effect: { maxHpBonus: 15, cooldownMult: 1.10 },
    description: '+15 maks HP, ama buyulerin +%10 bekleme',
  },

  // ── PABUC (Movement) ──────────────────────────────────────
  'pab-carik': {
    id: 'pab-carik', name: 'Carik', slot: 'pabuc',
    ingredients: { telek: 2 },
    tags: ['speed'], rarity: 'beyaz',
    effect: { moveSpeedMult: 1.10 },
    description: '+%10 hareket hizi',
  },
  'pab-kosele': {
    id: 'pab-kosele', name: 'Kosele', slot: 'pabuc',
    ingredients: { demir: 1, telek: 1 },
    tags: ['guard', 'speed'], rarity: 'yesil',
    effect: { kbTakenMult: 0.92, moveSpeedMult: 0.95 },
    description: '+%8 itme direnci, -%5 hareket hizi',
  },
  'pab-takunya': {
    id: 'pab-takunya', name: 'Takunya', slot: 'pabuc',
    ingredients: { buz: 1, telek: 1 },
    tags: ['ice', 'speed'], rarity: 'yesil',
    effect: { frictionMult: 0.70, moveSpeedMult: 1.05 },
    description: '-%30 surtunme (daha cok kayma), +%5 hiz',
  },
  'pab-yun-patik': {
    id: 'pab-yun-patik', name: 'Yun Patik', slot: 'pabuc',
    ingredients: { gam: 1, telek: 1 },
    tags: ['stealth', 'speed'], rarity: 'yesil',
    effect: { diMult: 1.20 },
    description: 'Itme sirasinda +%20 yon kontrolu (DI)',
  },
  'pab-kundura': {
    id: 'pab-kundura', name: 'Kundura', slot: 'pabuc',
    ingredients: { agir: 1, demir: 1 },
    tags: ['force', 'guard'], rarity: 'yesil',
    effect: { kbTakenMult: 0.85, moveSpeedMult: 0.92 },
    description: '+%15 itme direnci, -%8 hareket hizi',
  },
  'pab-nalin': {
    id: 'pab-nalin', name: 'Nalin', slot: 'pabuc',
    ingredients: { kehribar: 1, telek: 1 },
    tags: ['electric', 'speed'], rarity: 'mor',
    effect: { moveSpeedMult: 1.18, maxHpBonus: -12 },
    description: '+%18 hareket hizi, -12 maks HP',
  },
  'pab-corap': {
    id: 'pab-corap', name: 'Corap', slot: 'pabuc',
    ingredients: { altin: 1, telek: 1, gam: 1 },
    tags: ['greed', 'speed'], rarity: 'mor',
    effect: { moveSpeedMult: 1.05, materialBonusPerRound: 1 },
    description: '+%5 hiz, her raund +1 ekstra malzeme',
  },
  'pab-basmak': {
    id: 'pab-basmak', name: 'Basmak', slot: 'pabuc',
    ingredients: { koz: 1, telek: 1, agir: 1 },
    tags: ['fire', 'speed'], rarity: 'mor',
    effect: { maxSpeedKbBonus: 0.10 },
    description: 'Maks hizdayken buyulerin +%10 itme verir',
  },
};

// ─── HAZINE (Set Bonuses) ────────────────────────────────────
// Activate automatically when equipped items have matching tags.
// requirement.type: 'same' (N items share tag), 'cross' (specific tag pair), 'triple' (3x same tag)

export const HAZINE = {
  // 2-tag same: require 2 different equipped items with same tag
  'hz-buzul': {
    id: 'hz-buzul', name: 'Buzul',
    requirement: { type: 'same', tag: 'ice', count: 2 },
    effect: { kbBonusVsSlowed: 0.12 },
    description: 'Yavaslamis hedefler senden %12 daha fazla itme alir',
  },
  'hz-yangin': {
    id: 'hz-yangin', name: 'Yangin',
    requirement: { type: 'same', tag: 'fire', count: 2 },
    effect: { burnOnHit: true, burnDamage: 1, burnDuration: 1000 },
    description: 'Hasar veren buyulerin 1s boyunca yakar (1 HP/s)',
  },
  'hz-deprem': {
    id: 'hz-deprem', name: 'Deprem',
    requirement: { type: 'same', tag: 'force', count: 2 },
    effect: { ignoreKbResistPct: 0.30 },
    description: 'Itmen hedefin pasif itme direncinin %30unu yoksayar',
  },
  'hz-kasirga': {
    id: 'hz-kasirga', name: 'Kasirga',
    requirement: { type: 'same', tag: 'speed', count: 2 },
    effect: { postCastSpeedBuff: 0.15, postCastSpeedDuration: 2000 },
    description: 'Buyu kullandiktan sonra 2s +%15 hiz',
  },
  'hz-kale': {
    id: 'hz-kale', name: 'Kale',
    requirement: { type: 'same', tag: 'guard', count: 2 },
    effect: { roundDamageReductionPerRound: 0.05, roundDamageReductionCap: 0.25 },
    description: 'Hayatta kaldigin her raund %5 daha az hasar alirsin (maks %25)',
  },
  'hz-akimlar': {
    id: 'hz-akimlar', name: 'Akimlar',
    requirement: { type: 'same', tag: 'electric', count: 2 },
    effect: { damageDealtMult: 1.25, kbTakenMult: 1.20 },
    description: '+%25 hasar, ama +%20 itme yeme',
  },
  'hz-hazine-av': {
    id: 'hz-hazine-av', name: 'Hazine Avcisi',
    requirement: { type: 'same', tag: 'greed', count: 2 },
    effect: { spBonusPerRound: 2 },
    description: 'Her raund +2 SP',
  },
  'hz-hayalet': {
    id: 'hz-hayalet', name: 'Hayalet',
    requirement: { type: 'same', tag: 'stealth', count: 2 },
    effect: { hayaletActive: true },
    description: 'Itme yedikten sonra 1.5s yari seffaf olursun',
  },

  // 2-tag cross: require specific different tags across items
  'hz-permafrost': {
    id: 'hz-permafrost', name: 'Permafrost',
    requirement: { type: 'cross', tags: ['ice', 'guard'] },
    effect: { slowDurationMult: 1.30 },
    description: 'Uyguladigin yavaslatmalar %30 daha uzun surer',
  },
  'hz-isik-topu': {
    id: 'hz-isik-topu', name: 'Isik Topu',
    requirement: { type: 'cross', tags: ['force', 'speed'] },
    effect: { kbBonusAtMaxRange: 0.20 },
    description: 'Menzilinin %70inden fazla giden mermiler +%20 itme',
  },
  'hz-berserker': {
    id: 'hz-berserker', name: 'Berserker',
    requirement: { type: 'cross', tags: ['fire', 'electric'] },
    effect: { lowHpDamageBonus: 0.20, lowHpThreshold: 0.40 },
    description: '%40 HP altinda: +%20 hasar',
  },
  'hz-korsanlik': {
    id: 'hz-korsanlik', name: 'Korsanlik',
    requirement: { type: 'cross', tags: ['greed', 'electric'] },
    effect: { korsanlikActive: true },
    description: 'Cift malzeme dususu, ama her raunda %85 HP ile basla',
  },
  'hz-sessiz-olum': {
    id: 'hz-sessiz-olum', name: 'Sessiz Olum',
    requirement: { type: 'cross', tags: ['stealth', 'force'] },
    effect: { firstKbBonusForce: 0.25 },
    description: 'Her raundun ilk itmesi +%25 guc',
  },
  'hz-buz-kalesi': {
    id: 'hz-buz-kalesi', name: 'Buz Kalesi',
    requirement: { type: 'cross', tags: ['ice', 'speed'] },
    effect: { slidingSlowBonus: 0.15 },
    description: 'Kayarken (hiz > %80) yavaslatma buyulerin +%15 yavaslatma',
  },

  // 3-tag: require same tag on ALL 3 equipped items
  'hz-mutlak-sifir': {
    id: 'hz-mutlak-sifir', name: 'Mutlak Sifir',
    requirement: { type: 'same', tag: 'ice', count: 3 },
    effect: { slowOnHit: 0.15, slowOnHitDuration: 1500 },
    description: 'Tum buyulerin 1.5s boyunca 0.15 yavaslatma uygular',
  },
  'hz-cehennem': {
    id: 'hz-cehennem', name: 'Cehennem',
    requirement: { type: 'same', tag: 'fire', count: 3 },
    effect: { burnDamage: 2, burnDuration: 2000 },
    description: 'Yanma hasari 2 HP/s, 2s olur',
  },
  'hz-titan': {
    id: 'hz-titan', name: 'Titan',
    requirement: { type: 'same', tag: 'force', count: 3 },
    effect: { kbDealtMult: 1.20, kbTakenMult: 0.90, moveSpeedMult: 0.90 },
    description: '+%20 itme, +%10 itme direnci, -%10 hiz',
  },
  'hz-simsek': {
    id: 'hz-simsek', name: 'Simsek',
    requirement: { type: 'same', tag: 'speed', count: 3 },
    effect: { moveSpeedMult: 1.25, diMult: 1.30, maxHpBonus: -15 },
    description: '+%25 hiz, +%30 DI, -15 maks HP',
  },
};

// ─── ITEM CONSTANTS ──────────────────────────────────────────
export const ITEM_CONSTANTS = {
  MAX_STASH_SIZE: 6,
  MAX_NAZAR: 10,
  NAZAR_COST_REROLL: 1,
  NAZAR_COST_EXTRA_MATERIAL: 2,
  NAZAR_COST_RECIPE_HINT: 3,
  NAZAR_PER_KB: 1,
  NAZAR_PER_ELIMINATION: 2,
  NAZAR_PER_SURVIVE_AFTER_ELIM: 1,
  NAZAR_PER_RING_DAMAGE_SEC: 0.5,
};

// ─── HELPERS ─────────────────────────────────────────────────

/**
 * Check if a set of material counts matches a recipe's ingredients.
 * @param {Object} materials - { buz: 3, koz: 1, ... }
 * @param {Object} ingredients - { buz: 1, agir: 1 }
 * @returns {boolean}
 */
export function hasIngredientsFor(materials, ingredients) {
  for (const [matId, needed] of Object.entries(ingredients)) {
    if ((materials[matId] || 0) < needed) return false;
  }
  return true;
}

/**
 * Find a recipe matching the given material combination.
 * Used for undiscovered recipe discovery (DENE button).
 * @param {Object} materialCombo - { buz: 2 } or { koz: 1, agir: 1 }
 * @returns {string|null} recipe ID or null
 */
export function findRecipeByIngredients(materialCombo) {
  for (const recipe of Object.values(RECIPES)) {
    const ing = recipe.ingredients;
    // Check same keys with same counts
    const ingKeys = Object.keys(ing);
    const comboKeys = Object.keys(materialCombo);
    if (ingKeys.length !== comboKeys.length) continue;

    let match = true;
    for (const key of ingKeys) {
      if (ing[key] !== materialCombo[key]) { match = false; break; }
    }
    if (match) return recipe.id;
  }
  return null;
}

/**
 * Compute which Hazine are active given equipped item tags.
 * @param {Object} equipped - { saz: item|null, yadigar: item|null, pabuc: item|null }
 * @returns {string[]} array of active Hazine IDs
 */
export function computeActiveHazine(equipped) {
  // Collect all tags from equipped items, grouped by slot
  const slotTags = {};
  const allTags = [];
  for (const [slot, item] of Object.entries(equipped)) {
    if (!item) continue;
    slotTags[slot] = item.tags || [];
    for (const tag of item.tags) {
      allTags.push({ tag, slot });
    }
  }

  // Count tags across DIFFERENT slots
  const tagSlots = {}; // tag -> Set of slots
  for (const { tag, slot } of allTags) {
    if (!tagSlots[tag]) tagSlots[tag] = new Set();
    tagSlots[tag].add(slot);
  }

  const active = [];

  for (const [hzId, hz] of Object.entries(HAZINE)) {
    const req = hz.requirement;

    if (req.type === 'same') {
      // Need `count` different slots with this tag
      const slots = tagSlots[req.tag];
      if (slots && slots.size >= req.count) {
        active.push(hzId);
      }
    } else if (req.type === 'cross') {
      // Need both tags present across equipped items (in different slots)
      const [tagA, tagB] = req.tags;
      const slotsA = tagSlots[tagA];
      const slotsB = tagSlots[tagB];
      if (slotsA && slotsB && slotsA.size > 0 && slotsB.size > 0) {
        active.push(hzId);
      }
    }
  }

  return active;
}

/**
 * Get total ingredient count for a recipe (for rarity display).
 */
export function getRecipeIngredientCount(recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return 0;
  return Object.values(recipe.ingredients).reduce((sum, n) => sum + n, 0);
}

/**
 * Get a random material from the ingredient list of a recipe.
 * Used for disassembly returns.
 */
export function getRandomIngredient(recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return MATERIAL_IDS[Math.floor(Math.random() * MATERIAL_IDS.length)];

  const pool = [];
  for (const [matId, count] of Object.entries(recipe.ingredients)) {
    for (let i = 0; i < count; i++) pool.push(matId);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
