import type { Grid } from '../routing/types';

// Synthetic terrain for development only. Not real Mars data.
// Shape is chosen so that routes must differ: a steep central hill (> 25°),
// a gentle ramp in the south, a rough "boulder field" west of the hill
// and a small NoData patch in the north-east corner.

const WIDTH = 100;
const HEIGHT = 100;
const CELL_SIZE = 10; // metre -> 1 × 1 km
const NODATA = -9999;
const BASE_ELEVATION = -2550; // metre, arbitrary mock value

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

function isNodataCell(col: number, row: number): boolean {
  return col >= 92 && row <= 7;
}

/** Elevation at a cell-centre in map metres (x east, y north; CONTRACT Section 1). */
function terrainElevation(x: number, y: number, noise: number): number {
  const tilt = 0.02 * x; // ~1° rise to the east
  const ramp = y < 300 ? -0.08 * (300 - y) : 0; // ~4.6° ramp descending south
  const dx = x - 500;
  const dy = y - 500;
  const sigma = 100;
  const hill = 120 * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)); // max slope ~36°
  const inBoulderField = x >= 150 && x <= 350 && y >= 400 && y <= 650;
  const roughnessAmp = inBoulderField ? 0.8 : 0.15;
  return BASE_ELEVATION + tilt + ramp + hill + noise * roughnessAmp;
}

function generateElevation(): number[] {
  const random = createRandom(9);
  const totalH = HEIGHT * CELL_SIZE;
  const elevation = new Array<number>(WIDTH * HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const noise = random() * 2 - 1; // always consume, keeps the sequence stable
      const i = row * WIDTH + col;
      if (isNodataCell(col, row)) {
        elevation[i] = NODATA;
        continue;
      }
      const x = (col + 0.5) * CELL_SIZE;
      const y = totalH - (row + 0.5) * CELL_SIZE;
      elevation[i] = round(terrainElevation(x, y, noise), 2);
    }
  }
  return elevation;
}

/** Returns the elevation or null if the cell is outside the grid or NoData. */
function valueAt(elevation: number[], col: number, row: number): number | null {
  if (col < 0 || col >= WIDTH || row < 0 || row >= HEIGHT) return null;
  const z = elevation[row * WIDTH + col];
  return z === NODATA ? null : z;
}

/**
 * Gradient along one axis. Uses the central difference when both neighbours
 * are valid, otherwise a one-sided difference, so NoData never enters the math
 * (CONTRACT 3b). Returns null when neither neighbour is valid.
 */
function axisGradient(center: number, before: number | null, after: number | null): number | null {
  if (before !== null && after !== null) return (after - before) / (2 * CELL_SIZE);
  if (after !== null) return (after - center) / CELL_SIZE;
  if (before !== null) return (center - before) / CELL_SIZE;
  return null;
}

function computeSlope(elevation: number[], col: number, row: number): number {
  const z = valueAt(elevation, col, row);
  if (z === null) return NODATA;
  const gx = axisGradient(z, valueAt(elevation, col - 1, row), valueAt(elevation, col + 1, row));
  const gy = axisGradient(z, valueAt(elevation, col, row - 1), valueAt(elevation, col, row + 1));
  if (gx === null || gy === null) return NODATA; // safe side: impassable
  const deg = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
  return round(deg, 1);
}

/** Population standard deviation of valid elevations in the 3×3 window. */
function computeRoughness(elevation: number[], col: number, row: number): number {
  if (valueAt(elevation, col, row) === null) return NODATA;
  const values: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const v = valueAt(elevation, col + dc, row + dr);
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

function computeStats(elevation: number[], slope: number[], roughness: number[]): Grid['stats'] {
  const elev = validValues(elevation);
  const slp = validValues(slope);
  const rough = validValues(roughness).sort((a, b) => a - b);
  return {
    elevationMin: Math.min(...elev),
    elevationMax: Math.max(...elev),
    slopeMax: Math.max(...slp),
    roughnessP95: percentile(rough, 0.95),
  };
}

export function createMockGrid(): Grid {
  const elevation = generateElevation();
  const slope = new Array<number>(WIDTH * HEIGHT);
  const roughness = new Array<number>(WIDTH * HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const i = row * WIDTH + col;
      slope[i] = computeSlope(elevation, col, row);
      roughness[i] = computeRoughness(elevation, col, row);
    }
  }
  return {
    version: 1,
    width: WIDTH,
    height: HEIGHT,
    cellSize: CELL_SIZE,
    nodata: NODATA,
    elevation,
    slope,
    roughness,
    stats: computeStats(elevation, slope, roughness),
  };
}
