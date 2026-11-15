import type { Cell, Grid } from '../routing/types'
import { passabilityIssue } from '../map/cells'
import { fetchJson } from './data'

// Science stops from /content/stops.json (CONTRACT Section 8). Optional
// content may be null while the team prepares it; the UI shows only what is
// actually in the file. Two file shapes are accepted:
//   - current: { "gridSize": { "width", "height" }, "stops": [ ... ] }
//   - older:   a bare array of stops (cells then refer to the fallback grid size)

export interface GridSize {
  width: number
  height: number
}

/** Older photo block (still read for backward compatibility). */
export interface StopPhoto {
  file: string
  sol: number
  camera: string
  imageId: string
  url: string
}

/**
 * Reference field image: a Perseverance image of comparable geology, NOT
 * taken at the stop's map location.
 */
export interface StopReference {
  description: string | null
  whyItMatters: string | null
  sol: number | null
  camera: string | null
  imageId: string | null
  /** false: the ID and its raw-image link do not match yet; neither is shown. */
  imageIdVerified: boolean
  /** NASA Raw Images page of this image. */
  rawUrl: string | null
  /** Scientific source links (http/https only). */
  sources: string[]
  /** Site-relative path, e.g. "content/images/stop1_sol530.jpg"; may not exist yet. */
  image: string | null
  /** Image credit; null = the Mastcam-Z default (see panels/stopCardView.ts). */
  credit: string | null
}

export interface Stop {
  id: string
  name: string
  col: number
  row: number
  /** What is at this map location. Null while pending. */
  atLocation: string | null
  reference: StopReference | null
  // Older fields, kept so older files keep working.
  description: string | null
  whyImportant: string | null
  sourceUrl: string | null
  photo: StopPhoto | null
}

export interface StopsFile {
  stops: Stop[]
  /** Grid the col/row numbers refer to; null for the older bare-array file. */
  gridSize: GridSize | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Only http(s) links are shown, so a malformed value can never become a script URL. */
function optionalUrl(value: unknown): string | null {
  const text = optionalText(value)
  return text && /^https?:\/\//i.test(text) ? text : null
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Image path inside the site's public folder: plain relative segments only
 * (no scheme, no "..", no leading slash), so it can only point at our own files.
 */
export function safeImagePath(value: unknown): string | null {
  const text = optionalText(value)
  if (!text || !/^[\w-]+(\/[\w.-]+)*\.(jpe?g|png|webp)$/i.test(text) || text.includes('..')) return null
  return text
}

function parsePhoto(value: unknown): StopPhoto | null {
  if (!isRecord(value)) return null
  const { file, sol, camera, imageId, url } = value
  if (typeof file !== 'string' || !file.trim()) return null
  if (typeof sol !== 'number' || !Number.isFinite(sol)) return null
  if (typeof camera !== 'string' || typeof imageId !== 'string' || typeof url !== 'string') return null
  return { file: file.trim(), sol, camera, imageId, url }
}

/** Reference block; anything malformed inside becomes null instead of dropping the stop. */
export function parseReference(value: unknown): StopReference | null {
  if (!isRecord(value)) return null
  const sources = Array.isArray(value.sources)
    ? value.sources.map(optionalUrl).filter((u): u is string => u !== null)
    : []
  return {
    description: optionalText(value.description),
    whyItMatters: optionalText(value.whyItMatters),
    sol: optionalNumber(value.sol),
    camera: optionalText(value.camera),
    imageId: optionalText(value.imageId),
    // Missing = verified (older entries); only an explicit false marks it unverified.
    imageIdVerified: value.imageIdVerified !== false,
    rawUrl: optionalUrl(value.rawUrl),
    sources,
    image: safeImagePath(value.image),
    credit: optionalText(value.credit),
  }
}

/** One stops.json entry, or null if a required field (id, name, col, row) is missing or wrong. */
export function parseStop(value: unknown): Stop | null {
  if (!isRecord(value)) return null
  const { id, name, col, row } = value
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return null
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null
  return {
    id,
    name,
    col: col as number,
    row: row as number,
    atLocation: optionalText(value.atLocation),
    reference: parseReference(value.reference),
    description: optionalText(value.description),
    whyImportant: optionalText(value.whyImportant),
    sourceUrl: optionalUrl(value.sourceUrl),
    photo: parsePhoto(value.photo),
  }
}

/** Bad entries are skipped with a warning instead of breaking the app. */
function parseStopList(items: unknown[]): Stop[] {
  const stops: Stop[] = []
  items.forEach((item, k) => {
    const stop = parseStop(item)
    if (stop) stops.push(stop)
    else console.warn(`stops.json: entry ${k} is not a valid stop and was skipped`)
  })
  return stops
}

function parseGridSize(value: unknown): GridSize | null {
  if (!isRecord(value)) return null
  const { width, height } = value
  return Number.isInteger(width) && Number.isInteger(height) && (width as number) > 0 && (height as number) > 0
    ? { width: width as number, height: height as number }
    : null
}

/** Parses either file shape; a missing or broken file gives no stops. */
export function parseStopsFile(data: unknown): StopsFile {
  if (Array.isArray(data)) return { stops: parseStopList(data), gridSize: null }
  if (isRecord(data) && Array.isArray(data.stops)) {
    const gridSize = parseGridSize(data.gridSize)
    if (!gridSize) console.warn('stops.json: "gridSize" is missing or invalid; using the default grid size')
    return { stops: parseStopList(data.stops), gridSize }
  }
  return { stops: [], gridSize: null }
}

/** Stops only (either file shape). */
export function parseStops(data: unknown): Stop[] {
  return parseStopsFile(data).stops
}

/** Never throws: a missing or broken file simply means no stops. */
export async function loadStops(): Promise<StopsFile> {
  return parseStopsFile(await fetchJson('/content/stops.json'))
}

/** A stop without any science content yet (older placeholder entries). */
export function isContentPending(stop: Stop): boolean {
  const hasReference = stop.reference !== null && (stop.reference.description !== null || stop.reference.whyItMatters !== null)
  return !hasReference && stop.atLocation === null && stop.whyImportant === null && stop.sourceUrl === null
}

export function stopCell(stop: Stop): Cell {
  return { col: stop.col, row: stop.row }
}

/**
 * Keeps only stops that sit on a passable cell of this grid. Stop cells were
 * chosen on a grid of size `stopsGrid`; on a grid of another size the same
 * col/row point somewhere else (e.g. bunched in a corner), so all are hidden.
 */
export function placeableStops(stops: Stop[], grid: Grid, maxSlopeDeg: number, stopsGrid: GridSize): Stop[] {
  if (stops.length > 0 && (grid.width !== stopsGrid.width || grid.height !== stopsGrid.height)) {
    console.warn(
      `Science stops hidden: stops.json cells refer to a ${stopsGrid.width}×${stopsGrid.height} grid, ` +
        `this grid is ${grid.width}×${grid.height}`,
    )
    return []
  }
  return stops.filter((stop) => {
    const outside = stop.col < 0 || stop.col >= grid.width || stop.row < 0 || stop.row >= grid.height
    const issue = outside ? 'outside the grid' : passabilityIssue(stopCell(stop), grid, maxSlopeDeg)
    if (issue) console.warn(`Science stop "${stop.id}" at (${stop.col}, ${stop.row}) is hidden: ${issue}`)
    return issue === null
  })
}
