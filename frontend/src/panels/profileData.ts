import type { Cell, RouteResult } from '../routing/types'

// Merges the recommended and comparison route profiles into one row list for
// Recharts. The two routes have different distance samples, so each row holds
// whichever series has a point at that distance; lines bridge the gaps.

export interface ProfileRow {
  distanceM: number
  recElevation?: number
  recSlope?: number
  /** Index into the recommended route's path, for the map hover marker. */
  recIndex?: number
  cmpElevation?: number
  cmpSlope?: number
  cmpIndex?: number
}

// Distances closer than this are treated as the same sample.
const SAME_DISTANCE_M = 1e-6

export function buildProfileRows(rec: RouteResult, cmp: RouteResult | null): ProfileRow[] {
  const rows: ProfileRow[] = []
  rec.profile.forEach((p, k) => {
    rows.push({ distanceM: p.distanceM, recElevation: p.elevationM, recSlope: p.slopeDeg, recIndex: k })
  })
  cmp?.profile.forEach((p, k) => {
    rows.push({ distanceM: p.distanceM, cmpElevation: p.elevationM, cmpSlope: p.slopeDeg, cmpIndex: k })
  })
  rows.sort((a, b) => a.distanceM - b.distanceM)

  const merged: ProfileRow[] = []
  for (const row of rows) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(last.distanceM - row.distanceM) < SAME_DISTANCE_M) Object.assign(last, row, { distanceM: last.distanceM })
    else merged.push({ ...row })
  }
  return merged
}

/** Path cell to mark on the map for a hovered row (recommended route first). */
export function hoverCellForRow(row: ProfileRow, rec: RouteResult, cmp: RouteResult | null): Cell | null {
  if (row.recIndex !== undefined) return rec.path[row.recIndex] ?? null
  if (cmp && row.cmpIndex !== undefined) return cmp.path[row.cmpIndex] ?? null
  return null
}

export interface NiceScale {
  domain: [number, number]
  ticks: number[]
}

// Allowed step shapes per power of ten: 1, 2, 2.5, 5 (× 10^n).
const NICE_STEP_FACTORS = [1, 2, 2.5, 5, 10]

/** Smallest "round" step ≥ span / targetTicks, and never below minStep. */
export function niceStep(span: number, targetTicks: number, minStep: number): number {
  const raw = Math.max(span / Math.max(targetTicks, 1), minStep, Number.EPSILON)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const factor = NICE_STEP_FACTORS.find((f) => f * magnitude >= raw - 1e-9) ?? 10
  return factor * magnitude
}

/**
 * Axis domain snapped outward to whole steps, with evenly spaced ticks,
 * e.g. distances 0–1096 m → 0, 250, … 1250; elevations −2547…−2512 → −2550 … −2510.
 */
export function niceScale(min: number, max: number, targetTicks: number, minStep: number): NiceScale {
  const step = niceStep(max - min, targetTicks, minStep)
  const lo = Math.floor(min / step) * step
  let hi = Math.ceil(max / step) * step
  if (hi <= lo) hi = lo + step // flat data still gets a visible range
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { domain: [lo, hi], ticks }
}

/** Elevation extent over both series (undefined when the rows hold no elevations). */
export function elevationExtent(rows: ProfileRow[]): [number, number] | undefined {
  const values = rows.flatMap((r) => [r.recElevation, r.cmpElevation]).filter((v): v is number => v !== undefined)
  return values.length ? [Math.min(...values), Math.max(...values)] : undefined
}
