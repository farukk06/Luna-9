// Display settings for the three alternative routes (CONTRACT Section 9).
// Single source for route colours and line styles: the map layer, the legend,
// the route cards and the elevation chart all read from here.
export type RouteKind = 'shortest' | 'safest' | 'balanced'

export const ROUTE_KINDS: readonly RouteKind[] = ['shortest', 'safest', 'balanced']

export const ROUTE_LABELS: Record<RouteKind, string> = {
  shortest: 'Shortest',
  safest: 'Safest',
  balanced: 'Balanced',
}

// Hues picked to stay clear of the slope scale (blue → green → yellow → red,
// purple = impassable) and the orange UI accent, and bright enough to read on
// the grey HiRISE photo. Contrast against the dark casing (#16181c):
// magenta 6.6:1, cyan 11.7:1, lime 14.7:1; smallest CIELAB distance to any
// slope colour is ≥ 40 (magenta vs. impassable purple).
export const ROUTE_COLORS: Record<RouteKind, string> = {
  shortest: '#ff5cdb', // magenta
  safest: '#2ee6ff', // cyan
  balanced: '#b6ff3b', // lime
}

/** Line style of a drawn route; widths are in CSS pixels. */
export interface RouteLineStyle {
  width: number
  /** Dark outline drawn under the coloured line, so it reads on any terrain. */
  casingWidth: number
  casingOpacity: number
  /** Opacity of the coloured line itself. */
  opacity: number
  /** Empty = solid. */
  dash: number[]
  /** Soft halo in the route colour under the casing; 0 = none. */
  glowWidth: number
}

/** Recommended route: thick, solid, slight glow, drawn on top. */
export const RECOMMENDED_LINE: RouteLineStyle = {
  width: 5,
  casingWidth: 9,
  casingOpacity: 0.6,
  opacity: 1,
  dash: [],
  glowWidth: 16,
}

/** Alternatives: thin, dashed, slightly see-through. */
export const ALTERNATIVE_LINE: RouteLineStyle = {
  width: 2.5,
  casingWidth: 5.5,
  casingOpacity: 0.6,
  opacity: 0.7,
  dash: [8, 7],
  glowWidth: 0,
}

/** Other routes fade to this opacity while one route is hovered or selected. */
export const DIMMED_ROUTE_OPACITY = 0.22

export const lineStyleFor = (recommended: boolean): RouteLineStyle => (recommended ? RECOMMENDED_LINE : ALTERNATIVE_LINE)

/** "#rrggbb" + alpha → "rgba(r, g, b, a)" (OpenLayers and inline SVG strokes). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Map marker colours, shared by the map layer and the legend. */
export const MARKER_COLORS = {
  habitat: '#3fcf6e',
  target: '#f07b2f',
  pointOfNoReturn: '#ff3b47',
  scienceStop: '#f4f5f7',
  landingSite: '#ffd34d',
  outline: '#121418',
} as const
