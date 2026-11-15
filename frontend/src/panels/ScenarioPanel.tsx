import type { EvaProfile } from '../routing/types'
import {
  EVA_RANGES,
  SLOPE_LIMIT_RANGE,
  type ScenarioParams,
  type SliderRange,
  WEIGHT_RANGE,
  type WeightKey,
  isDefaultScenario,
  withEva,
  withSlopeLimit,
  withWeight,
} from './scenarioParams'

interface ScenarioPanelProps {
  params: ScenarioParams
  onChange: (next: ScenarioParams) => void
  onReset: () => void
}

interface ParamSliderProps {
  label: string
  value: number
  range: SliderRange
  /** Text shown next to the slider, e.g. "25°". */
  display: string
  onChange: (value: number) => void
}

function ParamSlider({ label, value, range, display, onChange }: ParamSliderProps) {
  return (
    <label className="param-slider">
      <span className="param-label">{label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="param-value">{display}</span>
    </label>
  )
}

const WEIGHTS: { key: WeightKey; label: string }[] = [
  { key: 'wDistance', label: 'Distance' },
  { key: 'wSlope', label: 'Slope' },
  { key: 'wRoughness', label: 'Roughness' },
]

const EVA_FIELDS: { key: keyof EvaProfile; label: string; unit: string }[] = [
  { key: 'maxEvaMinutes', label: 'Max EVA duration', unit: 'min' },
  { key: 'researchMinutes', label: 'Research time', unit: 'min' },
  { key: 'safetyMarginPct', label: 'Safety margin', unit: '%' },
]

/** Weights keep one decimal because wDistance can sit at its 0.1 minimum. */
const weightText = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/**
 * Collapsible panel for the planning assumptions (closed by default).
 * Changes go straight to onChange; the app debounces the route recalculation.
 */
function ScenarioPanel({ params, onChange, onReset }: ScenarioPanelProps) {
  const { options, eva } = params
  return (
    <details className="panel-section scenario-panel">
      <summary className="scenario-summary">
        <h3>Scenario parameters</h3>
        <span className="scenario-badge" title="Planning assumptions, not measurements">
          Scenario
        </span>
      </summary>

      <p className="scenario-help">Assumptions for planning, not measured values.</p>

      <h4 className="param-group">Terrain</h4>
      <ParamSlider
        label="Max slope limit"
        value={options.maxSlopeDeg}
        range={SLOPE_LIMIT_RANGE}
        display={`${options.maxSlopeDeg}°`}
        onChange={(v) => onChange(withSlopeLimit(params, v))}
      />

      <h4 className="param-group">Route weights</h4>
      {WEIGHTS.map(({ key, label }) => (
        <ParamSlider
          key={key}
          label={label}
          value={options[key]}
          range={WEIGHT_RANGE}
          display={weightText(options[key])}
          onChange={(v) => onChange(withWeight(params, key, v))}
        />
      ))}
      <p className="scenario-help">
        Weights affect the balanced route only; shortest and safest use fixed weights. The slope limit applies to all
        routes and to the map&apos;s impassable (purple) cells.
      </p>

      <h4 className="param-group">EVA</h4>
      {EVA_FIELDS.map(({ key, label, unit }) => (
        <ParamSlider
          key={key}
          label={label}
          value={eva[key]}
          range={EVA_RANGES[key]}
          display={`${eva[key]} ${unit}`}
          onChange={(v) => onChange(withEva(params, key, v))}
        />
      ))}

      <button type="button" className="btn" onClick={onReset} disabled={isDefaultScenario(params)}>
        Reset to defaults
      </button>
    </details>
  )
}

export default ScenarioPanel
