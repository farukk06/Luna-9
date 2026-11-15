import type { Alternatives, EvaCheck } from '../routing/types'
import type { RouteKind } from '../config/routes'
import { evaDisplay, firstFailureMessage } from './routeAssessment'
import { evaMargin } from './missionBriefing'

// Pure logic behind "Where can we go?": per-stop status, EVA margin and the
// safety ranking. This is an accessibility/safety ranking only; it never
// weighs scientific value, and it never uses MEDA weather data.

export type ReachStatus = 'within' | 'over' | 'no-route'

export const REACH_STATUS_LABELS: Record<ReachStatus, string> = {
  within: 'Within EVA limit',
  over: 'Over EVA limit',
  'no-route': 'No safe route',
}

export const RANKING_RULE =
  'Ranked by safety: lowest max slope among stops within the EVA limit, then largest time margin.'

/** Engine output for one stop: findAlternatives + checkEva of the recommended route. */
export interface StopReachInput {
  stopId: string
  name: string
  alternatives: Alternatives
  eva: EvaCheck | null
  /** Why the habitat/stop cell is blocked (slope or NoData), when that is the failure. */
  blockedDetail?: string | null
}

export interface StopReach {
  stopId: string
  name: string
  status: ReachStatus
  /** Why: failure message for no-route, the time overrun for over; null when within. */
  reason: string | null
  routeKind: RouteKind | null
  distanceM: number | null
  maxSlopeDeg: number | null
  /** Shown parts, one decimal like the route cards; their sum is totalMin. */
  outboundMin: number | null
  researchMin: number | null
  returnMin: number | null
  /** Shown total (outbound + research + return). */
  totalMin: number | null
  limitMin: number | null
  /** Limit minus total; negative when over the limit. */
  marginMin: number | null
  marginPct: number | null
  /** First stop of the ranking that is within the limit. */
  best: boolean
}

function noRoute(input: StopReachInput, reason: string): StopReach {
  return {
    stopId: input.stopId,
    name: input.name,
    status: 'no-route',
    reason,
    routeKind: null,
    distanceM: null,
    maxSlopeDeg: null,
    outboundMin: null,
    researchMin: null,
    returnMin: null,
    totalMin: null,
    limitMin: null,
    marginMin: null,
    marginPct: null,
    best: false,
  }
}

/** Status and numbers for one stop, from the recommended route and its EVA check. */
export function summarizeStop(input: StopReachInput): StopReach {
  const kind = input.alternatives.recommended
  if (!kind) {
    const message = firstFailureMessage(input.alternatives) ?? 'No safe route within the slope limit'
    return noRoute(input, input.blockedDetail ? `${message}. ${input.blockedDetail}` : message)
  }
  const margin = input.eva ? evaMargin(input.eva) : null
  // checkEva failed closed (no usable limit): never present that as reachable.
  if (!input.eva || !margin) return noRoute(input, 'EVA time could not be checked for this route')
  const route = input.alternatives[kind]
  const shown = evaDisplay(input.eva)
  const totalMin = Number(shown.total)
  const limitMin = Math.round(input.eva.limitMin * 10) / 10
  const within = input.eva.withinLimit
  return {
    stopId: input.stopId,
    name: input.name,
    status: within ? 'within' : 'over',
    reason: within ? null : `${totalMin.toFixed(1)} min exceeds the ${limitMin.toFixed(1)} min EVA limit`,
    routeKind: kind,
    distanceM: route.distanceM,
    maxSlopeDeg: route.maxSlopeDeg,
    outboundMin: Number(shown.outbound),
    researchMin: Number(shown.research),
    returnMin: Number(shown.return),
    totalMin,
    limitMin,
    marginMin: margin.remainingMin,
    marginPct: margin.remainingPct,
    best: false,
  }
}

const STATUS_ORDER: Record<ReachStatus, number> = { within: 0, over: 1, 'no-route': 2 }

// Slopes are compared as displayed (0.1°): equal-looking slopes count as a tie.
const slopeKey = (v: number | null) => (v === null ? Infinity : Math.round(v * 10))

/** Within → over → no route; then lowest max slope; then largest margin. Stable otherwise. */
export function compareReach(a: StopReach, b: StopReach): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    slopeKey(a.maxSlopeDeg) - slopeKey(b.maxSlopeDeg) ||
    (b.marginMin ?? -Infinity) - (a.marginMin ?? -Infinity) ||
    0
  )
}

/** Ranked rows; the first one within the EVA limit gets "Best option". */
export function rankStops(inputs: StopReachInput[]): StopReach[] {
  const rows = inputs.map(summarizeStop).sort(compareReach)
  if (rows[0]?.status === 'within') rows[0] = { ...rows[0], best: true }
  return rows
}
