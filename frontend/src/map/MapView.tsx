import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import Map from 'ol/Map'
import Overlay from 'ol/Overlay'
import type { Positioning } from 'ol/Overlay'
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
import { READOUT_HINT, TOUCH_READOUT_HINT, createLocalProjection, createView, gridExtent, readoutText } from './mapSetup'
import { createMarkerLayer, updateMarkers } from './markers'
import { createRouteLayer, updateRoutes, type RouteLayerHandle, type RouteLine } from './routeLayer'
import { createStopsLayer, updateStops } from './stopsLayer'
import { logWhenDrawn, recordMapClick } from './clickTiming'
import { clearLabelCache } from './mapSymbols'
import { cellToMap } from './coords'
import type { Stop } from '../services/stops'
import type VectorLayer from 'ol/layer/Vector'
import type { RouteKind } from '../config/routes'

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
  /** Phone/touch layout: tap wording in the readout box. */
  touch?: boolean
  /** Route hovered or selected in the panel: highlighted, the others faded. */
  focusedRoute: RouteKind | null
  /** Card shown next to this stop on the map (desktop); null = no card on the map. */
  popup: { stop: Stop; content: ReactNode } | null
}

const NOTICE_MS = 2500
// Previous routes stay visible but faded while the new ones are computed.
const STALE_ROUTE_OPACITY = 0.3
const STOP_HIT_TOLERANCE_PX = 5
// Gap between a stop symbol and its card.
const POPUP_OFFSET_PX = 18

/**
 * Opens the card on the side of the stop with more room (right of a stop in
 * the left half, and so on); autoPan then nudges the map if it still overflows.
 */
function popupPlacement(pixel: number[] | null, size: number[] | undefined): { positioning: Positioning; offset: number[] } {
  if (!pixel || !size) return { positioning: 'center-left', offset: [POPUP_OFFSET_PX, 0] }
  const toLeft = pixel[0] > size[0] / 2
  const vertical = pixel[1] < size[1] / 3 ? 'top' : pixel[1] > (size[1] * 2) / 3 ? 'bottom' : 'center'
  const verticalOffset = vertical === 'top' ? -24 : vertical === 'bottom' ? 24 : 0
  return {
    positioning: `${vertical}-${toLeft ? 'right' : 'left'}` as Positioning,
    offset: [toLeft ? -POPUP_OFFSET_PX : POPUP_OFFSET_PX, verticalOffset],
  }
}

