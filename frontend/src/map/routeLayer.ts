import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Stroke, Style } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Cell, Grid } from '../routing/types'
import { ROUTE_COLORS, type RouteKind } from '../config/routes'
import { cellToMap } from './coords'

/** One route to draw; only successful (ok: true) routes are passed in. */
export interface RouteLine {
  kind: RouteKind
  path: Cell[]
  recommended: boolean
}

// Recommended: thick, solid, with a dark casing so it stands out on any terrain.
// Others: thin and dashed, clearly secondary.
function routeStyles(kind: RouteKind, recommended: boolean): Style[] {
  const color = ROUTE_COLORS[kind]
  if (recommended) {
    return [
      new Style({ stroke: new Stroke({ color: 'rgba(10, 12, 14, 0.85)', width: 8 }) }),
      new Style({ stroke: new Stroke({ color, width: 5 }) }),
    ]
  }
  return [new Style({ stroke: new Stroke({ color, width: 2.5, lineDash: [8, 6] }) })]
}

const STYLE_CACHE = new Map<string, Style[]>()

function styleFor(feature: FeatureLike): Style[] {
  const kind = feature.get('kind') as RouteKind
  const recommended = feature.get('recommended') === true
  const key = `${kind}:${recommended}`
  let styles = STYLE_CACHE.get(key)
  if (!styles) {
    styles = routeStyles(kind, recommended)
    STYLE_CACHE.set(key, styles)
  }
  return styles
}

export function createRouteLayer(source: VectorSource): VectorLayer {
  return new VectorLayer({ source, style: styleFor })
}

/** Replaces the drawn routes; the recommended route is added last so it renders on top. */
export function updateRoutes(source: VectorSource, grid: Grid, routes: RouteLine[]): void {
  const ordered = [...routes].sort((a, b) => Number(a.recommended) - Number(b.recommended))
  const features = ordered
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
