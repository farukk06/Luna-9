import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Style } from 'ol/style'
import { MARKER_COLORS } from '../config/routes'
import { LANDING_LABEL } from '../config/landingSite'
import type { MapPoint } from './coords'
import { LABEL_DECLUTTER_GROUP, getSymbolVersion, pillLabel, svgIcon } from './mapSymbols'

const { landingSite: GOLD, outline: OUTLINE } = MARKER_COLORS

/** Five-pointed star centred on (c, c) as an SVG points list. */
function starPoints(c: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, k) => {
    const r = k % 2 === 0 ? outer : inner
    const a = (Math.PI / 5) * k - Math.PI / 2
    return `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

// A star: a shape no planning marker uses, so it reads as a reference point, not a place to go.
export function landingStarSvg(size: number): string {
  const c = size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<polygon points="${starPoints(c, c - 1, (c - 1) * 0.45)}" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="1.3" stroke-linejoin="round"/>
</svg>`
}

const STAR_PX = 20

/** Star symbol only (the overview map labels it in its legend line instead). */
export function landingSymbolStyle(size = STAR_PX): Style {
  return new Style({ image: svgIcon(landingStarSvg(size), [size, size]) })
}

let cache: { version: number; styles: Style[] } | null = null

function styleFor(): Style[] {
  const version = getSymbolVersion()
  if (!cache || cache.version !== version) {
    // Label above the star (the demo target sits just west of it); it gives way
    // ('declutter') where it would cover planning markers or their labels.
    cache = { version, styles: [landingSymbolStyle(), pillLabel(LANDING_LABEL, -20, 'declutter')] }
  }
  return cache.styles
}

export function createLandingLayer(source: VectorSource): VectorLayer {
  return new VectorLayer({ source, style: styleFor, declutter: LABEL_DECLUTTER_GROUP })
}

export function updateLanding(source: VectorSource, point: MapPoint | null): void {
  source.clear()
  if (point) source.addFeature(new Feature({ geometry: new Point([point.x, point.y]), landing: true }))
}
