// Shared constants used by both client and server

export const PHYSICS = {
  GRAVITY: { x: 0, y: 0 },       // Top-down: no gravity
  TICK_RATE: 20,                   // Server ticks per second
  TICK_MS: 50,                     // Milliseconds per server tick
};

export const PLAYER = {
  RADIUS: 18,                     // Physics body radius (world pixels)
  MASS: 20,                       // Very heavy — sluggish acceleration, weighty collisions
  SPEED: 22,                      // Slow top speed — projectiles are much faster
  FRICTION: 0.01,                 // Near-zero surface friction — ice
  FRICTION_AIR: 0.006,            // Ultra-low drag — coast far, hard to stop
  RESTITUTION: 0.8,               // Bounciness — high for satisfying billiard-ball collisions on ice
  FRICTION_STATIC: 0.01,          // Near-zero — easy to slide
  MAX_HP: 100,
  STOP_RADIUS: 10,                // Stop applying thrust within this distance
  KNOCKBACK_GRACE_MS: 300,        // After knockback hit, player slides freely (no speed cap, no steering)
};

export const ARENA = {
  RADIUS: 550,                    // Starting ring radius
  FLOOR_SIZE: 1200,               // Total floor area (square)
  RING_SHRINK_BASE: 1.5,          // Base shrink per second
  RING_SHRINK_SCALE: 0.3,         // Additional shrink per round number
  MIN_RING_RADIUS: 100,           // Ring never shrinks below this
};

export const ROUND = {
  TOTAL_ROUNDS: 20,
  DURATION: 60,                   // Seconds per round
  COUNTDOWN: 3,                   // Pre-round countdown seconds
  SHOP_DURATION: 20,              // Seconds for shop phase
};

export const DAMAGE = {
  RING_BASE: 2,                   // Base ring damage per second
  RING_SCALE: 0.01,               // Quadratic scaling factor (overshoot^2 * this)
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
  RING_OUT_KILL: 5,        // ring-out kill (the core mechanic — worth the most)
  DAMAGE_KILL: 2,          // killed by HP depletion
  ROUND_WIN: 3,
  SURVIVAL: 1,             // survived the round (not eliminated)
  BASE_PER_ROUND: 2,       // everyone gets 2 SP per round just for playing
  SLOT_UNLOCK_COST: 5,     // cost to unlock W, E, or R
  BRANCH_CHOICE_COST: 3,   // cost to pick a branch
};
