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
