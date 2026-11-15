import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Cell, Grid } from './routing/types'
import MapView from './map/MapView'
import { findNearestPassableCell, passabilityIssue } from './map/cells'
import MissionPanel, { type ClickMode, type RoutingView } from './panels/MissionPanel'
import LayersPanel, { type OverlayState } from './panels/LayersPanel'
import { LEGACY_STOPS_GRID_SIZE, MISSION_DEFAULTS } from './config/mission'
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
import type { RouteKind } from './config/routes'
import { type MedaFile, loadMeda } from './services/meda'

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
  /** Habitat placed at startup; while it is unmoved, its "Why here?" rationale is shown. */
  initialHabitat: Cell | null
}

function SourceBadge({ source }: { source: DataSource }) {
  return (
    <span className={`badge badge--${source}`} title={source === 'real' ? 'NASA/USGS data products' : 'Synthetic terrain for development'}>
      {source === 'real' ? 'REAL DATA' : 'MOCK DATA'}
    </span>
  )
}

/** Identifies a habitat/target pair: a route selection only applies to the mission it was made for. */
function missionKey(habitat: Cell | null, target: Cell | null): string {
  return `${habitat?.col},${habitat?.row}>${target?.col},${target?.row}`
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
  // Optional and independent: a missing or invalid meda.json never blocks the map.
  const [meda, setMeda] = useState<MedaFile | null>(null)
  const [habitat, setHabitat] = useState<Cell | null>(null)
  const [target, setTarget] = useState<Cell | null>(null)
  const [clickMode, setClickMode] = useState<ClickMode>('target')
  const [slopeLayer, setSlopeLayer] = useState<OverlayState>(DEFAULT_SLOPE_LAYER)
  const [roughnessLayer, setRoughnessLayer] = useState<OverlayState>(DEFAULT_ROUGHNESS_LAYER)
  const [stopsVisible, setStopsVisible] = useState(true)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<Cell | null>(null)
  // Route cards: hover previews a route on the map, a click keeps it selected.
  const [hoveredRoute, setHoveredRoute] = useState<RouteKind | null>(null)
  const [routeSelection, setRouteSelection] = useState<{ mission: string; kind: RouteKind } | null>(null)
  // Skip re-renders while the pointer stays on the same path cell.
  const handleProfileHover = useCallback((cell: Cell | null) => {
    setHoverCell((prev) => (sameCell(prev, cell) ? prev : cell))
  }, [])

  useEffect(() => {
    let cancelled = false // ignore the result if the component unmounted meanwhile
    const forcedMock = mockSpecFromSearch(window.location.search) // "?mock=400" for performance tests
    Promise.all([loadGrid(forcedMock), loadLayers(), loadStops()]).then(([gridResult, layersResult, stopsFile]) => {
      if (cancelled) return
      const { grid, source, sourceInfo } = gridResult
      const ctx = { gridSource: source, gridSourceInfo: sourceInfo, layersSource: layersResult.source, layers: layersResult.layers }
      const sources: Record<LayerId, string> = {
        ortho: layerSourceLabel('ortho', ctx),
        slope: layerSourceLabel('slope', ctx),
        roughness: layerSourceLabel('roughness', ctx),
      }
      // The file names the grid its cells refer to; older files without it used the mock grid.
      const stopsGrid = stopsFile.gridSize ?? LEGACY_STOPS_GRID_SIZE
      const stops = placeableStops(stopsFile.stops, grid, MAX_SLOPE_DEG, stopsGrid)
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

  useEffect(() => {
    let cancelled = false
    loadMeda().then((file) => {
      if (!cancelled) setMeda(file)
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
  // "Why here?" explains the chosen site only: hidden once the habitat is moved elsewhere.
  const habitatRationale =
    data !== null && sameCell(habitat, data.initialHabitat) ? MISSION_DEFAULTS[data.source].habitatRationale : null

  const selectedStop = data?.stops.find((s) => s.id === selectedStopId) ?? null

  // A selection or hover only counts while that route exists for the current mission.
  const currentMission = missionKey(habitat, target)
  const usableRoute = (kind: RouteKind | null | undefined): RouteKind | null =>
    kind && assessment.alternatives?.recommended && assessment.alternatives[kind].ok ? kind : null
  const selectedRoute = usableRoute(routeSelection?.mission === currentMission ? routeSelection.kind : null)
  const focusedRoute = usableRoute(hoveredRoute) ?? selectedRoute
  const toggleRouteSelection = (kind: RouteKind) =>
    setRouteSelection(selectedRoute === kind ? null : { mission: currentMission, kind })

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
          <span className="brand-mark" aria-hidden="true" />
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
            recommendedRoute={assessment.alternatives?.recommended ?? null}
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
            focusedRoute={focusedRoute}
            popup={
              selectedStop && !isMobile
                ? {
                    stop: selectedStop,
                    content: (
                      <StopCard
                        stop={selectedStop}
                        variant="popup"
                        onSetTarget={() => setStopAsTarget(selectedStop)}
                        onClose={() => setSelectedStopId(null)}
                      />
                    ),
                  }
                : null
            }
          />
        ) : (
          <p className="muted center">Loading terrain data…</p>
        )}
      </main>

      {/* Phones: the stop card slides up from the bottom instead of covering the small map. */}
      {selectedStop && isMobile && (
        <StopCard
          stop={selectedStop}
          variant="sheet"
          onSetTarget={() => setStopAsTarget(selectedStop)}
          onClose={() => setSelectedStopId(null)}
        />
      )}

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
            habitatRationale={habitatRationale}
            touch={touch}
            selectedRoute={selectedRoute}
            focusedRoute={focusedRoute}
            onSelectRoute={toggleRouteSelection}
            onHoverRoute={setHoveredRoute}
            meda={meda}
          />
        )}
      </aside>
    </div>
  )
}

export default App
