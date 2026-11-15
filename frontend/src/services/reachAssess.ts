import type { Alternatives, Cell, Grid, RouteResult } from '../routing/types'
import type { StopReachInput } from '../panels/reachability'
import { blockedCellDetail, firstFailureReason } from '../panels/routeAssessment'
import { type AssessParams, assessRoutes } from './routeAssess'

// Route + EVA check from the habitat to one science stop, for "Where can we go?".
// Shared by the reachability worker and its main-thread fallback (no DOM/React).

export interface ReachStop {
  id: string
  name: string
  cell: Cell
}

/** Paths and profiles are dropped: the list needs only the summary numbers. */
function slim(route: RouteResult): RouteResult {
  return { ...route, path: [], profile: [] }
}

function slimAlternatives(alt: Alternatives): Alternatives {
  return { ...alt, shortest: slim(alt.shortest), safest: slim(alt.safest), balanced: slim(alt.balanced) }
}

export function assessStop(grid: Grid, habitat: Cell, stop: ReachStop, params: AssessParams, where: 'worker' | 'main thread'): StopReachInput {
  const { alternatives, eva } = assessRoutes(grid, habitat, stop.cell, params, where)
  const context = { grid, habitat, target: stop.cell, maxSlopeDeg: params.options.maxSlopeDeg }
  const blockedDetail = blockedCellDetail(firstFailureReason(alternatives), context)
  return { stopId: stop.id, name: stop.name, alternatives: slimAlternatives(alternatives), eva, blockedDetail }
}
