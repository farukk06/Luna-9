import type { Cell, EvaCheck, Grid, RouteResult } from '../routing/types'
import type { Stop } from '../services/stops'
import { cellToMap, type MapPoint } from '../map/coords'
import { displayedTotalMin } from './routeAssessment'

// Pure logic behind the "Mission summary" card: EVA margin, science stops
// near the route and briefing warnings. No React here, so it is easy to test.

/** Science stops closer than this to the route are listed in the briefing. */
export const NEAR_ROUTE_M = 50
/** Warn when the route's max slope comes this close to the slope limit. */
export const SLOPE_WARNING_MARGIN_DEG = 3

export interface EvaMargin {
  /** Limit minus total; negative when the plan exceeds the limit. */
  remainingMin: number
  /** remainingMin as a percentage of the limit. */
  remainingPct: number
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Time left before the EVA limit. Uses the same one-decimal values as the
 * card ("a + b + c = total"), so "limit − total = remaining" adds up on screen.
 * Null when the check has no usable limit (checkEva failed closed).
 */
export function evaMargin(eva: EvaCheck): EvaMargin | null {
  const limit = round1(eva.limitMin)
  if (!(limit > 0)) return null
  const remainingMin = round1(limit - displayedTotalMin(eva))
  return { remainingMin, remainingPct: (remainingMin / limit) * 100 }
}

function distanceToSegment(p: MapPoint, a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export interface NearbyStop {
  stop: Stop
  /** Shortest distance from the stop's cell centre to the route line, metres. */
  distanceM: number
  /** Index of the path segment closest to the stop, for ordering along the route. */
  pathIndex: number
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row
}

/**
 * Stops within maxDistanceM of the route line, in the order they are passed
 * on the way out. The stop at the target cell is left out: it is the
 * destination itself, not a stop on the way.
 */
export function stopsNearRoute(stops: Stop[], path: Cell[], grid: Grid, maxDistanceM = NEAR_ROUTE_M): NearbyStop[] {
  if (path.length === 0) return []
  const target = path[path.length - 1]
  const points = path.map((c) => cellToMap(c, grid))
  const nearby: NearbyStop[] = []
  for (const stop of stops) {
    const cell = { col: stop.col, row: stop.row }
    if (sameCell(cell, target)) continue
    const p = cellToMap(cell, grid)
    let best = Infinity
    let bestIndex = 0
    for (let i = 0; i < points.length; i++) {
      const d = distanceToSegment(p, points[i], points[Math.min(i + 1, points.length - 1)])
      if (d < best) {
        best = d
        bestIndex = i
      }
    }
    if (best <= maxDistanceM) nearby.push({ stop, distanceM: best, pathIndex: bestIndex })
  }
  return nearby.sort((x, y) => x.pathIndex - y.pathIndex)
}

export type WarningLevel = 'danger' | 'caution' | 'info'

export interface MissionWarning {
  id: 'point-of-no-return' | 'eva-limit' | 'slope-near-limit' | 'mock-data'
  level: WarningLevel
  text: string
}

export interface WarningInput {
  route: RouteResult
  eva: EvaCheck | null
  maxSlopeLimitDeg: number
  mockData: boolean
}

function evaWarning(eva: EvaCheck | null): MissionWarning | null {
  if (!eva || eva.withinLimit) return null
  if (eva.pointOfNoReturnIndex !== undefined) {
    return {
      id: 'point-of-no-return',
      level: 'danger',
      text: 'EVA limit exceeded: turn back at the Point of no return marked on the map.',
    }
  }
  return { id: 'eva-limit', level: 'danger', text: 'EVA limit exceeded for this route.' }
}

function slopeWarning(route: RouteResult, limit: number): MissionWarning | null {
  if (route.maxSlopeDeg < limit - SLOPE_WARNING_MARGIN_DEG) return null
  return {
    id: 'slope-near-limit',
    level: 'caution',
    text: `Max slope ${route.maxSlopeDeg.toFixed(1)}° is within ${SLOPE_WARNING_MARGIN_DEG}° of the ${limit}° limit.`,
  }
}

/** Briefing warnings for the recommended route, most serious first. */
export function missionWarnings(input: WarningInput): MissionWarning[] {
  const warnings: (MissionWarning | null)[] = [
    evaWarning(input.eva),
    slopeWarning(input.route, input.maxSlopeLimitDeg),
    input.mockData
      ? { id: 'mock-data', level: 'caution', text: 'MOCK DATA: synthetic terrain, not real Mars measurements.' }
      : null,
  ]
  return warnings.filter((w): w is MissionWarning => w !== null)
}
