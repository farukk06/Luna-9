import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Map from 'ol/Map'
import ImageLayer from 'ol/layer/Image'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import ScaleLine from 'ol/control/ScaleLine'
import { defaults as defaultControls } from 'ol/control/defaults'
import { defaults as defaultInteractions } from 'ol/interaction/defaults'
import 'ol/ol.css'
import type { Cell, Grid } from '../routing/types'
import { passabilityIssue } from './cells'
import { mapToCell } from './coords'
import { READOUT_HINT, createLocalProjection, createView, gridExtent, readoutText } from './mapSetup'
import { createMarkerLayer, updateMarkers } from './markers'
import { createRouteLayer, updateRoutes, type RouteLine } from './routeLayer'
import { createStopsLayer, updateStops } from './stopsLayer'
import { logWhenDrawn, recordMapClick } from './clickTiming'
import type { Stop } from '../services/stops'
import type VectorLayer from 'ol/layer/Vector'

export type OverlayId = 'slope' | 'roughness'

export interface OverlaySpec {
  url: string
  visible: boolean
  /** 0–1 */
  opacity: number
}

interface MapViewProps {
  grid: Grid
  orthoUrl: string
  overlays: Record<OverlayId, OverlaySpec>
  habitat: Cell | null
  target: Cell | null
  /** Successful routes to draw; empty when nothing should be drawn. */
  routes: RouteLine[]
  /** True while the drawn routes belong to the previous habitat/target (new ones are computing). */
  routesStale: boolean
  pointOfNoReturn: Cell | null
  /** Cell hovered in the elevation chart, shown as a small temporary marker. */
  hoverCell: Cell | null
  /** Science stops already checked to be placeable on this grid. */
  stops: Stop[]
  stopsVisible: boolean
  onStopClick: (stopId: string) => void
  maxSlopeDeg: number
  /** Called only for passable cells inside the study area. */
  onCellClick: (cell: Cell) => void
  /** Optional instruction shown on top of the map, e.g. while placing the habitat. */
  hint?: string
}

const NOTICE_MS = 2500
// Previous routes stay visible but faded while the new ones are computed.
const STALE_ROUTE_OPACITY = 0.3
const STOP_HIT_TOLERANCE_PX = 5

