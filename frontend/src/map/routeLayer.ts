import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Fill, RegularShape, Stroke, Style } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Coordinate } from 'ol/coordinate'
import type { Cell, Grid } from '../routing/types'
import { DIMMED_ROUTE_OPACITY, MARKER_COLORS, ROUTE_COLORS, type RouteKind, lineStyleFor, withAlpha } from '../config/routes'
import { cellToMap } from './coords'

/** One route to draw; only successful (ok: true) routes are passed in. */
export interface RouteLine {
  kind: RouteKind
  path: Cell[]
  recommended: boolean
}

// The line geometry is exactly the computed cell path (no smoothing): what is
// drawn is what the router returned. Direction arrows are separate point
// symbols placed along it.

type FocusState = 'none' | 'focused' | 'dimmed'

const CASING_RGB = '16, 18, 22'
const GLOW_ALPHA = 0.22
// Draw order inside the layer: alternatives < recommended < hovered/selected.
const Z_ALTERNATIVE = 1
const Z_RECOMMENDED = 2
const Z_FOCUSED = 3

function focusState(kind: RouteKind, focus: RouteKind | null): FocusState {
  if (focus === null) return 'none'
  return focus === kind ? 'focused' : 'dimmed'
}

/** Glow (recommended only) → dark casing → coloured line, all with round caps and joins. */
function lineStyles(kind: RouteKind, recommended: boolean, state: FocusState): Style[] {
  const spec = lineStyleFor(recommended)
  const fade = state === 'dimmed' ? DIMMED_ROUTE_OPACITY : 1
  // A hovered/selected alternative is shown fully opaque and a little thicker.
  const opacity = state === 'focused' ? 1 : spec.opacity * fade
  const extra = state === 'focused' && !recommended ? 1 : 0
  const zIndex = state === 'focused' ? Z_FOCUSED : recommended ? Z_RECOMMENDED : Z_ALTERNATIVE
  const stroke = (color: string, width: number, lineDash?: number[]) =>
    new Style({ stroke: new Stroke({ color, width, lineCap: 'round', lineJoin: 'round', lineDash }), zIndex })
  const styles: Style[] = []
  if (spec.glowWidth > 0) styles.push(stroke(withAlpha(ROUTE_COLORS[kind], GLOW_ALPHA * fade), spec.glowWidth))
  styles.push(stroke(`rgba(${CASING_RGB}, ${spec.casingOpacity * fade})`, spec.casingWidth + extra))
  styles.push(stroke(withAlpha(ROUTE_COLORS[kind], opacity), spec.width + extra, spec.dash.length ? spec.dash : undefined))
  return styles
}

// --- Direction arrows (recommended route, habitat → target) ---------------

const ARROW_SPACING_PX = 120
// Arrows keep clear of the habitat and target symbols at the route ends.
const ARROW_END_CLEARANCE_PX = 34
// Direction is read over this distance on each side, so the zigzag of the
// 8-connected cell path does not make the arrows wobble.
const ARROW_DIRECTION_SPAN_PX = 14

function cumulativeLengths(coords: Coordinate[]): number[] {
  const lengths = [0]
  for (let k = 1; k < coords.length; k++) {
    lengths.push(lengths[k - 1] + Math.hypot(coords[k][0] - coords[k - 1][0], coords[k][1] - coords[k - 1][1]))
  }
  return lengths
}

function pointAt(coords: Coordinate[], lengths: number[], distance: number): Coordinate {
  const d = Math.min(Math.max(distance, 0), lengths[lengths.length - 1])
  let k = 1
  while (k < lengths.length - 1 && lengths[k] < d) k++
  const span = lengths[k] - lengths[k - 1] || 1
  const t = (d - lengths[k - 1]) / span
  return [coords[k - 1][0] + (coords[k][0] - coords[k - 1][0]) * t, coords[k - 1][1] + (coords[k][1] - coords[k - 1][1]) * t]
}