function MapView(props: MapViewProps) {
  const { grid, orthoUrl, overlays, habitat, target, routes, routesStale, pointOfNoReturn, hoverCell } = props
  const { stops, stopsVisible, onStopClick, maxSlopeDeg, onCellClick, hint, touch = false, focusedRoute, popup } = props
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
  const readoutHint = touch ? TOUCH_READOUT_HINT : READOUT_HINT
  const readoutHintRef = useRef(readoutHint)
  // True while the box shows the hint rather than a cell readout.
  const showingHintRef = useRef(true)
  // Vector sources live as long as the component; route/marker changes only touch them.
  const [markerSource] = useState(() => new VectorSource())
  const [routeSource] = useState(() => new VectorSource())
  const [stopsSource] = useState(() => new VectorSource())
  const stopsLayerRef = useRef<VectorLayer | null>(null)
  const routeLayerRef = useRef<RouteLayerHandle | null>(null)
  // The stop card is rendered by React (portal) into this element, which an OpenLayers Overlay keeps next to the stop.
  const [popupElement] = useState(() => document.createElement('div'))
  const popupOverlayRef = useRef<Overlay | null>(null)
  const focusedRouteRef = useRef(focusedRoute)
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
    readoutHintRef.current = readoutHint
    focusedRouteRef.current = focusedRoute
  })

  // The readout is plain DOM text (see setReadout below); swap the hint when
  // the layout changes, e.g. a window resized across the phone breakpoint.
  useEffect(() => {
    if (readoutRef.current && showingHintRef.current) readoutRef.current.textContent = readoutHint
  }, [readoutHint])

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
    routeLayerRef.current?.setFocus(focusedRoute)
  }, [focusedRoute])

  useEffect(() => {
    routeLayerRef.current?.layer.setOpacity(routesStale ? STALE_ROUTE_OPACITY : 1)
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
    routeLayer.layer.setOpacity(routesStaleRef.current ? STALE_ROUTE_OPACITY : 1)
    routeLayer.setFocus(focusedRouteRef.current)
    routeLayerRef.current = routeLayer
    const markerLayer = createMarkerLayer(markerSource)
    const map = new Map({
      target: targetRef.current,
      // Draw order, bottom to top: base image → slope → roughness → routes → stops → markers.
      layers: [
        ortho,
        slopeLayer,
        roughnessLayer,
        routeLayer.layer,
        stopsLayer,
        markerLayer,
      ],
      view: createView(grid, projection, extent),
      controls: defaultControls({ attribution: false }).extend([new ScaleLine({ units: 'metric' })]),
      // A click places the target, so double-click zoom would fight it (two
      // targets per double click). Zoom buttons and the mouse wheel remain.
      interactions: defaultInteractions({ doubleClickZoom: false }),
    })
    map.getView().fit(extent, { size: map.getSize(), padding: [24, 24, 24, 24] })
    mapRef.current = map

    const popupOverlay = new Overlay({
      element: popupElement,
      autoPan: { margin: 16, animation: { duration: 200 } },
      stopEvent: true, // clicks and scrolling inside the card never reach the map
      className: 'ol-overlay-container stop-popup-container',
    })
    map.addOverlay(popupOverlay)
    popupOverlayRef.current = popupOverlay

    // Canvas labels drawn before Inter finished loading used the fallback font.
    let disposed = false
    document.fonts?.ready.then(() => {
      if (disposed) return
      clearLabelCache()
      markerLayer.changed()
      stopsLayer.changed()
    })

    // The readout is written straight to the DOM: pointermove fires many times
    // per second and does not need to re-render the React tree.
    const setReadout = (text: string, isHint = false) => {
      showingHintRef.current = isHint
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
    // A finger "leaves" right after every tap; keep the tapped cell readout then.
    const resetReadout = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') setReadout(readoutHintRef.current, true)
    }
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
      setReadout(readoutText(x, y, grid)) // touch has no hover, so a tap shows the cell too
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
      disposed = true
      element.removeEventListener('pointerleave', resetReadout)
      map.removeOverlay(popupOverlay)
      popupOverlayRef.current = null
      map.setTarget(undefined)
      map.dispose()
      mapRef.current = null
      overlayLayersRef.current = {}
      stopsLayerRef.current = null
      routeLayerRef.current = null
    }
    // slopeUrl is deliberately missing: overlaysRef holds the current URL for a new map,
    // and the effect above swaps it on an existing one.
  }, [grid, orthoUrl, roughnessUrl, markerSource, routeSource, stopsSource, showNotice, popupElement])

  // Runs after the map effect above, so a rebuilt map gets the open card back.
  const popupStop = popup?.stop ?? null
  useEffect(() => {
    const overlay = popupOverlayRef.current
    const map = mapRef.current
    if (!overlay || !map) return
    if (!popupStop) {
      overlay.setPosition(undefined)
      return
    }
    const { x, y } = cellToMap({ col: popupStop.col, row: popupStop.row }, grid)
    const placement = popupPlacement(map.getPixelFromCoordinate([x, y]), map.getSize())
    overlay.setPositioning(placement.positioning)
    overlay.setOffset(placement.offset)
    overlay.setPosition([x, y])
  }, [popupStop, grid, orthoUrl, roughnessUrl])

  return (
    <div className="map-view">
      <div ref={targetRef} className="map-canvas" />
      {hint && <div className="map-hint">{hint}</div>}
      {notice && (
        <div className="map-notice" role="alert">
          {notice}
        </div>
      )}
      {/* Filled by the effects above, never by React children, so DOM writes cannot clash. */}
      <div ref={readoutRef} className="map-readout" />
      {popup && createPortal(popup.content, popupElement)}
    </div>
  )
}

export default MapView
