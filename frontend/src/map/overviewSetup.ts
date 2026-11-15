import Projection from 'ol/proj/Projection'
import { addEquivalentProjections, addProjection, get as getProjection } from 'ol/proj'
import { buffer, type Extent } from 'ol/extent'
import { type LonLatBounds, parseLonLatBounds } from '../services/data'

// Non-component helpers for the "Where on Mars?" overview map (OverviewMap.tsx).

/** NASA Mars Trek WMTS (verified 2026-11-15: GetCapabilities and tiles send Access-Control-Allow-Origin: *). */
export const OVERVIEW_LAYER = 'Mars_Viking_MDIM21_ClrMosaic_global_232m'
export const OVERVIEW_CAPABILITIES_URL = `https://trek.nasa.gov/tiles/Mars/EQ/${OVERVIEW_LAYER}/1.0.0/WMTSCapabilities.xml`
export const OVERVIEW_MATRIX_SET = 'default028mm'
export const OVERVIEW_CREDIT =
  'Base map: Viking MDIM 2.1 colorized global mosaic – NASA/JPL/USGS (USGS Astrogeology, NASA Ames), via NASA Mars Trek'
/** Saved crop of the same layer, used when the live service is unreachable. */
export const OVERVIEW_STATIC_META_URL = '/content/overview/jezero_overview.json'
/** Live tiles must start arriving within this time, or the saved image is used. */
export const LIVE_TIMEOUT_MS = 5000

// Jezero Crater centre, commonly cited value (18.38° N, 77.58° E).
const CENTER: [number, number] = [77.58, 18.38]
// The crater is ~45 km across; a 70 km view keeps the whole rim in the low, wide box
// (at 60 km the north and east rims touched the edges in the Viking mosaic).
const VIEW_KM = 70
// 1° latitude ≈ 59.27 km on Mars (radius 3396.19 km); longitude is stretched
// by 1/cos(latitude) so the view also covers VIEW_KM east–west.
const KM_PER_DEG_LAT = 59.27
const HALF_LAT = VIEW_KM / 2 / KM_PER_DEG_LAT
const HALF_LON = HALF_LAT / Math.cos((CENTER[1] * Math.PI) / 180)

/** ~70×70 km around Jezero, [west, south, east, north] in degrees. */
export function overviewViewExtent(): Extent {
  return [CENTER[0] - HALF_LON, CENTER[1] - HALF_LAT, CENTER[0] + HALF_LON, CENTER[1] + HALF_LAT]
}

/** Panning stops one view-width beyond the default view. */
export function overviewPanExtent(): Extent {
  return buffer(overviewViewExtent(), HALF_LAT * 2)
}

// The Trek tile matrix set declares this CRS: Mars equirectangular in degrees.
// Its scale denominators assume OpenLayers' default metres-per-degree, so
// the projection keeps units 'degrees' without a Mars-specific factor.
const MARS_CRS_CODES = ['urn:ogc:def:crs:EPSG::104905', 'EPSG:104905']

/** Degree-based Mars projection, registered once so optionsFromCapabilities finds it. */
export function marsDegreeProjection(): Projection {
  const existing = getProjection(MARS_CRS_CODES[0])
  if (existing) return existing
  const projections = MARS_CRS_CODES.map(
    (code) => new Projection({ code, units: 'degrees', extent: [-180, -90, 180, 90], global: true }),
  )
  projections.forEach((p) => addProjection(p))
  addEquivalentProjections(projections)
  return projections[0]
}

/** Closed ring of a lon/lat rectangle, for a Polygon geometry. */
export function boundsRing(bounds: LonLatBounds): number[][] {
  const [w, s, e, n] = bounds
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ]
}

export interface StaticOverview {
  imageUrl: string
  bounds: LonLatBounds
}

/** Reads jezero_overview.json; the image path is relative to the JSON file. Null if invalid. */
export function parseStaticOverview(raw: unknown, metaUrl: string): StaticOverview | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { image, boundsLonLat } = raw as Record<string, unknown>
  const bounds = parseLonLatBounds(boundsLonLat)
  if (typeof image !== 'string' || !image.trim() || !bounds) return null
  const base = metaUrl.slice(0, metaUrl.lastIndexOf('/') + 1)
  return { imageUrl: base + image.trim(), bounds }
}

/**
 * Mars Trek writes tile matrix sizes as decimals ("<MatrixWidth>2.0</MatrixWidth>").
 * The OpenLayers parser only accepts integers there and would drop them,
 * leaving an empty tile range (no tile is ever requested), so "2.0" → "2".
 */
export function normalizeMatrixSizes(xml: string): string {
  return xml.replace(/<(MatrixWidth|MatrixHeight)>\s*(\d+)\.0+\s*<\/\1>/g, '<$1>$2</$1>')
}
