import { describe, expect, it } from 'vitest';
import { findRoute, DEFAULT_OPTIONS, MIN_DISTANCE_WEIGHT, SUIT_FACTOR } from './index';
import type { Grid, RouteOptions, RouteResult } from './types';
import { MinHeap } from './heap';

// All terrain in this suite is synthetic, not NASA/USGS measurement data.
function grid(width = 3, height = 3): Grid {
  return { version: 1, width, height, cellSize: 10, nodata: -9999,
    elevation: Array(width * height).fill(0), slope: Array(width * height).fill(0),
    roughness: Array(width * height).fill(0),
    stats: { elevationMin: 0, elevationMax: 0, slopeMax: 0, roughnessP95: 1 } };
}
const cell = (col: number, row = 0) => ({ col, row });
const shortest = { ...DEFAULT_OPTIONS, wSlope: 0, wRoughness: 0 };
function failed(result: RouteResult, reason: RouteResult['reason']) {
  expect(result).toEqual({ ok: false, reason, path: [], distanceM: 0, maxSlopeDeg: 0,
    meanSlopeDeg: 0, durationMin: 0, returnDurationMin: 0, profile: [] });
}

describe('findRoute on synthetic terrain', () => {
  it('safely rejects missing runtime grid, stats, options and coordinates', () => {
    for (const value of [null, undefined, {}, { ...grid(), stats: undefined }, { ...grid(), stats: {} }]) {
      failed(findRoute(value as Grid, cell(0), cell(1), shortest), 'unreachable');
    }
    failed(findRoute(grid(), cell(0), cell(1), null as unknown as RouteOptions), 'unreachable');
    failed(findRoute(grid(), null as unknown as ReturnType<typeof cell>, cell(1), shortest), 'out-of-bounds');
    failed(findRoute(grid(), cell(0), undefined as unknown as ReturnType<typeof cell>, shortest), 'out-of-bounds');
  });
  it('rejects sparse arrays rather than skipping missing cells', () => {
    const g = grid(); delete g.elevation[4];
    failed(findRoute(g, cell(0), cell(1), shortest), 'unreachable');
  });
  it('finds the shortest flat path and fills every result field', () => {
    const result = findRoute(grid(), cell(0), cell(2), shortest);
    expect(result).toEqual({ ok: true, path: [cell(0), cell(1), cell(2)], distanceM: 20,
      maxSlopeDeg: 0, meanSlopeDeg: 0,
      durationMin: expect.any(Number), returnDurationMin: expect.any(Number),
      profile: [0, 10, 20].map(distanceM => ({ distanceM, elevationM: 0, slopeDeg: 0 })) });
    expect(result.durationMin).toBeCloseTo(20 / (100 * SUIT_FACTOR) * Math.exp(3.5 * 0.05));
    expect(result.returnDurationMin).toBe(result.durationMin);
  });
  it('uses sqrt(2) times cell size for diagonal steps', () => {
    const r = findRoute(grid(), cell(0), cell(2, 2), shortest);
    expect(r.path).toEqual([cell(0), cell(1, 1), cell(2, 2)]);
    expect(r.distanceM).toBeCloseTo(20 * Math.SQRT2);
  });
  it.each([1, 2])('forbids corner cutting with %i blocked side(s)', count => {
    const g = grid(2, 2); g.slope[1] = 40;
    if (count === 2) g.slope[2] = 40;
    const r = findRoute(g, cell(0), cell(1, 1), shortest);
    if (count === 2) failed(r, 'unreachable');
    else { expect(r.path).toEqual([cell(0), cell(0, 1), cell(1, 1)]); expect(r.distanceM).toBe(20); }
  });
  it.each(['elevation', 'slope', 'roughness'] as const)('avoids %s NoData', field => {
    const g = grid(); g[field][1] = g.nodata;
    const r = findRoute(g, cell(0), cell(2), shortest);
    expect(r.ok).toBe(true); expect(r.path).not.toContainEqual(cell(1));
  });
  it('avoids steep cells but allows the exact slope threshold', () => {
    const g = grid(); g.slope[1] = 26;
    expect(findRoute(g, cell(0), cell(2), shortest).path).not.toContainEqual(cell(1));
    g.slope[1] = 25;
    expect(findRoute(g, cell(0), cell(2), shortest).path).toContainEqual(cell(1));
  });
  it.each(['start', 'goal'] as const)('reports blocked %s', endpoint => {
    const g = grid(); g.elevation[endpoint === 'start' ? 0 : 2] = g.nodata;
    failed(findRoute(g, cell(0), cell(2), shortest), endpoint === 'start' ? 'start-blocked' : 'goal-blocked');
  });
  it.each([cell(-1), cell(3), cell(0, -1), cell(0, 3), cell(0.5), cell(NaN), cell(Infinity)])('rejects invalid coordinate %j at either endpoint', c => {
    failed(findRoute(grid(), c, cell(0), shortest), 'out-of-bounds');
    failed(findRoute(grid(), cell(0), c, shortest), 'out-of-bounds');
  });
  it('reports an unreachable goal across a complete barrier', () => {
    const g = grid(); g.slope.splice(3, 3, 30, 30, 30);
    failed(findRoute(g, cell(0), cell(2, 2), shortest), 'unreachable');
  });
  it('returns one point and zero durations when start equals goal', () => {
    const r = findRoute(grid(), cell(1, 1), cell(1, 1), shortest);
    expect(r.ok).toBe(true); expect(r.path).toEqual([cell(1, 1)]);
    expect(r.profile).toEqual([{ distanceM: 0, elevationM: 0, slopeDeg: 0 }]);
    expect([r.distanceM, r.durationMin, r.returnDurationMin, r.maxSlopeDeg, r.meanSlopeDeg]).toEqual([0, 0, 0, 0, 0]);
  });
  it.each([0, 0.001])('handles roughnessP95=%s and zero maxSlopeDeg', p95 => {
    const g = grid(); g.stats.roughnessP95 = p95; g.roughness.fill(100);
    const r = findRoute(g, cell(0), cell(2, 2), { ...DEFAULT_OPTIONS, maxSlopeDeg: 0 });
    expect(r.ok).toBe(true); expect(r.distanceM).toBeCloseTo(20 * Math.SQRT2);
  });
  it('clamps distance weight without mutating caller options', () => {
    const options = { ...DEFAULT_OPTIONS, wDistance: 0 };
    expect(findRoute(grid(), cell(0), cell(2, 2), options)).toEqual(
      findRoute(grid(), cell(0), cell(2, 2), { ...options, wDistance: MIN_DISTANCE_WEIGHT }));
    expect(options.wDistance).toBe(0);
  });
  it.each(['slope', 'roughness'] as const)('takes a cheaper detour under %s cost', field => {
    const g = grid(5, 3); g[field][7] = field === 'slope' ? 25 : 100;
    const opts = { ...shortest, wSlope: field === 'slope' ? 100 : 0, wRoughness: field === 'roughness' ? 100 : 0 };
    expect(findRoute(g, cell(0, 1), cell(4, 1), shortest).path).toContainEqual(cell(2, 1));
    expect(findRoute(g, cell(0, 1), cell(4, 1), opts).path).not.toContainEqual(cell(2, 1));
  });
  it('computes directed Tobler times from elevation rather than stored slope', () => {
    const g = grid(3, 1); g.elevation = [0, 1, 3]; g.slope = [2, 4, 6];
    const r = findRoute(g, cell(0), cell(2), shortest);
    const minutes = (grade: number) => 10 / (100 * SUIT_FACTOR) * Math.exp(3.5 * Math.abs(grade + 0.05));
    expect(r.durationMin).toBeCloseTo(minutes(0.1) + minutes(0.2));
    expect(r.returnDurationMin).toBeCloseTo(minutes(-0.1) + minutes(-0.2));
    expect(r.durationMin).toBeGreaterThan(r.returnDurationMin);
    expect(r.maxSlopeDeg).toBe(6); expect(r.meanSlopeDeg).toBe(4);
    expect(r.profile.map(p => p.elevationM)).toEqual([0, 1, 3]);
    const reverse = findRoute(g, cell(2), cell(0), shortest);
    expect(reverse.durationMin).toBeCloseTo(r.returnDurationMin);
  });
  it.each([
    { width: 0 }, { height: 1.5 }, { cellSize: 0 }, { cellSize: Infinity },
    { elevation: [0] }, { slope: [0] }, { roughness: [0] }, { nodata: NaN },
  ])('rejects malformed grid %j', patch => {
    failed(findRoute({ ...grid(), ...patch }, cell(0), cell(1), shortest), 'unreachable');
  });
  it.each(['elevation', 'slope', 'roughness'] as const)('rejects nonfinite %s values', field => {
    const g = grid(); g[field][4] = NaN;
    failed(findRoute(g, cell(0), cell(1), shortest), 'unreachable');
  });
  it.each([
    { wDistance: -1 }, { wSlope: -1 }, { wRoughness: -1 }, { wDistance: NaN },
    { wSlope: Infinity }, { maxSlopeDeg: -1 }, { maxSlopeDeg: 91 }, { maxSlopeDeg: NaN },
  ] satisfies Partial<RouteOptions>[])('rejects invalid options %j', patch => {
    failed(findRoute(grid(), cell(0), cell(1), { ...shortest, ...patch }), 'unreachable');
  });
  it('rejects invalid terrain ranges and statistics', () => {
    for (const patch of [{ slope: Array(9).fill(-1) }, { roughness: Array(9).fill(-1) },
      { stats: { ...grid().stats, roughnessP95: -1 } }]) {
      failed(findRoute({ ...grid(), ...patch }, cell(0), cell(1), shortest), 'unreachable');
    }
  });
  it('does not leak Infinity on extreme elevation or costs', () => {
    const g = grid(2, 1); g.elevation[1] = Number.MAX_VALUE;
    failed(findRoute(g, cell(0), cell(1), shortest), 'unreachable');
    failed(findRoute(grid(), cell(0), cell(1), { ...shortest, wDistance: Number.MAX_VALUE }), 'unreachable');
  });
  it('does not mutate input terrain or coordinates', () => {
    const g = grid(); const before = structuredClone(g); const start = Object.freeze(cell(0));
    findRoute(g, start, Object.freeze(cell(2)), Object.freeze(shortest));
    expect(g).toEqual(before);
  });
});

