import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Cell, Grid } from './routing/types'
import MapView from './map/MapView'
import { findNearestPassableCell, passabilityIssue } from './map/cells'
import MissionPanel, { type ClickMode, type RoutingView } from './panels/MissionPanel'
import LayersPanel, { type OverlayState } from './panels/LayersPanel'
import { MISSION_DEFAULTS, STOPS_GRID_SIZE } from './config/mission'
import { describePosition, gridCenterCell, positionToCell } from './map/positions'
import {
  type DataSource,
  type LayerId,
  type LayerImageUrls,
  type LayerInfo,
  getLayerImageUrls,
  layerSourceLabel,
  loadGrid,
  loadLayers,
  mockSpecFromSearch,
} from './services/data'
import { DEFAULT_OPTIONS } from './services/routing'
import { useRouteAssessment } from './services/useRouteAssessment'
import { useDebouncedValue } from './services/useDebouncedValue'
import { COARSE_POINTER_QUERY, MOBILE_QUERY, useMediaQuery } from './services/useMediaQuery'
import { renderSlope } from './map/rasterImages'
import { DEFAULT_SCENARIO, type ScenarioParams } from './panels/scenarioParams'
import { type Stop, loadStops, placeableStops, stopCell } from './services/stops'
import StopCard from './panels/StopCard'

// Default slope limit, used only to place the initial habitat/target and the
// science stops. Routing, the slope layer and map clicks follow the scenario limit.
const MAX_SLOPE_DEG = DEFAULT_OPTIONS.maxSlopeDeg
// Slider changes wait this long before routes and the slope image are redone.
const SCENARIO_DEBOUNCE_MS = 250
const DEFAULT_SLOPE_LAYER: OverlayState = { visible: true, opacity: 0.5 }
const DEFAULT_ROUGHNESS_LAYER: OverlayState = { visible: false, opacity: 0.6 }

interface LoadedData {
  grid: Grid
  source: DataSource
  images: LayerImageUrls
  layers: LayerInfo[]
  sources: Record<LayerId, string>
  /** Only stops that sit on a passable cell of this grid. */
  stops: Stop[]
  /** Habitat placed at startup; while it is unmoved, the demo habitat notes apply. */
  initialHabitat: Cell | null
}

function SourceBadge({ source }: { source: DataSource }) {
  return <span className={`source-badge source-badge--${source}`}>{source === 'real' ? 'REAL DATA' : 'MOCK DATA'}</span>
}

/** The configured demo target if it is usable on this grid; otherwise the app opens without one. */
function initialTarget(grid: Grid, source: DataSource): Cell | null {
  const position = MISSION_DEFAULTS[source].target
  if (!position) return null // none configured (real data until chosen)
  const cell = positionToCell(position, grid)
  const issue = cell ? passabilityIssue(cell, grid, MAX_SLOPE_DEG) : 'outside the study area'
  if (cell && issue === null) return cell
  console.warn(`Default target ${describePosition(position)} skipped: ${issue}`)
  return null
}

/**
 * The passable cell nearest the configured habitat position, or nearest the
 * grid centre when none is configured (or it lies outside the study area).
 */
function initialHabitat(grid: Grid, source: DataSource): Cell | null {
  const position = MISSION_DEFAULTS[source].habitat
  let wanted = position ? positionToCell(position, grid) : null
  if (position && !wanted) console.warn(`Default habitat ${describePosition(position)} is outside the study area`)
  wanted ??= gridCenterCell(grid)
  const cell = findNearestPassableCell(wanted, grid, MAX_SLOPE_DEG)
  if (!cell) console.warn('Default habitat: no passable cell on this grid')
  else if (!sameCell(cell, wanted)) {
    console.warn(`Default habitat (${wanted.col}, ${wanted.row}) not passable, moved to (${cell.col}, ${cell.row})`)
  }
  return cell
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
    const forcedMock = mockSpecFromSearch(window.location.search) // "?mock=400" for performance tests
    Promise.all([loadGrid(forcedMock), loadLayers(), loadStops()]).then(([gridResult, layersResult, allStops]) => {
      if (cancelled) return
      const { grid, source, sourceInfo } = gridResult
      const ctx = { gridSource: source, gridSourceInfo: sourceInfo, layersSource: layersResult.source, layers: layersResult.layers }
      const sources: Record<LayerId, string> = {
        ortho: layerSourceLabel('ortho', ctx),
        slope: layerSourceLabel('slope', ctx),
        roughness: layerSourceLabel('roughness', ctx),
      }
      const stops = placeableStops(allStops, grid, MAX_SLOPE_DEG, STOPS_GRID_SIZE)
      const startHabitat = initialHabitat(grid, source)
      const images = getLayerImageUrls(grid, source)
      setData({ grid, source, images, layers: layersResult.layers, sources, stops, initialHabitat: startHabitat })
      setHabitat(startHabitat)
      setTarget(initialTarget(grid, source)) // ready-made demo mission
    })
    return () => {
      cancelled = true
    }
  }, [])

  // `scenario` follows the sliders immediately (panel values); `activeScenario`
  // lags by the debounce and drives routing, the slope layer and the legend.
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY)
  const touch = isMobile || coarsePointer
  const [scenario, setScenario] = useState<ScenarioParams>(DEFAULT_SCENARIO)
  const activeScenario = useDebouncedValue(scenario, SCENARIO_DEBOUNCE_MS)
  const slopeLimit = activeScenario.options.maxSlopeDeg
  const grid = data?.grid ?? null
  const slopeUrl = useMemo(() => (grid ? renderSlope(grid, slopeLimit) : ''), [grid, slopeLimit])

  const assessment = useRouteAssessment(grid, habitat, target, activeScenario)
  const routingView: RoutingView = {
    computing: assessment.computing,
    alternatives: assessment.alternatives,
    eva: assessment.eva,
    evaProfile: activeScenario.eva,
    maxSlopeDeg: slopeLimit,
  }
  const habitatPendingReview =
    data !== null && MISSION_DEFAULTS[data.source].habitatPendingReview && sameCell(habitat, data.initialHabitat)

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
            sources={data.sources}
            maxSlopeDeg={slopeLimit}
            slope={slopeLayer}
            onSlopeChange={setSlopeLayer}
            roughness={roughnessLayer}
            onRoughnessChange={setRoughnessLayer}
            stopCount={data.stops.length}
            stopsVisible={stopsVisible}
            collapsible={isMobile}
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
              slope: { url: slopeUrl, ...slopeLayer },
              roughness: { url: data.images.roughness, ...roughnessLayer },
            }}
            habitat={habitat}
            target={target}
            routes={assessment.routeLines}
            routesStale={assessment.routesStale}
            pointOfNoReturn={assessment.pointOfNoReturn}
            hoverCell={hoverCell}
            stops={data.stops}
            stopsVisible={stopsVisible}
            onStopClick={setSelectedStopId}
            maxSlopeDeg={slopeLimit}
            onCellClick={handleCellClick}
            hint={clickMode === 'habitat' ? `${touch ? 'Tap' : 'Click'} to place habitat` : undefined}
            touch={touch}
          />
        ) : (
          <p className="muted center">Loading terrain data…</p>
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
            scenario={scenario}
            onScenarioChange={setScenario}
            onScenarioReset={() => setScenario(DEFAULT_SCENARIO)}
            stops={data.stops}
            mockData={data.source === 'mock'}
            habitatPendingReview={habitatPendingReview}
            touch={touch}
          />
        )}
      </aside>
    </div>
  )
}

export default App
