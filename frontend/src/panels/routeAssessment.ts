import type { Alternatives, Cell, EvaCheck, Grid, RouteResult } from '../routing/types'
import { cellIndex } from '../map/coords'
import { ROUTE_KINDS, ROUTE_LABELS, type RouteKind } from '../config/routes'

// Turns the engine's alternatives into user-facing text. The engine's own
// `reason` string is a technical note, so the UI builds its own sentence.

type FailureReason = NonNullable<RouteResult['reason']>

/** UI messages from the CONTRACT Section 9 reason table. */
export const ROUTE_FAILURE_MESSAGES: Record<FailureReason, string> = {
  'invalid-input': 'Route could not be computed (invalid input)',
  'out-of-bounds': 'Point is outside the study area',
  'start-blocked': 'Habitat cell is not passable',
  'goal-blocked': 'Target cell is not passable',
  unreachable: 'No safe route within the slope limit',
}

export function failureMessage(route: RouteResult): string {
  return ROUTE_FAILURE_MESSAGES[route.reason ?? 'invalid-input']
}

/** Reason of the first failed route (same order as firstFailureMessage), or null if none failed. */
export function firstFailureReason(alt: Alternatives): FailureReason | null {
  const failed = ROUTE_KINDS.find((kind) => !alt[kind].ok)
  return failed ? (alt[failed].reason ?? 'invalid-input') : null
}

/** What the routes were computed for, needed to explain a blocked habitat/target cell. */
export interface BlockedContext {
  grid: Grid
  habitat: Cell | null
  target: Cell | null
  maxSlopeDeg: number
}

/**
 * Second line under the CONTRACT message for start-blocked / goal-blocked:
 * why the cell is not passable (NoData or slope above the scenario limit).
 * Null for other reasons, or when the cell does not explain it.
 */
export function blockedCellDetail(reason: FailureReason | null, ctx: BlockedContext): string | null {
  if (reason !== 'start-blocked' && reason !== 'goal-blocked') return null
  const cell = reason === 'start-blocked' ? ctx.habitat : ctx.target
  const { grid } = ctx
  if (!cell || cell.col < 0 || cell.row < 0 || cell.col >= grid.width || cell.row >= grid.height) return null
  const i = cellIndex(cell, grid)
  const slope = grid.slope[i]
  if (grid.elevation[i] === grid.nodata || slope === grid.nodata) return 'No terrain data at this point.'
  if (slope > ctx.maxSlopeDeg) {
    const who = reason === 'start-blocked' ? 'Habitat' : 'Target'
    return `${who} slope ${slope.toFixed(1)}° exceeds the ${ctx.maxSlopeDeg}° scenario limit.`
  }
  return null
}

/** Message for the first failed route (in shortest → safest → balanced order), or null if none failed. */
export function firstFailureMessage(alt: Alternatives): string | null {
  const failed = ROUTE_KINDS.find((kind) => !alt[kind].ok)
  return failed ? failureMessage(alt[failed]) : null
}

/** Route kinds with the recommended one first; the rest keep their fixed order. */
export function orderedRouteKinds(alt: Alternatives): RouteKind[] {
  const rec = alt.recommended
  if (!rec) return [...ROUTE_KINDS]
  return [rec, ...ROUTE_KINDS.filter((kind) => kind !== rec)]
}

const deg = (v: number) => `${v.toFixed(1)}°`
const metres = (v: number) => `${v.toFixed(0)} m`

// Differences smaller than this are display noise, not a real trade-off.
const SAME_DISTANCE_M = 0.5
const SAME_SLOPE_DEG = 0.05

/**
 * One plain-language sentence explaining the recommendation, e.g.
 * "Balanced route recommended: 128 m longer than the shortest route, but keeps
 * max slope at 5.5° instead of 24.6°." Returns null when nothing is recommended.
 */
export function recommendationSentence(alt: Alternatives): string | null {
  const kind = alt.recommended
  if (!kind) return null
  const rec = alt[kind]
  const head = `${ROUTE_LABELS[kind]} route recommended`

  if (kind === 'shortest') {
    return `${head}: the alternatives do not lower the slope (max ${deg(rec.maxSlopeDeg)}), so the most direct path is preferred.`
  }

  const shortest = alt.shortest
  if (!shortest.ok) {
    return `${head}: ${metres(rec.distanceM)} with a max slope of ${deg(rec.maxSlopeDeg)}.`
  }

  const extra = rec.distanceM - shortest.distanceM
  if (extra < SAME_DISTANCE_M) {
    return `${head}: as short as the shortest route, with a max slope of ${deg(rec.maxSlopeDeg)}.`
  }
  const longer = `${metres(extra)} longer than the shortest route`
  if (rec.maxSlopeDeg < shortest.maxSlopeDeg - SAME_SLOPE_DEG) {
    return `${head}: ${longer}, but keeps max slope at ${deg(rec.maxSlopeDeg)} instead of ${deg(shortest.maxSlopeDeg)}.`
  }
  if (rec.meanSlopeDeg < shortest.meanSlopeDeg - SAME_SLOPE_DEG) {
    return `${head}: ${longer}, but lowers mean slope to ${deg(rec.meanSlopeDeg)} instead of ${deg(shortest.meanSlopeDeg)}.`
  }
  return `${head}: ${longer}, with a similar slope profile (max ${deg(rec.maxSlopeDeg)}).`
}

export interface EvaDisplay {
  outbound: string
  research: string
  return: string
  total: string
  limit: string
}

const round1 = (v: number) => Math.round(v * 10) / 10

function evaParts(eva: EvaCheck): number[] {
  return [eva.outboundMin, eva.researchMin, eva.returnMin].map(round1)
}

/** Sum of the one-decimal parts shown on screen (rounded again to drop float noise). */
export function displayedTotalMin(eva: EvaCheck): number {
  return round1(evaParts(eva).reduce((s, v) => s + v, 0))
}

/**
 * EVA minutes with one decimal, like the route cards. The shown total is the
 * sum of the shown parts, so "a + b + c = total" always adds up on screen
 * (it can differ from the exact total by at most 0.15 min).
 */
export function evaDisplay(eva: EvaCheck): EvaDisplay {
  const parts = evaParts(eva)
  const total = displayedTotalMin(eva)
  return {
    outbound: parts[0].toFixed(1),
    research: parts[1].toFixed(1),
    return: parts[2].toFixed(1),
    total: total.toFixed(1),
    limit: eva.limitMin.toFixed(1),
  }
}