/** Arrow positions and clockwise-from-north rotations along the line at this resolution. */
export function arrowPlacements(coords: Coordinate[], resolution: number): { at: Coordinate; rotation: number }[] {
  if (coords.length < 2) return []
  const lengths = cumulativeLengths(coords)
  const total = lengths[lengths.length - 1]
  const spacing = ARROW_SPACING_PX * resolution
  const clearance = ARROW_END_CLEARANCE_PX * resolution
  const usable = total - 2 * clearance
  if (usable <= 0) return []
  // Evenly spread over the usable stretch; one arrow in the middle if it is short.
  const count = Math.max(1, Math.floor(usable / spacing))
  const step = usable / count
  const half = ARROW_DIRECTION_SPAN_PX * resolution
  return Array.from({ length: count }, (_, k) => {
    const d = clearance + step * (k + 0.5)
    const [x0, y0] = pointAt(coords, lengths, d - half)
    const [x1, y1] = pointAt(coords, lengths, d + half)
    return { at: pointAt(coords, lengths, d), rotation: Math.atan2(x1 - x0, y1 - y0) }
  })
}

function arrowStyle(at: Coordinate, rotation: number, fade: number): Style {
  return new Style({
    geometry: new Point(at),
    // White head with a dark edge: reads on the coloured line and on the casing.
    image: new RegularShape({
      points: 3,
      radius: 6,
      rotation,
      rotateWithView: true,
      fill: new Fill({ color: withAlpha('#ffffff', fade) }),
      stroke: new Stroke({ color: withAlpha(MARKER_COLORS.outline, 0.9 * fade), width: 1.5, lineJoin: 'round' }),
    }),
    zIndex: Z_FOCUSED + 1,
  })
}

// --- Layer -------------------------------------------------------------------

const LINE_CACHE = new Map<string, Style[]>()

function cachedLineStyles(kind: RouteKind, recommended: boolean, state: FocusState): Style[] {
  const key = `${kind}:${recommended}:${state}`
  let styles = LINE_CACHE.get(key)
  if (!styles) {
    styles = lineStyles(kind, recommended, state)
    LINE_CACHE.set(key, styles)
  }
  return styles
}

interface ArrowCacheEntry {
  resolution: number
  state: FocusState
  styles: Style[]
}

export interface RouteLayerHandle {
  layer: VectorLayer
  /** Highlights one route and fades the others; null shows all routes normally. */
  setFocus: (kind: RouteKind | null) => void
}

export function createRouteLayer(source: VectorSource): RouteLayerHandle {
  let focus: RouteKind | null = null
  const arrowCache = new WeakMap<FeatureLike, ArrowCacheEntry>()

  const arrowsFor = (feature: FeatureLike, state: FocusState, resolution: number): Style[] => {
    const cached = arrowCache.get(feature)
    if (cached && cached.resolution === resolution && cached.state === state) return cached.styles
    const geometry = feature.getGeometry()
    const coords = geometry instanceof LineString ? geometry.getCoordinates() : []
    const fade = state === 'dimmed' ? DIMMED_ROUTE_OPACITY : 1
    const styles = arrowPlacements(coords, resolution).map((a) => arrowStyle(a.at, a.rotation, fade))
    arrowCache.set(feature, { resolution, state, styles })
    return styles
  }

  const style = (feature: FeatureLike, resolution: number): Style[] => {
    const kind = feature.get('kind') as RouteKind
    const recommended = feature.get('recommended') === true
    const state = focusState(kind, focus)
    const lines = cachedLineStyles(kind, recommended, state)
    return recommended ? [...lines, ...arrowsFor(feature, state, resolution)] : lines
  }

  const layer = new VectorLayer({ source, style })
  return {
    layer,
    setFocus: (kind) => {
      if (kind === focus) return
      focus = kind
      layer.changed() // restyle without touching the features
    },
  }
}

/** Replaces the drawn routes with exactly the computed cell paths. */
export function updateRoutes(source: VectorSource, grid: Grid, routes: RouteLine[]): void {
  const features = routes
    .filter((r) => r.path.length >= 2)
    .map((r) => {
      const coords = r.path.map((cell) => {
        const { x, y } = cellToMap(cell, grid)
        return [x, y]
      })
      return new Feature({ geometry: new LineString(coords), kind: r.kind, recommended: r.recommended })
    })
  source.clear()
  source.addFeatures(features)
}
