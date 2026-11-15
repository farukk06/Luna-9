import { MEDA_VALUE_FIELDS, type MedaMeasurement, type MedaObservation, type MedaSite, type MedaValueField } from '../services/meda'

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

export function observationOption(observation: MedaObservation): string {
  return `LMST ${observation.localTime}${observation.isSample ? ' · sample' : ''}`
}

/** "Jezero Crater · ≈ 18.4° N, 77.5° E" */
export function siteText(site: MedaSite): string {
  // Non-breaking spaces keep "77.5° E" on one line.
  const lat = `${Math.abs(site.approxLat).toFixed(1)}°\u00a0${site.approxLat >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(site.approxLon).toFixed(1)}°\u00a0${site.approxLon >= 0 ? 'E' : 'W'}`
  return `${site.name} · ≈ ${lat}, ${lon}`
}

export const doiUrl = (doi: string): string => `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`
