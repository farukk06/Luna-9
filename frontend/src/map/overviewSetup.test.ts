import { describe, expect, it } from 'vitest'
import { boundsRing, normalizeMatrixSizes, overviewViewExtent, parseStaticOverview } from './overviewSetup'

describe('overview helpers', () => {
  it('view is ~70 km tall, holds the whole ~45 km crater and contains the study area', () => {
    const [w, s, e, n] = overviewViewExtent()
    expect((n - s) * 59.27).toBeGreaterThan(68)
    expect((n - s) * 59.27).toBeLessThan(72)
    // Crater rim: 22.5 km from the centre (18.38° N, 77.58° E)
    expect(n - 18.38).toBeGreaterThan(22.5 / 59.27)
    expect(18.38 - s).toBeGreaterThan(22.5 / 59.27)
    expect(e - 77.58).toBeGreaterThan(22.5 / (59.27 * Math.cos((18.38 * Math.PI) / 180)))
    expect(77.58 - w).toBeGreaterThan(22.5 / (59.27 * Math.cos((18.38 * Math.PI) / 180)))
    // Real grid.json boundsLonLat
    expect(w).toBeLessThan(77.426)
    expect(e).toBeGreaterThan(77.46)
    expect(s).toBeLessThan(18.415)
    expect(n).toBeGreaterThan(18.449)
  })

  it('builds a closed rectangle ring', () => {
    const ring = boundsRing([1, 2, 3, 4])
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
  })

  it('reads the static image metadata relative to its JSON file', () => {
    const meta = { image: 'a.jpg', boundsLonLat: [77, 17.9, 78.1, 18.9] }
    expect(parseStaticOverview(meta, '/content/overview/m.json')).toEqual({
      imageUrl: '/content/overview/a.jpg',
      bounds: [77, 17.9, 78.1, 18.9],
    })
    expect(parseStaticOverview({ image: 'a.jpg' }, '/x.json')).toBeNull()
    expect(parseStaticOverview(null, '/x.json')).toBeNull()
  })
})

describe('normalizeMatrixSizes', () => {
  it('turns Mars Trek decimal matrix sizes into integers and leaves the rest alone', () => {
    const xml = '<MatrixWidth>256.0</MatrixWidth><MatrixHeight>128.0</MatrixHeight><ScaleDenominator>2.1E+06</ScaleDenominator><MatrixWidth>3</MatrixWidth>'
    expect(normalizeMatrixSizes(xml)).toBe(
      '<MatrixWidth>256</MatrixWidth><MatrixHeight>128</MatrixHeight><ScaleDenominator>2.1E+06</ScaleDenominator><MatrixWidth>3</MatrixWidth>',
    )
  })
})
