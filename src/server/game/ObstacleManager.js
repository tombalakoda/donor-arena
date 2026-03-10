import Matter from 'matter-js';

const { Bodies, World } = Matter;

/**
 * Manages static obstacle bodies (pillars) in the arena.
 * Creates Matter.js static circle bodies from map data.
 * Player collision is automatic via Matter.js.
 * Spell collision is done via distance checks in ServerSpell.
 */
export class ObstacleManager {
  constructor(world) {
    this.world = world;
    this.obstacles = []; // { x, y, radius, body }
  }

  /**
   * Load obstacles from map JSON and create static bodies.
   * Converts editor coordinates (0-1200) to world coordinates (centered at 0,0).
   */
  loadFromMap(mapData) {
    if (!mapData || !mapData.obstacles) return;
    const half = (mapData.meta?.arenaSize || 1200) / 2;

    for (const obs of mapData.obstacles) {
      const worldX = obs.x - half;
      const worldY = obs.y - half;
      const radius = obs.radius || 24;

      const body = Bodies.circle(worldX, worldY, radius, {
        isStatic: true,
        label: 'obstacle',
        restitution: 0.9,   // Bouncy — players ricochet off pillars on ice
        friction: 0,
      });

      World.add(this.world, body);

      this.obstacles.push({
        x: worldX,
        y: worldY,
        radius,
        body,
      });
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
  }
}
