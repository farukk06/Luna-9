// Single source of truth for raster colour scales. Both the generated map
// images and the legends in the Layers panel read these definitions.

export interface ColorStop {
  value: number
  color: string // "#rrggbb"
}

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Linear interpolation between stops; values beyond the ends are clamped. */
export function colorForValue(value: number, stops: ColorStop[]): Rgb {
  if (value <= stops[0].value) return hexToRgb(stops[0].color)
  for (let k = 1; k < stops.length; k++) {
    if (value <= stops[k].value) {
      const t = (value - stops[k - 1].value) / (stops[k].value - stops[k - 1].value)
      const a = hexToRgb(stops[k - 1].color)
      const b = hexToRgb(stops[k].color)
      return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)) as Rgb
    }
  }
  return hexToRgb(stops[stops.length - 1].color)
}

/** CSS linear-gradient that matches colorForValue over the stops' range. */
export function cssGradient(stops: ColorStop[]): string {
  const min = stops[0].value
  const span = stops[stops.length - 1].value - min || 1
  const parts = stops.map((s) => `${s.color} ${(((s.value - min) / span) * 100).toFixed(1)}%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}

// --- Slope -----------------------------------------------------------------

// Palette from the CONTRACT Section 5 example, stretched so the red end sits
// exactly at the routing slope limit; anything steeper gets its own colour.
const SLOPE_PALETTE: [fraction: number, color: string][] = [
  [0, '#2b83ba'],
  [0.4, '#abdda4'],
  [0.8, '#fdae61'],
  [1, '#d7191c'],
]

/** Cells steeper than maxSlopeDeg cannot be crossed by any route. */
export const IMPASSABLE_COLOR = '#7a1f8f'

export function slopeColorStops(maxSlopeDeg: number): ColorStop[] {
  return SLOPE_PALETTE.map(([f, color]) => ({ value: f * maxSlopeDeg, color }))
}

export function slopeColor(slopeDeg: number, maxSlopeDeg: number): Rgb {
  if (slopeDeg > maxSlopeDeg) return hexToRgb(IMPASSABLE_COLOR)
  return colorForValue(slopeDeg, slopeColorStops(maxSlopeDeg))
}

// Opacity by slope, so gentle terrain does not paint the whole photo: most of
// the real area is below 5°. The colours themselves stay the same.
/** At or below this slope a cell is fully transparent. */
export const SLOPE_TRANSPARENT_MAX_DEG = 3
/** From this slope up a cell is fully opaque (in between: linear ramp). */
export const SLOPE_OPAQUE_FROM_DEG = 10

/** 0–1 alpha of a slope cell; impassable cells are always fully opaque. */
export function slopeAlpha(slopeDeg: number, maxSlopeDeg: number): number {
  if (slopeDeg > maxSlopeDeg) return 1
  const t = (slopeDeg - SLOPE_TRANSPARENT_MAX_DEG) / (SLOPE_OPAQUE_FROM_DEG - SLOPE_TRANSPARENT_MAX_DEG)
  return Math.min(Math.max(t, 0), 1)
}

/** CSS gradient of the slope legend, with the same colours and opacity ramp as the map image. */
export function slopeCssGradient(maxSlopeDeg: number): string {
  const values = [
    ...new Set([...slopeColorStops(maxSlopeDeg).map((s) => s.value), SLOPE_TRANSPARENT_MAX_DEG, SLOPE_OPAQUE_FROM_DEG]),
  ]
    .filter((v) => v >= 0 && v <= maxSlopeDeg)
    .sort((x, y) => x - y)
  const parts = values.map((v) => {
    const [r, g, b] = slopeColor(v, maxSlopeDeg)
    return `rgba(${r}, ${g}, ${b}, ${slopeAlpha(v, maxSlopeDeg).toFixed(2)}) ${((v / maxSlopeDeg) * 100).toFixed(1)}%`
  })
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** Legend tick values: 0, 5, 10 … up to the slope limit. */
export function slopeLegendTicks(maxSlopeDeg: number, step = 5): number[] {
  const ticks: number[] = []
  for (let v = 0; v < maxSlopeDeg; v += step) ticks.push(v)
  ticks.push(maxSlopeDeg)
  return ticks
}

// --- Roughness -------------------------------------------------------------

// Roughness is shown relative to the grid's own 95th percentile (0 = smooth,
// 1 = P95 or rougher), the same normalisation the routing cost uses.
export const ROUGHNESS_STOPS: ColorStop[] = [
  { value: 0, color: '#f7f4c3' },
  { value: 0.5, color: '#e8a33d' },
  { value: 1, color: '#8e2a1d' },
]

/** 0–1; P95 ≤ 0.001 (flat terrain) maps everything to 0, as in CONTRACT Section 9. */
export function normalizedRoughness(roughness: number, p95: number): number {
  if (p95 <= 0.001) return 0
  return Math.min(Math.max(roughness / p95, 0), 1)
}
