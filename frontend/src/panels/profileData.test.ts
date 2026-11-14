import { describe, expect, it } from 'vitest'
import type { RouteResult } from '../routing/types'
import { buildProfileRows, elevationExtent, hoverCellForRow, niceScale, niceStep } from './profileData'

function route(points: [distanceM: number, elevationM: number][]): RouteResult {
  return {
    ok: true,
    path: points.map((_, k) => ({ col: k, row: 0 })),
    distanceM: points[points.length - 1][0],
    maxSlopeDeg: 0,
    meanSlopeDeg: 0,
    durationMin: 0,
    returnDurationMin: 0,
    profile: points.map(([distanceM, elevationM]) => ({ distanceM, elevationM, slopeDeg: 1 })),
  }
}

describe('buildProfileRows', () => {
  const rec = route([
    [0, 10],
    [10, 12],
    [20, 15],
  ])
  const cmp = route([
    [0, 10],
    [14.14, 18],
  ])

  it('merges both profiles sorted by distance, sharing equal distances', () => {
    const rows = buildProfileRows(rec, cmp)
    expect(rows.map((r) => r.distanceM)).toEqual([0, 10, 14.14, 20])
    expect(rows[0]).toMatchObject({ recElevation: 10, cmpElevation: 10, recIndex: 0, cmpIndex: 0 })
    expect(rows[2]).toMatchObject({ cmpElevation: 18, cmpIndex: 1 })
    expect(rows[2].recElevation).toBeUndefined()
  })

  it('works with only the recommended route', () => {
    expect(buildProfileRows(rec, null)).toHaveLength(3)
  })

  it('maps a hovered row to a path cell, preferring the recommended route', () => {
    const rows = buildProfileRows(rec, cmp)
    expect(hoverCellForRow(rows[1], rec, cmp)).toEqual({ col: 1, row: 0 })
    expect(hoverCellForRow(rows[2], rec, cmp)).toEqual(cmp.path[1])
  })
})

describe('niceScale', () => {
  it('gives round distance ticks', () => {
    expect(niceScale(0, 1096, 5, 50)).toEqual({ domain: [0, 1250], ticks: [0, 250, 500, 750, 1000, 1250] })
    expect(niceScale(0, 362, 5, 50).ticks).toEqual([0, 100, 200, 300, 400])
  })

  it('gives 5 or 10 m elevation steps with negative Mars elevations', () => {
    expect(niceScale(-2547.3, -2512.8, 4, 5)).toEqual({ domain: [-2550, -2510], ticks: [-2550, -2540, -2530, -2520, -2510] })
    expect(niceStep(6, 4, 5)).toBe(5) // a nearly flat route never gets 1 m or 2 m steps
  })

  it('keeps a visible range for flat data', () => {
    expect(niceScale(-2540, -2540, 4, 5).domain).toEqual([-2540, -2535])
  })

  it('finds the elevation extent over both series', () => {
    expect(elevationExtent([{ distanceM: 0, recElevation: 3 }, { distanceM: 1, cmpElevation: -1 }])).toEqual([-1, 3])
    expect(elevationExtent([])).toBeUndefined()
  })
})
