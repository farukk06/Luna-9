import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Cell, Grid } from '../routing/types'
import { MARKER_COLORS } from '../config/routes'
import { cellToMap } from './coords'

export type MarkerKind = 'habitat' | 'target' | 'pnr'

const OUTLINE = '#111316'

function label(text: string): Text {
  return new Text({
    text,
    offsetY: 18,
    font: '600 12px system-ui, sans-serif',
    fill: new Fill({ color: '#ffffff' }),
    stroke: new Stroke({ color: OUTLINE, width: 3 }), // halo keeps it readable on any terrain
  })
}

function circleMarker(color: string, text: string): Style {
  return new Style({
    image: new Circle({ radius: 7, fill: new Fill({ color }), stroke: new Stroke({ color: OUTLINE, width: 2 }) }),
    text: label(text),
  })
}

// A red diamond, a different shape from habitat/target so it is not read as a place to go.
function pointOfNoReturnMarker(): Style {
  return new Style({
    image: new RegularShape({
      points: 4,
      radius: 9,
      angle: 0,
      fill: new Fill({ color: MARKER_COLORS.pointOfNoReturn }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
    text: label('Point of no return'),
  })
}

const STYLES: Record<MarkerKind, Style> = {
  habitat: circleMarker(MARKER_COLORS.habitat, 'Habitat'),
  target: circleMarker(MARKER_COLORS.target, 'Target'),
  pnr: pointOfNoReturnMarker(),
}

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

export interface MarkerCells {
  habitat: Cell | null
  target: Cell | null
  pointOfNoReturn: Cell | null
}

/** Replaces the markers in the source; the map itself is left untouched. */
export function updateMarkers(source: VectorSource, grid: Grid, cells: MarkerCells): void {
  const features: Feature[] = []
  // Point of no return first, so habitat/target draw over it if they coincide.
  if (cells.pointOfNoReturn) features.push(markerFeature('pnr', cells.pointOfNoReturn, grid))
  if (cells.habitat) features.push(markerFeature('habitat', cells.habitat, grid))
  if (cells.target) features.push(markerFeature('target', cells.target, grid))
  source.clear()
  source.addFeatures(features)
}
