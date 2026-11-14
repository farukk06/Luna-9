import type { Alternatives, Cell, EvaCheck, Grid } from '../routing/types'
import { DEFAULT_EVA_PROFILE, DEFAULT_OPTIONS, checkEva, findAlternatives } from './routing'

// The route computation itself, shared by the Web Worker and the main-thread
// fallback. It must stay free of DOM/React imports so it can run in a worker.

export interface AssessmentResult {
  alternatives: Alternatives
  /** EVA check of the recommended route; null when nothing is recommended. */
  eva: EvaCheck | null
  /** Wall-clock time of findAlternatives, for the performance log. */
  elapsedMs: number
}

export type ComputeContext = 'worker' | 'main thread'

export function assessRoutes(grid: Grid, habitat: Cell, target: Cell, where: ComputeContext): AssessmentResult {
  const start = performance.now()
  const alternatives = findAlternatives(grid, habitat, target, DEFAULT_OPTIONS)
  const elapsedMs = performance.now() - start
  const rec = alternatives.recommended
  const eva = rec ? checkEva(alternatives[rec], DEFAULT_EVA_PROFILE) : null
  console.info(
    `findAlternatives: ${elapsedMs.toFixed(0)} ms on ${grid.width}×${grid.height} grid ` +
      `(${habitat.col},${habitat.row}) → (${target.col},${target.row}) [${where}]`,
  )
  return { alternatives, eva, elapsedMs }
}
