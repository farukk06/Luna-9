import type { Grid } from '../routing/types';
import { createMockGrid } from '../mocks/mockGrid';
import { SLOPE_COLOR_STOPS, renderHillshade, renderSlope } from '../mocks/mockImages';

// Data source layer: uses Person 2's files in /public/data when they exist and
// are valid, otherwise falls back to mock data. Switching to real data needs
// no code change: the files simply appear.

export type DataSource = 'real' | 'mock';

/** One entry of layers.json (CONTRACT Section 5). */
export interface LegendEntry {
  value: number;
  color: string;
  label: string;
}

export interface LayerInfo {
  id: string;
  title: string;
  file: string;
  source: string;
  unit?: string; // optional: an orthophoto has no unit or legend
  legend?: LegendEntry[];
}

export interface LayerImageUrls {
  ortho: string;
  slope: string;
}

const MOCK_SOURCE_TEXT = 'Mock data – real data pending';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function isNumberArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function isValidStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['elevationMin', 'elevationMax', 'slopeMax', 'roughnessP95'].every((k) => isFiniteNumber(value[k]));
}

/** True when the value has the CONTRACT Section 3 Grid shape and consistent array lengths. */
export function isValidGrid(value: unknown): value is Grid {
  if (!isRecord(value)) return false;
  const { version, width, height, cellSize, nodata, stats } = value;
  if (!isFiniteNumber(version) || !isPositiveInteger(width) || !isPositiveInteger(height)) return false;
  if (!isFiniteNumber(cellSize) || cellSize <= 0 || !isFiniteNumber(nodata)) return false;
  if (!isValidStats(stats)) return false;
  const n = width * height;
  return isNumberArray(value.elevation, n) && isNumberArray(value.slope, n) && isNumberArray(value.roughness, n);
}

/**
 * Fetches a JSON file and returns its parsed content, or null on any failure.
 * The content-type check matters: Vite's dev server answers a missing file
 * with index.html (status 200), which must not be treated as data.
 */
async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    return (await response.json()) as unknown;
  } catch {
    return null; // network error or broken JSON
  }
}

export async function loadGrid(): Promise<{ grid: Grid; source: DataSource }> {
  const data = await fetchJson('/data/grid.json');
  if (isValidGrid(data)) return { grid: data, source: 'real' };
  return { grid: createMockGrid(), source: 'mock' };
}

function isValidLegendEntry(value: unknown): value is LegendEntry {
  return (
    isRecord(value) &&
    isFiniteNumber(value.value) &&
    typeof value.color === 'string' &&
    typeof value.label === 'string'
  );
}

function isValidLayer(value: unknown): value is LayerInfo {
  if (!isRecord(value)) return false;
  const textOk = ['id', 'title', 'file', 'source'].every((k) => typeof value[k] === 'string');
  const unitOk = value.unit === undefined || typeof value.unit === 'string';
  const legendOk =
    value.legend === undefined || (Array.isArray(value.legend) && value.legend.every(isValidLegendEntry));
  return textOk && unitOk && legendOk;
}

function mockLayers(): LayerInfo[] {
  const labels = ['0°', '10°', '20°', '30°+'];
  return [
    { id: 'ortho', title: 'Hillshade (mock orthophoto)', file: 'ortho.png', source: MOCK_SOURCE_TEXT },
    {
      id: 'slope',
      title: 'Slope',
      file: 'slope.png',
      source: MOCK_SOURCE_TEXT,
      unit: '°',
      legend: SLOPE_COLOR_STOPS.map((s, k) => ({ value: s.value, color: s.color, label: labels[k] })),
    },
  ];
}

export async function loadLayers(): Promise<{ layers: LayerInfo[]; source: DataSource }> {
  const data = await fetchJson('/data/layers.json');
  if (Array.isArray(data) && data.length > 0 && data.every(isValidLayer)) {
    return { layers: data, source: 'real' };
  }
  return { layers: mockLayers(), source: 'mock' };
}

/** Real data uses Person 2's PNGs; mock data renders images from the grid (browser only). */
export function getLayerImageUrls(grid: Grid, source: DataSource): LayerImageUrls {
  if (source === 'real') return { ortho: '/data/ortho.png', slope: '/data/slope.png' };
  return { ortho: renderHillshade(grid), slope: renderSlope(grid) };
}
