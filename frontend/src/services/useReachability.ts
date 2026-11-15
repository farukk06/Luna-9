import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cell, Grid } from '../routing/types'
import type { StopReachInput } from '../panels/reachability'
import type { AssessParams } from './routeAssess'
import { type ReachStop, assessStop } from './reachAssess'
import type { ReachRequest, ReachResponse } from './reachWorkerProtocol'
import { useDebouncedValue } from './useDebouncedValue'

/** Waits for the habitat/scenario to settle; target clicks never restart this. */
const REACH_DEBOUNCE_MS = 400

export interface Reachability {
  computing: boolean
  /** Results for the current inputs, or the previous ones while computing (see stale). */
  results: StopReachInput[] | null
  stale: boolean
}

interface Stored {
  grid: Grid
  key: string
  results: StopReachInput[]
}

interface Inputs {
  habitat: Cell
  stops: ReachStop[]
  params: AssessParams
  key: string
}

function toInputs(habitat: Cell | null, stops: ReachStop[], params: AssessParams): Inputs | null {
  if (!habitat || stops.length === 0) return null
  const key = `${habitat.col},${habitat.row}|${stops.map((s) => `${s.id}@${s.cell.col},${s.cell.row}`).join(';')}|${JSON.stringify(params)}`
  return { habitat, stops, params, key }
}

function createReachWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./reachWorker.ts', import.meta.url), { type: 'module' })
  } catch (error) {
    console.warn('Reachability worker unavailable, computing on the main thread:', error)
    return null
  }
}

function post(worker: Worker, message: ReachRequest): void {
  worker.postMessage(message)
}

/**
 * Habitat → every science stop (findAlternatives + checkEva), in its own Web
 * Worker so the main habitat → target route never queues behind it. Recomputes
 * only when the habitat, the scenario or the stops change, after a debounce.
 */
export function useReachability(grid: Grid | null, habitat: Cell | null, stops: ReachStop[], params: AssessParams): Reachability {
  const [stored, setStored] = useState<Stored | null>(null)
  const [workerFailed, setWorkerFailed] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const nextIdRef = useRef(0)
  const latestRef = useRef<{ id: number; key: string } | null>(null)

  const liveInputs = useMemo(() => toInputs(habitat, stops, params), [habitat, stops, params])
  const inputs = useDebouncedValue(liveInputs, REACH_DEBOUNCE_MS)

  useEffect(() => {
    if (!grid || workerFailed) return
    const worker = createReachWorker()
    if (!worker) return
    worker.onmessage = (event: MessageEvent<ReachResponse>) => {
      const message = event.data
      const latest = latestRef.current
      if (!latest || message.id !== latest.id) return
      if (message.type === 'error') {
        console.error('Reachability worker error, computing on the main thread instead:', message.message)
        setWorkerFailed(true)
        return
      }
      setStored({ grid, key: latest.key, results: message.results })
    }
    worker.onerror = (event) => {
      console.error('Reachability worker failed, computing on the main thread instead:', event.message)
      setWorkerFailed(true)
    }
    post(worker, { type: 'grid', grid })
    workerRef.current = worker
    return () => {
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [grid, workerFailed])

  useEffect(() => {
    if (!grid || !inputs) return
    const id = ++nextIdRef.current
    latestRef.current = { id, key: inputs.key }
    const worker = workerRef.current
    if (worker) {
      post(worker, { type: 'reach', id, habitat: inputs.habitat, stops: inputs.stops, params: inputs.params })
      return
    }
    // Fallback: one stop per task, so the page keeps painting between searches.
    const results: StopReachInput[] = []
    let timer = 0
    const next = () => {
      const stop = inputs.stops[results.length]
      if (stop) results.push(assessStop(grid, inputs.habitat, stop, inputs.params, 'main thread'))
      if (results.length < inputs.stops.length) timer = window.setTimeout(next, 0)
      else setStored({ grid, key: inputs.key, results })
    }
    timer = window.setTimeout(next, 0)
    return () => window.clearTimeout(timer)
  }, [grid, inputs, workerFailed])

  const liveKey = liveInputs?.key ?? null
  const current = stored && stored.grid === grid && stored.key === liveKey ? stored : null
  const shown = current ?? (liveKey !== null && stored?.grid === grid ? stored : null)
  return {
    computing: liveKey !== null && current === null,
    results: shown?.results ?? null,
    stale: shown !== null && current === null,
  }
}
