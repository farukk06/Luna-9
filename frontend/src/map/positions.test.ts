import { describe, expect, it } from 'vitest'
import { LARGE_MOCK_SPEC, createMockGrid } from '../mocks/mockGrid'
import { MISSION_DEFAULTS } from '../config/mission'
import { isPassableWithSlope } from './cells'
import { fractionToCell, gridCenterCell, positionToCell } from './positions'

const small = createMockGrid()
const large = createMockGrid(LARGE_MOCK_SPEC)
const { habitat, target } = MISSION_DEFAULTS.mock

describe('mission positions', () => {
  it('keeps the original mock cells on the 100×100 grid', () => {
    expect(positionToCell(habitat!, small)).toEqual({ col: 15, row: 85 })
    expect(positionToCell(target!, small)).toEqual({ col: 79, row: 13 })
  })

  it('lands in the same place on the 400×400 grid, on passable cells', () => {
    const h = positionToCell(habitat!, large)!
    const t = positionToCell(target!, large)!
    expect(h).toEqual({ col: 60, row: 340 })
    expect(t).toEqual({ col: 318, row: 54 })
    expect(isPassableWithSlope(h, large, 25)).toBe(true)
    expect(isPassableWithSlope(t, large, 25)).toBe(true)
  })

  it('clamps fraction 1 to the last cell', () => {
    expect(fractionToCell(1, 1, small)).toEqual({ col: 99, row: 99 })
  })

  it('reads metre positions with the map origin at the bottom-left', () => {
    expect(positionToCell({ kind: 'map', xM: 5, yM: 5 }, small)).toEqual({ col: 0, row: 99 })
    expect(positionToCell({ kind: 'map', xM: -1, yM: 5 }, small)).toBeNull()
  })

  it('has no real-data defaults yet and a grid centre fallback', () => {
    expect(MISSION_DEFAULTS.real).toEqual({ habitat: null, target: null })
    expect(gridCenterCell(large)).toEqual({ col: 200, row: 200 })
  })
})
