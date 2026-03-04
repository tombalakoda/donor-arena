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
      damage: 4,              // was 10 — chip damage, not kill tool
      knockbackForce: 0.06,   // was 0.04 — more push, vulnerability scaling does the rest
      cooldown: 2200,         // was 2500 — primary tool, slightly faster
      speed: 8,
      range: 400,
      radius: 7,
      lifetime: 2000,
      piercing: false,
    },
    branches: {
      A: {
        name: 'Rapid Fire',
        description: 'Relentless barrage: many small pushes that build vulnerability fast',
        icon: 'spell-Fireball',
        tiers: [
          { cost: 3, name: 'Quick Shot', description: 'Faster cooldown', mods: { cooldown: -500, damage: -1 } },
          { cost: 3, name: 'Trigger Happy', description: 'Even faster cooldown, more speed', mods: { cooldown: -400, speed: 1 } },
          { cost: 3, name: 'Suppressing Fire', description: 'Rapid push barrage', mods: { cooldown: -300, knockbackForce: 0.005 } },
          { cost: 4, name: 'Machine Gun', description: 'Extreme fire rate, piercing shots', mods: { cooldown: -200, piercing: true, knockbackForce: 0.005 } },
        ],
      },
      B: {
        name: 'Meteor',
        description: 'Massive single push: sends enemies flying across the arena',
        icon: 'spell-Explosion',
        tiers: [
          { cost: 3, name: 'Heavy Impact', description: 'Bigger push, slightly slower', mods: { damage: 2, knockbackForce: 0.02, speed: -1 } },
          { cost: 3, name: 'Blast Radius', description: 'Explodes on impact — pushes everyone nearby', mods: { explosionRadius: 45, knockbackForce: 0.01 } },
          { cost: 3, name: 'Shockwave', description: 'Even more knockback, larger blast', mods: { knockbackForce: 0.02, explosionRadius: 12 } },
          { cost: 4, name: 'Cataclysm', description: 'Devastating push — guaranteed ring-out at high vulnerability', mods: { damage: 3, knockbackForce: 0.03, explosionRadius: 6 } },
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
      cooldown: 5000,        // was 6000 — mobility matters more in sumo
      range: 220,             // was 200 — slightly longer escape
      damage: 0,
      knockbackForce: 0,
    },
    branches: {
      A: {
        name: 'Phase Shift',
        description: 'Escape artist: blink away from the edge with multiple charges',
        icon: 'spell-BookLight',
        tiers: [
          { cost: 3, name: 'Extended Range', description: 'Blink further', mods: { range: 60 } },
          { cost: 3, name: 'Quick Phase', description: 'Reduced cooldown', mods: { cooldown: -1000 } },
          { cost: 3, name: 'Double Blink', description: 'Two charges before cooldown', mods: { charges: 2 } },
          { cost: 4, name: 'Warp', description: 'Much further range, brief invulnerability', mods: { range: 80, cooldown: -500, invulnFrames: 300 } },
        ],
      },
      B: {
        name: 'Shoulder Slam',
        description: 'Dash into enemies and send them flying — the sumo charge',
        icon: 'spell-BookWind',
        tiers: [
          { cost: 3, name: 'Shoulder Check', description: 'Dash pushes enemies hard', mods: { dashDamage: 3, dashKnockback: 0.04, range: -60 } },
          { cost: 3, name: 'Momentum', description: 'Even more push, reduced cooldown', mods: { dashKnockback: 0.02, cooldown: -800 } },
          { cost: 3, name: 'Battering Ram', description: 'Wider dash, more push', mods: { dashDamage: 2, dashKnockback: 0.01, dashWidth: 15 } },
          { cost: 4, name: 'Unstoppable', description: 'Devastating slam — launches enemies', mods: { dashDamage: 3, dashKnockback: 0.03, cooldown: -700 } },
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
      damage: 2,              // was 5 — pure utility/setup spell
      knockbackForce: 0.02,   // was 0.008 — meaningful push now
      cooldown: 3500,         // was 4000 — utility should be available
      speed: 7,
      range: 350,
      radius: 6,
      lifetime: 2000,
      piercing: false,
      slowAmount: 0.5,        // was 0.4 — stronger slow for edge traps
      slowDuration: 2000,     // was 1500 — longer setup window
      rootDuration: 400,      // 0.4s base root — brief freeze on hit
    },
    branches: {
      A: {
        name: 'Deep Freeze',
        description: 'Root enemies at the ring edge — then push them out',
        icon: 'spell-BookIce',
        tiers: [
          { cost: 3, name: 'Permafrost', description: 'Longer and stronger slow', mods: { slowDuration: 500, slowAmount: 0.1 } },
          { cost: 3, name: 'Ice Lance', description: 'More push, faster bolt', mods: { knockbackForce: 0.01, speed: 2, range: 50 } },
          { cost: 3, name: 'Frozen Solid', description: 'Much longer root — easy ring-out setup', mods: { rootDuration: 400 } },
          { cost: 4, name: 'Absolute Zero', description: 'Deep freeze: long root, heavy slow', mods: { damage: 2, slowAmount: 0.1, rootDuration: 300, knockbackForce: 0.01 } },
        ],
      },
      B: {
        name: 'Blizzard',
        description: 'Drop a slow zone at the ring edge — trap enemies in the danger zone',
        icon: 'spell-Mist',
        tiers: [
          { cost: 3, name: 'Frost Ring', description: 'Drop a frost zone instead of firing a bolt', mods: { convertToZone: true, zoneRadius: 45, zoneDuration: 3500 } },
          { cost: 3, name: 'Expanding Cold', description: 'Larger zone, lasts longer', mods: { zoneRadius: 15, zoneDuration: 1000 } },
          { cost: 3, name: 'Hypothermia', description: 'Zone slows much more — enemies can barely move', mods: { zoneDamage: 1, slowAmount: 0.15 } },
          { cost: 4, name: 'Ice Age', description: 'Massive slow zone — covers the ring edge', mods: { zoneRadius: 18, zoneDuration: 1500, zoneDamage: 1, slowAmount: 0.1 } },
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
      damage: 2,              // was 5 — displacement tool, not DPS
      knockbackForce: 0,
      cooldown: 8000,         // was 10000 — faster sumo pacing
      speed: 12,
      range: 320,             // was 300 — slightly longer reach
      radius: 8,
      lifetime: 1500,
      pullForce: 0.06,        // was 0.04 — stronger displacement
    },
    branches: {
      A: {
        name: 'Swing & Release',
        description: 'Hook enemies and swing them around — fling them out of the ring',
        icon: 'spell-BookDeath',
        tiers: [
          { cost: 3, name: 'Barbed Hook', description: 'Stronger release force', mods: { damage: 1, pullForce: 0.02 } },
          { cost: 3, name: 'Quick Release', description: 'Faster hook, reduced cooldown', mods: { cooldown: -2000, speed: 2 } },
          { cost: 3, name: 'Longer Chain', description: 'Extended swing — more windup, bigger fling', mods: { damage: 1, swingDuration: 200 } },
          { cost: 4, name: 'Death Grip', description: 'Devastating swing force and range', mods: { pullForce: 0.03, damage: 1, range: 60 } },
        ],
      },
      B: {
        name: 'Grappling Hook',
        description: 'Hook a point, get pulled to it, then launch through — become the projectile',
        icon: 'spell-BookDarkness',
        tiers: [
          { cost: 3, name: 'Grapple Anchor', description: 'Hook pulls you to the anchor point. Press R for early release.', mods: { pullSelf: true, cooldown: -1500, pullSpeed: 4 } },
          { cost: 3, name: 'Long Chain', description: 'Longer range, faster hook travel', mods: { range: 80, speed: 4, pullSpeed: 1 } },
          { cost: 3, name: 'Wrecking Ball', description: 'Collide with enemies during pull and flight', mods: { flightCollision: true, flightDamage: 3, flightKnockback: 0.02, pullSpeed: 1 } },
          { cost: 4, name: 'Human Cannonball', description: 'Faster pull, longer flight, devastating impact', mods: { pullSpeed: 2, launchSpeedBonus: 2, flightDuration: 200, flightDamage: 2, flightKnockback: 0.015 } },
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
