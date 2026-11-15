import { describe, expect, it } from 'vitest'
import { createMockGrid } from '../mocks/mockGrid'
import type { Grid } from '../routing/types'
import type { LonLatBounds } from '../services/data'
import { LANDING_SITE } from '../config/landingSite'
import { mapToCell } from './coords'
import { lonLatToMap } from './lonLat'

// Same shape as the real grid.json: 400×400 cells of 5 m.
const grid: Grid = { ...createMockGrid(), width: 400, height: 400, cellSize: 5 }
// source.boundsLonLat of the real grid.json.
const bounds: LonLatBounds = [77.42613027179006, 18.41512380269072, 77.45987148150628, 18.44886501240695]

describe('lonLatToMap', () => {
  it('maps the corners to the map extent', () => {
    expect(lonLatToMap(bounds[0], bounds[1], bounds, grid)).toEqual({ x: 0, y: 0 })
    const ne = lonLatToMap(bounds[2], bounds[3], bounds, grid)
    expect(ne?.x).toBeCloseTo(2000, 6)
    expect(ne?.y).toBeCloseTo(2000, 6)
  })

  it('returns null outside the bounds', () => {
    expect(lonLatToMap(77.6, 18.4, bounds, grid)).toBeNull()
    expect(lonLatToMap(bounds[0], bounds[3] + 0.001, bounds, grid)).toBeNull()
  })

  it('puts the Perseverance landing site near the north edge, east of centre', () => {
    const point = lonLatToMap(LANDING_SITE.lon, LANDING_SITE.lat, bounds, grid)
    expect(point).not.toBeNull()
    expect(mapToCell(point!.x, point!.y, grid)).toEqual({ col: 292, row: 49 })
  })
})
