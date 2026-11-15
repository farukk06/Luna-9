import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS'
import WMTSCapabilities from 'ol/format/WMTSCapabilities'
import type Projection from 'ol/proj/Projection'
import { getCenter, getHeight, getWidth } from 'ol/extent'
import { Fill, Stroke, Style, Text } from 'ol/style'
import { defaults as defaultControls } from 'ol/control/defaults'
import { defaults as defaultInteractions } from 'ol/interaction/defaults'
import type { LonLatBounds } from '../services/data'
import { LANDING_LABEL, LANDING_SITE } from '../config/landingSite'
import { MARKER_COLORS } from '../config/routes'
import { landingStarSvg, landingSymbolStyle } from './landingLayer'
import {
  LIVE_TIMEOUT_MS,
  OVERVIEW_CAPABILITIES_URL,
  OVERVIEW_CREDIT,
  OVERVIEW_LAYER,
  OVERVIEW_MATRIX_SET,
  OVERVIEW_STATIC_META_URL,
  boundsRing,
  normalizeMatrixSizes,
  marsDegreeProjection,
  overviewPanExtent,
  overviewViewExtent,
  parseStaticOverview,
} from './overviewSetup'

type BaseMode = 'loading' | 'live' | 'static' | 'unavailable'

interface OverviewMapProps {
  /** Approximate lon/lat bounds of the study area (grid.json source.boundsLonLat). */
  studyBounds: LonLatBounds
  /** Desktop: open; phone: starts as a small button. */
  defaultOpen: boolean
}

const STUDY_COLOR = MARKER_COLORS.target // orange UI accent

function studyAreaStyle(): Style {
  return new Style({
    stroke: new Stroke({ color: STUDY_COLOR, width: 2 }),
    text: new Text({
      text: 'Study area 2×2 km',
      font: '600 11px Inter, system-ui, sans-serif',
      fill: new Fill({ color: '#f1f2f4' }),
      stroke: new Stroke({ color: 'rgba(14, 16, 20, 0.9)', width: 3 }),
      placement: 'point',
      offsetY: -16,
      overflow: true, // the 2 km square is far smaller than its label
    }),
  })
}

function overlayLayer(studyBounds: LonLatBounds): VectorLayer {
  const study = new Feature(new Polygon([boundsRing(studyBounds)]))
  study.setStyle(studyAreaStyle())
  const landing = new Feature(new Point([LANDING_SITE.lon, LANDING_SITE.lat]))
  landing.setStyle(landingSymbolStyle(12))
  return new VectorLayer({ source: new VectorSource({ features: [study, landing] }) })
}

async function liveSource(signal: AbortSignal, projection: Projection): Promise<WMTS> {
  const response = await fetch(OVERVIEW_CAPABILITIES_URL, { signal })
  if (!response.ok) throw new Error(`GetCapabilities HTTP ${response.status}`)
  const capabilities = new WMTSCapabilities().read(normalizeMatrixSizes(await response.text()))
  const options = optionsFromCapabilities(capabilities, {
    layer: OVERVIEW_LAYER,
    matrixSet: OVERVIEW_MATRIX_SET,
    projection,
    crossOrigin: 'anonymous',
  })
  if (!options) throw new Error('Layer or tile matrix set missing in GetCapabilities')
  return new WMTS(options)
}

/**
 * Small second map that places the 2×2 km study area inside Jezero Crater.
 * Uses the live Mars Trek tiles when they answer quickly, otherwise a saved
 * crop of the same layer. Only zoom and pan; clicks do nothing.
 */
