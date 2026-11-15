import { describe, expect, it } from 'vitest'
import VectorSource from 'ol/source/Vector'
import LineString from 'ol/geom/LineString'
import type { Grid } from '../routing/types'
import { arrowPlacements, updateRoutes } from './routeLayer'
import { cellToMap } from './coords'

describe('arrowPlacements', () => {
  it('points arrows along the line, from start to end', () => {
    // 1000 m due east at 1 m/px: rotation is clockwise from north, so east = π/2.
    const east = arrowPlacements([[0, 0], [1000, 0]], 1)
    expect(east.length).toBeGreaterThan(3)
    for (const a of east) expect(a.rotation).toBeCloseTo(Math.PI / 2)
    const xs = east.map((a) => a.at[0])
    expect(xs).toEqual([...xs].sort((p, q) => p - q))
    // Reversed line: arrows turn around (west = −π/2).
    for (const a of arrowPlacements([[1000, 0], [0, 0]], 1)) expect(a.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('keeps arrows clear of both route ends', () => {
    for (const a of arrowPlacements([[0, 0], [0, 500]], 1)) {
      expect(a.at[1]).toBeGreaterThanOrEqual(34)
      expect(a.at[1]).toBeLessThanOrEqual(500 - 34)
    }
  })

  it('draws no arrows on a route shorter than the end clearance', () => {
    expect(arrowPlacements([[0, 0], [40, 0]], 1)).toEqual([])
  })
})

describe('updateRoutes', () => {
  it('draws exactly the computed cell path (no smoothing)', () => {
    const grid = { width: 10, height: 10, cellSize: 5 } as Grid
    const path = [
      { col: 1, row: 1 },
      { col: 2, row: 2 },
      { col: 2, row: 3 },
      { col: 3, row: 4 },
    ]
    const source = new VectorSource()
    updateRoutes(source, grid, [{ kind: 'safest', path, recommended: true }])
    const geometry = source.getFeatures()[0].getGeometry() as LineString
    expect(geometry.getCoordinates()).toEqual(path.map((c) => {
      const { x, y } = cellToMap(c, grid)
      return [x, y]
    }))
  })
})
