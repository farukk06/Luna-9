import type { Grid } from '../routing/types';

// Temporary map images generated from a grid, used until Person 2's real
// ortho.png / slope.png exist. Pixel (x, y) = cell (col, row), so the top
// image row is grid row 0 (north up, CONTRACT Sections 1 and 4).

export interface ColorStop {
  value: number;
  color: string; // "#rrggbb"
}

/** Slope legend colours from the CONTRACT Section 5 example. */
export const SLOPE_COLOR_STOPS: ColorStop[] = [
  { value: 0, color: '#2b83ba' },
  { value: 10, color: '#abdda4' },
  { value: 20, color: '#fdae61' },
  { value: 30, color: '#d7191c' },
];

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear interpolation between legend stops; values beyond the ends are clamped. */
export function colorForValue(value: number, stops: ColorStop[]): Rgb {
  if (value <= stops[0].value) return hexToRgb(stops[0].color);
  for (let k = 1; k < stops.length; k++) {
    if (value <= stops[k].value) {
      const t = (value - stops[k - 1].value) / (stops[k].value - stops[k - 1].value);
      const a = hexToRgb(stops[k - 1].color);
      const b = hexToRgb(stops[k].color);
      return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)) as Rgb;
    }
  }
  return hexToRgb(stops[stops.length - 1].color);
}

function elevationAt(grid: Grid, col: number, row: number): number | null {
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;
  const z = grid.elevation[row * grid.width + col];
  return z === grid.nodata ? null : z;
}

/** dz per metre along one axis; NoData/edge neighbours are skipped, none valid → flat. */
function axisGradient(grid: Grid, center: number, before: number | null, after: number | null): number {
  const c = grid.cellSize;
  if (before !== null && after !== null) return (after - before) / (2 * c);
  if (after !== null) return (after - center) / c;
  if (before !== null) return (center - before) / c;
  return 0;
}

// Light from the north-west, 45° above the horizon: the usual cartographic
// convention, so hills read as raised rather than as pits.
const LIGHT_AZIMUTH = (315 * Math.PI) / 180;
const LIGHT_ALTITUDE = (45 * Math.PI) / 180;
const LIGHT: Rgb = [
  Math.sin(LIGHT_AZIMUTH) * Math.cos(LIGHT_ALTITUDE), // east
  Math.cos(LIGHT_AZIMUTH) * Math.cos(LIGHT_ALTITUDE), // north
  Math.sin(LIGHT_ALTITUDE), // up
];

/** Lambert shading 0–1 of the surface at a valid cell. */
function shadeAt(grid: Grid, col: number, row: number, z: number): number {
  const dzEast = axisGradient(grid, z, elevationAt(grid, col - 1, row), elevationAt(grid, col + 1, row));
  // Rows grow southwards, so "after" in the north direction is row − 1.
  const dzNorth = axisGradient(grid, z, elevationAt(grid, col, row + 1), elevationAt(grid, col, row - 1));
  const len = Math.hypot(dzEast, dzNorth, 1);
  const dot = (-dzEast * LIGHT[0] - dzNorth * LIGHT[1] + LIGHT[2]) / len;
  return Math.max(0, dot);
}

/** RGBA pixels of a grey hillshade, slightly brighter at higher elevation. */
export function hillshadePixels(grid: Grid): Uint8ClampedArray {
  const px = new Uint8ClampedArray(grid.width * grid.height * 4);
  const { elevationMin, elevationMax } = grid.stats;
  const range = elevationMax - elevationMin || 1;
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const z = elevationAt(grid, col, row);
      if (z === null) continue; // stays transparent (alpha 0)
      const tone = 0.75 * shadeAt(grid, col, row, z) + 0.25 * ((z - elevationMin) / range);
      const p = (row * grid.width + col) * 4;
      px[p] = px[p + 1] = px[p + 2] = Math.round(255 * tone);
      px[p + 3] = 255;
    }
  }
  return px;
}

/** RGBA pixels of the slope layer coloured with the given legend stops. */
export function slopePixels(grid: Grid, stops: ColorStop[] = SLOPE_COLOR_STOPS): Uint8ClampedArray {
  const px = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let i = 0; i < grid.width * grid.height; i++) {
    const s = grid.slope[i];
    if (s === grid.nodata) continue;
    const [r, g, b] = colorForValue(s, stops);
    px.set([r, g, b, 255], i * 4);
  }
  return px;
}

/** Draws RGBA pixels on a canvas and returns a PNG data URL (browser only). */
function pixelsToDataUrl(px: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  const image = ctx.createImageData(width, height);
  image.data.set(px);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function renderHillshade(grid: Grid): string {
  return pixelsToDataUrl(hillshadePixels(grid), grid.width, grid.height);
}

export function renderSlope(grid: Grid): string {
  return pixelsToDataUrl(slopePixels(grid), grid.width, grid.height);
}
