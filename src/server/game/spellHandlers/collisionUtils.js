/**
 * Swept line-circle collision test.
 *
 * Instead of checking if the projectile's CURRENT position overlaps a target,
 * this checks whether the projectile's movement LINE (from previous to current
 * position) passes within `combinedRadius` of the target center.
 *
 * This prevents fast projectiles from "tunneling" through players when their
 * per-tick displacement exceeds the collision distance.
 *
 * @param {number} prevX - Projectile position before this tick
 * @param {number} prevY
 * @param {number} currX - Projectile position after this tick
 * @param {number} currY
 * @param {number} targetX - Target center
 * @param {number} targetY
 * @param {number} combinedRadius - spell.radius + target.radius
 * @returns {boolean} true if the swept path intersects the target
 */
export function sweepTestHit(prevX, prevY, currX, currY, targetX, targetY, combinedRadius) {
  // Direction vector of projectile movement this tick
  const dx = currX - prevX;
  const dy = currY - prevY;
  const segLenSq = dx * dx + dy * dy;

  // If projectile didn't move, fall back to point-circle test at current pos
  if (segLenSq === 0) {
    const ex = currX - targetX;
    const ey = currY - targetY;
    return (ex * ex + ey * ey) < combinedRadius * combinedRadius;
  }

  // Vector from segment start to target center
  const fx = prevX - targetX;
  const fy = prevY - targetY;

  // Project target onto segment: t = -dot(f, d) / dot(d, d)
  // Clamped to [0, 1] so we only check the actual segment, not the infinite line
  let t = -(fx * dx + fy * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  // Closest point on segment to target
  const closestX = prevX + t * dx;
  const closestY = prevY + t * dy;

  const distX = closestX - targetX;
  const distY = closestY - targetY;
  return (distX * distX + distY * distY) < combinedRadius * combinedRadius;
}
