import { useEffect, useMemo, useState } from 'react'
import type { Alternatives, Cell, EvaCheck, Grid } from '../routing/types'
import { ROUTE_KINDS } from '../config/routes'
import type { RouteLine } from '../map/routeLayer'
import { DEFAULT_EVA_PROFILE, DEFAULT_OPTIONS, checkEva, findAlternatives } from './routing'

interface StoredResult {
  grid: Grid
  key: string
  alternatives: Alternatives
  eva: EvaCheck | null
}

export interface RouteAssessment {
  computing: boolean
  alternatives: Alternatives | null
  /** EVA check of the recommended route; null when nothing is recommended. */
  eva: EvaCheck | null
  /** Successful routes to draw; empty when recommended is null (CONTRACT Section 9). */
  routeLines: RouteLine[]
  pointOfNoReturn: Cell | null
}

function inputKey(habitat: Cell, target: Cell): string {
  return `${habitat.col},${habitat.row}>${target.col},${target.row}`
}

function assess(grid: Grid, habitat: Cell, target: Cell): Omit<StoredResult, 'grid' | 'key'> {
  const alternatives = findAlternatives(grid, habitat, target, DEFAULT_OPTIONS)
  const rec = alternatives.recommended
  const eva = rec ? checkEva(alternatives[rec], DEFAULT_EVA_PROFILE) : null
  return { alternatives, eva }
}

function toRouteLines(alt: Alternatives | null): RouteLine[] {
  if (!alt || alt.recommended === null) return []
  return ROUTE_KINDS.filter((kind) => alt[kind].ok).map((kind) => ({
    kind,
    path: alt[kind].path,
    recommended: kind === alt.recommended,
  }))
}

function pointOfNoReturnCell(alt: Alternatives | null, eva: EvaCheck | null): Cell | null {
  if (!alt?.recommended || !eva || eva.withinLimit || eva.pointOfNoReturnIndex === undefined) return null
  return alt[alt.recommended].path[eva.pointOfNoReturnIndex] ?? null
}

/**
 * Runs findAlternatives + checkEva for the current habitat/target.
 * Three A* searches on a 400×400 grid can take noticeable time, so the work is
 * deferred: requestAnimationFrame lets the browser paint "Computing routes..."
 * first, then setTimeout runs the search in a fresh task. A result is only
 * shown if it still matches the current inputs, so fast re-clicks never
 * display a stale route.
 */
export function useRouteAssessment(grid: Grid | null, habitat: Cell | null, target: Cell | null): RouteAssessment {
  const [stored, setStored] = useState<StoredResult | null>(null)
  const key = grid && habitat && target ? inputKey(habitat, target) : null

  useEffect(() => {
    if (!grid || !habitat || !target || key === null) return
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setStored({ grid, key, ...assess(grid, habitat, target) }), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [grid, habitat, target, key])

  const current = stored && stored.key === key && stored.grid === grid ? stored : null
  const alternatives = current?.alternatives ?? null
  const eva = current?.eva ?? null
  const routeLines = useMemo(() => toRouteLines(alternatives), [alternatives])
  const pointOfNoReturn = useMemo(() => pointOfNoReturnCell(alternatives, eva), [alternatives, eva])

  return { computing: key !== null && current === null, alternatives, eva, routeLines, pointOfNoReturn }
}
