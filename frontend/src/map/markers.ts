import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle, Fill, Stroke, Style, Text } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Cell, Grid } from '../routing/types'
import { cellToMap } from './coords'

export type MarkerKind = 'habitat' | 'target'

const MARKERS: Record<MarkerKind, { color: string; label: string }> = {
  habitat: { color: '#3fae5c', label: 'Habitat' },
  target: { color: '#e8892c', label: 'Target' },
}

function markerStyle(kind: MarkerKind): Style {
  const { color, label } = MARKERS[kind]
  return new Style({
    image: new Circle({
      radius: 7,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#111316', width: 2 }),
    }),
    text: new Text({
      text: label,
      offsetY: 18,
      font: '600 12px system-ui, sans-serif',
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: '#111316', width: 3 }), // halo keeps it readable on any terrain
    }),
  })
}

const STYLES: Record<MarkerKind, Style> = { habitat: markerStyle('habitat'), target: markerStyle('target') }

function styleFor(feature: FeatureLike): Style {
  const kind = feature.get('kind') as MarkerKind
  return STYLES[kind]
}

export function createMarkerLayer(source: VectorSource): VectorLayer {
  return new VectorLayer({ source, style: styleFor })
}

function markerFeature(kind: MarkerKind, cell: Cell, grid: Grid): Feature {
  const { x, y } = cellToMap(cell, grid)
  return new Feature({ geometry: new Point([x, y]), kind })
}

/** Replaces the markers in the source; the map itself is left untouched. */
export function updateMarkers(source: VectorSource, grid: Grid, habitat: Cell | null, target: Cell | null): void {
  const features: Feature[] = []
  if (habitat) features.push(markerFeature('habitat', habitat, grid))
  if (target) features.push(markerFeature('target', target, grid))
  source.clear()
  source.addFeatures(features)
}
