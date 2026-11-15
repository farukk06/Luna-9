import type { Alternatives, Cell, EvaCheck, EvaProfile, Grid } from '../routing/types'
import { cellIndex } from '../map/coords'
import { formatNumber } from '../map/format'
import type { Stop } from '../services/stops'
import RoutesSection from './RoutesSection'
import ElevationProfile from './ElevationProfile'
import MissionSummary from './MissionSummary'
import ScenarioPanel from './ScenarioPanel'
import type { ScenarioParams } from './scenarioParams'

export type ClickMode = 'target' | 'habitat'

export interface RoutingView {
  computing: boolean
  alternatives: Alternatives | null
  eva: EvaCheck | null
  evaProfile: EvaProfile
  /** Slope limit the shown routes were computed with. */
  maxSlopeDeg: number
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
  /** Live slider values (routes follow them after a short debounce). */
  scenario: ScenarioParams
  onScenarioChange: (next: ScenarioParams) => void
  onScenarioReset: () => void
  stops: Stop[]
  mockData: boolean
  habitatPendingReview: boolean
  /** Phone/touch layout: "Tap" instead of "Click" wording. */
  touch: boolean
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
  // Same inputs the shown routes were computed with, to explain a blocked habitat/target.
  const blockedContext = {
    grid,
    habitat,
    target,
    maxSlopeDeg: routing?.maxSlopeDeg ?? props.scenario.options.maxSlopeDeg,
  }
  return (
    <>
      <h2>Mission</h2>

      {/* Section classes set the stacked phone order in index.css; desktop keeps this order. */}
      <section className="panel-section habitat-section">
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

      <section className="panel-section target-section">
        <h3>Target</h3>
        {target ? (
          <>
            <CellStats cell={target} grid={grid} />
            <button type="button" className="btn" onClick={props.onClearTarget}>
              Clear target
            </button>
          </>
        ) : (
          <p className="muted">{props.touch ? 'Tap' : 'Click on'} the map to set a target</p>
        )}
      </section>

      <MissionSummary
        grid={grid}
        hasTarget={target !== null}
        computing={routing?.computing ?? false}
        alternatives={routing?.alternatives ?? null}
        eva={routing?.eva ?? null}
        maxSlopeLimitDeg={blockedContext.maxSlopeDeg}
        blockedContext={blockedContext}
        stops={props.stops}
        mockData={props.mockData}
        habitatPendingReview={props.habitatPendingReview}
      />

      <ScenarioPanel params={props.scenario} onChange={props.onScenarioChange} onReset={props.onScenarioReset} />

      {target && routing && (
        <RoutesSection
          computing={routing.computing}
          alternatives={routing.alternatives}
          eva={routing.eva}
          evaProfile={routing.evaProfile}
          blockedContext={blockedContext}
        />
      )}

      <section className="panel-section profile-section">
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
