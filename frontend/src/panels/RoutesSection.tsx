import type { Alternatives, EvaCheck, EvaProfile, RouteResult } from '../routing/types'
import { ROUTE_COLORS, ROUTE_LABELS, type RouteKind } from '../config/routes'
import { evaDisplay, failureMessage, firstFailureMessage, orderedRouteKinds, recommendationSentence } from './routeAssessment'

interface RoutesSectionProps {
  computing: boolean
  alternatives: Alternatives | null
  eva: EvaCheck | null
  evaProfile: EvaProfile
}

const min = (v: number) => `${v.toFixed(1)} min`

function RouteCard({ kind, route, recommended }: { kind: RouteKind; route: RouteResult; recommended: boolean }) {
  return (
    <div className={`route-card${recommended ? ' route-card--recommended' : ''}`}>
      <div className="route-card-head">
        <span className={`route-swatch${recommended ? '' : ' route-swatch--dashed'}`} style={{ color: ROUTE_COLORS[kind] }} />
        <span className="route-name">{ROUTE_LABELS[kind]}</span>
        {recommended && <span className="route-badge">Recommended</span>}
      </div>
      {route.ok ? (
        <dl className="stats">
          <dt>Distance</dt>
          <dd>{route.distanceM.toFixed(0)} m</dd>
          <dt>Max slope</dt>
          <dd>{route.maxSlopeDeg.toFixed(1)}°</dd>
          <dt>Mean slope</dt>
          <dd>{route.meanSlopeDeg.toFixed(1)}°</dd>
          <dt>Outbound / return</dt>
          <dd>
            {min(route.durationMin)} / {min(route.returnDurationMin)}
          </dd>
        </dl>
      ) : (
        <p className="muted">Not available: {failureMessage(route)}</p>
      )}
    </div>
  )
}

function EvaSummary({ eva, profile }: { eva: EvaCheck; profile: EvaProfile }) {
  const shown = evaDisplay(eva)
  return (
    <div className={`eva-box${eva.withinLimit ? '' : ' eva-box--warning'}`}>
      <div className="eva-title">EVA check (recommended route)</div>
      <dl className="stats">
        <dt>Outbound + research + return</dt>
        <dd>
          {shown.outbound} + {shown.research} + {shown.return} min
        </dd>
        <dt>Total / limit</dt>
        <dd>
          {shown.total} min / {shown.limit} min
        </dd>
      </dl>
      {eva.withinLimit ? (
        <p className="eva-status">EVA ready: within the time limit.</p>
      ) : (
        <p className="eva-status" role="alert">
          EVA limit exceeded.
          {eva.pointOfNoReturnIndex !== undefined &&
            ' Turn back at the Point of no return marked on the map, or the habitat cannot be reached in time.'}
        </p>
      )}
      <p className="scenario-note">
        Scenario: max EVA {profile.maxEvaMinutes} min, {profile.safetyMarginPct}% safety margin, {profile.researchMinutes}{' '}
        min research.
      </p>
    </div>
  )
}

function RoutesBody({ alternatives, eva, evaProfile }: { alternatives: Alternatives; eva: EvaCheck | null; evaProfile: EvaProfile }) {
  if (alternatives.recommended === null) {
    // CONTRACT: with no recommendation, show only the explanation, no routes.
    return <p className="route-failure">{firstFailureMessage(alternatives)}</p>
  }
  return (
    <>
      <p className="recommendation">{recommendationSentence(alternatives)}</p>
      {eva && <EvaSummary eva={eva} profile={evaProfile} />}
      {orderedRouteKinds(alternatives).map((kind) => (
        <RouteCard key={kind} kind={kind} route={alternatives[kind]} recommended={kind === alternatives.recommended} />
      ))}
    </>
  )
}

function RoutesSection({ computing, alternatives, eva, evaProfile }: RoutesSectionProps) {
  return (
    <section className="panel-section">
      <h3>Routes</h3>
      <p className="assessment-tag">Preliminary route assessment</p>
      {computing || !alternatives ? (
        <p className="muted">Computing routes...</p>
      ) : (
        <RoutesBody alternatives={alternatives} eva={eva} evaProfile={evaProfile} />
      )}
    </section>
  )
}

export default RoutesSection
