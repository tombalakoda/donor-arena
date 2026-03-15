// Shared constants used by both client and server

export const PHYSICS = {
  GRAVITY: { x: 0, y: 0 },       // Top-down: no gravity
  TICK_RATE: 20,                   // Server ticks per second
  TICK_MS: 50,                     // Milliseconds per server tick
};

export const PLAYER = {
  RADIUS: 14,                     // Physics body radius (world pixels) — scaled down for bigger-feeling arena
  MASS: 20,                       // Very heavy — sluggish acceleration, weighty collisions
  SPEED: 22,                      // Slow top speed — projectiles are much faster
  FRICTION: 0.01,                 // Near-zero surface friction — ice
  FRICTION_AIR: 0.006,            // Ultra-low drag — coast far, hard to stop
  RESTITUTION: 0.8,               // Bounciness — high for satisfying billiard-ball collisions on ice
  FRICTION_STATIC: 0.01,          // Near-zero — easy to slide
  MAX_HP: 100,
  STOP_RADIUS: 8,                 // Stop applying thrust within this distance
  KNOCKBACK_GRACE_MS: 500,        // After knockback hit, player slides freely (was 300 — longer for sumo drama)
  KNOCKBACK_GRACE_MIN: 200,       // Light taps (frostbolt 0.02) — snappy recovery
  KNOCKBACK_GRACE_MAX: 900,       // Devastating hits (meteor 0.10) — long dramatic slide
  KNOCKBACK_GRACE_SCALE: 5000,    // grace = clamp(forceMag * SCALE, MIN, MAX)
  KNOCKBACK_COMBO_EXTEND: 150,    // ms added to grace on combo hit (already in KB)
  KNOCKBACK_COMBO_MAX_GRACE: 1200,// hard cap on total accumulated grace
  KNOCKBACK_COMBO_FORCE_MULT: 1.15, // 15% bonus force on combo hits
  KNOCKBACK_BASE_MULT: 1.0,       // Minimum knockback multiplier at full HP
  KNOCKBACK_SCALE: 1.8,           // At 0 HP remaining, knockback is (1 + 1.8) = 2.8× base (Smash Bros %)
  DI_STRENGTH: 0.15,              // 15% of current speed as steering force during knockback
  SPEED_CAP_DECAY: 0.82,          // Retain 82% of excess speed per tick (smooth post-knockback decel)
  KNOCKBACK_EASE_MS: 1000,        // Post-knockback ease window: soft cap for 1s, then hard cap resumes
};

export const ARENA = {
  RADIUS: 480,                    // Starting ring radius (was 550 — smaller = more ring-outs)
  FLOOR_SIZE: 1200,               // Total floor area (square)
  RING_SHRINK_BASE: 2.0,          // Base shrink per second (was 1.5 — faster pressure)
  RING_SHRINK_SCALE: 0.5,         // Additional shrink per round number (was 0.3)
  MIN_RING_RADIUS: 0,             // Ring collapses fully — rounds end by elimination only
};

export const ROUND = {
  TOTAL_ROUNDS: 20,
  DURATION: 45,                   // Seconds per round (was 60 — sumo rounds are fast)
  COUNTDOWN: 3,                   // Pre-round countdown seconds
  SHOP_DURATION: 20,              // Seconds for shop phase
};

export const DAMAGE = {
  RING_BASE: 2,                   // Base ring damage per second (unchanged)
  RING_SCALE: 0.01,               // Quadratic scaling factor (unchanged)
};

export const MATCH = {
  MAX_PLAYERS: 8,
};

export const SANDBOX = {
  STARTING_SP: 200,            // Lots of SP to test spell upgrades
  ROUND_DURATION: 600,         // 10 minutes per round (effectively infinite)
  RING_SHRINK_BASE: 0,         // No ring shrink
  RING_SHRINK_SCALE: 0,        // No ring shrink acceleration
  DUMMY_COUNT: 4,              // Number of training dummies to spawn
  DUMMY_HP: 100,               // HP per dummy
  DUMMY_RESPAWN_DELAY: 3000,   // 3 seconds before dummy respawns
};

export const SP = {
  PER_DAMAGE_25: 1,       // 1 SP per 25 damage dealt
  RING_OUT_KILL: 7,        // ring-out kill — THE core mechanic (was 5)
  DAMAGE_KILL: 1,          // killed by HP depletion — incidental (was 2)
  ROUND_WIN: 4,            // last player standing (was 3)
  SURVIVAL: 2,             // survived the round (was 1 — staying in the ring matters)
  BASE_PER_ROUND: 2,       // everyone gets 2 SP per round just for playing
  SLOT_UNLOCK_COST: 5,     // cost to unlock W, E, or R slot
  SPELL_CHOICE_COST: 3,    // cost to choose a spell in a slot (was BRANCH_CHOICE_COST)
  // Tier upgrade costs are defined per-tier in skillTreeData.js
  // Q tiers: 3/3/4/5 SP.  W/E/R tiers: 3/5 SP.
};
