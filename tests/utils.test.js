import { describe, it, expect } from 'vitest';
import { getSpawnPositions } from '../src/server/game/utils.js';

describe('getSpawnPositions', () => {
  it('should return correct count of positions', () => {
    expect(getSpawnPositions(1)).toHaveLength(1);
    expect(getSpawnPositions(4)).toHaveLength(4);
    expect(getSpawnPositions(8)).toHaveLength(8);
  });

  it('should default radius to 200', () => {
    const positions = getSpawnPositions(1);
    const dist = Math.sqrt(positions[0].x ** 2 + positions[0].y ** 2);
    expect(dist).toBeCloseTo(200, 0);
  });

  it('should place first position at top of circle (angle -PI/2)', () => {
    const positions = getSpawnPositions(4, 100);
    // angle -PI/2 => cos=0, sin=-1 => (0, -100)
    expect(positions[0]).toEqual({ x: 0, y: -100 });
  });

  it('should space 4 positions evenly at 90-degree intervals', () => {
    const positions = getSpawnPositions(4, 100);
    expect(positions[0]).toEqual({ x: 0, y: -100 });   // top
    expect(positions[1]).toEqual({ x: 100, y: 0 });     // right
    expect(positions[2]).toEqual({ x: 0, y: 100 });     // bottom
    expect(positions[3]).toEqual({ x: -100, y: 0 });    // left
  });

  it('should use custom radius', () => {
    const positions = getSpawnPositions(1, 500);
    const dist = Math.sqrt(positions[0].x ** 2 + positions[0].y ** 2);
    expect(dist).toBeCloseTo(500, 0);
  });

  it('should place all positions on the circle within rounding tolerance', () => {
    const radius = 200;
    const positions = getSpawnPositions(8, radius);
    for (const pos of positions) {
      const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2);
      // Math.round introduces up to 0.5 error per axis → ~1 pixel total distance error
      expect(Math.abs(dist - radius)).toBeLessThan(1);
    }
  });
});
