import { describe, expect, it } from 'vitest'
import { DEFAULT_EVA_PROFILE, DEFAULT_OPTIONS, MIN_DISTANCE_WEIGHT } from '../services/routing'
import {
  DEFAULT_SCENARIO,
  EVA_RANGES,
  SLOPE_LIMIT_RANGE,
  WEIGHT_RANGE,
  isDefaultScenario,
  scenarioKey,
  withEva,
  withSlopeLimit,
  withWeight,
} from './scenarioParams'

const inRange = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max

describe('scenario defaults', () => {
  it('come from the routing engine', () => {
    expect(DEFAULT_SCENARIO.options).toEqual(DEFAULT_OPTIONS)
    expect(DEFAULT_SCENARIO.eva).toEqual(DEFAULT_EVA_PROFILE)
  })

  it('lie inside the slider ranges', () => {
    const { options, eva } = DEFAULT_SCENARIO
    expect(inRange(options.maxSlopeDeg, SLOPE_LIMIT_RANGE)).toBe(true)
    expect([options.wDistance, options.wSlope, options.wRoughness].every((w) => inRange(w, WEIGHT_RANGE))).toBe(true)
    expect(inRange(eva.maxEvaMinutes, EVA_RANGES.maxEvaMinutes)).toBe(true)
    expect(inRange(eva.researchMinutes, EVA_RANGES.researchMinutes)).toBe(true)
    expect(inRange(eva.safetyMarginPct, EVA_RANGES.safetyMarginPct)).toBe(true)
  })
})

describe('scenario updates', () => {
  it('clamp the slope limit to 5–30°', () => {
    expect(withSlopeLimit(DEFAULT_SCENARIO, 2).options.maxSlopeDeg).toBe(5)
    expect(withSlopeLimit(DEFAULT_SCENARIO, 45).options.maxSlopeDeg).toBe(30)
    expect(withSlopeLimit(DEFAULT_SCENARIO, 18).options.maxSlopeDeg).toBe(18)
  })

  it('never let the distance weight reach zero', () => {
    expect(withWeight(DEFAULT_SCENARIO, 'wDistance', 0).options.wDistance).toBe(MIN_DISTANCE_WEIGHT)
    expect(withWeight(DEFAULT_SCENARIO, 'wSlope', 0).options.wSlope).toBe(0)
    expect(withWeight(DEFAULT_SCENARIO, 'wRoughness', 12).options.wRoughness).toBe(10)
  })

  it('clamp EVA values and keep other fields', () => {
    const s = withEva(DEFAULT_SCENARIO, 'safetyMarginPct', 90)
    expect(s.eva.safetyMarginPct).toBe(EVA_RANGES.safetyMarginPct.max)
    expect(s.eva.maxEvaMinutes).toBe(DEFAULT_EVA_PROFILE.maxEvaMinutes)
    expect(s.options).toEqual(DEFAULT_SCENARIO.options)
  })

  it('do not mutate the previous parameters', () => {
    withSlopeLimit(DEFAULT_SCENARIO, 10)
    expect(DEFAULT_SCENARIO.options.maxSlopeDeg).toBe(DEFAULT_OPTIONS.maxSlopeDeg)
  })

  it('are detected as changed from the defaults', () => {
    expect(isDefaultScenario(DEFAULT_SCENARIO)).toBe(true)
    const changed = withWeight(DEFAULT_SCENARIO, 'wSlope', 5)
    expect(isDefaultScenario(changed)).toBe(false)
    expect(scenarioKey(changed)).not.toBe(scenarioKey(DEFAULT_SCENARIO))
  })
})
