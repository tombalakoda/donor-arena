// Skill Tree Definitions — shared between client and server
// Each spell has base stats and tier upgrades.
// Q spells: 4 tiers. W/E/R spells: 2 tiers.
// Stats are computed by applying tier mods additively on top of base.

export const SKILL_TREES = {
  // ═══════════════════════════════════════════════════════════════
  // Q — FIREBALL VARIANTS (3 paths, 4 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'fireball-sniper': {
    base: {
      type: 'projectile',
      damage: 4,
      knockbackForce: 0.07,
      cooldown: 2800,
      speed: 9,
      range: 500,
      radius: 7,
      lifetime: 2200,
      piercing: false,
    },
    tiers: [
      { cost: 3, name: 'Marksman', description: 'Extended range, faster bolt', mods: { range: 60, speed: 1 } },
      { cost: 3, name: 'Heavy Round', description: 'Increased knockback', mods: { knockbackForce: 0.02 } },
      { cost: 4, name: 'Piercing Shot', description: 'Bolt passes through enemies', mods: { piercing: true } },
      { cost: 5, name: 'Railgun', description: 'Maximum range and push', mods: { range: 80, knockbackForce: 0.02, speed: 1 } },
    ],
  },

  'fireball-machinegun': {
    base: {
      type: 'projectile',
      damage: 3,
      knockbackForce: 0.04,
      cooldown: 1800,
      speed: 8,
      range: 300,
      radius: 6,
      lifetime: 1500,
      piercing: false,
      projectileCount: 1,
    },
    tiers: [
      { cost: 3, name: 'Quick Trigger', description: 'Faster cooldown', mods: { cooldown: -300 } },
      { cost: 3, name: 'Double Tap', description: 'Fire 2 bolts in a spread', mods: { projectileCount: 1 } },
      { cost: 4, name: 'Bullet Storm', description: 'Even faster cooldown', mods: { cooldown: -300 } },
      { cost: 5, name: 'Minigun', description: '3 piercing bolts', mods: { projectileCount: 1, piercing: true } },
    ],
  },

  'fireball-cannon': {
    base: {
      type: 'projectile',
      damage: 5,
      knockbackForce: 0.10,
      cooldown: 3200,
      speed: 7,
      range: 250,
      radius: 9,
      lifetime: 1400,
      piercing: false,
    },
    tiers: [
      { cost: 3, name: 'Heavy Slug', description: 'More knockback, more damage', mods: { knockbackForce: 0.02, damage: 1 } },
      { cost: 3, name: 'Blast Wave', description: 'Explodes on impact', mods: { explosionRadius: 40 } },
      { cost: 4, name: 'Concussion', description: 'Bigger blast, more push', mods: { explosionRadius: 15, knockbackForce: 0.02 } },
      { cost: 5, name: 'Shockwave', description: 'Devastating blast, brief stun', mods: { damage: 2, knockbackForce: 0.02, stunDuration: 300 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // W — MOBILITY (6 spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'blink': {
    base: {
      type: 'blink',
      cooldown: 5000,
      range: 220,
      damage: 0,
      knockbackForce: 0,
    },
    tiers: [
      { cost: 3, name: 'Far Reach', description: 'Blink further', mods: { range: 60 } },
      { cost: 5, name: 'Phase Warp', description: 'Much further, faster cooldown', mods: { range: 80, cooldown: -1000 } },
    ],
  },

  'dash': {
    base: {
      type: 'dash',
      cooldown: 5000,
      range: 160,
      dashDamage: 3,
      dashKnockback: 0.04,
      dashWidth: 12,
    },
    tiers: [
      { cost: 3, name: 'Heavy Charge', description: 'Harder slam, more damage', mods: { dashKnockback: 0.02, dashDamage: 2 } },
      { cost: 5, name: 'Battering Ram', description: 'Wider, faster cooldown, more push', mods: { dashWidth: 10, cooldown: -1000, dashKnockback: 0.02 } },
    ],
  },

  'flash': {
    base: {
      type: 'buff',
      cooldown: 6000,
      buffDuration: 2000,
      speedBoost: 0.6,          // +60% movement speed
      frictionReduction: 0.003, // reduce air friction during flash
    },
    tiers: [
      { cost: 3, name: 'Afterburner', description: 'Longer boost, faster speed', mods: { buffDuration: 1000, speedBoost: 0.2 } },
      { cost: 5, name: 'Blazing Trail', description: 'Leave a trail that slows enemies', mods: { cooldown: -1500, leaveTrail: true, trailSlowAmount: 0.3, trailSlowDuration: 1500 } },
    ],
  },

  'ghost': {
    base: {
      type: 'buff',
      cooldown: 8000,
      buffDuration: 2500,
      speedBoost: 0.2,          // +20% movement speed
      intangible: true,         // projectiles pass through
    },
    tiers: [
      { cost: 3, name: 'Phantom', description: 'Longer intangibility', mods: { buffDuration: 1000 } },
      { cost: 5, name: 'Poltergeist', description: 'AoE push when exiting ghost form', mods: { cooldown: -2000, exitPushForce: 0.03, exitPushRadius: 60 } },
    ],
  },

  'swap': {
    base: {
      type: 'swap',
      cooldown: 10000,
      speed: 8,
      range: 350,
      radius: 7,
      lifetime: 1800,
      damage: 0,
      knockbackForce: 0,
    },
    tiers: [
      { cost: 3, name: 'Quick Swap', description: 'Faster bolt, faster cooldown', mods: { speed: 3, cooldown: -2000 } },
      { cost: 5, name: 'Disorient', description: 'Enemy is stunned after swap', mods: { swapStunDuration: 500, cooldown: -1500 } },
    ],
  },

  'timeshift': {
    base: {
      type: 'recall',
      cooldown: 8000,
      recallDuration: 3000,     // stores 3s of position history
    },
    tiers: [
      { cost: 3, name: 'Deep Memory', description: 'Recall from 4s ago, faster cooldown', mods: { recallDuration: 1000, cooldown: -1500 } },
      { cost: 5, name: 'Temporal Rift', description: 'AoE push at departure point, faster cooldown', mods: { departurePushForce: 0.04, departurePushRadius: 60, cooldown: -1500 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // E — DEBUFF / CONTROL (5 spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'frostbolt': {
    base: {
      type: 'projectile',
      damage: 2,
      knockbackForce: 0.02,
      cooldown: 3500,
      speed: 7,
      range: 350,
      radius: 6,
      lifetime: 2000,
      piercing: false,
      slowAmount: 0.5,
      slowDuration: 2000,
      rootDuration: 400,
    },
    tiers: [
      { cost: 3, name: 'Permafrost', description: 'Stronger, longer slow', mods: { slowDuration: 500, slowAmount: 0.1 } },
      { cost: 5, name: 'Absolute Zero', description: 'Deep freeze: long root, heavy push', mods: { rootDuration: 400, knockbackForce: 0.02, damage: 2 } },
    ],
  },

  'blizzard': {
    base: {
      type: 'zone',
      cooldown: 6000,
      range: 300,
      zoneRadius: 45,
      zoneDuration: 3500,
      zoneDamage: 0,
      slowAmount: 0.5,
      slowDuration: 1000,
    },
    tiers: [
      { cost: 3, name: 'Expanding Cold', description: 'Larger zone, lasts longer', mods: { zoneRadius: 20, zoneDuration: 1500 } },
      { cost: 5, name: 'Ice Age', description: 'Zone damages and slows much more', mods: { zoneDamage: 1, slowAmount: 0.15 } },
    ],
  },

  'icewall': {
    base: {
      type: 'wall',
      cooldown: 10000,
      range: 200,
      wallDuration: 4000,
      wallHp: 30,
      wallWidth: 80,            // width of the wall segment
      wallThickness: 16,        // thickness
    },
    tiers: [
      { cost: 3, name: 'Fortified', description: 'Tougher wall, lasts longer', mods: { wallHp: 20, wallDuration: 2000 } },
      { cost: 5, name: 'Shatter', description: 'Wall explodes when destroyed, slowing nearby enemies', mods: { shatterSlowAmount: 0.4, shatterSlowDuration: 1500, shatterRadius: 60, cooldown: -2000 } },
    ],
  },

  'bouncer': {
    base: {
      type: 'projectile',
      damage: 2,
      knockbackForce: 0.03,
      cooldown: 5000,
      speed: 6,
      range: 600,
      radius: 7,
      lifetime: 4000,
      piercing: false,
      maxBounces: 3,
      destroysSpells: true,     // destroys enemy projectiles on contact
    },
    tiers: [
      { cost: 3, name: 'Ricochet', description: 'More bounces, faster bolt', mods: { maxBounces: 2, speed: 2 } },
      { cost: 5, name: 'Momentum', description: 'Gets stronger with each bounce', mods: { kbPerBounce: 0.01, cooldown: -1000 } },
    ],
  },

  'shield': {
    base: {
      type: 'buff',
      cooldown: 12000,
      buffDuration: 2000,
      shieldHits: 2,            // blocks this many hits
    },
    tiers: [
      { cost: 3, name: 'Hardened', description: 'Blocks more hits, lasts longer', mods: { shieldHits: 1, buffDuration: 1000 } },
      { cost: 5, name: 'Reflect', description: 'On break, reflects last hit. Faster cooldown.', mods: { reflectOnBreak: true, cooldown: -2000 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // R — ULTIMATE (7 spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'hook': {
    base: {
      type: 'hook',
      damage: 2,
      knockbackForce: 0,
      cooldown: 8000,
      speed: 12,
      range: 320,
      radius: 8,
      lifetime: 1500,
      pullForce: 0.06,
      swingDuration: 600,
    },
    tiers: [
      { cost: 3, name: 'Barbed Hook', description: 'Stronger release, more damage', mods: { pullForce: 0.02, damage: 1, cooldown: -1500 } },
      { cost: 5, name: 'Death Grip', description: 'Longer swing, more range and force', mods: { swingDuration: 300, range: 60, pullForce: 0.02 } },
    ],
  },

  'grappling': {
    base: {
      type: 'hook',
      damage: 0,
      knockbackForce: 0,
      cooldown: 8000,
      speed: 12,
      range: 320,
      radius: 8,
      lifetime: 1500,
      pullSelf: true,
      pullSpeed: 4,
      launchSpeedBonus: 0,
      flightDuration: 500,
    },
    tiers: [
      { cost: 3, name: 'Long Chain', description: 'Faster pull, further range', mods: { pullSpeed: 2, range: 80, cooldown: -1500 } },
      { cost: 5, name: 'Wrecking Ball', description: 'Collide with enemies during flight', mods: { flightCollision: true, flightDamage: 4, flightKnockback: 0.03 } },
    ],
  },

  'lightning': {
    base: {
      type: 'instant',
      damage: 3,
      knockbackForce: 0.09,
      cooldown: 7000,
      radius: 100,              // detection radius for nearest enemy
    },
    tiers: [
      { cost: 3, name: 'Surge', description: 'Wider range, more push', mods: { radius: 40, knockbackForce: 0.03 } },
      { cost: 5, name: 'Chain Lightning', description: 'Chains to 2nd enemy at 50% power', mods: { chainCount: 1, chainKbFactor: 0.5, cooldown: -1500 } },
    ],
  },

  'homing': {
    base: {
      type: 'homing',
      damage: 3,
      knockbackForce: 0.06,
      cooldown: 9000,
      speed: 5,
      radius: 7,
      lifetime: 4000,
      turnRate: 0.08,           // radians per tick (how fast it steers)
      trackingRange: 400,       // max distance to acquire a target
    },
    tiers: [
      { cost: 3, name: 'Persistence', description: 'Tracks longer, turns sharper', mods: { lifetime: 2000, turnRate: 0.03 } },
      { cost: 5, name: 'Warhead', description: 'Faster, stronger, explodes on impact', mods: { speed: 2, knockbackForce: 0.03, explosionRadius: 30 } },
    ],
  },

  'meteor': {
    base: {
      type: 'zone',
      damage: 5,
      knockbackForce: 0.10,
      cooldown: 12000,
      range: 250,               // close range cast only
      impactDelay: 1000,        // 1s delay before impact
      impactRadius: 80,         // AoE push radius
      isMeteor: true,           // flag for special meteor behavior
    },
    tiers: [
      { cost: 3, name: 'Quick Fall', description: 'Faster impact, wider blast', mods: { impactDelay: -500, impactRadius: 20, cooldown: -2000 } },
      { cost: 5, name: 'Apocalypse', description: 'Devastating impact, leaves burning ground', mods: { knockbackForce: 0.04, damage: 3, burnZoneDuration: 2000, burnSlowAmount: 0.3 } },
    ],
  },

  'rocketswarm': {
    base: {
      type: 'homing',
      damage: 1,
      knockbackForce: 0.02,
      cooldown: 10000,
      speed: 5,
      radius: 5,
      lifetime: 3000,
      turnRate: 0.06,
      trackingRange: 150,       // shorter tracking range
      missileCount: 5,          // how many missiles to spawn
      isSwarm: true,            // flag for multi-missile behavior
    },
    tiers: [
      { cost: 3, name: 'Barrage', description: 'More missiles, longer duration', mods: { missileCount: 3, lifetime: 1000 } },
      { cost: 5, name: 'Saturation', description: 'Stronger missiles, wider tracking', mods: { knockbackForce: 0.01, trackingRange: 50, cooldown: -2000 } },
    ],
  },

  'boomerang': {
    base: {
      type: 'boomerang',
      damage: 2,
      knockbackForce: 0.03,     // base KB at close range
      maxKnockbackForce: 0.09,  // KB at max range (scales linearly with distance)
      cooldown: 7000,
      speed: 7,
      range: 400,               // max distance before returning
      radius: 8,
      lifetime: 3000,
    },
    tiers: [
      { cost: 3, name: 'Long Throw', description: 'Further range, more max knockback', mods: { range: 100, maxKnockbackForce: 0.02 } },
      { cost: 5, name: 'Catch & Throw', description: 'Return path hits too, cooldown reduced on catch', mods: { hitsOnReturn: true, cooldownOnCatch: -2000 } },
    ],
  },
};

/**
 * Compute effective stats for a spell at a given tier level.
 *
 * @param {string} spellId - e.g. 'fireball-sniper', 'blink', 'hook', etc.
 * @param {number} tierLevel - 0 = base only, 1 = first tier upgrade, 2 = second, etc.
 * @returns {Object} computed stats with all modifiers applied additively
 */
export function computeSpellStats(spellId, tierLevel) {
  const tree = SKILL_TREES[spellId];
  if (!tree) return null;

  // Start with a copy of base stats
  const stats = { ...tree.base };

  // If tier 0, return base stats
  if (!tierLevel || tierLevel <= 0) return stats;

  // Apply tiers 0 through tierLevel-1 (clamped to available tiers)
  const maxTier = Math.min(tierLevel, tree.tiers.length);
  for (let i = 0; i < maxTier; i++) {
    const tier = tree.tiers[i];
    for (const [key, value] of Object.entries(tier.mods)) {
      if (typeof value === 'boolean') {
        // Boolean mods override (e.g., piercing: true, pullSelf: true)
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
 * @param {number} currentTier - current tier level (0-based)
 * @returns {number|null} cost in SP, or null if max tier reached
 */
export function getUpgradeCost(spellId, currentTier) {
  const tree = SKILL_TREES[spellId];
  if (!tree) return null;

  if (currentTier >= tree.tiers.length) return null; // already max
  return tree.tiers[currentTier].cost;
}

/**
 * Get info about the next tier upgrade.
 *
 * @param {string} spellId
 * @param {number} currentTier
 * @returns {{ name, description, cost, mods }|null}
 */
export function getNextTierInfo(spellId, currentTier) {
  const tree = SKILL_TREES[spellId];
  if (!tree) return null;

  if (currentTier >= tree.tiers.length) return null;
  return tree.tiers[currentTier];
}

/**
 * Get max tier count for a spell.
 */
export function getMaxTier(spellId) {
  const tree = SKILL_TREES[spellId];
  return tree ? tree.tiers.length : 0;
}
