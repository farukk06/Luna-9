import { describe, expect, it } from 'vitest'
import {
  IMPASSABLE_COLOR,
  colorForValue,
  cssGradient,
  hexToRgb,
  normalizedRoughness,
  slopeAlpha,
  slopeColor,
  slopeCssGradient,
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
    expect(slopeLegendTicks(21)).toEqual([0, 5, 10, 15, 21])
    expect(slopeLegendTicks(5)).toEqual([0, 5])
    expect(slopeLegendTicks(6)).toEqual([0, 6])
  })

  it('produces a CSS gradient with the same stops as the image', () => {
    expect(cssGradient(slopeColorStops(25))).toBe(
      'linear-gradient(to right, #2b83ba 0.0%, #abdda4 40.0%, #fdae61 80.0%, #d7191c 100.0%)',
    )
  })

  it('makes gentle slopes transparent and fades in up to 10°', () => {
    expect(slopeAlpha(0, 25)).toBe(0)
    expect(slopeAlpha(3, 25)).toBe(0)
    expect(slopeAlpha(6.5, 25)).toBeCloseTo(0.5)
    expect(slopeAlpha(10, 25)).toBe(1)
    expect(slopeAlpha(20, 25)).toBe(1)
    expect(slopeAlpha(30, 25)).toBe(1) // impassable is always shown
  })

  it('gives the legend the same colours and opacity ramp', () => {
    expect(slopeCssGradient(25)).toBe(
      'linear-gradient(to right, rgba(43, 131, 186, 0.00) 0.0%, rgba(81, 158, 179, 0.00) 12.0%, ' +
        'rgba(171, 221, 164, 1.00) 40.0%, rgba(253, 174, 97, 1.00) 80.0%, rgba(215, 25, 28, 1.00) 100.0%)',
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
