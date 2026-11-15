import {
  IMPASSABLE_COLOR,
  ROUGHNESS_STOPS,
  SLOPE_OPAQUE_FROM_DEG,
  SLOPE_TRANSPARENT_MAX_DEG,
  cssGradient,
  slopeCssGradient,
  slopeLegendTicks,
} from '../map/colorScale'
import { MARKER_COLORS, ROUTE_COLORS, ROUTE_KINDS, ROUTE_LABELS } from '../config/routes'

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

function LineSample({ color, recommended }: { color: string; recommended: boolean }) {
  return <span className={`route-swatch${recommended ? '' : ' route-swatch--dashed'}`} style={{ color }} />
}

function MarkerSample({ color, shape }: { color: string; shape: 'circle' | 'diamond' | 'hexagon' }) {
  return <span className={`marker-sample marker-sample--${shape}`} style={{ background: color }} />
}

/** Explains the route lines and markers drawn on the map. */
export function RouteLegend() {
  return (
    <div className="legend">
      {ROUTE_KINDS.map((kind) => (
        <div className="legend-row" key={kind}>
          <LineSample color={ROUTE_COLORS[kind]} recommended={false} />
          <span>{ROUTE_LABELS[kind]}</span>
        </div>
      ))}
      <div className="legend-row">
        <LineSample color="var(--text)" recommended />
        <span>Recommended: thick solid line</span>
      </div>
      <div className="legend-row">
        <LineSample color="var(--text)" recommended={false} />
        <span>Alternative: thin dashed line</span>
      </div>
      <div className="legend-row">
        <MarkerSample color={MARKER_COLORS.habitat} shape="circle" />
        <span>Habitat</span>
      </div>
      <div className="legend-row">
        <MarkerSample color={MARKER_COLORS.target} shape="circle" />
        <span>Target</span>
      </div>
      <div className="legend-row">
        <MarkerSample color={MARKER_COLORS.pointOfNoReturn} shape="diamond" />
        <span>Point of no return</span>
      </div>
      <div className="legend-row">
        <MarkerSample color={MARKER_COLORS.scienceStop} shape="hexagon" />
        <span>Science stop</span>
      </div>
    </div>
  )
}
