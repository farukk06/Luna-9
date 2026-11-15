import type { Alternatives, Cell, EvaCheck, EvaProfile, Grid } from '../routing/types'
import { cellIndex } from '../map/coords'
import { formatNumber } from '../map/format'
import type { Stop } from '../services/stops'
import RoutesSection from './RoutesSection'
import ElevationProfile from './ElevationProfile'
import MissionSummary from './MissionSummary'
import ScenarioPanel from './ScenarioPanel'
import ConditionsPanel from './ConditionsPanel'
import type { MedaFile } from '../services/meda'
import type { ScenarioParams } from './scenarioParams'
import type { RouteKind } from '../config/routes'

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
  /** Route kept selected by a card click (null = the recommended route is shown). */
  selectedRoute: RouteKind | null
  /** Route highlighted on the map right now (hovered card, else the selected one). */
  focusedRoute: RouteKind | null
  onSelectRoute: (kind: RouteKind) => void
  onHoverRoute: (kind: RouteKind | null) => void
  /** Valid meda.json, or null: then the conditions panel is not rendered at all. */
  meda: MedaFile | null
}

function CellStats({ cell, grid }: { cell: Cell; grid: Grid }) {
  const i = cellIndex(cell, grid)
  return (
    <dl className="stats stats--compact">
      <dt>Cell</dt>
      <dd>
        ({cell.col}, {cell.row})
      </dd>
      <dt>Elev.</dt>
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
      <section className="panel-section waypoints-section" aria-label="Habitat and target">
        <div className="waypoint">
          <div className="waypoint-head">
            <span className="waypoint-dot waypoint-dot--habitat" aria-hidden="true" />
            <h3>Habitat</h3>
          </div>
          {habitat ? <CellStats cell={habitat} grid={grid} /> : <p className="muted small">No passable cell found</p>}
          <button
            type="button"
            className={`btn btn--small${placingHabitat ? ' btn--active' : ''}`}
            aria-pressed={placingHabitat}
            onClick={props.onToggleMoveHabitat}
          >
            {placingHabitat ? 'Cancel move' : 'Move habitat'}
          </button>
        </div>
        <div className="waypoint">
          <div className="waypoint-head">
            <span className="waypoint-dot waypoint-dot--target" aria-hidden="true" />
            <h3>Science target</h3>
          </div>
          {target ? (
            <>
              <CellStats cell={target} grid={grid} />
              <button type="button" className="btn btn--small" onClick={props.onClearTarget}>
                Clear target
              </button>
            </>
          ) : (
            <p className="muted small">{props.touch ? 'Tap' : 'Click on'} the map to set a target</p>
          )}
        </div>
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

      {target && routing && (
        <RoutesSection
          computing={routing.computing}
          alternatives={routing.alternatives}
          eva={routing.eva}
          evaProfile={routing.evaProfile}
          blockedContext={blockedContext}
          selectedRoute={props.selectedRoute}
          focusedRoute={props.focusedRoute}
          onSelectRoute={props.onSelectRoute}
          onHoverRoute={props.onHoverRoute}
        />
      )}

      <details className="panel-section collapsible profile-section" open>
        <summary className="collapsible-summary">
          <h3>Elevation profile</h3>
        </summary>
        <ElevationProfile
          hasTarget={target !== null}
          computing={routing?.computing ?? false}
          alternatives={routing?.alternatives ?? null}
          selectedRoute={props.selectedRoute}
          onHoverCell={props.onProfileHover}
        />
      </details>

      {props.meda && <ConditionsPanel meda={props.meda} />}

      <ScenarioPanel params={props.scenario} onChange={props.onScenarioChange} onReset={props.onScenarioReset} />
    </>
  )
}

export default MissionPanel
