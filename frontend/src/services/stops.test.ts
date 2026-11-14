/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMockGrid } from '../mocks/mockGrid'
import { isContentPending, parseStop, parseStops, placeableStops } from './stops'

const base = {
  id: 'stop-x',
  name: 'Science stop X',
  col: 10,
  row: 90,
  description: 'Text',
  whyImportant: null,
  sourceUrl: null,
  photo: null,
}

afterEach(() => vi.restoreAllMocks())

describe('parseStop', () => {
  it('accepts a placeholder stop with null optional content', () => {
    const stop = parseStop(base)
    expect(stop).not.toBeNull()
    expect(isContentPending(stop!)).toBe(true)
  })

  it('rejects entries with missing or wrong required fields', () => {
    expect(parseStop({ ...base, id: '' })).toBeNull()
    expect(parseStop({ ...base, col: 1.5 })).toBeNull()
    expect(parseStop({ ...base, description: undefined })).toBeNull()
    expect(parseStop('stop')).toBeNull()
  })

  it('keeps only http(s) source links', () => {
    expect(parseStop({ ...base, sourceUrl: 'https://example.org/x' })!.sourceUrl).toBe('https://example.org/x')
    expect(parseStop({ ...base, sourceUrl: 'javascript:alert(1)' })!.sourceUrl).toBeNull()
  })

  it('drops an incomplete photo object', () => {
    expect(parseStop({ ...base, photo: { file: 'photos/a.jpg', sol: 12 } })!.photo).toBeNull()
  })
})

describe('parseStops', () => {
  it('returns no stops for a missing or broken file', () => {
    expect(parseStops(null)).toEqual([])
    expect(parseStops({ not: 'an array' })).toEqual([])
  })

  it('skips bad entries with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseStops([base, { id: 1 }])).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('placeableStops', () => {
  const grid = createMockGrid()

  it('hides stops outside the grid or on impassable cells and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stops = [
      parseStop(base)!,
      parseStop({ ...base, id: 'outside', col: 150 })!,
      parseStop({ ...base, id: 'nodata', col: 99, row: 0 })!, // mock NoData corner
    ]
    expect(placeableStops(stops, grid, 25).map((s) => s.id)).toEqual(['stop-x'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('places every stop of the shipped stops.json on the mock grid', () => {
    const file = JSON.parse(readFileSync(new URL('../../public/content/stops.json', import.meta.url), 'utf-8')) as unknown
    const stops = parseStops(file)
    expect(stops).toHaveLength(3)
    expect(placeableStops(stops, grid, 25)).toHaveLength(3)
    expect(stops.every(isContentPending)).toBe(true)
  })
})
