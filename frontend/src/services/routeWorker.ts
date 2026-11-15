import type { Cell, Grid } from '../routing/types'
import { type AssessParams, assessRoutes } from './routeAssess'
import type { WorkerRequest, WorkerResponse } from './routeWorkerProtocol'

// Web Worker: runs the A* searches off the main thread, so the map and panels
// stay responsive on the 400×400 grid. It only imports the routing engine.

/** The few worker-scope members used here (the app's TS config has no WebWorker lib). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse): void
}

const scope = self as unknown as WorkerScope

let grid: Grid | null = null
let pending: { id: number; habitat: Cell; target: Cell; params: AssessParams } | null = null
let scheduled = false

/**
 * Runs only the newest request. Requests that arrive while a search is running
 * queue up; when it ends they are all read before this timer fires (usually),
 * so outdated clicks are skipped instead of each costing a full search.
 */
function runPending(): void {
  scheduled = false
  const request = pending
  pending = null
  if (!request || !grid) return
  try {
    const result = assessRoutes(grid, request.habitat, request.target, request.params, 'worker')
    scope.postMessage({ type: 'result', id: request.id, ...result })
  } catch (error) {
    scope.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) })
  }
}

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'grid') {
    grid = message.grid
    return
  }
  pending = { id: message.id, habitat: message.habitat, target: message.target, params: message.params }
  if (!scheduled) {
    scheduled = true
    setTimeout(runPending, 0)
  }
}
