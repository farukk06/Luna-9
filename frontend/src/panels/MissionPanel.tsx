import type { Alternatives, Cell, EvaCheck, EvaProfile, Grid } from '../routing/types'
import { cellIndex } from '../map/coords'
import { formatNumber } from '../map/format'
import RoutesSection from './RoutesSection'
import ElevationProfile from './ElevationProfile'

export type ClickMode = 'target' | 'habitat'

export interface RoutingView {
  computing: boolean
  alternatives: Alternatives | null
  eva: EvaCheck | null
  evaProfile: EvaProfile
}

interface MissionPanelProps {
  grid: Grid
  habitat: Cell | null
  target: Cell | null
  routing: RoutingView | null
  clickMode: ClickMode
  onToggleMoveHabitat: () => void
  onClearTarget: () => void
  onProfileHover: (cell: Cell | null) => void
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

function MissionPanel(props: MissionPanelProps) {
  const { grid, habitat, target, routing, clickMode } = props
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

      {target && routing && (
        <RoutesSection
          computing={routing.computing}
          alternatives={routing.alternatives}
          eva={routing.eva}
          evaProfile={routing.evaProfile}
        />
      )}

      <section className="panel-section">
        <h3>Elevation profile</h3>
        <ElevationProfile
          hasTarget={target !== null}
          computing={routing?.computing ?? false}
          alternatives={routing?.alternatives ?? null}
          onHoverCell={props.onProfileHover}
        />
      </section>
    </>
  )
}

export default MissionPanel
