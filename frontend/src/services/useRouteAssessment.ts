import { useEffect, useMemo, useRef, useState } from 'react'
import type { Alternatives, Cell, EvaCheck, Grid } from '../routing/types'
import { ROUTE_KINDS } from '../config/routes'
import type { RouteLine } from '../map/routeLayer'
import { assessRoutes } from './routeAssess'
import type { WorkerRequest, WorkerResponse } from './routeWorkerProtocol'

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
  /**
   * Successful routes to draw; empty when recommended is null (CONTRACT Section 9).
   * While computing, these are the previous result's routes (see routesStale).
   */
  routeLines: RouteLine[]
  /** True when routeLines belong to the previous habitat/target: draw them faded. */
  routesStale: boolean
  pointOfNoReturn: Cell | null
}

function inputKey(habitat: Cell, target: Cell): string {
  return `${habitat.col},${habitat.row}>${target.col},${target.row}`
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

/** A module worker (Vite bundles it from this URL), or null where workers are unavailable. */
function createRouteWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./routeWorker.ts', import.meta.url), { type: 'module' })
  } catch (error) {
    console.warn('Route worker unavailable, computing on the main thread:', error)
    return null
  }
}

function post(worker: Worker, message: WorkerRequest): void {
  worker.postMessage(message)
}

/**
 * Runs findAlternatives + checkEva for the current habitat/target.
 * Three A* searches on the 400×400 grid take up to ~300 ms, so they run in a
 * Web Worker and the UI keeps responding ("Computing routes…" meanwhile).
 * Every request gets an id; only the answer to the newest one is kept, so a
 * slow, outdated result can never overwrite a newer route. If the worker
 * cannot start or fails, the same computation runs on the main thread.
 */
export function useRouteAssessment(grid: Grid | null, habitat: Cell | null, target: Cell | null): RouteAssessment {
  const [stored, setStored] = useState<StoredResult | null>(null)
  const [workerFailed, setWorkerFailed] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const nextIdRef = useRef(0)
  const latestRef = useRef<{ id: number; key: string } | null>(null)
  const key = grid && habitat && target ? inputKey(habitat, target) : null

  // One worker per grid: the grid is copied to it once, requests carry only cells.
  useEffect(() => {
    if (!grid || workerFailed) return
    const worker = createRouteWorker()
    if (!worker) return
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      const latest = latestRef.current
      if (!latest || message.id !== latest.id) return // outdated: a newer request is pending
      if (message.type === 'error') {
        console.error('Route worker error, computing on the main thread instead:', message.message)
        setWorkerFailed(true)
        return
      }
      setStored({ grid, key: latest.key, alternatives: message.alternatives, eva: message.eva })
    }
    worker.onerror = (event) => {
      console.error('Route worker failed, computing on the main thread instead:', event.message)
      setWorkerFailed(true)
    }
    post(worker, { type: 'grid', grid })
    if (import.meta.env.DEV) console.info(`Route worker started, grid sent once (${grid.width}×${grid.height})`)
    workerRef.current = worker
    return () => {
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [grid, workerFailed])

  useEffect(() => {
    if (!grid || !habitat || !target || key === null) return
    const id = ++nextIdRef.current
    latestRef.current = { id, key }
    const worker = workerRef.current
    if (worker) {
      post(worker, { type: 'assess', id, habitat, target })
      return
    }
    // Fallback: requestAnimationFrame lets the browser paint "Computing routes…"
    // first, then setTimeout runs the search in a fresh task.
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        const result = assessRoutes(grid, habitat, target, 'main thread')
        setStored({ grid, key, alternatives: result.alternatives, eva: result.eva })
      }, 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [grid, habitat, target, key, workerFailed])

  const current = stored && stored.key === key && stored.grid === grid ? stored : null
  // While a new result is computing, the previous one (same grid) stays on the
  // map, faded; with no habitat/target nothing is drawn.
  const shown = current ?? (key !== null && stored?.grid === grid ? stored : null)
  const alternatives = current?.alternatives ?? null
  const eva = current?.eva ?? null
  const routeLines = useMemo(() => toRouteLines(shown?.alternatives ?? null), [shown])
  // Only for the current route: an old point of no return would be misleading.
  const pointOfNoReturn = useMemo(() => pointOfNoReturnCell(alternatives, eva), [alternatives, eva])

  return {
    computing: key !== null && current === null,
    alternatives,
    eva,
    routeLines,
    routesStale: shown !== null && current === null,
    pointOfNoReturn,
  }
}
