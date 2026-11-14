import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Cell, Grid } from './routing/types'
import MapView from './map/MapView'
import { findNearestPassableCell } from './map/cells'
import MissionPanel, { type ClickMode } from './panels/MissionPanel'
import LayersPanel, { type OverlayState } from './panels/LayersPanel'
import { DEFAULT_HABITAT_CELL } from './config/mission'
import {
  type DataSource,
  type LayerImageUrls,
  type LayerInfo,
  getLayerImageUrls,
  loadGrid,
  loadLayers,
} from './services/data'
import { DEFAULT_OPTIONS, findRoute } from './services/routing'

const MAX_SLOPE_DEG = DEFAULT_OPTIONS.maxSlopeDeg
const DEFAULT_SLOPE_LAYER: OverlayState = { visible: true, opacity: 0.6 }

interface LoadedData {
  grid: Grid
  source: DataSource
  images: LayerImageUrls
  layers: LayerInfo[]
}

function SourceBadge({ source }: { source: DataSource }) {
  return <span className={`source-badge source-badge--${source}`}>{source === 'real' ? 'REAL DATA' : 'MOCK DATA'}</span>
}

function App() {
  const [data, setData] = useState<LoadedData | null>(null)
  const [habitat, setHabitat] = useState<Cell | null>(null)
  const [target, setTarget] = useState<Cell | null>(null)
  const [clickMode, setClickMode] = useState<ClickMode>('target')
  const [slopeLayer, setSlopeLayer] = useState<OverlayState>(DEFAULT_SLOPE_LAYER)

  useEffect(() => {
    let cancelled = false // ignore the result if the component unmounted meanwhile
    Promise.all([loadGrid(), loadLayers()]).then(([{ grid, source }, { layers }]) => {
      if (cancelled) return
      setData({ grid, source, images: getLayerImageUrls(grid, source), layers })
      // Snap the default habitat to a passable cell, so it also works on the real grid.
      setHabitat(findNearestPassableCell(DEFAULT_HABITAT_CELL, grid, MAX_SLOPE_DEG))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const route = useMemo(() => {
    if (!data || !habitat || !target) return null
    return findRoute(data.grid, habitat, target, DEFAULT_OPTIONS)
  }, [data, habitat, target])

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
          <LayersPanel layers={data.layers} slope={slopeLayer} onSlopeChange={setSlopeLayer} />
        ) : (
          <h2>Layers</h2>
        )}
      </aside>

      <main className="map-area">
        {data ? (
          <MapView
            grid={data.grid}
            orthoUrl={data.images.ortho}
            slopeUrl={data.images.slope}
            slopeVisible={slopeLayer.visible}
            slopeOpacity={slopeLayer.opacity}
            habitat={habitat}
            target={target}
            maxSlopeDeg={MAX_SLOPE_DEG}
            onCellClick={handleCellClick}
            hint={clickMode === 'habitat' ? 'Click to place habitat' : undefined}
          />
        ) : (
          <p className="muted center">Loading data...</p>
        )}
      </main>

      <aside className="panel panel--right">
        {data && (
          <MissionPanel
            grid={data.grid}
            habitat={habitat}
            target={target}
            route={route}
            clickMode={clickMode}
            onToggleMoveHabitat={() => setClickMode((m) => (m === 'habitat' ? 'target' : 'habitat'))}
            onClearTarget={() => setTarget(null)}
          />
        )}
      </aside>
    </div>
  )
}

export default App