function MapView(props: MapViewProps) {
  const { grid, orthoUrl, overlays, habitat, target, routes, routesStale, pointOfNoReturn, hoverCell } = props
  const { stops, stopsVisible, onStopClick, maxSlopeDeg, onCellClick, hint } = props
  const { slope, roughness } = overlays
  // Only the base/roughness URLs rebuild the map. The slope image changes with
  // the scenario slope limit, so its source is swapped in place (view stays).
  const slopeUrl = slope.url
  const roughnessUrl = roughness.url
  const targetRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const overlayLayersRef = useRef<Partial<Record<OverlayId, ImageLayer<ImageStatic>>>>({})
  // Initial overlay state for a freshly built map; later changes go through setVisible/setOpacity.
  const overlaysRef = useRef(overlays)
  const readoutRef = useRef<HTMLDivElement>(null)
  // Vector sources live as long as the component; route/marker changes only touch them.
  const [markerSource] = useState(() => new VectorSource())
  const [routeSource] = useState(() => new VectorSource())
  const [stopsSource] = useState(() => new VectorSource())
  const stopsLayerRef = useRef<VectorLayer | null>(null)
  const routeLayerRef = useRef<VectorLayer | null>(null)
  const routesStaleRef = useRef(routesStale)
  const stopsVisibleRef = useRef(stopsVisible)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  // The click handler is registered once per map, so it reads the latest
  // callback and slope limit through refs instead of recreating the map.
  const onCellClickRef = useRef(onCellClick)
  const onStopClickRef = useRef(onStopClick)
  const maxSlopeRef = useRef(maxSlopeDeg)
  useEffect(() => {
    onCellClickRef.current = onCellClick
    onStopClickRef.current = onStopClick
    stopsVisibleRef.current = stopsVisible
    maxSlopeRef.current = maxSlopeDeg
    overlaysRef.current = overlays
    routesStaleRef.current = routesStale
  })

  const showNotice = useCallback((text: string) => {
    window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  useEffect(() => {
    updateMarkers(markerSource, grid, { habitat, target, pointOfNoReturn, hover: hoverCell })
    logWhenDrawn(mapRef.current, 'marker')
  }, [markerSource, grid, habitat, target, pointOfNoReturn, hoverCell])

  useEffect(() => {
    updateRoutes(routeSource, grid, routes)
  }, [routeSource, grid, routes])

  useEffect(() => {
    routeLayerRef.current?.setOpacity(routesStale ? STALE_ROUTE_OPACITY : 1)
    if (!routesStale && routes.length > 0) logWhenDrawn(mapRef.current, 'routes')
  }, [routesStale, routes])

  useEffect(() => {
    updateStops(stopsSource, grid, stops)
  }, [stopsSource, grid, stops])

  useEffect(() => {
    stopsLayerRef.current?.setVisible(stopsVisible)
  }, [stopsVisible])

  // Visibility/opacity changes only touch the layer: view (zoom, pan) and markers stay as they are.
  useEffect(() => {
    overlayLayersRef.current.slope?.setVisible(slope.visible)
    overlayLayersRef.current.slope?.setOpacity(slope.opacity)
  }, [slope.visible, slope.opacity])

  useEffect(() => {
    const layer = overlayLayersRef.current.slope
    const source = layer?.getSource()
    if (!layer || !source || source.getUrl() === slopeUrl) return
    const projection = source.getProjection() ?? undefined
    layer.setSource(new ImageStatic({ url: slopeUrl, projection, imageExtent: gridExtent(grid) }))
  }, [grid, slopeUrl])

  useEffect(() => {
    overlayLayersRef.current.roughness?.setVisible(roughness.visible)
    overlayLayersRef.current.roughness?.setOpacity(roughness.opacity)
  }, [roughness.visible, roughness.opacity])

  useEffect(() => {
    if (!targetRef.current) return
    const extent = gridExtent(grid)
    const projection = createLocalProjection(extent)
    const ortho = new ImageLayer({
      source: new ImageStatic({ url: orthoUrl, projection, imageExtent: extent }),
    })
    // Same imageExtent as the base image, so overlay pixels sit exactly on their cells.
    const overlayLayer = (id: OverlayId) => {
      const spec = overlaysRef.current[id]
      return new ImageLayer({
        source: new ImageStatic({ url: spec.url, projection, imageExtent: extent }),
        visible: spec.visible,
        opacity: spec.opacity,
      })
    }
    const slopeLayer = overlayLayer('slope')
    const roughnessLayer = overlayLayer('roughness')
    overlayLayersRef.current = { slope: slopeLayer, roughness: roughnessLayer }
    const stopsLayer = createStopsLayer(stopsSource, stopsVisibleRef.current)
    stopsLayerRef.current = stopsLayer
    const routeLayer = createRouteLayer(routeSource)
    routeLayer.setOpacity(routesStaleRef.current ? STALE_ROUTE_OPACITY : 1)
    routeLayerRef.current = routeLayer
    const map = new Map({
      target: targetRef.current,
      // Draw order, bottom to top: base image → slope → roughness → routes → stops → markers.
      layers: [
        ortho,
        slopeLayer,
        roughnessLayer,
        routeLayer,
        stopsLayer,
        createMarkerLayer(markerSource),
      ],
      view: createView(grid, projection, extent),
      controls: defaultControls({ attribution: false }).extend([new ScaleLine({ units: 'metric' })]),
      // A click places the target, so double-click zoom would fight it (two
      // targets per double click). Zoom buttons and the mouse wheel remain.
      interactions: defaultInteractions({ doubleClickZoom: false }),
    })
    map.getView().fit(extent, { size: map.getSize(), padding: [24, 24, 24, 24] })
    mapRef.current = map

    // The readout is written straight to the DOM: pointermove fires many times
    // per second and does not need to re-render the React tree.
    const setReadout = (text: string) => {
      if (readoutRef.current) readoutRef.current.textContent = text
    }
    const element = targetRef.current
    const stopHitOptions = { layerFilter: (layer: unknown) => layer === stopsLayer, hitTolerance: STOP_HIT_TOLERANCE_PX }
    map.on('pointermove', (event) => {
      if (event.dragging) return
      const [x, y] = event.coordinate
      setReadout(readoutText(x, y, grid))
      // Pointer cursor over a stop hints that it can be clicked.
      element.style.cursor = map.hasFeatureAtPixel(event.pixel, stopHitOptions) ? 'pointer' : ''
    })
    const resetReadout = () => setReadout(READOUT_HINT)
    element.addEventListener('pointerleave', resetReadout)

    // 'click' fires immediately; 'singleclick' waits ~250 ms to rule out a double click.
    map.on('click', (event) => {
      // A click on a stop opens its card instead of setting a target.
      const stopId = map.forEachFeatureAtPixel(event.pixel, (f) => f.get('stopId') as string | undefined, stopHitOptions)
      if (stopId) {
        onStopClickRef.current(stopId)
        return
      }
      const [x, y] = event.coordinate
      const cell = mapToCell(x, y, grid)
      if (!cell) return // outside the study area: ignore silently
      const issue = passabilityIssue(cell, grid, maxSlopeRef.current)
      if (issue) showNotice(issue)
      else {
        recordMapClick(event.originalEvent.timeStamp)
        // Commit the new target (and run the marker effect) right now, so the
        // marker moves in the next frame instead of after a scheduled render.
        flushSync(() => onCellClickRef.current(cell))
      }
    })

    // StrictMode mounts effects twice in development: detach and dispose the
    // first map so only one canvas ever lives inside the target element.
    return () => {
      element.removeEventListener('pointerleave', resetReadout)
      map.setTarget(undefined)
      map.dispose()
      mapRef.current = null
      overlayLayersRef.current = {}
      stopsLayerRef.current = null
      routeLayerRef.current = null
    }
    // slopeUrl is deliberately missing: overlaysRef holds the current URL for a new map,
    // and the effect above swaps it on an existing one.
  }, [grid, orthoUrl, roughnessUrl, markerSource, routeSource, stopsSource, showNotice])

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
