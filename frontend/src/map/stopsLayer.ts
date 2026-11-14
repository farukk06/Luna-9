import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Fill, RegularShape, Stroke, Style, Text } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Grid } from '../routing/types'
import type { Stop } from '../services/stops'
import { MARKER_COLORS } from '../config/routes'
import { cellToMap } from './coords'

// White hexagon: a different shape from habitat/target (circles) and the
// point of no return (diamond), so a stop is never mistaken for either.
function stopStyle(name: string): Style {
  return new Style({
    image: new RegularShape({
      points: 6,
      radius: 7,
      fill: new Fill({ color: MARKER_COLORS.scienceStop }),
      stroke: new Stroke({ color: '#111316', width: 2 }),
    }),
    text: new Text({
      text: name,
      offsetY: -16,
      font: '600 11px system-ui, sans-serif',
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: '#111316', width: 3 }),
    }),
  })
}

function styleFor(feature: FeatureLike): Style {
  return stopStyle(String(feature.get('name')))
}

export function createStopsLayer(source: VectorSource, visible: boolean): VectorLayer {
  return new VectorLayer({ source, style: styleFor, visible })
}

export function updateStops(source: VectorSource, grid: Grid, stops: Stop[]): void {
  const features = stops.map((stop) => {
    const { x, y } = cellToMap({ col: stop.col, row: stop.row }, grid)
    return new Feature({ geometry: new Point([x, y]), stopId: stop.id, name: stop.name })
  })
  source.clear()
  source.addFeatures(features)
}
