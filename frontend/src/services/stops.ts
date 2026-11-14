import type { Cell, Grid } from '../routing/types'
import { passabilityIssue } from '../map/cells'
import { fetchJson } from './data'

// Science stops from /content/stops.json (CONTRACT Section 8). Optional
// content (why it matters, source link, photo) may be null while the team
// prepares it; the UI shows only what is actually in the file.

export interface StopPhoto {
  file: string
  sol: number
  camera: string
  imageId: string
  url: string
}

export interface Stop {
  id: string
  name: string
  col: number
  row: number
  description: string
  whyImportant: string | null
  sourceUrl: string | null
  photo: StopPhoto | null
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

function parsePhoto(value: unknown): StopPhoto | null {
  if (!isRecord(value)) return null
  const { file, sol, camera, imageId, url } = value
  if (typeof file !== 'string' || !file.trim()) return null
  if (typeof sol !== 'number' || !Number.isFinite(sol)) return null
  if (typeof camera !== 'string' || typeof imageId !== 'string' || typeof url !== 'string') return null
  return { file: file.trim(), sol, camera, imageId, url }
}

/** One stops.json entry, or null if a required field is missing or wrong. */
export function parseStop(value: unknown): Stop | null {
  if (!isRecord(value)) return null
  const { id, name, col, row, description } = value
  if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) return null
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null
  if (typeof description !== 'string') return null
  return {
    id,
    name,
    col: col as number,
    row: row as number,
    description,
    whyImportant: optionalText(value.whyImportant),
    sourceUrl: optionalUrl(value.sourceUrl),
    photo: parsePhoto(value.photo),
  }
}

/** Parses the whole file; bad entries are skipped with a warning instead of breaking the app. */
export function parseStops(data: unknown): Stop[] {
  if (!Array.isArray(data)) return []
  const stops: Stop[] = []
  data.forEach((item, k) => {
    const stop = parseStop(item)
    if (stop) stops.push(stop)
    else console.warn(`stops.json: entry ${k} is not a valid stop and was skipped`)
  })
  return stops
}

/** Never throws: a missing or broken file simply means no stops. */
export async function loadStops(): Promise<Stop[]> {
  return parseStops(await fetchJson('/content/stops.json'))
}

/** A stop without its science content yet (no "why it matters" and no source). */
export function isContentPending(stop: Stop): boolean {
  return stop.whyImportant === null && stop.sourceUrl === null
}

export function stopCell(stop: Stop): Cell {
  return { col: stop.col, row: stop.row }
}

export interface GridSize {
  width: number
  height: number
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
