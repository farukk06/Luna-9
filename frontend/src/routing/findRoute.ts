import type { Cell, Grid, RouteOptions, RouteResult } from './types';
import { MIN_DISTANCE_WEIGHT, SUIT_FACTOR } from './config';
import { MinHeap } from './heap';

function failure(reason: NonNullable<RouteResult['reason']>): RouteResult {
  return { ok: false, reason, path: [], distanceM: 0, maxSlopeDeg: 0, meanSlopeDeg: 0,
    durationMin: 0, returnDurationMin: 0, profile: [] };
}

function validGrid(g: Grid): boolean {
  if (!g || !g.stats) return false;
  const size = g.width * g.height;
  return Number.isSafeInteger(g.width) && g.width > 0 && Number.isSafeInteger(g.height) && g.height > 0
    && Number.isSafeInteger(size) && Number.isFinite(g.cellSize) && g.cellSize > 0
    && Number.isFinite(g.nodata) && Number.isInteger(g.version) && g.version > 0
    && [g.elevation, g.slope, g.roughness].every(a => Array.isArray(a) && a.length === size && Array.from(a).every(Number.isFinite))
    && [g.stats.elevationMin, g.stats.elevationMax, g.stats.slopeMax, g.stats.roughnessP95].every(Number.isFinite)
    && g.stats.roughnessP95 >= 0
    && g.elevation.every(Number.isFinite)
    && g.slope.every(v => Number.isFinite(v) && (v === g.nodata || (v >= 0 && v <= 90)))
    && g.roughness.every(v => Number.isFinite(v) && (v === g.nodata || v >= 0));
}

function validOptions(o: RouteOptions): boolean {
  return !!o && [o.wDistance, o.wSlope, o.wRoughness].every(v => Number.isFinite(v) && v >= 0)
    && Number.isFinite(o.maxSlopeDeg) && o.maxSlopeDeg >= 0 && o.maxSlopeDeg <= 90;
}

function inside(g: Grid, c: Cell): boolean {
  return !!c && Number.isInteger(c.col) && Number.isInteger(c.row)
    && c.col >= 0 && c.row >= 0 && c.col < g.width && c.row < g.height;
}

function summarize(g: Grid, indices: number[]): RouteResult {
  const path = indices.map(i => ({ col: i % g.width, row: Math.floor(i / g.width) }));
  let distanceM = 0, durationMin = 0, returnDurationMin = 0, maximum = 0, sum = 0;
  const profile = indices.map((index, n) => {
    const slope = g.slope[index];
    maximum = Math.max(maximum, slope);
    sum += slope;
    if (n > 0) {
      const previous = indices[n - 1];
      const d = Math.hypot(path[n].col - path[n - 1].col, path[n].row - path[n - 1].row) * g.cellSize;
      const rise = (g.elevation[index] - g.elevation[previous]) / d;
      // rise = tan(theta); 60 / (1000 * 6) converts metres and km/hour to minutes.
      const minutes = (grade: number) => d / (100 * SUIT_FACTOR) * Math.exp(3.5 * Math.abs(grade + 0.05));
      distanceM += d;
      durationMin += minutes(rise);
      returnDurationMin += minutes(-rise);
    }
    return { distanceM, elevationM: g.elevation[index], slopeDeg: slope };
  });
  // Reject numerical overflow rather than reporting a usable route with infinite duration.
  if (![distanceM, durationMin, returnDurationMin, sum].every(Number.isFinite)) return failure('unreachable');
  // CONTRACT v2 does not prescribe weighting; retain the arithmetic cell mean.
  return { ok: true, path, distanceM, maxSlopeDeg: maximum, meanSlopeDeg: sum / path.length,
    durationMin, returnDurationMin, profile };
}

export function findRoute(grid: Grid, start: Cell, goal: Cell, options: RouteOptions): RouteResult {
  // v2 has no invalid-input reason; do not interpret this fallback as proof of disconnection.
  if (!validGrid(grid) || !validOptions(options)) return failure('unreachable');
  if (!inside(grid, start) || !inside(grid, goal)) return failure('out-of-bounds');
  const { width, height, cellSize, nodata } = grid;
  const passable = (i: number) => grid.elevation[i] !== nodata && grid.slope[i] !== nodata
    && grid.roughness[i] !== nodata && grid.slope[i] <= options.maxSlopeDeg;
  const startIndex = start.row * width + start.col, goalIndex = goal.row * width + goal.col;
  if (!passable(startIndex)) return failure('start-blocked');
  if (!passable(goalIndex)) return failure('goal-blocked');
  const alpha = Math.max(MIN_DISTANCE_WEIGHT, options.wDistance);
  const heuristic = (col: number, row: number) => Math.hypot(col - goal.col, row - goal.row) * cellSize * alpha;
  const terrain = (i: number) => options.wSlope * (options.maxSlopeDeg === 0 ? 0 : grid.slope[i] / options.maxSlopeDeg)
    + options.wRoughness * (grid.stats.roughnessP95 <= 0.001 ? 0 : Math.min(grid.roughness[i] / grid.stats.roughnessP95, 1));
  const costs = new Float64Array(width * height).fill(Infinity);
  const parents = new Float64Array(width * height).fill(-1);
  const open = new MinHeap();
  costs[startIndex] = 0;
  open.push({ index: startIndex, cost: 0, priority: heuristic(start.col, start.row) });
  for (let entry = open.pop(); entry; entry = open.pop()) {
    const { index, cost } = entry;
    if (cost !== costs[index]) continue;
    if (index === goalIndex) {
      const indices: number[] = [];
      for (let i = index; i !== -1; i = parents[i]) indices.push(i);
      return summarize(grid, indices.reverse());
    }
    const col = index % width, row = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = col + dx, y = row + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const next = y * width + x;
      if (!passable(next)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(row * width + x) || !passable(y * width + col))) continue;
      const d = cellSize * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      const candidate = cost + d * (alpha + terrain(index) / 2 + terrain(next) / 2);
      const priority = candidate + heuristic(x, y);
      if (!Number.isFinite(priority) || candidate >= costs[next]) continue;
      costs[next] = candidate;
      parents[next] = index;
      open.push({ index: next, cost: candidate, priority });
    }
  }
  return failure('unreachable');
}
