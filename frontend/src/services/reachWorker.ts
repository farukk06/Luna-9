import type { Grid } from '../routing/types'
import type { StopReachInput } from '../panels/reachability'
import { assessStop } from './reachAssess'
import type { ReachRequest, ReachResponse } from './reachWorkerProtocol'

// Second Web Worker, only for "Where can we go?": routes to every science
// stop run here, so the main route worker (habitat → target) never waits.

interface WorkerScope {
  onmessage: ((event: MessageEvent<ReachRequest>) => void) | null
  postMessage(message: ReachResponse): void
}

type Job = Extract<ReachRequest, { type: 'reach' }>

const scope = self as unknown as WorkerScope

let grid: Grid | null = null
let job: Job | null = null
let results: StopReachInput[] = []
let scheduled = false

/**
 * One stop per task: between stops the worker reads new messages, so a newer
 * request (habitat moved, slider changed) replaces the running one at once.
 */
function step(): void {
  scheduled = false
  const current = job
  if (!current || !grid) return
  try {
    const stop = current.stops[results.length]
    if (stop) results.push(assessStop(grid, current.habitat, stop, current.params, 'worker'))
    if (results.length < current.stops.length) {
      schedule()
      return
    }
    scope.postMessage({ type: 'result', id: current.id, results })
  } catch (error) {
    scope.postMessage({ type: 'error', id: current.id, message: error instanceof Error ? error.message : String(error) })
  }
  job = null
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  setTimeout(step, 0)
}

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'grid') {
    grid = message.grid
    return
  }
  job = message
  results = []
  schedule()
}
