import {
  MATERIALS, MATERIAL_IDS, RECIPES, HAZINE, ITEM_CONSTANTS,
  hasIngredientsFor, findRecipeByIngredients, computeActiveHazine,
  getRandomIngredient,
} from '../../shared/itemData.js';

/**
 * Per-player item system: materials, stash, equipped items, Hazine, Nazar, stats.
 */
export class ItemSystem {
  constructor(playerId) {
    this.playerId = playerId;

    // Material counts
    this.materials = {};
    for (const id of MATERIAL_IDS) this.materials[id] = 0;

    // Equipped items (one per slot)
    this.equipped = { saz: null, yadigar: null, pabuc: null };

    // Stash (inventory of crafted but unequipped items)
    this.stash = []; // max ITEM_CONSTANTS.MAX_STASH_SIZE

    // Active Hazine combo IDs
    this.hazineActive = [];

    // Nazar beads (comeback currency)
    this.nazar = 0;
    this.nazarAccumulator = 0; // fractional nazar from ring damage

    // Discovered recipes & hazine (loaded from client on join)
    this.discoveredRecipes = new Set();
    this.discoveredHazine = new Set();

    // Cached item stats (invalidated on equip/unequip/hazine change)
    this._statsCache = null;
    this._statsDirty = true;

    // Per-round tracking for conditional effects
    this.firstHitDealtThisRound = false;
    this.firstKbDealtThisRound = false;
    this.lastAttackTime = 0;
    this.roundsSurvived = 0;
  }

  // ─── MATERIALS ───────────────────────────────────────────

  addMaterial(type) {
    if (!MATERIALS[type]) return false;
    this.materials[type]++;
    return true;
  }

  removeMaterial(type) {
    if ((this.materials[type] || 0) <= 0) return false;
    this.materials[type]--;
    return true;
  }

  getMaterials() {
    return { ...this.materials };
  }

  getRandomMaterialType() {
    return MATERIAL_IDS[Math.floor(Math.random() * MATERIAL_IDS.length)];
  }

  // ─── CRAFTING ────────────────────────────────────────────

