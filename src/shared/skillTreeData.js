// Skill Tree Definitions — shared between client and server
// Each spell has a base definition and two upgrade branches (A/B).
// Once a branch is chosen, it's locked in for the match.
// Each branch has 4 tiers of upgrades.

export const SKILL_TREE = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    slot: 'Q',
    unlockCost: 0, // everyone starts with it
    icon: 'spell-BookFire',
    base: {
      type: 'projectile',
      damage: 10,
      knockbackForce: 0.04,
      cooldown: 2500,
      speed: 8,
      range: 400,
      radius: 12,
      lifetime: 2000,
      piercing: false,
    },
    branches: {
      A: {
        name: 'Rapid Fire',
        description: 'Fast-firing fireballs: lower damage per hit, much faster cooldown',
        icon: 'spell-Fireball',
        tiers: [
          { cost: 3, name: 'Quick Shot', description: 'Faster cooldown, slightly less damage', mods: { cooldown: -600, damage: -2 } },
          { cost: 3, name: 'Trigger Happy', description: 'Even faster cooldown, more speed', mods: { cooldown: -500, speed: 1 } },
          { cost: 3, name: 'Suppressing Fire', description: 'Rapid fire with reduced knockback per hit', mods: { cooldown: -400, damage: -1, knockbackForce: -0.01 } },
          { cost: 4, name: 'Machine Gun', description: 'Extreme fire rate, piercing shots', mods: { cooldown: -200, piercing: true } },
        ],
      },
      B: {
        name: 'Meteor',
        description: 'Huge single impact: massive damage and knockback',
        icon: 'spell-Explosion',
        tiers: [
          { cost: 3, name: 'Heavy Impact', description: 'More damage and knockback, slightly slower', mods: { damage: 5, knockbackForce: 0.01, speed: -1 } },
          { cost: 3, name: 'Blast Radius', description: 'Explodes on impact, dealing AoE damage', mods: { explosionRadius: 60, damage: 3 } },
          { cost: 3, name: 'Scorched Earth', description: 'Leaves burning ground on impact', mods: { burnDuration: 2000, burnDamage: 3 } },
          { cost: 4, name: 'Cataclysm', description: 'Devastating impact with huge knockback', mods: { damage: 8, knockbackForce: 0.015, explosionRadius: 30 } },
        ],
      },
    },
  },

  blink: {
    id: 'blink',
    name: 'Blink',
    slot: 'W',
    unlockCost: 5,
    icon: 'spell-BookLight',
    base: {
      type: 'blink',
      cooldown: 6000,
      range: 200,
      damage: 0,
      knockbackForce: 0,
    },
    branches: {
      A: {
        name: 'Phase Shift',
        description: 'Longer range teleport with more charges',
        icon: 'spell-BookLight',
        tiers: [
          { cost: 3, name: 'Extended Range', description: 'Blink further', mods: { range: 60 } },
          { cost: 3, name: 'Quick Phase', description: 'Reduced cooldown', mods: { cooldown: -1000 } },
          { cost: 3, name: 'Double Blink', description: 'Two charges before cooldown', mods: { charges: 2 } },
          { cost: 4, name: 'Warp', description: 'Much further range, brief invulnerability', mods: { range: 80, cooldown: -500, invulnFrames: 200 } },
        ],
      },
      B: {
        name: 'Impact Dash',
        description: 'Short-range dash that damages and pushes enemies',
        icon: 'spell-BookWind',
        tiers: [
          { cost: 3, name: 'Shoulder Check', description: 'Dash deals damage and pushes enemies', mods: { dashDamage: 6, dashKnockback: 0.02, range: -60 } },
          { cost: 3, name: 'Momentum', description: 'More knockback, reduced cooldown', mods: { dashKnockback: 0.01, cooldown: -800 } },
          { cost: 3, name: 'Battering Ram', description: 'More damage, wider dash hitbox', mods: { dashDamage: 4, dashWidth: 20 } },
          { cost: 4, name: 'Unstoppable', description: 'Devastating dash with short cooldown', mods: { dashDamage: 5, dashKnockback: 0.015, cooldown: -700 } },
        ],
      },
    },
  },

  frostBolt: {
    id: 'frostBolt',
    name: 'Frost Bolt',
    slot: 'E',
    unlockCost: 5,
    icon: 'spell-BookIce',
    base: {
      type: 'projectile',
      damage: 5,
      knockbackForce: 0.008,
      cooldown: 4000,
      speed: 7,
      range: 350,
      radius: 10,
      lifetime: 2000,
      piercing: false,
      slowAmount: 0.4,
      slowDuration: 1500,
    },
    branches: {
      A: {
        name: 'Deep Freeze',
        description: 'Stronger slow and damage, can root enemies',
        icon: 'spell-BookIce',
        tiers: [
          { cost: 3, name: 'Permafrost', description: 'Longer and stronger slow', mods: { slowDuration: 500, slowAmount: 0.1 } },
          { cost: 3, name: 'Ice Lance', description: 'More damage, faster and longer range', mods: { damage: 4, speed: 2, range: 50 } },
          { cost: 3, name: 'Frozen Solid', description: 'Can root enemies in place briefly', mods: { rootDuration: 800 } },
          { cost: 4, name: 'Absolute Zero', description: 'Devastating freeze: high damage, deep slow, root', mods: { damage: 6, slowAmount: 0.15, rootDuration: 400 } },
        ],
      },
      B: {
        name: 'Blizzard',
        description: 'Converts into AoE slow zone dropped on the ground',
        icon: 'spell-Mist',
        tiers: [
          { cost: 3, name: 'Frost Ring', description: 'Drop a frost zone instead of firing a bolt', mods: { convertToZone: true, zoneRadius: 60, zoneDuration: 3000 } },
          { cost: 3, name: 'Expanding Cold', description: 'Larger zone, lasts longer', mods: { zoneRadius: 20, zoneDuration: 1000 } },
          { cost: 3, name: 'Hypothermia', description: 'Zone deals damage and slows more', mods: { zoneDamage: 2, slowAmount: 0.1 } },
          { cost: 4, name: 'Ice Age', description: 'Massive zone with strong slow and damage', mods: { zoneRadius: 30, zoneDuration: 1500, zoneDamage: 2, slowAmount: 0.1 } },
        ],
      },
    },
  },

  hook: {
    id: 'hook',
    name: 'Hook',
    slot: 'R',
    unlockCost: 5,
    icon: 'spell-BookDeath',
    base: {
      type: 'hook',
      damage: 5,
      knockbackForce: 0,
      cooldown: 10000,
      speed: 12,
      range: 300,
      radius: 14,
      lifetime: 1500,
      pullForce: 0.04,
    },
    branches: {
      A: {
        name: 'Chain Pull',
        description: 'Pulls enemy toward you — perfect for dragging them off the edge',
        icon: 'spell-BookDeath',
        tiers: [
          { cost: 3, name: 'Barbed Hook', description: 'More damage and pull strength', mods: { damage: 3, pullForce: 0.01 } },
          { cost: 3, name: 'Quick Release', description: 'Faster hook, reduced cooldown', mods: { cooldown: -2000, speed: 2 } },
          { cost: 3, name: 'Serrated Chain', description: 'More damage, briefly stuns on hit', mods: { damage: 4, stunDuration: 500 } },
          { cost: 4, name: 'Death Grip', description: 'Massive pull, more damage and range', mods: { pullForce: 0.02, damage: 5, range: 50 } },
        ],
      },
      B: {
        name: 'Grapple',
        description: 'Pulls yourself to the target point — mobility tool',
        icon: 'spell-BookDarkness',
        tiers: [
          { cost: 3, name: 'Quick Hook', description: 'Pull yourself to target, reduced cooldown', mods: { pullSelf: true, cooldown: -2000 } },
          { cost: 3, name: 'Extended Cable', description: 'Longer range, faster travel', mods: { range: 80, speed: 3 } },
          { cost: 3, name: 'Slingshot', description: 'AoE knockback on arrival', mods: { arrivalKnockback: 0.02, arrivalRadius: 40 } },
          { cost: 4, name: 'Meteor Strike', description: 'Devastating impact on landing', mods: { arrivalDamage: 10, arrivalKnockback: 0.015, arrivalRadius: 20 } },
        ],
      },
    },
  },
};

