import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Style } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Grid } from '../routing/types'
import type { Stop } from '../services/stops'
import { MARKER_COLORS } from '../config/routes'
import { cellToMap } from './coords'
import { LABEL_DECLUTTER_GROUP, getSymbolVersion, pillLabel, svgIcon } from './mapSymbols'

/** Pointy-top hexagon around (c, c) as an SVG points list. */
function hexagonPoints(c: number, r: number): string {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2
    return `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

// Ringed hexagon: a different shape from habitat (dome), target (pin) and the
// point of no return (diamond), so a stop is never mistaken for either.
const { scienceStop: LIGHT, outline: OUTLINE } = MARKER_COLORS
const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
<polygon points="${hexagonPoints(12, 11)}" fill="rgba(18,20,24,0.7)" stroke="${OUTLINE}" stroke-width="1"/>
<polygon points="${hexagonPoints(12, 9)}" fill="none" stroke="${LIGHT}" stroke-width="2" stroke-linejoin="round"/>
<polygon points="${hexagonPoints(12, 4)}" fill="${LIGHT}"/>
</svg>`

let cache: { version: number; symbol: Style; labels: Map<string, Style> } | null = null

function styleFor(feature: FeatureLike): Style[] {
  const version = getSymbolVersion()
  if (!cache || cache.version !== version) {
    cache = { version, symbol: new Style({ image: svgIcon(STOP_SVG, [24, 24]) }), labels: new Map() }
  }
  const name = String(feature.get('name'))
  let label = cache.labels.get(name)
  if (!label) {
    label = pillLabel(name, -22, 'declutter') // above the symbol; hidden where it would cover a marker
    cache.labels.set(name, label)
  }
  return [cache.symbol, label]
}

export function createStopsLayer(source: VectorSource, visible: boolean): VectorLayer {
  return new VectorLayer({ source, style: styleFor, visible, declutter: LABEL_DECLUTTER_GROUP })
}

export function updateStops(source: VectorSource, grid: Grid, stops: Stop[]): void {
  const features = stops.map((stop) => {
    const { x, y } = cellToMap({ col: stop.col, row: stop.row }, grid)
    return new Feature({ geometry: new Point([x, y]), stopId: stop.id, name: stop.name })
  })
  source.clear()
  source.addFeatures(features)
}
