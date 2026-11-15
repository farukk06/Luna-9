import { describe, expect, it } from 'vitest';
import type { Grid } from '../routing/types';
import { createMockGrid } from './mockGrid';
import {
  DEFAULT_EVA_PROFILE,
  DEFAULT_OPTIONS,
  SUIT_FACTOR,
  checkEva,
  findAlternatives,
  findRoute,
  toblerSpeedKmh,
} from './mockRouting';

/** Small synthetic grid with a constant east-west gradient (0 = flat). */
function planeGrid(gradient: number, size = 20, cellSize = 10): Grid {
  const n = size * size;
  const elevation = Array.from({ length: n }, (_, i) => (i % size) * cellSize * gradient);
  const slopeDeg = Math.round(((Math.atan(gradient) * 180) / Math.PI) * 10) / 10;
  return {
    version: 1,
    width: size,
    height: size,
    cellSize,
    nodata: -9999,
    elevation,
    slope: new Array<number>(n).fill(slopeDeg),
    roughness: new Array<number>(n).fill(0),
    stats: {
      elevationMin: 0,
      elevationMax: (size - 1) * cellSize * gradient,
      slopeMax: slopeDeg,
      roughnessP95: 0,
    },
  };
}

const grid = createMockGrid();
const start = { col: 10, row: 90 };
const goal = { col: 40, row: 75 };

describe('createMockGrid', () => {
  it('matches the contract shape: 100×100, 10 m cells', () => {
    expect(grid.width).toBe(100);
    expect(grid.height).toBe(100);
    expect(grid.cellSize).toBe(10);
    expect(grid.elevation).toHaveLength(10000);
    expect(grid.slope).toHaveLength(10000);
    expect(grid.roughness).toHaveLength(10000);
  });

  it('has a central hill steeper than 25°', () => {
    expect(grid.stats.slopeMax).toBeGreaterThan(25);
  });

  it('keeps NoData consistent and out of the stats', () => {
    const nodataIdx = grid.elevation.findIndex((z) => z === grid.nodata);
    expect(nodataIdx).toBeGreaterThanOrEqual(0);
    expect(grid.slope[nodataIdx]).toBe(grid.nodata);
    expect(grid.roughness[nodataIdx]).toBe(grid.nodata);
    expect(grid.stats.elevationMin).toBeGreaterThan(grid.nodata);
    expect(grid.stats.roughnessP95).toBeGreaterThan(0);
  });
});

describe('findRoute (mock)', () => {
  it('starts at the start cell and ends at the goal cell', () => {
    const route = findRoute(grid, start, goal, DEFAULT_OPTIONS);
    expect(route.ok).toBe(true);
    expect(route.path[0]).toEqual(start);
    expect(route.path[route.path.length - 1]).toEqual(goal);
  });

  it('has a positive distance', () => {
    const route = findRoute(grid, start, goal, DEFAULT_OPTIONS);
    expect(route.distanceM).toBeGreaterThan(0);
  });

  it('gives different outbound and return times on a sloped route', () => {
    const route = findRoute(planeGrid(0.1), { col: 2, row: 5 }, { col: 15, row: 5 }, DEFAULT_OPTIONS);
    expect(route.ok).toBe(true);
    // Uphill outbound must be slower than the downhill return.
    expect(route.durationMin).toBeGreaterThan(route.returnDurationMin);
  });

  it('uses Tobler ≈ 5.04 km/h × SUIT_FACTOR on flat ground', () => {
    expect(toblerSpeedKmh(0)).toBeCloseTo(5.04 * SUIT_FACTOR, 2);
    // 100 m straight on a flat grid: time must match that speed.
    const route = findRoute(planeGrid(0), { col: 0, row: 0 }, { col: 10, row: 0 }, DEFAULT_OPTIONS);
    const expectedMin = (0.1 / (5.04 * SUIT_FACTOR)) * 60;
    expect(route.distanceM).toBe(100);
    expect(route.durationMin).toBeCloseTo(expectedMin, 1);
    expect(route.returnDurationMin).toBeCloseTo(route.durationMin, 10);
  });

  it('uses the distance-weighted mean slope (CONTRACT v3)', () => {
    // 3×3 flat grid with slope 0° at (0,0), 10° at (1,1), 20° at (2,1).
    const g = planeGrid(0, 3)
    g.slope[0] = 0
    g.slope[1 * 3 + 1] = 10
    g.slope[1 * 3 + 2] = 20
    const route = findRoute(g, { col: 0, row: 0 }, { col: 2, row: 1 }, DEFAULT_OPTIONS)
    // Bresenham gives one diagonal step, then one straight step.
    expect(route.path).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ])
    // Edge slopes 5° (diagonal, 10√2 m) and 15° (straight, 10 m).
    const diag = 10 * Math.SQRT2
    const expected = (5 * diag + 15 * 10) / (diag + 10)
    expect(route.meanSlopeDeg).toBeCloseTo(expected, 10) // ≈ 9.14°, not the plain mean of 10°
    expect(route.maxSlopeDeg).toBe(20)
  })

  it('handles a single-cell path (start = goal)', () => {
    const g = planeGrid(0, 3)
    g.slope[4] = 7.5
    const route = findRoute(g, { col: 1, row: 1 }, { col: 1, row: 1 }, DEFAULT_OPTIONS)
    expect(route.ok).toBe(true)
    expect(route.path).toEqual([{ col: 1, row: 1 }])
    expect(route.distanceM).toBe(0)
    expect(route.maxSlopeDeg).toBe(7.5)
    expect(route.meanSlopeDeg).toBe(7.5)
    expect(route.durationMin).toBe(0)
    expect(route.returnDurationMin).toBe(0)
  })

  it('reports blocked and out-of-bounds cells instead of throwing', () => {
    expect(findRoute(grid, { col: -1, row: 0 }, goal, DEFAULT_OPTIONS).reason).toBe('out-of-bounds');
    expect(findRoute(grid, { col: 99, row: 0 }, goal, DEFAULT_OPTIONS).reason).toBe('start-blocked');
  });
});

describe('findAlternatives / checkEva (mock)', () => {
  it('returns the same route three times with the mock reason', () => {
    const alt = findAlternatives(grid, start, goal, DEFAULT_OPTIONS);
    expect(alt.shortest).toEqual(alt.balanced);
    expect(alt.safest).toEqual(alt.balanced);
    expect(alt.reason).toBe('Mock route – real routing pending');
  });

  it('sums outbound, research and return time', () => {
    const route = findRoute(grid, start, goal, DEFAULT_OPTIONS);
    const eva = checkEva(route, DEFAULT_EVA_PROFILE);
    expect(eva.totalMin).toBeCloseTo(route.durationMin + 30 + route.returnDurationMin, 10);
    expect(eva.limitMin).toBe(192);
    expect(eva.withinLimit).toBe(true);
    expect(eva.pointOfNoReturnIndex).toBeUndefined();
  });

  it('marks a point of no return when the limit is exceeded', () => {
    const route = findRoute(grid, start, goal, DEFAULT_OPTIONS);
    const eva = checkEva(route, { maxEvaMinutes: 10, researchMinutes: 0, safetyMarginPct: 0 });
    expect(eva.withinLimit).toBe(false);
    expect(eva.pointOfNoReturnIndex).toBeLessThan(route.path.length - 1);
  });
});
