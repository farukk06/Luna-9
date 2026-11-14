import { useCallback, useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import ImageLayer from 'ol/layer/Image'
import ImageStatic from 'ol/source/ImageStatic'
import Projection from 'ol/proj/Projection'
import ScaleLine from 'ol/control/ScaleLine'
import { defaults as defaultControls } from 'ol/control/defaults'
import { buffer, getHeight, getWidth, type Extent } from 'ol/extent'
import 'ol/ol.css'
import VectorSource from 'ol/source/Vector'
import type { Cell, Grid } from '../routing/types'
import { passabilityIssue } from './cells'
import { cellIndex, isPassableCell, mapToCell } from './coords'
import { formatNumber } from './format'
import { createMarkerLayer, updateMarkers } from './markers'

const READOUT_HINT = 'Move the pointer over the map'

/** Text for the pointer readout box at map coordinate (x, y). */
export function readoutText(x: number, y: number, grid: Grid): string {
  const cell = mapToCell(x, y, grid)
  if (!cell) return 'outside study area'
  const head = `x ${formatNumber(x, 0)} m, y ${formatNumber(y, 0)} m · cell (${cell.col}, ${cell.row})`
  if (!isPassableCell(cell, grid)) return `${head} · no data`
  const i = cellIndex(cell, grid)
  return `${head} · elev ${formatNumber(grid.elevation[i], 1)} m · slope ${formatNumber(grid.slope[i], 1)}°`
}

interface MapViewProps {
  grid: Grid
  orthoUrl: string
  slopeUrl: string
  slopeVisible: boolean
  /** 0–1 */
  slopeOpacity: number
  habitat: Cell | null
  target: Cell | null
  maxSlopeDeg: number
  /** Called only for passable cells inside the study area. */
  onCellClick: (cell: Cell) => void
  /** Optional instruction shown on top of the map, e.g. while placing the habitat. */
  hint?: string
}

const NOTICE_MS = 2500

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
function createLocalProjection(extent: Extent): Projection {
  return new Projection({
    code: 'LUNA9-LOCAL',
    units: 'm',
    extent,
    getPointResolution: (resolution: number) => resolution,
  })
}

function createView(grid: Grid, projection: Projection, extent: Extent): View {
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

function MapView(props: MapViewProps) {
  const { grid, orthoUrl, slopeUrl, slopeVisible, slopeOpacity, habitat, target, maxSlopeDeg, onCellClick, hint } =
    props
  const targetRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const slopeLayerRef = useRef<ImageLayer<ImageStatic> | null>(null)
  // Initial layer state for a freshly built map; later changes go through setVisible/setOpacity.
  const slopeStateRef = useRef({ visible: slopeVisible, opacity: slopeOpacity })
  const readoutRef = useRef<HTMLDivElement>(null)
  // One marker source for the component's lifetime; marker changes only touch it.
  const [markerSource] = useState(() => new VectorSource())
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  // The click handler is registered once per map, so it reads the latest
  // callback and slope limit through refs instead of recreating the map.
  const onCellClickRef = useRef(onCellClick)
  const maxSlopeRef = useRef(maxSlopeDeg)
  useEffect(() => {
    onCellClickRef.current = onCellClick
    maxSlopeRef.current = maxSlopeDeg
    slopeStateRef.current = { visible: slopeVisible, opacity: slopeOpacity }
  })

  const showNotice = useCallback((text: string) => {
    window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    updateMarkers(markerSource, grid, habitat, target)
  }, [markerSource, grid, habitat, target])

  // Visibility/opacity changes only touch the layer: view (zoom, pan) and markers stay as they are.
  useEffect(() => {
    slopeLayerRef.current?.setVisible(slopeVisible)
    slopeLayerRef.current?.setOpacity(slopeOpacity)
  }, [slopeVisible, slopeOpacity])

  useEffect(() => {
    if (!targetRef.current) return
    const extent = gridExtent(grid)
    const projection = createLocalProjection(extent)
    const ortho = new ImageLayer({
      source: new ImageStatic({ url: orthoUrl, projection, imageExtent: extent }),
    })
    // Same imageExtent as the base image, so slope pixels sit exactly on their cells.
    const slope = new ImageLayer({
      source: new ImageStatic({ url: slopeUrl, projection, imageExtent: extent }),
      visible: slopeStateRef.current.visible,
      opacity: slopeStateRef.current.opacity,
    })
    slopeLayerRef.current = slope
    const map = new Map({
      target: targetRef.current,
      // Draw order, bottom to top: base image → slope overlay → habitat/target markers.
      layers: [ortho, slope, createMarkerLayer(markerSource)],
      view: createView(grid, projection, extent),
      controls: defaultControls({ attribution: false }).extend([new ScaleLine({ units: 'metric' })]),
    })
    map.getView().fit(extent, { size: map.getSize(), padding: [24, 24, 24, 24] })
    mapRef.current = map

    // The readout is written straight to the DOM: pointermove fires many times
    // per second and does not need to re-render the React tree.
    const setReadout = (text: string) => {
      if (readoutRef.current) readoutRef.current.textContent = text
    }
    map.on('pointermove', (event) => {
      if (event.dragging) return
      const [x, y] = event.coordinate
      setReadout(readoutText(x, y, grid))
    })
    const element = targetRef.current
    const resetReadout = () => setReadout(READOUT_HINT)
    element.addEventListener('pointerleave', resetReadout)

    map.on('singleclick', (event) => {
      const [x, y] = event.coordinate
      const cell = mapToCell(x, y, grid)
      if (!cell) return // outside the study area: ignore silently
      const issue = passabilityIssue(cell, grid, maxSlopeRef.current)
      if (issue) showNotice(issue)
      else onCellClickRef.current(cell)
    })

    // StrictMode mounts effects twice in development: detach and dispose the
    // first map so only one canvas ever lives inside the target element.
    return () => {
      element.removeEventListener('pointerleave', resetReadout)
      map.setTarget(undefined)
      map.dispose()
      mapRef.current = null
      slopeLayerRef.current = null
    }
  }, [grid, orthoUrl, slopeUrl, markerSource, showNotice])

  return (
    <div className="map-view">
      <div ref={targetRef} className="map-canvas" />
      {hint && <div className="map-hint">{hint}</div>}
      {notice && (
        <div className="map-notice" role="alert">
          {notice}
        </div>
      )}
      <div ref={readoutRef} className="map-readout">
        {READOUT_HINT}
      </div>
    </div>
  )
}

export default MapView
