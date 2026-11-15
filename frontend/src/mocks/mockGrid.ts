import type { Grid } from '../routing/types';

// Synthetic terrain for development only. Not real Mars data.
// Shape is chosen so that routes must differ: a steep central hill (> 25°),
// a gentle ramp in the south, a rough "boulder field" west of the hill
// and a small NoData patch in the north-east corner.
// The default is 100×100 cells of 10 m (1 × 1 km). A larger spec (e.g. 400×400
// cells of 5 m, the size of the real grid) scales the same pattern, for
// performance tests.

export interface MockGridSpec {
  /** Cells per side (the grid is square). */
  cells: number;
  /** Cell size in metres. */
  cellSize: number;
}

export const DEFAULT_MOCK_SPEC: MockGridSpec = { cells: 100, cellSize: 10 };
/** Same dimensions as Person 2's real grid (2 × 2 km). */
export const LARGE_MOCK_SPEC: MockGridSpec = { cells: 400, cellSize: 5 };

const BASE_CELLS = 100; // the pattern below is designed on 100 cells…
const BASE_EXTENT_M = 1000; // …covering 1 km
const BASE_CELL_SIZE_M = 10;
const NODATA = -9999;
const BASE_ELEVATION = -2550; // metre, arbitrary mock value

/** Derived sizes for one spec; every helper below reads its dimensions from here. */
interface Layout {
  width: number;
  height: number;
  cellSize: number;
  /** Horizontal scale of the pattern relative to the 1 km design. */
  extentScale: number;
  /** Cells per design cell, for the NoData corner. */
  cellScale: number;
}

function layoutFor(spec: MockGridSpec): Layout {
  return {
    width: spec.cells,
    height: spec.cells,
    cellSize: spec.cellSize,
    extentScale: (spec.cells * spec.cellSize) / BASE_EXTENT_M,
    cellScale: spec.cells / BASE_CELLS,
  };
}

/** Deterministic PRNG (mulberry32) so the mock grid is identical on every run. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** NoData corner: columns ≥ 92 and rows ≤ 7 of the 100-cell design, scaled. */
function isNodataCell(l: Layout, col: number, row: number): boolean {
  return col >= 92 * l.cellScale && row < 8 * l.cellScale;
}

/**
 * Elevation at a cell-centre in map metres (x east, y north; CONTRACT Section 1).
 * Horizontal and vertical sizes scale together (k), so slopes stay the same on
 * a larger extent; the noise scales with the cell size for the same reason.
 */
function terrainElevation(l: Layout, x: number, y: number, noise: number): number {
  const k = l.extentScale;
  const tilt = 0.02 * x; // ~1° rise to the east
  const ramp = y < 300 * k ? -0.08 * (300 * k - y) : 0; // ~4.6° ramp descending south
  const dx = x - 500 * k;
  const dy = y - 500 * k;
  const sigma = 100 * k;
  const hill = 120 * k * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)); // max slope ~36°
  const inBoulderField = x >= 150 * k && x <= 350 * k && y >= 400 * k && y <= 650 * k;
  const roughnessAmp = (inBoulderField ? 0.8 : 0.15) * (l.cellSize / BASE_CELL_SIZE_M);
  return BASE_ELEVATION + tilt + ramp + hill + noise * roughnessAmp;
}

function generateElevation(l: Layout): number[] {
  const random = createRandom(9);
  const totalH = l.height * l.cellSize;
  const elevation = new Array<number>(l.width * l.height);
  for (let row = 0; row < l.height; row++) {
    for (let col = 0; col < l.width; col++) {
      const noise = random() * 2 - 1; // always consume, keeps the sequence stable
      const i = row * l.width + col;
      if (isNodataCell(l, col, row)) {
        elevation[i] = NODATA;
        continue;
      }
      const x = (col + 0.5) * l.cellSize;
      const y = totalH - (row + 0.5) * l.cellSize;
      elevation[i] = round(terrainElevation(l, x, y, noise), 2);
    }
  }
  return elevation;
}

/** Returns the elevation or null if the cell is outside the grid or NoData. */
function valueAt(l: Layout, elevation: number[], col: number, row: number): number | null {
  if (col < 0 || col >= l.width || row < 0 || row >= l.height) return null;
  const z = elevation[row * l.width + col];
  return z === NODATA ? null : z;
}

/**
 * Gradient along one axis. Uses the central difference when both neighbours
 * are valid, otherwise a one-sided difference, so NoData never enters the math
 * (CONTRACT 3b). Returns null when neither neighbour is valid.
 */
function axisGradient(c: number, center: number, before: number | null, after: number | null): number | null {
  if (before !== null && after !== null) return (after - before) / (2 * c);
  if (after !== null) return (after - center) / c;
  if (before !== null) return (center - before) / c;
  return null;
}

function computeSlope(l: Layout, elevation: number[], col: number, row: number): number {
  const z = valueAt(l, elevation, col, row);
  if (z === null) return NODATA;
  const at = (c: number, r: number) => valueAt(l, elevation, c, r);
  const gx = axisGradient(l.cellSize, z, at(col - 1, row), at(col + 1, row));
  const gy = axisGradient(l.cellSize, z, at(col, row - 1), at(col, row + 1));
  if (gx === null || gy === null) return NODATA; // safe side: impassable
  const deg = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
  return round(deg, 1);
}

/** Population standard deviation of valid elevations in the 3×3 window. */
function computeRoughness(l: Layout, elevation: number[], col: number, row: number): number {
  if (valueAt(l, elevation, col, row) === null) return NODATA;
  const values: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const v = valueAt(l, elevation, col + dc, row + dr);
      if (v !== null) values.push(v);
    }
  }
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return round(Math.sqrt(variance), 2);
}

/** Nearest-rank percentile of an already sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function validValues(values: number[]): number[] {
  return values.filter((v) => v !== NODATA);
}

// Loops instead of Math.min(...values): spreading 160 000 values can overflow the call stack.
function minOf(values: number[]): number {
  return values.reduce((m, v) => (v < m ? v : m), Infinity);
}

function maxOf(values: number[]): number {
  return values.reduce((m, v) => (v > m ? v : m), -Infinity);
}

function computeStats(elevation: number[], slope: number[], roughness: number[]): Grid['stats'] {
  const elev = validValues(elevation);
  const slp = validValues(slope);
  const rough = validValues(roughness).sort((a, b) => a - b);
  return {
    elevationMin: minOf(elev),
    elevationMax: maxOf(elev),
    slopeMax: maxOf(slp),
    roughnessP95: percentile(rough, 0.95),
  };
}

export function createMockGrid(spec: MockGridSpec = DEFAULT_MOCK_SPEC): Grid {
  const l = layoutFor(spec);
  const elevation = generateElevation(l);
  const slope = new Array<number>(l.width * l.height);
  const roughness = new Array<number>(l.width * l.height);
  for (let row = 0; row < l.height; row++) {
    for (let col = 0; col < l.width; col++) {
      const i = row * l.width + col;
      slope[i] = computeSlope(l, elevation, col, row);
      roughness[i] = computeRoughness(l, elevation, col, row);
    }
  }
  return {
    version: 1,
    width: l.width,
    height: l.height,
    cellSize: l.cellSize,
    nodata: NODATA,
    elevation,
    slope,
    roughness,
    stats: computeStats(elevation, slope, roughness),
  };
}