  canCraft(recipeId) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return { ok: false, reason: 'invalid_recipe' };
    if (this.isStashFull()) return { ok: false, reason: 'stash_full' };
    if (!hasIngredientsFor(this.materials, recipe.ingredients)) {
      return { ok: false, reason: 'insufficient_materials' };
    }
    return { ok: true };
  }

  /**
   * Craft an item. Consumes materials, adds to stash.
   * Returns { ok, item, newDiscovery } or { ok: false, reason }
   */
  craft(recipeId) {
    const check = this.canCraft(recipeId);
    if (!check.ok) return check;

    const recipe = RECIPES[recipeId];

    // Consume materials
    for (const [matId, count] of Object.entries(recipe.ingredients)) {
      this.materials[matId] -= count;
    }

    // Create item
    const item = {
      id: recipe.id,
      name: recipe.name,
      slot: recipe.slot,
      tags: [...recipe.tags],
      rarity: recipe.rarity,
      description: recipe.description,
      instanceId: `${recipe.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };

    // Add to stash
    this.stash.push(item);

    // Track discovery
    const newDiscovery = !this.discoveredRecipes.has(recipeId);
    this.discoveredRecipes.add(recipeId);

    return { ok: true, item, newDiscovery };
  }

  /**
   * Try crafting with a material combination (for DENE / undiscovered recipes).
   * @param {Object} materialCombo - { buz: 2 } etc.
   */
  tryCraft(materialCombo) {
    const recipeId = findRecipeByIngredients(materialCombo);
    if (!recipeId) return { ok: false, reason: 'no_match' };
    return this.craft(recipeId);
  }

  getCraftableRecipes() {
    const result = [];
    for (const [id, recipe] of Object.entries(RECIPES)) {
      if (!this.discoveredRecipes.has(id)) continue;
      if (!hasIngredientsFor(this.materials, recipe.ingredients)) continue;
      result.push(id);
    }
    return result;
  }

  getDiscoverableRecipes() {
    const result = [];
    for (const [id, recipe] of Object.entries(RECIPES)) {
      if (this.discoveredRecipes.has(id)) continue;
      if (!hasIngredientsFor(this.materials, recipe.ingredients)) continue;
      result.push(id);
    }
    return result;
  }

  // ─── STASH (INVENTORY) ──────────────────────────────────

  isStashFull() {
    return this.stash.length >= ITEM_CONSTANTS.MAX_STASH_SIZE;
  }

  findStashItem(instanceId) {
    return this.stash.find(i => i.instanceId === instanceId);
  }

  removeFromStash(instanceId) {
    const idx = this.stash.findIndex(i => i.instanceId === instanceId);
    if (idx === -1) return null;
    return this.stash.splice(idx, 1)[0];
  }

  // ─── EQUIPMENT ──────────────────────────────────────────

  /**
   * Equip an item from stash. If slot occupied, old item goes to stash.
   */
  equip(instanceId) {
    const item = this.findStashItem(instanceId);
    if (!item) return { ok: false, reason: 'not_in_stash' };

    const slot = item.slot;
    const current = this.equipped[slot];

    if (current) {
      // Need room in stash for old item (item being equipped frees 1 slot)
      // Since we remove the new item from stash first, then add old item, net is 0
    }

    // Remove from stash
    this.removeFromStash(instanceId);

    // If slot occupied, put old item in stash
    if (current) {
      this.stash.push(current);
    }

    // Equip new item
    this.equipped[slot] = item;

    // Recalculate
    this._recalcHazine();
    this._statsDirty = true;

    return { ok: true, slot };
  }

  /**
   * Unequip item from slot back to stash.
   */
  unequip(slot) {
    if (!this.equipped[slot]) return { ok: false, reason: 'slot_empty' };
    if (this.isStashFull()) return { ok: false, reason: 'stash_full' };

    const item = this.equipped[slot];
    this.equipped[slot] = null;
    this.stash.push(item);

    this._recalcHazine();
    this._statsDirty = true;

    return { ok: true };
  }

  getEquipped() {
    return { ...this.equipped };
  }

  // ─── DISASSEMBLE ────────────────────────────────────────

  /**
   * Disassemble an item (from equipped or stash). Returns materials.
   * @param {string} instanceId
   * @param {string} source - 'equipped' | 'stash'
   */
  disassemble(instanceId, source) {
    let item = null;

    if (source === 'stash') {
      item = this.removeFromStash(instanceId);
    } else if (source === 'equipped') {
      for (const [slot, eq] of Object.entries(this.equipped)) {
        if (eq && eq.instanceId === instanceId) {
          item = eq;
          this.equipped[slot] = null;
          break;
        }
      }
    }

    if (!item) return { ok: false, reason: 'item_not_found' };

    // Return materials
    const stats = this.getItemStats();
    const returnCount = 1 + (stats.disassembleBonus || 0);
    const returned = [];

    for (let i = 0; i < returnCount; i++) {
      const mat = getRandomIngredient(item.id);
      this.materials[mat]++;
      returned.push(mat);
    }

    if (source === 'equipped') {
      this._recalcHazine();
      this._statsDirty = true;
    }

    return { ok: true, returned };
  }

  // ─── HAZINE ─────────────────────────────────────────────

  _recalcHazine() {
    const prev = [...this.hazineActive];
    this.hazineActive = computeActiveHazine(this.equipped);

    // Track newly discovered Hazine
    const newDiscoveries = [];
    for (const hzId of this.hazineActive) {
      if (!this.discoveredHazine.has(hzId)) {
        this.discoveredHazine.add(hzId);
        newDiscoveries.push(hzId);
      }
    }

    return newDiscoveries;
  }

  getActiveHazine() {
    return [...this.hazineActive];
  }

  // ─── NAZAR ──────────────────────────────────────────────

  addNazar(amount) {
    this.nazar = Math.min(ITEM_CONSTANTS.MAX_NAZAR, this.nazar + amount);
  }

  addNazarFractional(amount) {
    this.nazarAccumulator += amount;
    while (this.nazarAccumulator >= 1) {
      this.addNazar(1);
      this.nazarAccumulator -= 1;
    }
  }

  getNazar() {
    return this.nazar;
  }

  /**
   * Spend Nazar on an action.
   * @param {string} action - 'reroll' | 'extra' | 'hint'
   */
  spendNazar(action) {
    const costs = {
      reroll: ITEM_CONSTANTS.NAZAR_COST_REROLL,
      extra: ITEM_CONSTANTS.NAZAR_COST_EXTRA_MATERIAL,
      hint: ITEM_CONSTANTS.NAZAR_COST_RECIPE_HINT,
    };

    const cost = costs[action];
    if (!cost) return { ok: false, reason: 'invalid_action' };
    if (this.nazar < cost) return { ok: false, reason: 'insufficient_nazar' };

    this.nazar -= cost;

    if (action === 'extra') {
      const mat = this.getRandomMaterialType();
      this.addMaterial(mat);
      return { ok: true, material: mat };
    }

    if (action === 'hint') {
      // Find an undiscovered recipe the player could craft
      const discoverable = this.getDiscoverableRecipes();
      if (discoverable.length === 0) {
        // Refund if no recipes to discover
        this.nazar += cost;
        return { ok: false, reason: 'no_undiscovered_recipes' };
      }
      const hintId = discoverable[Math.floor(Math.random() * discoverable.length)];
      return { ok: true, hintRecipeId: hintId };
    }

    if (action === 'reroll') {
      // Client must specify which material to reroll — handled at Room level
      return { ok: true };
    }

    return { ok: false, reason: 'unknown' };
  }

  // ─── STATS ──────────────────────────────────────────────

  getItemStats() {
    if (this._statsDirty) {
      this._statsCache = this.computeItemStats();
      this._statsDirty = false;
    }
    // Attach runtime state that conditional effects need
    if (this._statsCache) {
      this._statsCache.lastAttackTime = this.lastAttackTime;
    }
    return this._statsCache;
  }

  computeItemStats() {
    const stats = {
      // Multipliers (default 1.0)
      damageDealtMult: 1.0,
      damageTakenMult: 1.0,
      kbDealtMult: 1.0,
      kbTakenMult: 1.0,
      moveSpeedMult: 1.0,
      cooldownMult: 1.0,
      diMult: 1.0,
      slowResistMult: 1.0,
      frictionMult: 1.0,
      projectileSpeedMult: 1.0,

      // Additive (default 0)
      maxHpBonus: 0,

      // Conditional (default 0 / false)
      burnOnHit: false,
      burnDamage: 0,
      burnDuration: 0,
      slowOnHit: 0,
      slowOnHitDuration: 0,
      slowBonusDamage: 0,
      firstHitBonusDamage: 0,
      kbBonusVsSlowed: 0,
      kbBonusAtMaxRange: 0,
      postCastSpeedBuff: 0,
      postCastSpeedDuration: 0,
      lowHpDamageBonus: 0,
      lowHpThreshold: 0,
      lowHpDamageReduction: 0,
      ignoreKbResistPct: 0,
      spBonusPerRound: 0,
      spBonusPerKill: 0,
      materialBonusPerRound: 0,
      disassembleBonus: 0,
      roundDamageReduction: 0,
      korsanlikActive: false,
      firstKbBonusForce: 0,
      slidingSlowBonus: 0,
      hayaletActive: false,
      maxSpeedKbBonus: 0,
      idleCooldownReduction: 0,
      slowDurationMult: 1.0,
    };

    // Apply equipped item effects
    for (const item of Object.values(this.equipped)) {
      if (!item) continue;
      const recipe = RECIPES[item.id];
      if (!recipe || !recipe.effect) continue;
      this._mergeEffect(stats, recipe.effect);
    }

    // Apply Hazine effects
    for (const hzId of this.hazineActive) {
      const hz = HAZINE[hzId];
      if (!hz || !hz.effect) continue;
      this._mergeEffect(stats, hz.effect);
    }

    // Kale Hazine: scaling damage reduction per round survived
    if (stats.roundDamageReductionPerRound) {
      stats.roundDamageReduction = Math.min(
        stats.roundDamageReductionCap || 0.25,
        stats.roundDamageReductionPerRound * this.roundsSurvived
      );
    }

    return stats;
  }

  _mergeEffect(stats, effect) {
    for (const [key, val] of Object.entries(effect)) {
      if (key === 'roundDamageReductionPerRound' || key === 'roundDamageReductionCap') {
        // Store these for Kale computation
        stats[key] = val;
        continue;
      }
      if (typeof val === 'boolean') {
        stats[key] = stats[key] || val;
      } else if (key.endsWith('Mult')) {
        // Multiplicative stacking
        stats[key] *= val;
      } else {
        // Additive stacking
        stats[key] = (stats[key] || 0) + val;
      }
    }
  }

  // ─── ROUND LIFECYCLE ────────────────────────────────────

  onRoundStart() {
    this.firstHitDealtThisRound = false;
    this.firstKbDealtThisRound = false;
  }

  onRoundEnd(survived) {
    if (survived) {
      this.roundsSurvived++;
      // Recalculate stats if Kale Hazine active
      if (this.hazineActive.includes('hz-kale')) {
        this._statsDirty = true;
      }
    }
  }

  // ─── DISCOVERY ──────────────────────────────────────────

  loadDiscoveries(recipes, hazine) {
    if (Array.isArray(recipes)) {
      for (const id of recipes) {
        if (RECIPES[id]) this.discoveredRecipes.add(id);
      }
    }
    if (Array.isArray(hazine)) {
      for (const id of hazine) {
        if (HAZINE[id]) this.discoveredHazine.add(id);
      }
    }
  }

  // ─── SERIALIZATION ──────────────────────────────────────

  getState() {
    return {
      materials: { ...this.materials },
      equipped: {
        saz: this.equipped.saz ? { ...this.equipped.saz } : null,
        yadigar: this.equipped.yadigar ? { ...this.equipped.yadigar } : null,
        pabuc: this.equipped.pabuc ? { ...this.equipped.pabuc } : null,
      },
      stash: this.stash.map(item => ({ ...item })),
      hazineActive: [...this.hazineActive],
      nazar: this.nazar,
      discoveredRecipes: [...this.discoveredRecipes],
      discoveredHazine: [...this.discoveredHazine],
    };
  }

  /**
   * Reset for new match (keep discoveries).
   */
  resetForMatch() {
    for (const id of MATERIAL_IDS) this.materials[id] = 0;
    this.equipped = { saz: null, yadigar: null, pabuc: null };
    this.stash = [];
    this.hazineActive = [];
    this.nazar = 0;
    this.nazarAccumulator = 0;
    this.roundsSurvived = 0;
    this.firstHitDealtThisRound = false;
    this.firstKbDealtThisRound = false;
    this._statsDirty = true;
  }
}
