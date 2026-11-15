import {
  MEDA_VALUE_FIELDS,
  type MedaFile,
  type MedaMeasurement,
  type MedaObservation,
  type MedaSite,
  type MedaValueField,
} from '../services/meda'

// Text for the conditions panel (CONTRACT Section 7 UI rules). MEDA values
// are historical measurements: nothing here may read as current weather, and
// no EVA suitability verdict is derived from them.

export const PANEL_TITLE = 'Surface conditions'
export const HISTORICAL_BADGE = 'Historical'
export const SAMPLE_BADGE = 'Sample'
export const SAMPLE_NOTE = 'Sample scenario – not a measurement'
export const NO_VERDICT_NOTE = 'No EVA suitability verdict is derived from these values.'

export const FIELD_LABELS: Record<MedaValueField, string> = {
  pressurePa: 'Pressure',
  relativeHumidityPct: 'Relative humidity',
  airTempC: 'Air temperature',
  sensorTempC: 'Sensor temperature (not air temperature)',
  windSpeedMps: 'Wind speed',
  opacity: 'Atmospheric opacity',
}

/** Unit shown after a value; opacity is dimensionless, so it has none. */
export const DISPLAY_UNITS: Record<MedaValueField, string> = {
  pressurePa: 'Pa',
  relativeHumidityPct: '%',
  airTempC: '°C',
  sensorTempC: '°C',
  windSpeedMps: 'm/s',
  opacity: '',
}

const DECIMALS: Record<MedaValueField, number> = {
  pressurePa: 1,
  relativeHumidityPct: 1,
  airTempC: 1,
  sensorTempC: 1,
  windSpeedMps: 1,
  opacity: 2,
}

/** "Historical MEDA data – Sol 100, LMST 13:05 – not current conditions" */
export function historicalLabel(sol: number, observation: Pick<MedaObservation, 'localTime'>): string {
  return `Historical MEDA data – Sol ${sol}, LMST ${observation.localTime} – not current conditions`
}

export function formatValue(field: MedaValueField, value: number, decimals = DECIMALS[field]): string {
  const unit = DISPLAY_UNITS[field]
  const number = value.toFixed(decimals)
  if (!unit) return number
  return unit === '%' ? `${number}%` : `${number} ${unit}`
}

export interface Reading {
  field: MedaValueField
  label: string
  value: string
  measurement: MedaMeasurement | null
}

/** Only the non-null values of an observation, in a fixed order. Null fields get no row at all. */
export function visibleReadings(observation: MedaObservation): Reading[] {
  return MEDA_VALUE_FIELDS.flatMap((field) => {
    const value = observation[field]
    if (value === null) return []
    return [{ field, label: FIELD_LABELS[field], value: formatValue(field, value), measurement: observation.measurements[field] ?? null }]
  })
}

/** Small provenance line: "FILE.CSV · COLUMN"; then "± 1.0 Pa · Quality: flag" when the source gives them. */
export function measurementSource(m: MedaMeasurement): string {
  return `${m.file} · ${m.column}`
}

export function measurementDetail(field: MedaValueField, m: MedaMeasurement): string | null {
  const parts: string[] = []
  if (m.uncertainty !== null) parts.push(`± ${formatValue(field, m.uncertainty, DECIMALS[field] + 1)}`)
  if (m.quality !== null) parts.push(`Quality: ${m.quality}`)
  return parts.length ? parts.join(' · ') : null
}

/** Observations of a sol in LMST order (the file order is not guaranteed). */
export function sortedObservations(observations: MedaObservation[]): MedaObservation[] {
  return [...observations].sort((a, b) => a.localTime.localeCompare(b.localTime))
}

/**
 * Short codes for the time picker. Sensor temperature gets its own code (Ts)
 * so it is never read as air temperature (T).
 */
export const FIELD_CODES: Record<MedaValueField, string> = {
  pressurePa: 'P',
  relativeHumidityPct: 'RH',
  airTempC: 'T',
  sensorTempC: 'Ts',
  windSpeedMps: 'Wind',
  opacity: 'Opacity',
}

