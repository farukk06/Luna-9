import { useEffect, useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Alternatives, Cell } from '../routing/types'
import { ROUTE_COLORS, ROUTE_LABELS, type RouteKind } from '../config/routes'
import { formatNumber } from '../map/format'
import { type ProfileRow, buildProfileRows, elevationExtent, hoverCellForRow, niceScale } from './profileData'

interface ElevationProfileProps {
  hasTarget: boolean
  computing: boolean
  alternatives: Alternatives | null
  /** Reports the path cell under the pointer (null when the pointer leaves the chart). */
  onHoverCell: (cell: Cell | null) => void
}

const TOOLTIP_MAX_WIDTH_PX = 190

interface SeriesInfo {
  kind: RouteKind
  label: string
}

function ProfileTooltip({ row, rec, cmp }: { row: ProfileRow | undefined; rec: SeriesInfo; cmp: SeriesInfo | null }) {
  if (!row) return null
  const line = (info: SeriesInfo, elevation?: number, slope?: number) =>
    elevation === undefined ? null : (
      <div className="profile-tooltip-row" key={info.kind}>
        <span className="profile-tooltip-dot" style={{ background: ROUTE_COLORS[info.kind] }} />
        {info.label}: {formatNumber(elevation, 1)} m · slope {formatNumber(slope ?? 0, 1)}°
      </div>
    )
  return (
    <div className="profile-tooltip">
      <div className="profile-tooltip-head">{row.distanceM.toFixed(0)} m from habitat</div>
      {line(rec, row.recElevation, row.recSlope)}
      {cmp && line(cmp, row.cmpElevation, row.cmpSlope)}
    </div>
  )
}

function emptyText(hasTarget: boolean, computing: boolean, alternatives: Alternatives | null): string | null {
  if (!hasTarget) return 'Set a target to see the elevation profile.'
  if (computing || !alternatives) return 'Computing routes…'
  if (alternatives.recommended === null) return 'No elevation profile: no route was found.'
  return null
}

function ElevationProfile({ hasTarget, computing, alternatives, onHoverCell }: ElevationProfileProps) {
  const recKind = alternatives?.recommended ?? null
  const rec = recKind && alternatives ? alternatives[recKind] : null
  // Compare against the shortest route, unless it is the recommended one or failed.
  const cmp = alternatives && recKind !== 'shortest' && alternatives.shortest.ok ? alternatives.shortest : null
  const rows = useMemo(() => (rec ? buildProfileRows(rec, cmp) : []), [rec, cmp])
  // Round ticks: ~5 distance steps (≥ 50 m) and ~4 elevation steps of at least 5 m.
  const xScale = useMemo(() => niceScale(0, rows[rows.length - 1]?.distanceM ?? 0, 5, 50), [rows])
  const yScale = useMemo(() => {
    const [lo, hi] = elevationExtent(rows) ?? [0, 0]
    return niceScale(lo, hi, 4, 5)
  }, [rows])
  // If the chart disappears or changes under the pointer, mouseleave never fires:
  // clear the map marker so it cannot get stuck.
  useEffect(() => () => onHoverCell(null), [rows, onHoverCell])

  const empty = emptyText(hasTarget, computing, alternatives)
  if (empty || !rec || !recKind) return <p className="muted">{empty}</p>

  const recInfo: SeriesInfo = { kind: recKind, label: `${ROUTE_LABELS[recKind]} (recommended)` }
  const cmpInfo: SeriesInfo | null = cmp ? { kind: 'shortest', label: ROUTE_LABELS.shortest } : null

  return (
    <div className="profile-chart">
      <ResponsiveContainer width="100%" height={210}>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onMouseMove={(state) => {
            const index = state.activeTooltipIndex
            const row = index === undefined || index === null ? undefined : rows[Number(index)]
            onHoverCell(row ? hoverCellForRow(row, rec, cmp) : null)
          }}
          onMouseLeave={() => onHoverCell(null)}
        >
          <CartesianGrid stroke="#33373e" strokeDasharray="2 4" />
          <XAxis
            dataKey="distanceM"
            type="number"
            domain={xScale.domain}
            ticks={xScale.ticks}
            allowDataOverflow
            tickFormatter={(v: number) => v.toFixed(0)}
            tick={{ fill: '#9aa0a8', fontSize: 11 }}
            stroke="#4a4f57"
            height={38} // room for tick labels plus the axis title below them
            label={{ value: 'Distance (m)', position: 'insideBottom', offset: 0, fill: '#9aa0a8', fontSize: 11 }}
          />
          <YAxis
            domain={yScale.domain}
            ticks={yScale.ticks}
            allowDataOverflow
            tickFormatter={(v: number) => formatNumber(v, 0)}
            tick={{ fill: '#9aa0a8', fontSize: 11 }}
            stroke="#4a4f57"
            width={52}
            label={{ value: 'Elevation (m)', angle: -90, position: 'insideLeft', fill: '#9aa0a8', fontSize: 11, dy: 40 }}
          />
          <Tooltip
            content={({ payload }) => (
              <ProfileTooltip row={payload?.[0]?.payload as ProfileRow | undefined} rec={recInfo} cmp={cmpInfo} />
            )}
            cursor={{ stroke: '#9aa0a8', strokeDasharray: '3 3' }}
            // Keep the box inside the chart: Recharts flips it to the left of the
            // pointer when it would overflow, which only works if it is narrower
            // than the chart, hence the max width (text wraps inside).
            allowEscapeViewBox={{ x: false, y: false }}
            wrapperStyle={{ maxWidth: TOOLTIP_MAX_WIDTH_PX, zIndex: 5 }}
            offset={10}
          />
          {cmpInfo && (
            <Line
              dataKey="cmpElevation"
              stroke={ROUTE_COLORS.shortest}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="recElevation"
            stroke={ROUTE_COLORS[recKind]}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="profile-legend">
        <span>
          <span className="route-swatch" style={{ color: ROUTE_COLORS[recKind] }} /> {recInfo.label}
        </span>
        {cmpInfo && (
          <span>
            <span className="route-swatch route-swatch--dashed" style={{ color: ROUTE_COLORS.shortest }} /> {cmpInfo.label}
          </span>
        )}
      </div>
    </div>
  )
}

export default ElevationProfile
