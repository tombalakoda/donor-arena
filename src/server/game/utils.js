/**
 * Generate evenly-spaced spawn positions in a circle.
 * @param {number} count - number of positions
 * @param {number} radius - circle radius (default 200)
 * @returns {{ x: number, y: number }[]}
 */
export function getSpawnPositions(count, radius = 200) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    positions.push({
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    });
  }
  return positions;
}
