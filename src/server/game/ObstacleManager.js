import Matter from 'matter-js';

const { Bodies, World } = Matter;

/**
 * Manages static obstacle bodies (pillars) in the arena.
 * Creates Matter.js static circle bodies from map data.
 * Player collision is automatic via Matter.js.
 * Spell collision is done via distance checks in ServerSpell.
 *
 * Obstacle types:
 *   'normal'    — standard static pillar (default)
 *   'breakable' — has HP, destroyed by spells
 *   'bouncer'   — extra-high restitution, launches players hard
 *   'explosive' — has HP, knockbacks ALL nearby players on destruction
 */
export class ObstacleManager {
  constructor(world) {
    this.world = world;
    this.obstacles = []; // { x, y, radius, body, type?, hp?, ... }
    this.destroyedObstacles = []; // queued destruction events for Room.js to broadcast
  }

  /**
   * Load obstacles from map JSON and create static bodies.
   * Converts editor coordinates (0-1200) to world coordinates (centered at 0,0).
   */
  loadFromMap(mapData) {
    if (!mapData || !mapData.obstacles) return;
    const half = (mapData.meta?.arenaSize || 1200) / 2;

    for (let i = 0; i < mapData.obstacles.length; i++) {
      const obs = mapData.obstacles[i];
      const worldX = obs.x - half;
      const worldY = obs.y - half;
      const radius = obs.radius || 24;
      const type = obs.type || 'normal';

      const body = Bodies.circle(worldX, worldY, radius, {
        isStatic: true,
        label: 'obstacle',
        restitution: type === 'bouncer' ? 2.0 : 0.9,
        friction: 0,
      });

      World.add(this.world, body);

      const obstacle = {
        x: worldX,
        y: worldY,
        radius,
        body,
        type,
        mapIndex: i, // for client sync
      };

      // Breakable / explosive obstacles have HP
      if (type === 'breakable' || type === 'explosive') {
        obstacle.hp = obs.hp || 20;
        obstacle.maxHp = obstacle.hp;
      }

      // Explosive obstacles store explosion params
      if (type === 'explosive') {
        obstacle.explosionRadius = obs.explosionRadius || 120;
        obstacle.explosionForce = obs.explosionForce || 0.12;
      }

      this.obstacles.push(obstacle);
    }
  }

  /**
   * Add a temporary obstacle (e.g. wall spell).
   * Returns the obstacle object with extra fields for tracking.
   */
  addTemporary(x, y, radius, extra = {}) {
    const body = Bodies.circle(x, y, radius, {
      isStatic: true,
      label: 'obstacle',
      restitution: 0.9,
      friction: 0,
    });

    World.add(this.world, body);

    const obs = { x, y, radius, body, isTemporary: true, ...extra };
    this.obstacles.push(obs);
    return obs;
  }

  /** Remove a single temporary obstacle from the world. */
  removeTemporary(obstacle) {
    if (!obstacle) return;
    const idx = this.obstacles.indexOf(obstacle);
    if (idx !== -1) {
      World.remove(this.world, obstacle.body);
      this.obstacles.splice(idx, 1);
    }
  }

  /** Remove all temporary obstacles (called between rounds). */
  clearTemporary() {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].isTemporary) {
        World.remove(this.world, this.obstacles[i].body);
        this.obstacles.splice(i, 1);
      }
    }
  }

  /**
   * Queue a map obstacle for destruction. Called by spell handlers when
   * a breakable/explosive obstacle's HP reaches 0.
   * The obstacle is removed from physics immediately; the event is queued
   * for Room.js to broadcast to clients.
   */
  queueDestroy(obstacle) {
    if (!obstacle || obstacle.isTemporary) return;

    // Queue event for client broadcast
    this.destroyedObstacles.push({
      mapIndex: obstacle.mapIndex,
      type: obstacle.type,
      x: obstacle.x,
      y: obstacle.y,
      explosionRadius: obstacle.explosionRadius || 0,
    });

    // Remove from physics world
    const idx = this.obstacles.indexOf(obstacle);
    if (idx !== -1) {
      World.remove(this.world, obstacle.body);
      this.obstacles.splice(idx, 1);
    }
  }

  /** Flush and return queued destruction events. Called by Room.js each tick. */
  flushDestroyed() {
    if (this.destroyedObstacles.length === 0) return [];
    const events = this.destroyedObstacles;
    this.destroyedObstacles = [];
    return events;
  }

  /** Get all obstacles for spell collision checks. */
  getObstacles() {
    return this.obstacles;
  }

  /** Remove all obstacle bodies from the physics world. */
  destroy() {
    for (const obs of this.obstacles) {
      World.remove(this.world, obs.body);
    }
    this.obstacles = [];
    this.destroyedObstacles = [];
  }
}
