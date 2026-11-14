import { describe, expect, it } from 'vitest'
import {
  IMPASSABLE_COLOR,
  colorForValue,
  cssGradient,
  hexToRgb,
  normalizedRoughness,
  slopeColor,
  slopeColorStops,
  slopeLegendTicks,
} from './colorScale'

describe('slope colour scale', () => {
  it('uses the CONTRACT palette from 0° to the slope limit', () => {
    expect(slopeColorStops(25).map((s) => s.value)).toEqual([0, 10, 20, 25])
    expect(slopeColor(0, 25)).toEqual(hexToRgb('#2b83ba'))
    expect(slopeColor(25, 25)).toEqual(hexToRgb('#d7191c'))
  })

  it('marks slopes above the limit as impassable', () => {
    expect(slopeColor(25.1, 25)).toEqual(hexToRgb(IMPASSABLE_COLOR))
  })

  it('builds legend ticks every 5° up to the limit', () => {
    expect(slopeLegendTicks(25)).toEqual([0, 5, 10, 15, 20, 25])
    expect(slopeLegendTicks(22)).toEqual([0, 5, 10, 15, 20, 22])
  })

  it('produces a CSS gradient with the same stops as the image', () => {
    expect(cssGradient(slopeColorStops(25))).toBe(
      'linear-gradient(to right, #2b83ba 0.0%, #abdda4 40.0%, #fdae61 80.0%, #d7191c 100.0%)',
    )
  })

  it('clamps values outside the stop range', () => {
    const stops = [
      { value: 0, color: '#2b83ba' },
      { value: 30, color: '#d7191c' },
    ]
    expect(colorForValue(-5, stops)).toEqual([43, 131, 186])
    expect(colorForValue(45, stops)).toEqual([215, 25, 28])
  })
})

describe('normalizedRoughness', () => {
  it('normalises by P95 and clamps to 0–1', () => {
    expect(normalizedRoughness(0.9, 1.8)).toBe(0.5)
    expect(normalizedRoughness(5, 1.8)).toBe(1)
  })

  it('maps everything to 0 on flat terrain (P95 ≤ 0.001)', () => {
    expect(normalizedRoughness(0.5, 0)).toBe(0)
  })
})
