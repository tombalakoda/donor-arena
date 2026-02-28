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
  KNOCKBACK_GRACE_MS: 500,        // After knockback hit, player slides freely (was 300 — longer for sumo drama)
  KNOCKBACK_BASE_MULT: 1.0,       // Minimum knockback multiplier at full HP
  KNOCKBACK_SCALE: 2.5,           // At 0 HP remaining, knockback is (1 + 2.5) = 3.5× base (Smash Bros %)
};

export const ARENA = {
  RADIUS: 480,                    // Starting ring radius (was 550 — smaller = more ring-outs)
  FLOOR_SIZE: 1200,               // Total floor area (square)
  RING_SHRINK_BASE: 2.0,          // Base shrink per second (was 1.5 — faster pressure)
  RING_SHRINK_SCALE: 0.5,         // Additional shrink per round number (was 0.3)
  MIN_RING_RADIUS: 80,            // Ring never shrinks below this (was 100 — tighter endgame)
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
  SLOT_UNLOCK_COST: 5,     // cost to unlock W, E, or R
  BRANCH_CHOICE_COST: 3,   // cost to pick a branch
};