function OverviewMap({ studyBounds, defaultOpen }: OverviewMapProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [mode, setMode] = useState<BaseMode>('loading')
  const targetRef = useRef<HTMLDivElement>(null)
  // Once the live service has failed, reopening the box goes straight to the saved image.
  const liveFailedRef = useRef(false)

  useEffect(() => {
    if (!open || !targetRef.current) return
    const projection = marsDegreeProjection()
    const viewExtent = overviewViewExtent()
    const map = new Map({
      target: targetRef.current,
      layers: [overlayLayer(studyBounds)],
      controls: defaultControls({ attribution: false, rotate: false }),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
    })
    // Resolution (degrees per pixel) that fits the ~70 km view into the box.
    const [width, height] = map.getSize() ?? [248, 200]
    const fitted = Math.max(getWidth(viewExtent) / width, getHeight(viewExtent) / height)
    map.setView(
      new View({
        projection,
        center: getCenter(viewExtent),
        resolution: fitted,
        // Allow ~4× zoom in and ~2× zoom out from the default view.
        maxResolution: fitted * 2,
        minResolution: fitted / 4,
        extent: overviewPanExtent(),
        showFullExtent: true,
      }),
    )

    // Layer stack, bottom to top: saved image → live tiles → study area and landing star.
    // The saved image (same layer) loads at once, so the box is never empty
    // while the slow live service answers; live tiles cover it when they arrive.
    let disposed = false
    let staticState: 'pending' | 'ok' | 'failed' = 'pending'
    let liveState: 'pending' | 'ok' | 'failed' = liveFailedRef.current ? 'failed' : 'pending'
    const controller = new AbortController()
    let liveLayer: TileLayer<WMTS> | null = null

    const updateMode = () => {
      if (disposed) return
      if (liveState === 'ok') setMode('live')
      else if (staticState === 'ok') setMode('static')
      else if (staticState === 'failed' && liveState === 'failed') setMode('unavailable')
    }

    const loadStatic = async () => {
      try {
        const response = await fetch(OVERVIEW_STATIC_META_URL)
        const meta = parseStaticOverview(response.ok ? await response.json() : null, OVERVIEW_STATIC_META_URL)
        if (disposed) return
        if (!meta) throw new Error('invalid overview metadata')
        const source = new ImageStatic({ url: meta.imageUrl, projection, imageExtent: meta.bounds })
        source.on('imageloadend', () => {
          staticState = 'ok'
          updateMode()
        })
        source.on('imageloaderror', () => {
          staticState = 'failed'
          updateMode()
        })
        map.getLayers().insertAt(0, new ImageLayer({ source }))
      } catch {
        staticState = 'failed'
        updateMode()
      }
    }

    const dropLive = (reason: string) => {
      if (liveState !== 'pending' || disposed) return
      liveState = 'failed'
      window.clearTimeout(timer)
      controller.abort()
      if (liveLayer) map.removeLayer(liveLayer)
      liveFailedRef.current = true
      console.warn(`Overview: live Mars Trek tiles unavailable (${reason}); using the saved image`)
      updateMode()
    }

    void loadStatic()
    const timer = window.setTimeout(() => dropLive(`no tile within ${LIVE_TIMEOUT_MS} ms`), LIVE_TIMEOUT_MS)
    if (liveState === 'failed') {
      window.clearTimeout(timer) // failed earlier in this session: saved image only
    } else {
      liveSource(controller.signal, projection)
        .then((source) => {
          if (disposed || liveState !== 'pending') return
          // The first tile decides: a loaded tile means live mode, an early error means the saved image.
          source.once('tileloadend', () => {
            if (liveState !== 'pending' || disposed) return
            liveState = 'ok'
            window.clearTimeout(timer)
            updateMode()
          })
          source.on('tileloaderror', () => dropLive('tile error'))
          liveLayer = new TileLayer({ source })
          // Above the saved image whether or not that has been added yet.
          const layers = map.getLayers()
          layers.insertAt(Math.max(0, layers.getLength() - 1), liveLayer)
        })
        .catch((error: unknown) => dropLive(error instanceof Error ? error.message : 'request failed'))
    }

    return () => {
      disposed = true
      window.clearTimeout(timer)
      controller.abort()
      map.setTarget(undefined)
      map.dispose()
      setMode('loading')
    }
  }, [open, studyBounds])

  if (!open) {
    return (
      <div className="overview overview--closed">
        <button type="button" className="overview-toggle" onClick={() => setOpen(true)} aria-expanded="false">
          Where on Mars?
        </button>
      </div>
    )
  }

  const credit = mode === 'static' ? `${OVERVIEW_CREDIT} (saved copy)` : OVERVIEW_CREDIT
  return (
    <section className="overview" aria-label="Where on Mars? Overview map of Jezero Crater">
      <header className="overview-head">
        <span className="overview-title">Where on Mars?</span>
        <span className="overview-sub">Jezero Crater, ~70 km</span>
        <button type="button" className="overview-close" onClick={() => setOpen(false)} aria-label="Hide overview map" aria-expanded="true">
          ×
        </button>
      </header>
      <div className={`overview-map overview-map--${mode}`}>
        <div ref={targetRef} className="overview-canvas" />
        {mode === 'loading' && <p className="overview-status">Loading overview…</p>}
        {mode === 'unavailable' && <p className="overview-status">Overview map unavailable</p>}
      </div>
      <div className="overview-legend">
        <span className="overview-key">
          <span className="overview-key-square" aria-hidden="true" />
          Study area
        </span>
        <span className="overview-key">
          <img className="overview-key-star" src={`data:image/svg+xml;utf8,${encodeURIComponent(landingStarSvg(12))}`} alt="" />
          {LANDING_LABEL}
        </span>
      </div>
      {mode !== 'unavailable' && <p className="overview-credit">{credit}</p>}
    </section>
  )
}

export default OverviewMap
