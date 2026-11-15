import type { Grid } from '../routing/types'
import type { LonLatBounds } from '../services/data'
import type { MapPoint } from './coords'

// grid.json source.boundsLonLat is approximate (CONTRACT Section 3), so these
// conversions are for showing context (landing site, overview), never routing.

/**
 * Lon/lat → local map metres by linear interpolation inside the bounds.
 * The source DEM is equirectangular (standard parallel 0°), so degrees map
 * linearly to metres. Null outside the bounds.
 */
export function lonLatToMap(lon: number, lat: number, bounds: LonLatBounds, grid: Grid): MapPoint | null {
  const [west, south, east, north] = bounds
  if (lon < west || lon > east || lat < south || lat > north) return null
  return {
    x: ((lon - west) / (east - west)) * grid.width * grid.cellSize,
    y: ((lat - south) / (north - south)) * grid.height * grid.cellSize,
  }
}
