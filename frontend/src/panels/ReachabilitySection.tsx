import type { EvaProfile } from '../routing/types'
import { ROUTE_LABELS } from '../config/routes'
import { RouteSwatch } from './Legends'
import { RANKING_RULE, REACH_STATUS_LABELS, type StopReach, type StopReachInput, rankStops } from './reachability'

export interface ReachabilityView {
  computing: boolean
  results: StopReachInput[] | null
  /** Results belong to the previous habitat/scenario (shown faded while computing). */
  stale: boolean
  /** Scenario the results were computed with, shown as assumptions. */
  maxSlopeDeg: number
  evaProfile: EvaProfile
}

interface ReachabilitySectionProps {
  view: ReachabilityView
  hasHabitat: boolean
  stopCount: number
  /** Id of the stop that is the current science target, if any. */
  targetStopId: string | null
  onPlan: (stopId: string) => void
}

function MarginValue({ row }: { row: StopReach }) {
  if (row.marginMin === null || row.marginPct === null) return <dd>–</dd>
  const min = Math.abs(row.marginMin).toFixed(1)
  const pct = `${Math.abs(row.marginPct).toFixed(0)}%`
  return row.marginMin >= 0 ? (
    <dd>
      {min} min ({pct})
    </dd>
  ) : (
    <dd className="text-danger">
      over by {min} min ({pct})
    </dd>
  )
}

function ReachCard({ row, isTarget, onPlan }: { row: StopReach; isTarget: boolean; onPlan: () => void }) {
  return (
    <li className={`reach-card reach-card--${row.status}${row.best ? ' reach-card--best' : ''}`}>
      <div className="reach-card-head">
        <span className="reach-card-name">{row.name}</span>
        {row.best && <span className="badge badge--accent">Best option</span>}
      </div>
      <div className="reach-card-status">
        <span className={`badge badge--reach-${row.status}`}>{REACH_STATUS_LABELS[row.status]}</span>
        {row.reason && <span className="reach-card-reason">{row.reason}</span>}
      </div>
      {row.routeKind && row.distanceM !== null && row.maxSlopeDeg !== null && row.totalMin !== null && (
        <dl className="stats stats--compact reach-card-stats">
          <dt>Route</dt>
          <dd className="summary-route">
            <RouteSwatch kind={row.routeKind} recommended /> {ROUTE_LABELS[row.routeKind]}
          </dd>
          <dt>Distance</dt>
          <dd>{row.distanceM.toFixed(0)} m</dd>
          <dt>Max slope</dt>
          <dd>{row.maxSlopeDeg.toFixed(1)}°</dd>
          <dt className="stats-stack">Out + research + back</dt>
          <dd className="stats-stack">
            {row.outboundMin?.toFixed(1)} + {row.researchMin?.toFixed(1)} + {row.returnMin?.toFixed(1)} ={' '}
            {row.totalMin.toFixed(1)} min
          </dd>
          <dt>EVA limit</dt>
          <dd>{row.limitMin?.toFixed(1)} min</dd>
          <dt>Margin</dt>
          <MarginValue row={row} />
        </dl>
      )}
      {isTarget ? (
        <p className="muted small reach-card-current">Current science target</p>
      ) : (
        <button type="button" className="btn btn--small" onClick={onPlan}>
          Plan this EVA
        </button>
      )}
    </li>
  )
}

function Body(props: ReachabilitySectionProps) {
  const { view } = props
  if (props.stopCount === 0) return <p className="muted small">No science stops on this map.</p>
  if (!props.hasHabitat) return <p className="muted small">Place the habitat to check which stops are reachable.</p>
  if (!view.results) return <p className="muted small">Computing…</p>
  const rows = rankStops(view.results)
  return (
    <>
      {view.computing && <p className="muted small">Computing…</p>}
      <ol className={`reach-list${view.stale ? ' reach-list--stale' : ''}`} aria-busy={view.computing}>
        {rows.map((row) => (
          <ReachCard key={row.stopId} row={row} isTarget={row.stopId === props.targetStopId} onPlan={() => props.onPlan(row.stopId)} />
        ))}
      </ol>
    </>
  )
}

/**
 * "Where can we go?": every science stop checked from the current habitat with
 * the current scenario, ranked by safety (never by scientific value).
 */
function ReachabilitySection(props: ReachabilitySectionProps) {
  const { view } = props
  const eva = view.evaProfile
  return (
    <details className="panel-section collapsible reach-section" open>
      <summary className="collapsible-summary">
        <h3>Where can we go?</h3>
      </summary>
      <div className="section-head reach-badges">
        <span className="badge badge--assessment">Preliminary route assessment</span>
        <span className="badge badge--scenario">Scenario</span>
      </div>
      <p className="reach-rule">{RANKING_RULE}</p>
      <Body {...props} />
      <p className="reach-note">
        Out + research ({eva.researchMinutes} min) + back, against a {eva.maxEvaMinutes} min EVA with a{' '}
        {eva.safetyMarginPct}% safety margin and a {view.maxSlopeDeg}° slope limit. These scenario parameters are
        assumptions, not certified limits; change them under Scenario parameters.
      </p>
    </details>
  )
}

export default ReachabilitySection
