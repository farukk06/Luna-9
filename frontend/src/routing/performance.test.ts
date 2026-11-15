/// <reference types="node" />
import { arch, cpus, platform, release } from 'node:os';
import { version } from 'node:process';
import { expect, it } from 'vitest';
import { DEFAULT_OPTIONS, findRoute } from './index';
import type { Grid } from './types';

// Local synthetic timing check, not a scientific benchmark or a browser latency guarantee.
it('measures complete findRoute calls on synthetic 400x400 grids', () => {
  console.info('Timing environment', { node: version, platform: platform(), release: release(),
    arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length });
  for (const scenario of ['flat', 'weighted', 'unreachable'] as const) {
    const size = 400 * 400;
    const grid: Grid = { version: 1, width: 400, height: 400, cellSize: 5, nodata: -9999,
      elevation: Array(size).fill(0), slope: Array(size).fill(0), roughness: Array(size).fill(0),
      stats: { elevationMin: 0, elevationMax: 0, slopeMax: 20, roughnessP95: 1 } };
    if (scenario === 'weighted') {
      grid.slope = grid.slope.map((_, i) => (i * 17 + Math.floor(i / 400) * 13) % 21);
      grid.roughness = grid.roughness.map((_, i) => (i * 7 % 20) / 10);
    }
    if (scenario === 'unreachable') grid.slope.fill(40, 200 * 400, 201 * 400);
    const start = { col: 0, row: 0 }, goal = { col: 399, row: 399 };
    findRoute(grid, start, goal, DEFAULT_OPTIONS); // Warm up this scenario before timing.
    const samples: number[] = [];
    for (let run = 0; run < 5; run++) {
      const before = performance.now();
      const result = findRoute(grid, start, goal, DEFAULT_OPTIONS);
      samples.push(performance.now() - before);
      expect(result.ok).toBe(scenario !== 'unreachable');
      if (result.ok) {
        expect(result.path[0]).toEqual(start);
        expect(result.path.at(-1)).toEqual(goal);
      } else expect(result.reason).toBe('unreachable');
    }
    const sorted = [...samples].sort((a, b) => a - b);
    console.info('Synthetic 400x400 timing (ms)', { scenario, samples, median: sorted[2],
      min: sorted[0], max: sorted[4], cellSizeM: 5, measuredRuns: 5, warmupRuns: 1 });
  }
}, 30000);
