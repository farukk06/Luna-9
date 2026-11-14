import { useCallback, useEffect, useState } from 'react'
import type { Cell, Grid } from './routing/types'
import MapView from './map/MapView'
import { findNearestPassableCell, passabilityIssue } from './map/cells'
import MissionPanel, { type ClickMode, type RoutingView } from './panels/MissionPanel'
import LayersPanel, { type OverlayState } from './panels/LayersPanel'
import { DEFAULT_HABITAT_CELL, DEFAULT_TARGET_CELL } from './config/mission'
import {
  type DataSource,
  type LayerId,
  type LayerImageUrls,
  type LayerInfo,
  getLayerImageUrls,
  layerSourceLabel,
  loadGrid,
  loadLayers,
} from './services/data'
import { DEFAULT_EVA_PROFILE, DEFAULT_OPTIONS } from './services/routing'
import { useRouteAssessment } from './services/useRouteAssessment'
import { type Stop, loadStops, placeableStops, stopCell } from './services/stops'
import StopCard from './panels/StopCard'

const MAX_SLOPE_DEG = DEFAULT_OPTIONS.maxSlopeDeg
const DEFAULT_SLOPE_LAYER: OverlayState = { visible: true, opacity: 0.6 }
const DEFAULT_ROUGHNESS_LAYER: OverlayState = { visible: false, opacity: 0.6 }

interface LoadedData {
  grid: Grid
  source: DataSource
  images: LayerImageUrls
  layers: LayerInfo[]
  sources: Record<LayerId, string>
  /** Only stops that sit on a passable cell of this grid. */
  stops: Stop[]
}

function SourceBadge({ source }: { source: DataSource }) {
  return <span className={`source-badge source-badge--${source}`}>{source === 'real' ? 'REAL DATA' : 'MOCK DATA'}</span>
}

/** The demo target if it is usable on this grid; otherwise the app opens without one. */
function initialTarget(grid: Grid): Cell | null {
  const issue = passabilityIssue(DEFAULT_TARGET_CELL, grid, MAX_SLOPE_DEG)
  if (issue === null) return DEFAULT_TARGET_CELL
  console.warn(`Default target (${DEFAULT_TARGET_CELL.col}, ${DEFAULT_TARGET_CELL.row}) skipped: ${issue}`)
  return null
}

function sameCell(a: Cell | null, b: Cell | null): boolean {
  return a === b || (a !== null && b !== null && a.col === b.col && a.row === b.row)
}

