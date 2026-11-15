import { useId, useState } from 'react'
import type { MedaFile } from '../services/meda'
import {
  HISTORICAL_BADGE,
  NO_VERDICT_NOTE,
  PANEL_TITLE,
  SAMPLE_BADGE,
  SAMPLE_NOTE,
  doiUrl,
  historicalLabel,
  measurementDetail,
  measurementSource,
  observationOption,
  siteText,
  sortedObservations,
  visibleReadings,
} from './conditionsText'

interface ConditionsPanelProps {
  meda: MedaFile
  /** Open on first render (tests and server rendering); the panel starts closed otherwise. */
  defaultOpen?: boolean
}

/**
 * Historical MEDA measurements for a chosen sol and LMST time (CONTRACT
 * Section 7). Shows only values that exist, each with its source, and never
 * an EVA suitability verdict.
 */
function ConditionsPanel({ meda, defaultOpen = false }: ConditionsPanelProps) {
  const [solIndex, setSolIndex] = useState(0)
  const [obsIndex, setObsIndex] = useState(0)
  const solId = useId()
  const obsId = useId()
  const sol = meda.sols[solIndex] ?? meda.sols[0]
  const observations = sortedObservations(sol.observations)
  const observation = observations[obsIndex] ?? observations[0]
  const readings = visibleReadings(observation)

  return (
    <details className="panel-section collapsible conditions-section" open={defaultOpen || undefined}>
      <summary className="collapsible-summary">
        <h3>{PANEL_TITLE}</h3>
        <span className="badge badge--historical">{HISTORICAL_BADGE}</span>
        {observation.isSample && <span className="badge badge--pending">{SAMPLE_BADGE}</span>}
      </summary>

      <div className="conditions-pickers">
        <label htmlFor={solId}>Sol</label>
        <select
          id={solId}
          value={solIndex}
          onChange={(e) => {
            setSolIndex(Number(e.target.value))
            setObsIndex(0) // a new sol starts at its earliest observation
          }}
        >
          {meda.sols.map((s, i) => (
            <option key={s.sol} value={i}>
              Sol {s.sol}
            </option>
          ))}
        </select>
        <label htmlFor={obsId}>Time</label>
        <select id={obsId} value={obsIndex} onChange={(e) => setObsIndex(Number(e.target.value))}>
          {observations.map((o, i) => (
            <option key={`${o.localTime}-${i}`} value={i}>
              {observationOption(o)}
            </option>
          ))}
        </select>
      </div>

      <p className="conditions-label">{historicalLabel(sol.sol, observation)}</p>
      <p className="conditions-meta">
        {observation.earthDate !== null && <>Earth date {observation.earthDate} (UTC) · </>}
        {siteText(meda.site)}
      </p>
      {observation.isSample && <p className="conditions-sample">{SAMPLE_NOTE}</p>}

      <dl className="readings">
        {readings.map((r) => {
          const detail = r.measurement ? measurementDetail(r.field, r.measurement) : null
          return (
            <div className="reading" key={r.field}>
              <dt>{r.label}</dt>
              <dd className="reading-value">{r.value}</dd>
              {r.measurement && (
                <dd className="reading-source">
                  {measurementSource(r.measurement)}
                  {detail && <span className="reading-detail"> · {detail}</span>}
                </dd>
              )}
            </div>
          )
        })}
      </dl>

      <p className="conditions-note">{NO_VERDICT_NOTE}</p>

      <details className="source-details conditions-sources">
        <summary>Data sources</summary>
        <ul>
          {meda.source.datasets.map((d) => (
            <li key={d.name}>
              {d.name}
              {d.url && (
                <>
                  {' · '}
                  <a href={d.url} target="_blank" rel="noopener noreferrer">
                    link
                  </a>
                </>
              )}
              {d.doi && (
                <>
                  {' · '}
                  <a href={doiUrl(d.doi)} target="_blank" rel="noopener noreferrer">
                    DOI {d.doi}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    </details>
  )
}

export default ConditionsPanel
