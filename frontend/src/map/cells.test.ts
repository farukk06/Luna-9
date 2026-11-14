import { describe, expect, it } from 'vitest'
import type { Grid } from '../routing/types'
import { createMockGrid } from '../mocks/mockGrid'
import { findNearestPassableCell, passabilityIssue } from './cells'

const NODATA = -9999

/** Small flat grid; cells listed in `blocked` get NoData, `steep` cells get 40°. */
function testGrid(width: number, height: number, blocked: number[] = [], steep: number[] = []): Grid {
  const n = width * height
  const elevation = new Array<number>(n).fill(0)
  const slope = new Array<number>(n).fill(2)
  for (const i of blocked) {
    elevation[i] = NODATA
    slope[i] = NODATA
  }
  for (const i of steep) slope[i] = 40
  return {
    version: 1,
    width,
    height,
    cellSize: 10,
    nodata: NODATA,
    elevation,
    slope,
    roughness: new Array<number>(n).fill(0),
    stats: { elevationMin: 0, elevationMax: 0, slopeMax: 40, roughnessP95: 0 },
  }
}

describe('findNearestPassableCell', () => {
  it('returns a passable cell itself', () => {
    const grid = createMockGrid()
    expect(findNearestPassableCell({ col: 15, row: 85 }, grid, 25)).toEqual({ col: 15, row: 85 })
  })

  it('finds the nearest valid cell from a NoData cell', () => {
    // 5×5 grid: centre (2,2) and its direct neighbours are NoData except (3,2).
    const grid = testGrid(5, 5, [12, 7, 11, 17])
    expect(findNearestPassableCell({ col: 2, row: 2 }, grid, 25)).toEqual({ col: 3, row: 2 })
  })

  it('finds a valid cell from the mock NoData corner', () => {
    const grid = createMockGrid()
    const cell = findNearestPassableCell({ col: 99, row: 0 }, grid, 25)
    expect(cell).not.toBeNull()
    expect(passabilityIssue(cell!, grid, 25)).toBeNull()
  })

  it('skips cells steeper than the limit', () => {
    const grid = testGrid(3, 1, [], [0, 1])
    expect(findNearestPassableCell({ col: 0, row: 0 }, grid, 25)).toEqual({ col: 2, row: 0 })
  })

  it('prefers the straight-line nearest cell over the first ring hit', () => {
    // From (0,0): (3,3) is on ring 3 but 4.24 away; (4,0) is on ring 4 but only 4 away.
    const all = Array.from({ length: 36 }, (_, i) => i)
    const open = new Set([3 * 6 + 3, 0 * 6 + 4])
    const grid = testGrid(6, 6, all.filter((i) => !open.has(i)))
    expect(findNearestPassableCell({ col: 0, row: 0 }, grid, 25)).toEqual({ col: 4, row: 0 })
  })

  it('returns null when no cell is passable', () => {
    const grid = testGrid(3, 3, [0, 1, 2, 3, 4], [5, 6, 7, 8])
    expect(findNearestPassableCell({ col: 1, row: 1 }, grid, 25)).toBeNull()
  })

  it('handles a start cell outside the grid', () => {
    const grid = testGrid(4, 4)
    expect(findNearestPassableCell({ col: 15, row: 85 }, grid, 25)).toEqual({ col: 3, row: 3 })
  })
})

describe('passabilityIssue', () => {
  it('explains why a cell is blocked', () => {
    const grid = testGrid(2, 1, [0], [1])
    expect(passabilityIssue({ col: 0, row: 0 }, grid, 25)).toBe('Not passable: no data')
    expect(passabilityIssue({ col: 1, row: 0 }, grid, 25)).toBe('Not passable: slope 40.0° (limit 25°)')
  })
})