it('binary min-heap orders interleaved inserts and removes', () => {
  const heap = new MinHeap();
  for (const priority of [9, 1, 7, 3, 3, 0, 8]) heap.push({ index: priority, cost: 0, priority });
  expect(heap.pop()?.priority).toBe(0);
  heap.push({ index: -1, cost: 0, priority: -1 });
  expect(Array.from({ length: 7 }, () => heap.pop()?.priority)).toEqual([-1, 1, 3, 3, 7, 8, 9]);
  expect(heap.pop()).toBeUndefined();
});

it('matches an independent dense Dijkstra oracle on 20 weighted synthetic grids', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = grid(5, 5);
    g.slope = g.slope.map((_, i) => (i * 17 + seed * 7) % 35);
    g.roughness = g.roughness.map((_, i) => ((i * 13 + seed) % 8) / 2);
    g.slope[0] = 0; g.slope[24] = 0;
    const o = { ...DEFAULT_OPTIONS, wDistance: seed % 2 ? 0 : 2 };
    const alpha = Math.max(o.wDistance, MIN_DISTANCE_WEIGHT);
    const traversable = (i: number) => g.slope[i] <= o.maxSlopeDeg;
    const edgeCost = (a: number, b: number) => {
      const d = Math.hypot(a % 5 - b % 5, Math.floor(a / 5) - Math.floor(b / 5)) * 10;
      return d * (alpha + o.wSlope * (g.slope[a] + g.slope[b]) / (2 * o.maxSlopeDeg)
        + o.wRoughness * (Math.min(g.roughness[a], 1) + Math.min(g.roughness[b], 1)) / 2);
    };
    const distances = Array(25).fill(Infinity) as number[];
    const visited = new Set<number>(); distances[0] = 0;
    for (let step = 0; step < 25; step++) {
      let best = -1;
      for (let i = 0; i < 25; i++) if (!visited.has(i) && (best === -1 || distances[i] < distances[best])) best = i;
      if (best === -1 || !Number.isFinite(distances[best])) break;
      visited.add(best);
      for (let next = 0; next < 25; next++) {
        const dx = next % 5 - best % 5, dy = Math.floor(next / 5) - Math.floor(best / 5);
        if ((!dx && !dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1 || !traversable(next)) continue;
        if (dx && dy && (!traversable(best + dx) || !traversable(best + dy * 5))) continue;
        distances[next] = Math.min(distances[next], distances[best] + edgeCost(best, next));
      }
    }
    const result = findRoute(g, cell(0), cell(4, 4), o);
    if (!Number.isFinite(distances[24])) failed(result, 'unreachable');
    else {
      expect(result.ok).toBe(true);
      const actual = result.path.reduce((total, c, i, path) => i === 0 ? 0 : total
        + edgeCost(path[i - 1].row * 5 + path[i - 1].col, c.row * 5 + c.col), 0);
      expect(actual).toBeCloseTo(distances[24], 8);
    }
  }
});