function App() {
  const [data, setData] = useState<LoadedData | null>(null)
  const [habitat, setHabitat] = useState<Cell | null>(null)
  const [target, setTarget] = useState<Cell | null>(null)
  const [clickMode, setClickMode] = useState<ClickMode>('target')
  const [slopeLayer, setSlopeLayer] = useState<OverlayState>(DEFAULT_SLOPE_LAYER)
  const [roughnessLayer, setRoughnessLayer] = useState<OverlayState>(DEFAULT_ROUGHNESS_LAYER)
  const [stopsVisible, setStopsVisible] = useState(true)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<Cell | null>(null)
  // Skip re-renders while the pointer stays on the same path cell.
  const handleProfileHover = useCallback((cell: Cell | null) => {
    setHoverCell((prev) => (sameCell(prev, cell) ? prev : cell))
  }, [])

  useEffect(() => {
    let cancelled = false // ignore the result if the component unmounted meanwhile
    Promise.all([loadGrid(), loadLayers(), loadStops()]).then(([gridResult, layersResult, allStops]) => {
      if (cancelled) return
      const { grid, source, sourceInfo } = gridResult
      const ctx = { gridSource: source, gridSourceInfo: sourceInfo, layersSource: layersResult.source, layers: layersResult.layers }
      const sources: Record<LayerId, string> = {
        ortho: layerSourceLabel('ortho', ctx),
        slope: layerSourceLabel('slope', ctx),
        roughness: layerSourceLabel('roughness', ctx),
      }
      const stops = placeableStops(allStops, grid, MAX_SLOPE_DEG)
      setData({ grid, source, images: getLayerImageUrls(grid, source), layers: layersResult.layers, sources, stops })
      // Snap the default habitat to a passable cell, so it also works on the real grid.
      setHabitat(findNearestPassableCell(DEFAULT_HABITAT_CELL, grid, MAX_SLOPE_DEG))
      setTarget(initialTarget(grid)) // ready-made demo mission
    })
    return () => {
      cancelled = true
    }
  }, [])

  const assessment = useRouteAssessment(data?.grid ?? null, habitat, target)
  const routingView: RoutingView = {
    computing: assessment.computing,
    alternatives: assessment.alternatives,
    eva: assessment.eva,
    evaProfile: DEFAULT_EVA_PROFILE,
  }

  const selectedStop = data?.stops.find((s) => s.id === selectedStopId) ?? null

  const setStopAsTarget = (stop: Stop) => {
    setTarget(stopCell(stop)) // the route hook recomputes on the new target
    setClickMode('target')
    setSelectedStopId(null)
  }

  const handleCellClick = useCallback(
    (cell: Cell) => {
      if (clickMode === 'habitat') {
        setHabitat(cell)
        setClickMode('target') // moving the habitat is a one-shot action
      } else {
        setTarget(cell)
      }
    },
    [clickMode],
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">MarsPath</span>
          <span className="brand-subtitle">Mars EVA route planner – Jezero Crater</span>
        </div>
        {data && <SourceBadge source={data.source} />}
      </header>

      <aside className="panel panel--left">
        {data ? (
          <LayersPanel
            layers={data.layers}
            realImages={data.source === 'real'}
            sources={data.sources}
            maxSlopeDeg={MAX_SLOPE_DEG}
            slope={slopeLayer}
            onSlopeChange={setSlopeLayer}
            roughness={roughnessLayer}
            onRoughnessChange={setRoughnessLayer}
            stopCount={data.stops.length}
            stopsVisible={stopsVisible}
            onStopsVisibleChange={(visible) => {
              setStopsVisible(visible)
              if (!visible) setSelectedStopId(null) // no card for a hidden stop
            }}
          />
        ) : (
          <h2>Layers</h2>
        )}
      </aside>

      <main className="map-area">
        {data ? (
          <MapView
            grid={data.grid}
            orthoUrl={data.images.ortho}
            overlays={{
              slope: { url: data.images.slope, ...slopeLayer },
              roughness: { url: data.images.roughness, ...roughnessLayer },
            }}
            habitat={habitat}
            target={target}
            routes={assessment.routeLines}
            pointOfNoReturn={assessment.pointOfNoReturn}
            hoverCell={hoverCell}
            stops={data.stops}
            stopsVisible={stopsVisible}
            onStopClick={setSelectedStopId}
            maxSlopeDeg={MAX_SLOPE_DEG}
            onCellClick={handleCellClick}
            hint={clickMode === 'habitat' ? 'Click to place habitat' : undefined}
          />
        ) : (
          <p className="muted center">Loading data...</p>
        )}
        {selectedStop && (
          <StopCard
            stop={selectedStop}
            onSetTarget={() => setStopAsTarget(selectedStop)}
            onClose={() => setSelectedStopId(null)}
          />
        )}
      </main>

      <aside className="panel panel--right">
        {data && (
          <MissionPanel
            grid={data.grid}
            habitat={habitat}
            target={target}
            routing={routingView}
            clickMode={clickMode}
            onToggleMoveHabitat={() => setClickMode((m) => (m === 'habitat' ? 'target' : 'habitat'))}
            onClearTarget={() => setTarget(null)}
            onProfileHover={handleProfileHover}
          />
        )}
      </aside>
    </div>
  )
}

export default App
