import type { ReactNode } from 'react'
import type { Alternatives, EvaCheck, Grid } from '../routing/types'
import type { Stop } from '../services/stops'
import { ROUTE_LABELS } from '../config/routes'
import { type BlockedContext, evaDisplay } from './routeAssessment'
import RouteFailure from './RouteFailure'
import { NEAR_ROUTE_M, evaMargin, missionWarnings, stopsNearRoute } from './missionBriefing'

interface MissionSummaryProps {
  grid: Grid
  hasTarget: boolean
  computing: boolean
  alternatives: Alternatives | null
  eva: EvaCheck | null
  maxSlopeLimitDeg: number
  stops: Stop[]
  mockData: boolean
  habitatPendingReview: boolean
  blockedContext: BlockedContext
}

function MarginText({ eva }: { eva: EvaCheck }) {
  const margin = evaMargin(eva)
  if (!margin) return <dd>–</dd>
  const pct = `${Math.abs(margin.remainingPct).toFixed(0)}%`
  const min = Math.abs(margin.remainingMin).toFixed(1)
  return margin.remainingMin >= 0 ? (
    <dd>
      {min} min ({pct} of limit)
    </dd>
  ) : (
    <dd className="text-danger">
      over by {min} min ({pct})
    </dd>
  )
}

function Briefing(props: MissionSummaryProps & { alternatives: Alternatives }) {
  const { alternatives, eva, grid } = props
  const kind = alternatives.recommended
  if (!kind) return <RouteFailure alternatives={alternatives} context={props.blockedContext} />
  const route = alternatives[kind]
  const nearby = stopsNearRoute(props.stops, route.path, grid)
  const warnings = missionWarnings({
    route,
    eva,
    maxSlopeLimitDeg: props.maxSlopeLimitDeg,
    mockData: props.mockData,
    habitatPendingReview: props.habitatPendingReview,
  })
  const shown = eva ? evaDisplay(eva) : null
  return (
    <>
      <dl className="stats">
        <dt>Route</dt>
        <dd>{ROUTE_LABELS[kind]} (recommended)</dd>
        <dt>Distance</dt>
        <dd>{route.distanceM.toFixed(0)} m</dd>
        {shown && eva && (
          <>
            {/* Longest row: on a phone it moves below its label (index.css .stats-stack). */}
            <dt className="stats-stack">Out + research + back</dt>
            <dd className="stats-stack">
              {shown.outbound} + {shown.research} + {shown.return} = {shown.total} min
            </dd>
            <dt>EVA limit</dt>
            <dd>{shown.limit} min</dd>
            <dt>Remaining margin</dt>
            <MarginText eva={eva} />
          </>
        )}
      </dl>
      {nearby.length > 0 && (
        <div className="briefing-block">
          <div className="briefing-label">Science stops on the way (≤ {NEAR_ROUTE_M} m)</div>
          <ul className="briefing-list">
            {nearby.map(({ stop, distanceM }) => (
              <li key={stop.id}>
                {stop.name} <span className="muted">· {distanceM.toFixed(0)} m off route</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="briefing-warnings">
          {warnings.map((w) => (
            <li key={w.id} className={`briefing-warning briefing-warning--${w.level}`}>
              {w.text}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Mission briefing for the recommended route: times, EVA margin, stops and warnings. */
function MissionSummary(props: MissionSummaryProps) {
  const { hasTarget, computing, alternatives } = props
  let body: ReactNode
  if (!hasTarget) body = <p className="muted">Set a science target on the map to get a mission briefing.</p>
  else if (computing || !alternatives) body = <p className="muted">Computing routes…</p>
  else body = <Briefing {...props} alternatives={alternatives} />
  return (
    <section className="panel-section mission-summary">
      <h3>Mission summary</h3>
      <p className="assessment-tag">Preliminary route assessment</p>
      {body}
    </section>
  )
}

export default MissionSummary
