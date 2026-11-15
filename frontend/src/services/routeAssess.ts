import type { Alternatives, Cell, EvaCheck, EvaProfile, Grid, RouteOptions } from '../routing/types'
import { checkEva, findAlternatives } from './routing'

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

/** Scenario inputs of one assessment: route weights/slope limit and the EVA profile. */
export interface AssessParams {
  options: RouteOptions
  eva: EvaProfile
}

export function assessRoutes(
  grid: Grid,
  habitat: Cell,
  target: Cell,
  params: AssessParams,
  where: ComputeContext,
): AssessmentResult {
  const start = performance.now()
  const alternatives = findAlternatives(grid, habitat, target, params.options)
  const elapsedMs = performance.now() - start
  const rec = alternatives.recommended
  const eva = rec ? checkEva(alternatives[rec], params.eva) : null
  // Timing diagnostics only while developing; production consoles stay quiet.
  if (import.meta.env.DEV) {
    console.info(
      `findAlternatives: ${elapsedMs.toFixed(0)} ms on ${grid.width}×${grid.height} grid ` +
        `(${habitat.col},${habitat.row}) → (${target.col},${target.row}) [${where}]`,
    )
  }
  return { alternatives, eva, elapsedMs }
}
