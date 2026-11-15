import {
  IMPASSABLE_COLOR,
  ROUGHNESS_STOPS,
  SLOPE_OPAQUE_FROM_DEG,
  SLOPE_TRANSPARENT_MAX_DEG,
  cssGradient,
  slopeCssGradient,
  slopeLegendTicks,
} from '../map/colorScale'
import { ROUTE_COLORS, ROUTE_KINDS, ROUTE_LABELS, type RouteKind, lineStyleFor } from '../config/routes'

/** Gradient bar with tick labels; colours come from the same scale as the map image. */
export function SlopeLegend({ maxSlopeDeg }: { maxSlopeDeg: number }) {
  const ticks = slopeLegendTicks(maxSlopeDeg)
  return (
    <div className="legend">
      <div className="legend-bar legend-bar--outlined" style={{ background: slopeCssGradient(maxSlopeDeg) }} />
      <div className="legend-ticks">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(t / maxSlopeDeg) * 100}%` }}>
            {t}°
          </span>
        ))}
      </div>
      <div className="legend-row">
        <span className="legend-swatch" style={{ background: IMPASSABLE_COLOR }} />
        <span>&gt; {maxSlopeDeg}°: impassable (scenario slope limit)</span>
      </div>
      <p className="legend-note" title={`Fully transparent up to ${SLOPE_TRANSPARENT_MAX_DEG}°, fully shown from ${SLOPE_OPAQUE_FROM_DEG}°`}>
        Gentle slopes shown transparent
      </p>
    </div>
  )
}

/** Relative scale only: roughness is normalised by the grid's own P95, so no unit is shown. */
export function RoughnessLegend() {
  return (
    <div className="legend">
      <div className="legend-bar" style={{ background: cssGradient(ROUGHNESS_STOPS) }} />
      <div className="legend-ends">
        <span>Low</span>
        <span>High</span>
      </div>
      <p className="legend-note">Low → High (relative, P95-normalized)</p>
    </div>
  )
}

interface LineSampleProps {
  color: string
  recommended: boolean
  /** Wider sample for the legend; cards and chart use the short one. */
  width?: number
}

/**
 * Short line drawn exactly like the map: dark casing under the coloured line,
 * round caps, solid + glow for the recommended route, dashed otherwise.
 */
export function LineSample({ color, recommended, width = 26 }: LineSampleProps) {
  const spec = lineStyleFor(recommended)
  // Map widths scaled down a little so the sample fits a text line.
  const scale = 0.7
  const y = 7
  const pad = 4
  const dash = spec.dash.length ? spec.dash.map((d) => d * scale).join(' ') : undefined
  return (
    <svg className="line-sample" width={width} height={14} viewBox={`0 0 ${width} 14`} aria-hidden="true">
      {spec.glowWidth > 0 && (
        <line x1={pad} y1={y} x2={width - pad} y2={y} stroke={color} strokeOpacity={0.22} strokeWidth={spec.glowWidth * 0.55} strokeLinecap="round" />
      )}
      <line x1={pad} y1={y} x2={width - pad} y2={y} stroke="#101216" strokeOpacity={spec.casingOpacity + 0.2} strokeWidth={spec.casingWidth * scale} strokeLinecap="round" />
      <line x1={pad} y1={y} x2={width - pad} y2={y} stroke={color} strokeOpacity={spec.opacity} strokeWidth={spec.width * scale} strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

/** Line sample in a route's own colour. */
export function RouteSwatch({ kind, recommended }: { kind: RouteKind; recommended: boolean }) {
  return <LineSample color={ROUTE_COLORS[kind]} recommended={recommended} />
}

type MarkerShape = 'habitat' | 'target' | 'diamond' | 'hexagon'

/** Small CSS versions of the map symbols (same shapes and colours as map/markers.ts). */
function MarkerSample({ shape }: { shape: MarkerShape }) {
  return <span className={`marker-sample marker-sample--${shape}`} aria-hidden="true" />
}

/**
 * Explains the route lines and markers drawn on the map. Each route is shown
 * in its own colour and in the line style it currently has on the map.
 */
export function RouteLegend({ recommended }: { recommended: RouteKind | null }) {
  return (
    <div className="legend legend--routes">
      {ROUTE_KINDS.map((kind) => (
        <div className="legend-row" key={kind}>
          <LineSample color={ROUTE_COLORS[kind]} recommended={kind === recommended} width={34} />
          <span>
            {ROUTE_LABELS[kind]}
            {kind === recommended && <span className="legend-em"> · recommended</span>}
          </span>
        </div>
      ))}
      <p className="legend-note">
        Recommended: thick solid line with arrows (habitat → target). Alternatives: thin dashed lines.
      </p>
      <div className="legend-markers">
        <div className="legend-row">
          <MarkerSample shape="habitat" />
          <span>Habitat</span>
        </div>
        <div className="legend-row">
          <MarkerSample shape="target" />
          <span>Target</span>
        </div>
        <div className="legend-row">
          <MarkerSample shape="diamond" />
          <span>Point of no return</span>
        </div>
        <div className="legend-row">
          <MarkerSample shape="hexagon" />
          <span>Science stop</span>
        </div>
      </div>
    </div>
  )
}
