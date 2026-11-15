import type { EvaProfile, RouteOptions } from '../routing/types'
import { DEFAULT_EVA_PROFILE, DEFAULT_OPTIONS, MIN_DISTANCE_WEIGHT } from '../services/routing'

// Scenario parameters the user can change in the "Scenario parameters" panel.
// These are assumptions for planning, not measurements. Defaults and the
// minimum distance weight come from the routing engine (routing/config.ts);
// only the slider ranges are UI choices made here.

export interface ScenarioParams {
  options: RouteOptions
  eva: EvaProfile
}

export const DEFAULT_SCENARIO: ScenarioParams = {
  options: { ...DEFAULT_OPTIONS },
  eva: { ...DEFAULT_EVA_PROFILE },
}

export interface SliderRange {
  min: number
  max: number
  step: number
}

// The steepest real terrain in the study area is about 20°, so a range
// starting at 5° lets the limit actually block terrain.
export const SLOPE_LIMIT_RANGE: SliderRange = { min: 5, max: 30, step: 1 }
// The slider starts at 0 so 0.5 steps land on whole/half values; wDistance
// is then raised to the engine's MIN_DISTANCE_WEIGHT (it cannot be zero).
export const WEIGHT_RANGE: SliderRange = { min: 0, max: 10, step: 0.5 }

export const EVA_RANGES: Record<keyof EvaProfile, SliderRange> = {
  maxEvaMinutes: { min: 60, max: 480, step: 10 },
  researchMinutes: { min: 0, max: 120, step: 5 },
  safetyMarginPct: { min: 0, max: 50, step: 5 },
}

export type WeightKey = 'wDistance' | 'wSlope' | 'wRoughness'

function clamp(value: number, range: SliderRange): number {
  return Math.min(Math.max(value, range.min), range.max)
}

/** Lowest allowed value of a weight: wDistance must stay above zero. */
export function weightMin(key: WeightKey): number {
  return key === 'wDistance' ? MIN_DISTANCE_WEIGHT : WEIGHT_RANGE.min
}

export function withSlopeLimit(s: ScenarioParams, deg: number): ScenarioParams {
  return { ...s, options: { ...s.options, maxSlopeDeg: clamp(deg, SLOPE_LIMIT_RANGE) } }
}

export function withWeight(s: ScenarioParams, key: WeightKey, value: number): ScenarioParams {
  const v = Math.max(clamp(value, WEIGHT_RANGE), weightMin(key))
  return { ...s, options: { ...s.options, [key]: v } }
}

export function withEva(s: ScenarioParams, key: keyof EvaProfile, value: number): ScenarioParams {
  return { ...s, eva: { ...s.eva, [key]: clamp(value, EVA_RANGES[key]) } }
}

/** Stable text key: equal parameters give equal keys (used to match results to requests). */
export function scenarioKey(s: ScenarioParams): string {
  const o = s.options
  const e = s.eva
  return [o.maxSlopeDeg, o.wDistance, o.wSlope, o.wRoughness, e.maxEvaMinutes, e.researchMinutes, e.safetyMarginPct].join('|')
}

export function isDefaultScenario(s: ScenarioParams): boolean {
  return scenarioKey(s) === scenarioKey(DEFAULT_SCENARIO)
}