const CODE_NAMES: Record<MedaValueField, string> = {
  pressurePa: 'pressure',
  relativeHumidityPct: 'relative humidity',
  airTempC: 'air temperature',
  sensorTempC: 'sensor temperature',
  windSpeedMps: 'wind speed',
  opacity: 'opacity',
}

const filledFields = (o: MedaObservation): MedaValueField[] => MEDA_VALUE_FIELDS.filter((f) => o[f] !== null)

/** Number of non-null values in an observation. */
export const filledCount = (o: MedaObservation): number => filledFields(o).length

/** "LMST 13:00 · P, RH, Ts" (+ " · sample"). Observations stay separate; this only labels them. */
export function observationOption(observation: MedaObservation): string {
  const codes = filledFields(observation).map((f) => FIELD_CODES[f]).join(', ')
  return `LMST ${observation.localTime} · ${codes}${observation.isSample ? ' · sample' : ''}`
}

/** "P pressure · RH relative humidity · …" for the codes that appear in these observations. */
export function codeLegend(observations: MedaObservation[]): string {
  const used = MEDA_VALUE_FIELDS.filter((f) => observations.some((o) => o[f] !== null))
  return used.map((f) => `${FIELD_CODES[f]} ${CODE_NAMES[f]}`).join(' · ')
}

// Daytime window used to break ties in the default selection (LMST, minutes).
const DAY_START_MIN = 10 * 60
const DAY_END_MIN = 16 * 60
const DAY_MIN = 24 * 60

const minutes = (localTime: string): number => {
  const [h, m] = localTime.split(':').map(Number)
  return h * 60 + m
}

const clockDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b)
  return Math.min(d, DAY_MIN - d) // around midnight, 23:00 is close to 00:00
}

/** Minutes from LMST 10:00–16:00 (0 inside the window). */
export function daytimeDistance(localTime: string): number {
  const t = minutes(localTime)
  if (t >= DAY_START_MIN && t <= DAY_END_MIN) return 0
  return Math.min(clockDistance(t, DAY_START_MIN), clockDistance(t, DAY_END_MIN))
}

/** Negative when a is the better default: more values first, then closer to daytime. */
function compareForDefault(a: MedaObservation, b: MedaObservation): number {
  return filledCount(b) - filledCount(a) || daytimeDistance(a.localTime) - daytimeDistance(b.localTime)
}

/** Index of the default observation in an LMST-sorted list; full ties keep the earliest. */
export function bestObservationIndex(observations: MedaObservation[]): number {
  let best = 0
  observations.forEach((o, i) => {
    if (compareForDefault(o, observations[best]) < 0) best = i
  })
  return best
}

/**
 * Opening selection: the sol whose best observation has the most values
 * (ties: closer to daytime, then file order), and that observation.
 */
export function defaultSelection(meda: MedaFile): { solIndex: number; obsIndex: number } {
  const picks = meda.sols.map((sol) => {
    const sorted = sortedObservations(sol.observations)
    const obsIndex = bestObservationIndex(sorted)
    return { obsIndex, observation: sorted[obsIndex] }
  })
  let solIndex = 0
  picks.forEach((pick, i) => {
    if (compareForDefault(pick.observation, picks[solIndex].observation) < 0) solIndex = i
  })
  return { solIndex, obsIndex: picks[solIndex].obsIndex }
}

/** "Jezero Crater · ≈ 18.4° N, 77.5° E" */
export function siteText(site: MedaSite): string {
  // Non-breaking spaces keep "77.5° E" on one line.
  const lat = `${Math.abs(site.approxLat).toFixed(1)}°\u00a0${site.approxLat >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(site.approxLon).toFixed(1)}°\u00a0${site.approxLon >= 0 ? 'E' : 'W'}`
  return `${site.name} · ≈ ${lat}, ${lon}`
}

export const doiUrl = (doi: string): string => `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`
