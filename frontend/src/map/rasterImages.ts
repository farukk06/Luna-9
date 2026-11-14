import type { Grid } from '../routing/types'
import { ROUGHNESS_STOPS, colorForValue, normalizedRoughness } from './colorScale'

// Client-side raster images built from grid arrays. Pixel (x, y) = cell
// (col, row), so the top image row is grid row 0 (north up, CONTRACT 1 and 4).

/** Draws RGBA pixels on a canvas and returns a PNG data URL (browser only). */
export function pixelsToDataUrl(px: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  const image = ctx.createImageData(width, height)
  image.data.set(px)
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

/** RGBA pixels of the P95-normalised roughness layer; NoData stays transparent. */
export function roughnessPixels(grid: Grid): Uint8ClampedArray {
  const px = new Uint8ClampedArray(grid.width * grid.height * 4)
  const p95 = grid.stats.roughnessP95
  for (let i = 0; i < grid.width * grid.height; i++) {
    const r = grid.roughness[i]
    if (r === grid.nodata || grid.elevation[i] === grid.nodata) continue
    const [red, green, blue] = colorForValue(normalizedRoughness(r, p95), ROUGHNESS_STOPS)
    px.set([red, green, blue, 255], i * 4)
  }
  return px
}

export function renderRoughness(grid: Grid): string {
  return pixelsToDataUrl(roughnessPixels(grid), grid.width, grid.height)
}
