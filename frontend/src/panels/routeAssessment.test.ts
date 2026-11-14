import { describe, expect, it } from 'vitest'
import type { Alternatives, RouteResult } from '../routing/types'
import { evaDisplay, firstFailureMessage, orderedRouteKinds, recommendationSentence } from './routeAssessment'

function route(distanceM: number, maxSlopeDeg: number, meanSlopeDeg: number): RouteResult {
  return {
    ok: true,
    path: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
    distanceM,
    maxSlopeDeg,
    meanSlopeDeg,
    durationMin: 1,
    returnDurationMin: 1,
    profile: [],
  }
}

function failed(reason: NonNullable<RouteResult['reason']>): RouteResult {
  return { ...route(0, 0, 0), ok: false, reason, path: [] }
}

function alternatives(partial: Partial<Alternatives>): Alternatives {
  return {
    shortest: route(400, 24.6, 10),
    safest: route(600, 4, 2),
    balanced: route(528, 5.5, 3),
    recommended: 'balanced',
    reason: 'engine text that the UI must not show',
    ...partial,
  }
}

describe('recommendationSentence', () => {
  it('explains a longer but less steep recommendation', () => {
    expect(recommendationSentence(alternatives({}))).toBe(
      'Balanced route recommended: 128 m longer than the shortest route, but keeps max slope at 5.5° instead of 24.6°.',
    )
  })

  it('uses a short sentence when the shortest route is recommended', () => {
    const s = recommendationSentence(alternatives({ recommended: 'shortest' }))
    expect(s).toBe(
      'Shortest route recommended: the alternatives do not lower the slope (max 24.6°), so the most direct path is preferred.',
    )
  })

  it('mentions the mean slope when the max slope is the same', () => {
    const s = recommendationSentence(
      alternatives({ shortest: route(400, 12, 8), safest: route(450, 12, 5), recommended: 'safest' }),
    )
    expect(s).toBe('Safest route recommended: 50 m longer than the shortest route, but lowers mean slope to 5.0° instead of 8.0°.')
  })

  it('handles a recommendation that is as short as the shortest route', () => {
    const s = recommendationSentence(alternatives({ balanced: route(400, 5.5, 3) }))
    expect(s).toBe('Balanced route recommended: as short as the shortest route, with a max slope of 5.5°.')
  })

  it('never repeats the engine reason text', () => {
    expect(recommendationSentence(alternatives({}))).not.toContain('engine text')
  })

  it('returns null when nothing is recommended', () => {
    expect(recommendationSentence(alternatives({ recommended: null }))).toBeNull()
  })
})

describe('firstFailureMessage / orderedRouteKinds', () => {
  it('maps the first failed route to the CONTRACT message', () => {
    const alt = alternatives({
      shortest: failed('unreachable'),
      safest: failed('unreachable'),
      balanced: failed('unreachable'),
      recommended: null,
    })
    expect(firstFailureMessage(alt)).toBe('No safe route within the slope limit')
    expect(firstFailureMessage(alternatives({ safest: failed('goal-blocked') }))).toBe('Target cell is not passable')
    expect(firstFailureMessage(alternatives({}))).toBeNull()
  })

  it('puts the recommended route first', () => {
    expect(orderedRouteKinds(alternatives({ recommended: 'safest' }))).toEqual(['safest', 'shortest', 'balanced'])
    expect(orderedRouteKinds(alternatives({ recommended: null }))).toEqual(['shortest', 'safest', 'balanced'])
  })
})

describe('evaDisplay', () => {
  it('shows one decimal and a total that matches the shown parts', () => {
    const shown = evaDisplay({
      outboundMin: 42.04,
      researchMin: 30,
      returnMin: 12.56,
      totalMin: 84.6,
      limitMin: 192,
      withinLimit: true,
    })
    expect(shown).toEqual({ outbound: '42.0', research: '30.0', return: '12.6', total: '84.6', limit: '192.0' })
  })

  it('keeps the sum consistent when exact rounding would drift', () => {
    // Each part shows as 10.1; the exact total 30.42 would show as 30.4, which does not add up.
    const shown = evaDisplay({
      outboundMin: 10.14,
      researchMin: 10.14,
      returnMin: 10.14,
      totalMin: 30.42,
      limitMin: 100,
      withinLimit: true,
    })
    expect(shown.total).toBe('30.3')
  })
})