// Map spell IDs to their slot keys
export const SPELL_SLOTS = {
  Q: 'fireball',
  W: 'blink',
  E: 'frostBolt',
  R: 'hook',
};

// Reverse map: spell ID to slot
export const SPELL_TO_SLOT = {};
for (const [slot, spellId] of Object.entries(SPELL_SLOTS)) {
  SPELL_TO_SLOT[spellId] = slot;
}

/**
 * Compute the effective stats for a spell given a player's branch choice and tier level.
 *
 * @param {string} spellId - e.g. 'fireball', 'blink', etc.
 * @param {string|null} branch - 'A', 'B', or null (no branch chosen yet)
 * @param {number} tierLevel - 0 = base only, 1 = first tier upgrade, ... 4 = max
 * @returns {Object} computed stats with all modifiers applied additively
 */
export function computeSpellStats(spellId, branch, tierLevel) {
  const tree = SKILL_TREE[spellId];
  if (!tree) return null;

  // Start with a copy of base stats
  const stats = { ...tree.base };

  // If no branch chosen or tier 0, return base stats
  if (!branch || tierLevel <= 0) return stats;

  const branchData = tree.branches[branch];
  if (!branchData) return stats;

  // Apply tiers 1 through tierLevel (clamped to available tiers)
  const maxTier = Math.min(tierLevel, branchData.tiers.length);
  for (let i = 0; i < maxTier; i++) {
    const tier = branchData.tiers[i];
    for (const [key, value] of Object.entries(tier.mods)) {
      if (typeof value === 'boolean') {
        // Boolean mods override (e.g., piercing: true, convertToZone: true)
        stats[key] = value;
      } else if (typeof value === 'number') {
        // Numeric mods are additive
        stats[key] = (stats[key] || 0) + value;
      }
    }
  }

  return stats;
}

