import { describe, expect, it } from 'vitest'
import type { Alternatives, EvaCheck, RouteResult } from '../routing/types'
import { type StopReachInput, rankStops, summarizeStop } from './reachability'

function route(maxSlopeDeg: number, distanceM = 500): RouteResult {
  return { ok: true, path: [], distanceM, maxSlopeDeg, meanSlopeDeg: 1, durationMin: 10, returnDurationMin: 10, profile: [] }
}

const failed: RouteResult = { ...route(0), ok: false, reason: 'unreachable' }

function alternatives(rec: RouteResult | null): Alternatives {
  if (!rec) return { shortest: failed, safest: failed, balanced: failed, recommended: null, reason: '' }
  return { shortest: rec, safest: rec, balanced: rec, recommended: 'balanced', reason: '' }
}

/** EVA check with a 192 min limit and the given outbound/return minutes (research 30). */
function eva(outboundMin: number, returnMin: number): EvaCheck {
  const totalMin = outboundMin + 30 + returnMin
  return { outboundMin, researchMin: 30, returnMin, totalMin, limitMin: 192, withinLimit: totalMin <= 192 }
}

function input(stopId: string, maxSlope: number | null, out = 50, back = 50): StopReachInput {
  if (maxSlope === null) return { stopId, name: stopId, alternatives: alternatives(null), eva: null }
  return { stopId, name: stopId, alternatives: alternatives(route(maxSlope)), eva: eva(out, back) }
}

describe('summarizeStop', () => {
  it('reports a stop within the limit with its margin', () => {
    const r = summarizeStop(input('a', 8))
    expect(r.status).toBe('within')
    expect(r.reason).toBeNull()
    expect([r.outboundMin, r.researchMin, r.returnMin, r.totalMin]).toEqual([50, 30, 50, 130])
    expect(r.marginMin).toBe(62)
    expect(r.marginPct).toBeCloseTo(32.29, 2)
    expect(r.maxSlopeDeg).toBe(8)
    expect(r.distanceM).toBe(500)
  })

  it('reports a stop over the limit with a negative margin and a reason', () => {
    const r = summarizeStop(input('a', 8, 100, 102))
    expect(r.status).toBe('over')
    expect(r.marginMin).toBe(-40)
    expect(r.reason).toBe('232.0 min exceeds the 192.0 min EVA limit')
  })

  it('reports no safe route with the engine failure message', () => {
    const r = summarizeStop(input('a', null))
    expect(r.status).toBe('no-route')
    expect(r.reason).toBe('No safe route within the slope limit')
    expect(r.totalMin).toBeNull()
  })

  it('adds why the stop cell is blocked', () => {
    const r = summarizeStop({ ...input('a', null), blockedDetail: 'Target slope 8.2° exceeds the 7° scenario limit.' })
    expect(r.reason).toBe('No safe route within the slope limit. Target slope 8.2° exceeds the 7° scenario limit.')
  })

  it('never shows a failed-closed EVA check as reachable', () => {
    const bad: EvaCheck = { outboundMin: 0, researchMin: 0, returnMin: 0, totalMin: 0, limitMin: 0, withinLimit: false }
    const r = summarizeStop({ stopId: 'a', name: 'a', alternatives: alternatives(route(5)), eva: bad })
    expect(r.status).toBe('no-route')
  })
})

describe('rankStops', () => {
  it('puts stops within the limit first, then over, then no route', () => {
    const rows = rankStops([input('none', null), input('over', 2, 100, 102), input('ok', 12)])
    expect(rows.map((r) => r.stopId)).toEqual(['ok', 'over', 'none'])
  })

  it('ranks within-limit stops by lowest max slope, not by margin', () => {
    const rows = rankStops([input('steep-fast', 15, 20, 20), input('flat-slow', 5, 70, 70)])
    expect(rows.map((r) => r.stopId)).toEqual(['flat-slow', 'steep-fast'])
  })

  it('breaks a slope tie with the largest margin', () => {
    const rows = rankStops([input('slow', 7.02, 60, 60), input('fast', 6.98, 30, 30)])
    // 7.02° and 6.98° both show as 7.0°: a tie, so the larger margin wins.
    expect(rows.map((r) => r.stopId)).toEqual(['fast', 'slow'])
  })

  it('keeps the input order when slope and margin are equal', () => {
    const rows = rankStops([input('first', 6), input('second', 6)])
    expect(rows.map((r) => r.stopId)).toEqual(['first', 'second'])
  })

  it('marks only the first within-limit stop as best option', () => {
    const rows = rankStops([input('b', 9), input('a', 4)])
    expect(rows.map((r) => r.best)).toEqual([true, false])
    expect(rows[0].stopId).toBe('a')
  })

  it('gives no best option when nothing fits the EVA limit', () => {
    const rows = rankStops([input('over', 3, 100, 102), input('none', null)])
    expect(rows.some((r) => r.best)).toBe(false)
  })
})
