import Icon from 'ol/style/Icon'
import Style, { type DeclutterMode } from 'ol/style/Style'

// Shared drawing helpers for map labels and SVG marker icons.

const LABEL_FONT_SIZE = 11
const LABEL_FONT = `600 ${LABEL_FONT_SIZE}px Inter, system-ui, sans-serif`
const LABEL_PAD_X = 7
const LABEL_HEIGHT = 19

const labelCache = new Map<string, HTMLCanvasElement>()
// Bumped when cached labels are dropped, so style caches keyed by it rebuild.
let symbolVersion = 0

export const getSymbolVersion = (): number => symbolVersion

/**
 * Text on a dark, semi-transparent rounded "pill". OpenLayers text
 * backgrounds are square, so the pill is drawn once on a canvas (at the
 * device pixel ratio, for sharp text) and used as an icon.
 */
function pillCanvas(text: string): HTMLCanvasElement {
  const cached = labelCache.get(text)
  if (cached) return cached
  const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1))
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.font = LABEL_FONT
  const width = Math.ceil(ctx.measureText(text).width) + LABEL_PAD_X * 2
  canvas.width = width * ratio
  canvas.height = LABEL_HEIGHT * ratio
  ctx.scale(ratio, ratio)
  ctx.beginPath()
  ctx.roundRect(0.5, 0.5, width - 1, LABEL_HEIGHT - 1, (LABEL_HEIGHT - 1) / 2)
  ctx.fillStyle = 'rgba(14, 16, 20, 0.78)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = LABEL_FONT // resetting the size clears the context state
  ctx.fillStyle = '#f1f2f4'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, width / 2, LABEL_HEIGHT / 2 + 0.5)
  labelCache.set(text, canvas)
  return canvas
}

/** Shared declutter group of the marker and stop layers (see pillLabel). */
export const LABEL_DECLUTTER_GROUP = 'map-labels'

/**
 * Label style placed `offsetY` CSS pixels below (positive) or above
 * (negative) the feature point. 'obstacle' labels always show; 'declutter'
 * labels (science stops) hide where they would overlap another symbol.
 */
export function pillLabel(text: string, offsetY: number, declutterMode: DeclutterMode = 'obstacle'): Style {
  const canvas = pillCanvas(text)
  const ratio = canvas.height / LABEL_HEIGHT || 1
  return new Style({
    image: new Icon({ img: canvas, scale: 1 / ratio, displacement: [0, -offsetY], declutterMode }),
    zIndex: 1, // labels above every marker symbol
  })
}

/** Labels drawn before the Inter font loaded used the fallback: redraw them. */
export function clearLabelCache(): void {
  labelCache.clear()
  symbolVersion++
}

/** OpenLayers icon from an SVG string (crisp at any pixel ratio). */
export function svgIcon(svg: string, size: [number, number], anchor: [number, number] = [0.5, 0.5]): Icon {
  return new Icon({
    src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: size[0],
    height: size[1],
    anchor,
    declutterMode: 'obstacle', // symbols always show and push stop labels aside
  })
}
