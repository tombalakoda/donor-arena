import Matter from 'matter-js';
import { PLAYER, ARENA } from '../../shared/constants.js';

const { Engine, World, Bodies, Body, Events } = Matter;

export class ServerPhysics {
  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0 },
    });
    this.world = this.engine.world;
    this.playerBodies = new Map(); // playerId -> Matter.Body
    this.knockbackUntil = new Map(); // playerId -> timestamp when knockback grace ends
  }

  addPlayer(playerId, x, y) {
    const body = Bodies.circle(x, y, PLAYER.RADIUS, {
      label: `player-${playerId}`,
      mass: PLAYER.MASS,
      friction: PLAYER.FRICTION,
      frictionAir: PLAYER.FRICTION_AIR,
      restitution: PLAYER.RESTITUTION,
      frictionStatic: PLAYER.FRICTION_STATIC,
      inertia: Infinity,
      inverseInertia: 0,
    });
    World.add(this.world, body);
    this.playerBodies.set(playerId, body);
    this.knockbackUntil.set(playerId, 0);
    return body;
  }

  removePlayer(playerId) {
    const body = this.playerBodies.get(playerId);
    if (body) {
      World.remove(this.world, body);
      this.playerBodies.delete(playerId);
      this.knockbackUntil.delete(playerId);
    }
  }

  /**
   * Apply knockback force to a player and start a grace period where
   * the speed cap is lifted and voluntary movement is blocked.
   * This makes knockback feel powerful — players FLY when hit.
   */
  applyKnockback(playerId, forceX, forceY) {
    const body = this.playerBodies.get(playerId);
    if (!body) return;
    Body.applyForce(body, body.position, { x: forceX, y: forceY });
    const graceDuration = PLAYER.KNOCKBACK_GRACE_MS || 300;
    this.knockbackUntil.set(playerId, Date.now() + graceDuration);
  }

  /**
   * Check if a player is currently in knockback stagger (sliding freely).
   */
  isInKnockback(playerId) {
    return Date.now() < (this.knockbackUntil.get(playerId) || 0);
  }

  applyInput(playerId, input, statusEffects = {}) {
    const body = this.playerBodies.get(playerId);
    if (!body) return false;

    const maxSpeed = PLAYER.SPEED * 0.05;

    // Knockback grace: player is sliding freely — no steering, no speed cap
    // Only frictionAir decays their velocity naturally
    if (this.isInKnockback(playerId)) {
      return false;
    }

    // Stun or root: prevent all voluntary movement (external forces like knockback still apply)
    if (statusEffects.stun || statusEffects.root) {
      const vel = body.velocity;
      const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        Body.setVelocity(body, { x: vel.x * scale, y: vel.y * scale });
      }
      return false;
    }

    if (input.targetX == null || input.targetY == null) return false;

    const dx = input.targetX - body.position.x;
    const dy = input.targetY - body.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const stopRadius = PLAYER.STOP_RADIUS || 10;

    let reached = false;

    if (distance > stopRadius) {
      // Apply thrust toward target
      const nx = dx / distance;
      const ny = dy / distance;

      let forceMagnitude = PLAYER.SPEED * 0.0002;

      // Slow effect: reduce movement force
      if (statusEffects.slow) {
        forceMagnitude *= (1 - statusEffects.slow.amount);
      }

      Body.applyForce(body, body.position, {
        x: nx * forceMagnitude,
        y: ny * forceMagnitude,
      });
    } else {
      // Within stop zone — stop applying force, let ice slide happen
      reached = true;
    }

    // Cap max velocity (only for voluntary movement — knockback is uncapped above)
    let effectiveMaxSpeed = maxSpeed;
    if (statusEffects.slow) {
      effectiveMaxSpeed *= (1 - statusEffects.slow.amount);
    }

    const vel = body.velocity;
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (currentSpeed > effectiveMaxSpeed) {
      const scale = effectiveMaxSpeed / currentSpeed;
      Body.setVelocity(body, {
        x: vel.x * scale,
        y: vel.y * scale,
      });
    }

    return reached;
  }

  step(deltaMs) {
    Engine.update(this.engine, deltaMs);
  }

  setPlayerPosition(playerId, x, y) {
    const body = this.playerBodies.get(playerId);
    if (!body) return;
    Body.setPosition(body, { x, y });
    Body.setVelocity(body, { x: 0, y: 0 });
  }

  getPlayerState(playerId) {
    const body = this.playerBodies.get(playerId);
    if (!body) return null;
    return {
      x: Math.round(body.position.x * 100) / 100,
      y: Math.round(body.position.y * 100) / 100,
      vx: Math.round(body.velocity.x * 1000) / 1000,
      vy: Math.round(body.velocity.y * 1000) / 1000,
    };
  }

  getAllPlayerStates() {
    const states = {};
    for (const [id, body] of this.playerBodies) {
      states[id] = this.getPlayerState(id);
    }
    return states;
  }

  destroy() {
    World.clear(this.world);
    Engine.clear(this.engine);
  }
}
