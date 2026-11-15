import { describe, expect, it } from 'vitest'
import type { Cell, EvaCheck, Grid, RouteResult } from '../routing/types'
import type { Stop } from '../services/stops'
import { evaMargin, missionWarnings, stopsNearRoute } from './missionBriefing'

function flatGrid(size = 40, cellSize = 5): Grid {
  const n = size * size
  return {
    version: 1,
    width: size,
    height: size,
    cellSize,
    nodata: -9999,
    elevation: new Array<number>(n).fill(0),
    slope: new Array<number>(n).fill(0),
    roughness: new Array<number>(n).fill(0),
    stats: { elevationMin: 0, elevationMax: 0, slopeMax: 0, roughnessP95: 0 },
  }
}

function stop(id: string, col: number, row: number): Stop {
  return { id, name: id, col, row, description: '', whyImportant: null, sourceUrl: null, photo: null }
}

function eva(partial: Partial<EvaCheck>): EvaCheck {
  return { outboundMin: 50, researchMin: 30, returnMin: 52, totalMin: 132, limitMin: 192, withinLimit: true, ...partial }
}

function route(maxSlopeDeg: number): RouteResult {
  return {
    ok: true,
    path: [],
    distanceM: 100,
    maxSlopeDeg,
    meanSlopeDeg: 1,
    durationMin: 10,
    returnDurationMin: 10,
    profile: [],
  }
}

describe('evaMargin', () => {
  it('gives the time left and its share of the limit', () => {
    expect(evaMargin(eva({}))).toEqual({ remainingMin: 60, remainingPct: 31.25 })
  })

  it('is negative when the plan is over the limit', () => {
    const m = evaMargin(eva({ outboundMin: 100, returnMin: 102, totalMin: 232, withinLimit: false }))
    expect(m?.remainingMin).toBe(-40)
    expect(m?.remainingPct).toBeCloseTo(-20.83, 2)
  })

  it('matches the rounded numbers shown on screen', () => {
    // 10.04 + 30 + 10.04 shows as 10.0 + 30.0 + 10.0 = 50.0, so 60.0 − 50.0 = 10.0.
    const m = evaMargin(eva({ outboundMin: 10.04, returnMin: 10.04, totalMin: 50.08, limitMin: 60 }))
    expect(m?.remainingMin).toBe(10)
  })

  it('is null for a failed check without a limit', () => {
    expect(evaMargin(eva({ limitMin: 0, withinLimit: false }))).toBeNull()
  })
})

describe('stopsNearRoute', () => {
  const grid = flatGrid() // 5 m cells
  // Straight east-west route along row 20, from col 5 to col 30.
  const path: Cell[] = Array.from({ length: 26 }, (_, k) => ({ col: 5 + k, row: 20 }))

  it('lists stops within 50 m, ordered along the route', () => {
    const stops = [stop('far-end', 25, 28), stop('near-start', 8, 18), stop('too-far', 15, 31)]
    const near = stopsNearRoute(stops, path, grid)
    expect(near.map((n) => n.stop.id)).toEqual(['near-start', 'far-end'])
    expect(near[0].distanceM).toBeCloseTo(10) // 2 rows × 5 m
    expect(near[1].distanceM).toBeCloseTo(40)
  })

  it('measures beyond the route ends from the end point', () => {
    // 11 cols west of the start (55 m) is outside; 9 cols (45 m) is inside.
    expect(stopsNearRoute([stop('w', -6, 20)], path, grid)).toHaveLength(0)
    expect(stopsNearRoute([stop('w', -4, 20)], path, grid)).toHaveLength(1)
  })

  it('leaves out the stop that is the target itself', () => {
    expect(stopsNearRoute([stop('target', 30, 20)], path, grid)).toEqual([])
  })

  it('returns nothing without a route', () => {
    expect(stopsNearRoute([stop('a', 5, 20)], [], grid)).toEqual([])
  })
})

describe('missionWarnings', () => {
  const base = { route: route(10), eva: eva({}), maxSlopeLimitDeg: 25, mockData: false, habitatPendingReview: false }

  it('has no warnings for a comfortable real-data route', () => {
    expect(missionWarnings(base)).toEqual([])
  })

  it('warns about the point of no return when the EVA limit is exceeded', () => {
    const w = missionWarnings({ ...base, eva: eva({ withinLimit: false, pointOfNoReturnIndex: 4 }) })
    expect(w.map((x) => x.id)).toEqual(['point-of-no-return'])
    expect(w[0].level).toBe('danger')
  })

  it('warns when max slope is within 3° of the limit', () => {
    expect(missionWarnings({ ...base, route: route(22) }).map((x) => x.id)).toEqual(['slope-near-limit'])
    expect(missionWarnings({ ...base, route: route(21.9) })).toEqual([])
  })

  it('flags mock data and the demo habitat, most serious first', () => {
    const w = missionWarnings({
      ...base,
      route: route(24),
      eva: eva({ withinLimit: false }),
      mockData: true,
      habitatPendingReview: true,
    })
    expect(w.map((x) => x.id)).toEqual(['eva-limit', 'slope-near-limit', 'mock-data', 'habitat-review'])
    expect(w[3].text).toBe('Demo habitat – pending science review.')
  })
})