/**
 * Get the cost to upgrade to the next tier for a spell.
 *
 * @param {string} spellId
 * @param {string} branch - 'A' or 'B'
 * @param {number} currentTier - current tier level (0-based)
 * @returns {number|null} cost in SP, or null if max tier reached
 */
export function getUpgradeCost(spellId, branch, currentTier) {
  const tree = SKILL_TREE[spellId];
  if (!tree || !branch) return null;

  const branchData = tree.branches[branch];
  if (!branchData) return null;

  if (currentTier >= branchData.tiers.length) return null; // already max
  return branchData.tiers[currentTier].cost;
}

/**
 * Get info about the next tier upgrade.
 *
 * @param {string} spellId
 * @param {string} branch
 * @param {number} currentTier
 * @returns {{ name, description, cost, mods }|null}
 */
export function getNextTierInfo(spellId, branch, currentTier) {
  const tree = SKILL_TREE[spellId];
  if (!tree || !branch) return null;

  const branchData = tree.branches[branch];
  if (!branchData) return null;

  if (currentTier >= branchData.tiers.length) return null;
  return branchData.tiers[currentTier];
}

/**
 * Get max tier count for a branch.
 */
export function getMaxTier(spellId, branch) {
  const tree = SKILL_TREE[spellId];
  if (!tree || !branch) return 0;
  const branchData = tree.branches[branch];
  return branchData ? branchData.tiers.length : 0;
}
