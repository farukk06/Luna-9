import type { Cell, Grid, RouteResult } from '../routing/types'
import { cellIndex } from '../map/coords'
import { formatNumber } from '../map/format'

export type ClickMode = 'target' | 'habitat'

interface MissionPanelProps {
  grid: Grid
  habitat: Cell | null
  target: Cell | null
  route: RouteResult | null
  clickMode: ClickMode
  onToggleMoveHabitat: () => void
  onClearTarget: () => void
}

function CellStats({ cell, grid }: { cell: Cell; grid: Grid }) {
  const i = cellIndex(cell, grid)
  return (
    <dl className="stats">
      <dt>Cell</dt>
      <dd>
        ({cell.col}, {cell.row})
      </dd>
      <dt>Elevation</dt>
      <dd>{formatNumber(grid.elevation[i], 1)} m</dd>
      <dt>Slope</dt>
      <dd>{formatNumber(grid.slope[i], 1)}°</dd>
    </dl>
  )
}

function RouteStats({ route }: { route: RouteResult }) {
  if (!route.ok) return <p className="muted">No route: {route.reason}</p>
  return (
    <dl className="stats">
      <dt>Distance</dt>
      <dd>{route.distanceM.toFixed(0)} m</dd>
      <dt>Outbound</dt>
      <dd>{route.durationMin.toFixed(1)} min</dd>
      <dt>Return</dt>
      <dd>{route.returnDurationMin.toFixed(1)} min</dd>
    </dl>
  )
}

function MissionPanel(props: MissionPanelProps) {
  const { grid, habitat, target, route, clickMode } = props
  const placingHabitat = clickMode === 'habitat'
  return (
    <>
      <h2>Mission</h2>

      <section className="panel-section">
        <h3>Habitat</h3>
        {habitat ? <CellStats cell={habitat} grid={grid} /> : <p className="muted">No passable cell found for the habitat</p>}
        <button
          type="button"
          className={`btn${placingHabitat ? ' btn--active' : ''}`}
          aria-pressed={placingHabitat}
          onClick={props.onToggleMoveHabitat}
        >
          {placingHabitat ? 'Cancel move' : 'Move habitat'}
        </button>
      </section>

      <section className="panel-section">
        <h3>Target</h3>
        {target ? (
          <>
            <CellStats cell={target} grid={grid} />
            <button type="button" className="btn" onClick={props.onClearTarget}>
              Clear target
            </button>
          </>
        ) : (
          <p className="muted">Click on the map to set a target</p>
        )}
      </section>

      {route && (
        <section className="panel-section">
          <h3>Route (mock, temporary)</h3>
          <RouteStats route={route} />
        </section>
      )}
    </>
  )
}

export default MissionPanel
