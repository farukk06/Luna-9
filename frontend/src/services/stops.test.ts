/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createMockGrid } from '../mocks/mockGrid'
import { isContentPending, parseStop, parseStops, parseStopsFile, placeableStops, safeImagePath } from './stops'

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
    expect(parseStop({ ...base, row: undefined })).toBeNull()
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
  const MOCK_SIZE = { width: 100, height: 100 }

  it('hides stops outside the grid or on impassable cells and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stops = [
      parseStop(base)!,
      parseStop({ ...base, id: 'outside', col: 150 })!,
      parseStop({ ...base, id: 'nodata', col: 99, row: 0 })!, // mock NoData corner
    ]
    expect(placeableStops(stops, grid, 25, MOCK_SIZE).map((s) => s.id)).toEqual(['stop-x'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('reads the shipped stops.json: 400×400 grid, three stops with reference images', () => {
    const file = JSON.parse(readFileSync(new URL('../../public/content/stops.json', import.meta.url), 'utf-8')) as unknown
    const { stops, gridSize } = parseStopsFile(file)
    expect(gridSize).toEqual({ width: 400, height: 400 })
    expect(stops.map((s) => [s.id, s.col, s.row])).toEqual([
      ['stop-1', 235, 265],
      ['stop-2', 202, 202],
      ['stop-3', 135, 175],
    ])
    expect(stops.every((s) => s.reference !== null && !isContentPending(s))).toBe(true)
    // Every image ID is verified now, so every raw-image link is shown.
    expect(stops.map((s) => s.reference?.imageIdVerified)).toEqual([true, true, true])
    expect(stops.every((s) => s.reference?.rawUrl?.endsWith(s.reference.imageId ?? '?'))).toBe(true)
    expect(stops.every((s) => s.atLocation !== null)).toBe(true)
  })

  it('points every shipped stop at an image file that exists', () => {
    const file = JSON.parse(readFileSync(new URL('../../public/content/stops.json', import.meta.url), 'utf-8')) as unknown
    for (const stop of parseStopsFile(file).stops) {
      const image = stop.reference?.image
      expect(image, stop.id).toBeTruthy()
      expect(existsSync(new URL(`../../public/${image}`, import.meta.url)), String(image)).toBe(true)
    }
  })

  it('hides all stops when the grid size differs from the one their cells refer to', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stops = [parseStop(base)!]
    expect(placeableStops(stops, grid, 25, { width: 400, height: 400 })).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('stops.json shapes (backward compatible)', () => {
  it('reads the older bare array without a grid size', () => {
    const { stops, gridSize } = parseStopsFile([base])
    expect(gridSize).toBeNull()
    expect(stops).toHaveLength(1)
    expect(stops[0].description).toBe('Text')
    expect(stops[0].reference).toBeNull()
  })

  it('reads the object shape with gridSize and stops', () => {
    const { stops, gridSize } = parseStopsFile({ gridSize: { width: 400, height: 400 }, stops: [base] })
    expect(gridSize).toEqual({ width: 400, height: 400 })
    expect(stops).toHaveLength(1)
  })

  it('warns and falls back when gridSize is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseStopsFile({ gridSize: { width: 0 }, stops: [base] }).gridSize).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('keeps only http(s) sources and safe image paths in a reference', () => {
    const stop = parseStop({
      ...base,
      reference: { sources: ['https://a.org/x', 'javascript:alert(1)', 5], image: '../secret.jpg', imageIdVerified: false },
    })
    expect(stop?.reference?.sources).toEqual(['https://a.org/x'])
    expect(stop?.reference?.image).toBeNull()
    expect(stop?.reference?.imageIdVerified).toBe(false)
  })

  it('accepts only plain relative image paths', () => {
    expect(safeImagePath('content/images/stop1_sol530.jpg')).toBe('content/images/stop1_sol530.jpg')
    for (const bad of ['/content/a.jpg', 'https://x.org/a.jpg', 'content/../a.jpg', 'content/a.svg', 'javascript:a.png']) {
      expect(safeImagePath(bad)).toBeNull()
    }
  })
})
