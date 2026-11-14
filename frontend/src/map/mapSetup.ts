import View from 'ol/View'
import Projection from 'ol/proj/Projection'
import { buffer, getHeight, getWidth, type Extent } from 'ol/extent'
import type { Grid } from '../routing/types'
import { cellIndex, isPassableCell, mapToCell } from './coords'
import { formatNumber } from './format'

// Non-component helpers for MapView, kept in their own file so React Fast
// Refresh can hot-reload MapView.tsx (it only works for component-only files).

export const READOUT_HINT = 'Move the pointer over the map'

/** Text for the pointer readout box at map coordinate (x, y). */
export function readoutText(x: number, y: number, grid: Grid): string {
  const cell = mapToCell(x, y, grid)
  if (!cell) return 'outside study area'
  const head = `x ${formatNumber(x, 0)} m, y ${formatNumber(y, 0)} m · cell (${cell.col}, ${cell.row})`
  if (!isPassableCell(cell, grid)) return `${head} · no data`
  const i = cellIndex(cell, grid)
  return `${head} · elev ${formatNumber(grid.elevation[i], 1)} m · slope ${formatNumber(grid.slope[i], 1)}°`
}

/** Map extent in local metres (CONTRACT Section 1): [0, 0, W, H]. */
export function gridExtent(grid: Grid): Extent {
  return [0, 0, grid.width * grid.cellSize, grid.height * grid.cellSize]
}

/**
 * Local flat metric projection. No transform to EPSG:4326 is ever registered,
 * and the point resolution is fixed to 1 unit = 1 m, so OpenLayers never
 * treats these coordinates as positions on Earth (the scale bar stays exact).
 * The object is passed directly instead of being registered by code, so a
 * grid with a different size never collides with an older definition.
 */
export function createLocalProjection(extent: Extent): Projection {
  return new Projection({
    code: 'LUNA9-LOCAL',
    units: 'm',
    extent,
    getPointResolution: (resolution: number) => resolution,
  })
}

export function createView(grid: Grid, projection: Projection, extent: Extent): View {
  const maxSide = Math.max(getWidth(extent), getHeight(extent))
  return new View({
    projection,
    // Panning is limited to the work area plus a 20 % margin.
    extent: buffer(extent, maxSide * 0.2),
    showFullExtent: true,
    // Zoom out: whole area in ~200 px. Zoom in: one cell ≈ 8 screen px.
    maxResolution: maxSide / 200,
    minResolution: grid.cellSize / 8,
  })
}
