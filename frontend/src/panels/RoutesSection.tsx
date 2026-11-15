import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { Alternatives, EvaCheck, EvaProfile, RouteResult } from '../routing/types'
import { ROUTE_COLORS, ROUTE_LABELS, type RouteKind } from '../config/routes'
import { type BlockedContext, evaDisplay, failureMessage, orderedRouteKinds, recommendationSentence } from './routeAssessment'
import RouteFailure from './RouteFailure'
import { RouteSwatch } from './Legends'

interface RouteInteraction {
  selectedRoute: RouteKind | null
  focusedRoute: RouteKind | null
  onSelectRoute: (kind: RouteKind) => void
  onHoverRoute: (kind: RouteKind | null) => void
}

interface RoutesSectionProps extends RouteInteraction {
  computing: boolean
  alternatives: Alternatives | null
  eva: EvaCheck | null
  evaProfile: EvaProfile
  blockedContext: BlockedContext
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  )
}

interface RouteCardProps extends RouteInteraction {
  kind: RouteKind
  route: RouteResult
  recommended: boolean
}

function RouteCard({ kind, route, recommended, selectedRoute, focusedRoute, onSelectRoute, onHoverRoute }: RouteCardProps) {
  const selected = selectedRoute === kind
  const classes = [
    'route-card',
    recommended && 'route-card--recommended',
    selected && 'route-card--selected',
    focusedRoute !== null && focusedRoute !== kind && 'route-card--dimmed',
  ]
    .filter(Boolean)
    .join(' ')
  // The card's selection ring and tag use the route colour (index.css --route-color).
  const style = { '--route-color': ROUTE_COLORS[kind] } as CSSProperties
  const head = (
    <div className="route-card-head">
      <RouteSwatch kind={kind} recommended={recommended} />
      <span className="route-name">{ROUTE_LABELS[kind]}</span>
      {selected && <span className="route-selected-tag">Selected</span>}
      {recommended && <span className="badge badge--accent">Recommended</span>}
    </div>
  )
  if (!route.ok) {
    return (
      <div className={classes} style={style}>
        {head}
        <p className="muted small">Not available: {failureMessage(route)}</p>
      </div>
    )
  }
  // Hover only for a real mouse: on touch, the tap (click) selects instead.
  const onPointerEnter = (e: PointerEvent) => e.pointerType === 'mouse' && onHoverRoute(kind)
  const onPointerLeave = (e: PointerEvent) => e.pointerType === 'mouse' && onHoverRoute(null)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectRoute(kind)
    }
  }
  return (
    <div
      className={classes}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${ROUTE_LABELS[kind]} route${recommended ? ', recommended' : ''}: show on map and in the elevation profile`}
      onClick={() => onSelectRoute(kind)}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {head}
      <div className="metrics">
        <Metric label="Distance" value={`${route.distanceM.toFixed(0)} m`} />
        <Metric label="Max slope" value={`${route.maxSlopeDeg.toFixed(1)}°`} />
        <Metric label="Mean slope" value={`${route.meanSlopeDeg.toFixed(1)}°`} />
        <Metric label="Out / back min" value={`${route.durationMin.toFixed(1)} / ${route.returnDurationMin.toFixed(1)}`} />
      </div>
    </div>
  )
}

function EvaSummary({ eva, profile }: { eva: EvaCheck; profile: EvaProfile }) {
  const shown = evaDisplay(eva)
  return (
    <div className={`eva-box${eva.withinLimit ? ' eva-box--ok' : ' eva-box--warning'}`}>
      <div className="eva-head">
        <span className="eva-title">EVA check · recommended route</span>
        <span className={`eva-state${eva.withinLimit ? '' : ' eva-state--warning'}`}>
          {eva.withinLimit ? 'EVA ready' : 'Over limit'}
        </span>
      </div>
      <dl className="stats stats--compact">
        <dt>Out + research + return</dt>
        <dd>
          {shown.outbound} + {shown.research} + {shown.return} min
        </dd>
        <dt>Total / limit</dt>
        <dd>
          {shown.total} / {shown.limit} min
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
        <span className="badge badge--scenario">Scenario</span> max EVA {profile.maxEvaMinutes} min,{' '}
        {profile.safetyMarginPct}% safety margin, {profile.researchMinutes} min research
      </p>
    </div>
  )
}

type RoutesBodyProps = Omit<RoutesSectionProps, 'computing' | 'alternatives'> & { alternatives: Alternatives }

function RoutesBody({ alternatives, eva, evaProfile, blockedContext, ...interaction }: RoutesBodyProps) {
  if (alternatives.recommended === null) {
    // CONTRACT: with no recommendation, show only the explanation, no routes.
    return <RouteFailure alternatives={alternatives} context={blockedContext} />
  }
  return (
    <>
      <p className="recommendation">{recommendationSentence(alternatives)}</p>
      <div className="route-cards">
        {orderedRouteKinds(alternatives).map((kind) => (
          <RouteCard
            key={kind}
            kind={kind}
            route={alternatives[kind]}
            recommended={kind === alternatives.recommended}
            {...interaction}
          />
        ))}
      </div>
      <p className="hint hint--pointer">Hover a route to preview it on the map; click to keep it selected.</p>
      <p className="hint hint--touch">Tap a route to highlight it on the map and in the profile.</p>
      {eva && <EvaSummary eva={eva} profile={evaProfile} />}
    </>
  )
}

function RoutesSection({ computing, alternatives, ...rest }: RoutesSectionProps) {
  return (
    <section className="panel-section routes-section">
      <div className="section-head">
        <h3>Routes</h3>
        <span className="badge badge--assessment">Preliminary route assessment</span>
      </div>
      {computing || !alternatives ? <p className="muted">Computing routes…</p> : <RoutesBody alternatives={alternatives} {...rest} />}
    </section>
  )
}

export default RoutesSection
