import type { Grid } from '../routing/types';
import { LARGE_MOCK_SPEC, type MockGridSpec, createMockGrid } from '../mocks/mockGrid';
import { renderHillshade } from '../mocks/mockImages';
import { slopeColorStops } from '../map/colorScale';
import { renderRoughness } from '../map/rasterImages';
import { DEFAULT_OPTIONS } from './routing';

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

/** The slope image is not here: it depends on the scenario slope limit, so App renders it (map/rasterImages). */
export interface LayerImageUrls {
  ortho: string;
  roughness: string;
}

/** Text fields of grid.json "source" (CONTRACT Section 3); only what the file actually contains. */
export interface GridSourceInfo {
  dem?: string;
  ortho?: string;
  /** Approximate [west, south, east, north] in degrees; only for context maps. */
  boundsLonLat?: LonLatBounds;
}

/** [west, south, east, north] in degrees (CONTRACT Section 3, source.boundsLonLat). */
export type LonLatBounds = [number, number, number, number];

/** Four finite numbers with west < east and south < north, inside lon/lat ranges; otherwise undefined. */
export function parseLonLatBounds(value: unknown): LonLatBounds | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (!value.every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  const [west, south, east, north] = value as LonLatBounds;
  if (west >= east || south >= north || south < -90 || north > 90 || west < -180 || east > 360) return undefined;
  return [west, south, east, north];
}

export type LayerId = 'ortho' | 'slope' | 'roughness';

export const MOCK_SOURCE_TEXT = 'Mock data – real data pending';

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
export async function fetchJson(url: string): Promise<unknown> {
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

/** Reads the optional "source" object of grid.json; non-string or empty fields are ignored. */
export function parseGridSource(raw: unknown): GridSourceInfo {
  if (!isRecord(raw) || !isRecord(raw.source)) return {};
  const info: GridSourceInfo = {};
  const { dem, ortho, boundsLonLat } = raw.source;
  if (typeof dem === 'string' && dem.trim()) info.dem = dem.trim();
  if (typeof ortho === 'string' && ortho.trim()) info.ortho = ortho.trim();
  const bounds = parseLonLatBounds(boundsLonLat);
  if (bounds) info.boundsLonLat = bounds;
  return info;
}

/**
 * Development switch: "?mock=400" in the page URL forces a 400×400, 5 m mock
 * grid (the real grid's size) for performance tests. Any other value, or no
 * parameter, keeps the normal behaviour.
 */
export function mockSpecFromSearch(search: string): MockGridSpec | null {
  return new URLSearchParams(search).get('mock') === String(LARGE_MOCK_SPEC.cells) ? LARGE_MOCK_SPEC : null;
}

export async function loadGrid(
  forcedMock: MockGridSpec | null = null,
): Promise<{ grid: Grid; source: DataSource; sourceInfo: GridSourceInfo }> {
  if (forcedMock) {
    console.info(`Using a ${forcedMock.cells}×${forcedMock.cells} mock grid (${forcedMock.cellSize} m cells) from the URL.`);
    return { grid: createMockGrid(forcedMock), source: 'mock', sourceInfo: {} };
  }
  const data = await fetchJson('/data/grid.json');
  if (isValidGrid(data)) return { grid: data, source: 'real', sourceInfo: parseGridSource(data) };
  return { grid: createMockGrid(), source: 'mock', sourceInfo: {} };
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
  const stops = slopeColorStops(DEFAULT_OPTIONS.maxSlopeDeg);
  return [
    { id: 'ortho', title: 'Hillshade (mock orthophoto)', file: 'ortho.png', source: MOCK_SOURCE_TEXT },
    {
      id: 'slope',
      title: 'Slope',
      file: 'slope.png',
      source: MOCK_SOURCE_TEXT,
      unit: '°',
      legend: stops.map((s) => ({ value: s.value, color: s.color, label: `${s.value}°` })),
    },
    { id: 'roughness', title: 'Roughness', file: 'roughness.png', source: MOCK_SOURCE_TEXT },
  ];
}

export async function loadLayers(): Promise<{ layers: LayerInfo[]; source: DataSource }> {
  const data = await fetchJson('/data/layers.json');
  if (Array.isArray(data) && data.length > 0 && data.every(isValidLayer)) {
    return { layers: data, source: 'real' };
  }
  return { layers: mockLayers(), source: 'mock' };
}

export const REAL_ORTHO_URL = '/data/ortho.png';

/**
 * Slope and roughness are always drawn in the browser from grid.json, with the
 * same colour scales as the legends (slope.png / roughness.png are not used,
 * so they may be missing). Only the base image comes from a file: Person 2's
 * ortho.png with real data, a hillshade of the grid with mock data.
 */
export function getLayerImageUrls(grid: Grid, source: DataSource): LayerImageUrls {
  return {
    ortho: source === 'real' ? REAL_ORTHO_URL : renderHillshade(grid),
    roughness: renderRoughness(grid),
  };
}

export interface SourceContext {
  gridSource: DataSource;
  gridSourceInfo: GridSourceInfo;
  layersSource: DataSource;
  layers: LayerInfo[];
}

/**
 * Source label for a layer, taken only from the data files, never invented.
 * Order: layers.json entry → grid.json "source" (slope and roughness are
 * derived from the DEM) → "not specified". With a mock grid every image on the
 * map is mock, so the mock text is shown regardless of layers.json.
 */
export function layerSourceLabel(id: LayerId, ctx: SourceContext): string {
  if (ctx.gridSource === 'mock') return MOCK_SOURCE_TEXT;
  const fromLayers = ctx.layersSource === 'real' ? ctx.layers.find((l) => l.id === id)?.source.trim() : undefined;
  if (fromLayers) return fromLayers;
  if (id === 'ortho' && ctx.gridSourceInfo.ortho) return ctx.gridSourceInfo.ortho;
  if (id !== 'ortho' && ctx.gridSourceInfo.dem) return `${ctx.gridSourceInfo.dem} (derived)`;
  return 'not specified';
}
