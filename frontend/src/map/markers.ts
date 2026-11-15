import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle, Fill, Stroke, Style } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { Cell, Grid } from '../routing/types'
import { MARKER_COLORS } from '../config/routes'
import { cellToMap } from './coords'
import { LABEL_DECLUTTER_GROUP, getSymbolVersion, pillLabel, svgIcon } from './mapSymbols'

export type MarkerKind = 'habitat' | 'target' | 'pnr' | 'hover'

const { outline: OUTLINE, habitat: HABITAT, target: TARGET, pointOfNoReturn: PNR } = MARKER_COLORS

// Each kind has its own shape, so markers stay distinct without colour:
// ringed dome = habitat, pin = target, diamond = point of no return.
// All symbols carry a thin dark edge so they read on light and dark terrain.

const HABITAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
<circle cx="15" cy="15" r="13.5" fill="rgba(18,20,24,0.55)" stroke="${OUTLINE}" stroke-width="1"/>
<circle cx="15" cy="15" r="12" fill="none" stroke="${HABITAT}" stroke-width="2"/>
<circle cx="15" cy="15" r="8.5" fill="${HABITAT}" stroke="${OUTLINE}" stroke-width="1"/>
<path d="M9.5 18.5 A5.5 5.5 0 0 1 20.5 18.5 Z" fill="${OUTLINE}"/>
<rect x="14" y="16" width="2" height="2.5" fill="${HABITAT}"/>
</svg>`

// Pin tip at the bottom centre = the target cell.
const TARGET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
<path d="M13 32.5 C13 32.5 2.5 20.5 2.5 12.5 A10.5 10.5 0 0 1 23.5 12.5 C23.5 20.5 13 32.5 13 32.5 Z" fill="${TARGET}" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>
<circle cx="13" cy="12.5" r="4" fill="#fff" stroke="${OUTLINE}" stroke-width="1"/>
</svg>`

// A red diamond, a different shape from habitat/target so it is not read as a place to go.
const PNR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
<polygon points="12,1.5 22.5,12 12,22.5 1.5,12" fill="${PNR}" stroke="${OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>
<polygon points="12,6.5 17.5,12 12,17.5 6.5,12" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`

function buildStyles(): Record<MarkerKind, Style[]> {
  return {
    habitat: [new Style({ image: svgIcon(HABITAT_SVG, [30, 30]) }), pillLabel('Habitat', 26)],
    // zIndex lifts the pin over the habitat if they are close together.
    target: [new Style({ image: svgIcon(TARGET_SVG, [26, 34], [0.5, 1]), zIndex: 0.5 }), pillLabel('Target', 14)],
    pnr: [new Style({ image: svgIcon(PNR_SVG, [24, 24]) }), pillLabel('Point of no return', 24)],
    // Small unlabeled ring: a temporary pointer from the elevation chart, not a place.
    hover: [
      new Style({
        image: new Circle({
          radius: 6,
          declutterMode: 'obstacle',
          fill: new Fill({ color: 'rgba(18, 20, 24, 0.45)' }),
          stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
        }),
      }),
      new Style({ image: new Circle({ radius: 8, declutterMode: 'obstacle', stroke: new Stroke({ color: OUTLINE, width: 1.2 }) }) }),
    ],
  }
}

let cache: { version: number; styles: Record<MarkerKind, Style[]> } | null = null

function styleFor(feature: FeatureLike): Style[] {
  const version = getSymbolVersion()
  if (!cache || cache.version !== version) cache = { version, styles: buildStyles() }
  return cache.styles[feature.get('kind') as MarkerKind]
}

export function createMarkerLayer(source: VectorSource): VectorLayer {
  return new VectorLayer({ source, style: styleFor, declutter: LABEL_DECLUTTER_GROUP })
}

function markerFeature(kind: MarkerKind, cell: Cell, grid: Grid): Feature {
  const { x, y } = cellToMap(cell, grid)
  return new Feature({ geometry: new Point([x, y]), kind })
}

export interface MarkerCells {
  habitat: Cell | null
  target: Cell | null
  pointOfNoReturn: Cell | null
  /** Point under the pointer in the elevation chart. */
  hover: Cell | null
}

/** Replaces the markers in the source; the map itself is left untouched. */
export function updateMarkers(source: VectorSource, grid: Grid, cells: MarkerCells): void {
  const features: Feature[] = []
  // Point of no return first, so habitat/target draw over it if they coincide.
  if (cells.pointOfNoReturn) features.push(markerFeature('pnr', cells.pointOfNoReturn, grid))
  if (cells.habitat) features.push(markerFeature('habitat', cells.habitat, grid))
  if (cells.target) features.push(markerFeature('target', cells.target, grid))
  if (cells.hover) features.push(markerFeature('hover', cells.hover, grid)) // on top while hovering
  source.clear()
  source.addFeatures(features)
}
