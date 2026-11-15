import { fetchJson } from './data'

// meda.json, schema v2 (CONTRACT Section 7). The file is optional: when it is
// missing or does not match the schema exactly, loadMeda returns null and the
// conditions panel is not shown at all.

export const MEDA_URL = '/data/meda.json'

/** Value fields of an observation, in display order. */
export const MEDA_VALUE_FIELDS = [
  'pressurePa',
  'relativeHumidityPct',
  'airTempC',
  'sensorTempC',
  'windSpeedMps',
  'opacity',
] as const

export type MedaValueField = (typeof MEDA_VALUE_FIELDS)[number]

/** Unit each value must carry in measurements.<field>.unit ("1" = dimensionless). */
export const MEDA_UNITS: Record<MedaValueField, string> = {
  pressurePa: 'Pa',
  relativeHumidityPct: '%',
  airTempC: '°C',
  sensorTempC: '°C',
  windSpeedMps: 'm/s',
  opacity: '1',
}

export interface MedaSite {
  name: string
  /** Degrees east, −180…180; informational only. */
  approxLon: number
  approxLat: number
}

export interface MedaDataset {
  name: string
  url: string | null
  doi: string | null
}

export interface MedaSource {
  datasets: MedaDataset[]
}

/** Where one value came from in the source data. */
export interface MedaMeasurement {
  file: string
  column: string
  unit: string
  /** ± in the field's unit; null when the source gives none. */
  uncertainty: number | null
  /** Source quality flag, verbatim. */
  quality: string | null
}

export interface MedaObservation {
  /** "HH:MM", 24 h. */
  localTime: string
  timeSystem: 'LMST'
  /** "YYYY-MM-DD" (UTC) or null when unknown. */
  earthDate: string | null
  pressurePa: number | null
  relativeHumidityPct: number | null
  /** Sensor temperature, NOT air temperature. */
  sensorTempC: number | null
  airTempC: number | null
  windSpeedMps: number | null
  opacity: number | null
  /** One entry for every non-null value field. */
  measurements: Partial<Record<MedaValueField, MedaMeasurement>>
  isSample: boolean
}

export interface MedaSol {
  sol: number
  observations: MedaObservation[]
}

export interface MedaFile {
  version: 2
  site: MedaSite
  source: MedaSource
  historical: true
  sols: MedaSol[]
}

// --- Validation -------------------------------------------------------------

type Json = Record<string, unknown>

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const isTextOrNull = (v: unknown): v is string | null => v === null || isText(v)
const isNonEmptyArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const EARTH_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function isValidSite(v: unknown): v is MedaSite {
  return (
    isRecord(v) &&
    isText(v.name) &&
    isNumber(v.approxLon) &&
    Math.abs(v.approxLon) <= 180 &&
    isNumber(v.approxLat) &&
    Math.abs(v.approxLat) <= 90
  )
}

function isValidDataset(v: unknown): v is MedaDataset {
  return isRecord(v) && isText(v.name) && isTextOrNull(v.url) && isTextOrNull(v.doi) && (v.url !== null || v.doi !== null)
}

function isValidSource(v: unknown): v is MedaSource {
  return isRecord(v) && isNonEmptyArray(v.datasets) && v.datasets.every(isValidDataset)
}

function isValidMeasurement(v: unknown, field: MedaValueField): v is MedaMeasurement {
  return (
    isRecord(v) &&
    isText(v.file) &&
    isText(v.column) &&
    v.unit === MEDA_UNITS[field] &&
    (v.uncertainty === null || (isNumber(v.uncertainty) && v.uncertainty >= 0)) &&
    isTextOrNull(v.quality)
  )
}

/** Range checks that catch unit mix-ups (e.g. hPa, fractions instead of %). */
function isPlausibleValue(field: MedaValueField, value: number): boolean {
  if (field === 'relativeHumidityPct') return value >= 0 && value <= 100
  if (field === 'pressurePa' || field === 'windSpeedMps' || field === 'opacity') return value >= 0
  return true
}

function isValidObservation(v: unknown): v is MedaObservation {
  if (!isRecord(v)) return false
  if (typeof v.localTime !== 'string' || !LOCAL_TIME.test(v.localTime)) return false
  if (v.timeSystem !== 'LMST') return false
  if (!(v.earthDate === null || (typeof v.earthDate === 'string' && EARTH_DATE.test(v.earthDate)))) return false
  if (typeof v.isSample !== 'boolean' || !isRecord(v.measurements)) return false
  const measurements = v.measurements
  let filled = 0
  for (const field of MEDA_VALUE_FIELDS) {
    const value = v[field]
    if (value === null) continue
    // Every field must be present: a missing key is not the same as an explicit null.
    if (!isNumber(value) || !isPlausibleValue(field, value)) return false
    if (!isValidMeasurement(measurements[field], field)) return false
    filled++
  }
  return filled > 0
}

function isValidSol(v: unknown): v is MedaSol {
  return (
    isRecord(v) &&
    isNumber(v.sol) &&
    Number.isInteger(v.sol) &&
    v.sol >= 0 &&
    isNonEmptyArray(v.observations) &&
    v.observations.every(isValidObservation)
  )
}

/** True only for a file that follows CONTRACT Section 7 (schema v2) exactly. */
export function isValidMedaFile(v: unknown): v is MedaFile {
  if (!isRecord(v) || v.version !== 2 || v.historical !== true) return false
  if (!isValidSite(v.site) || !isValidSource(v.source)) return false
  if (!isNonEmptyArray(v.sols) || !v.sols.every(isValidSol)) return false
  const solNumbers = (v.sols as MedaSol[]).map((s) => s.sol)
  return new Set(solNumbers).size === solNumbers.length // each sol only once
}

/** meda.json, or null when it is missing or invalid (the panel then stays hidden). */
export async function loadMeda(): Promise<MedaFile | null> {
  const data = await fetchJson(MEDA_URL)
  if (data === null) return null // no file: nothing to report
  if (isValidMedaFile(data)) return data
  console.warn('meda.json does not match CONTRACT Section 7 (schema v2); conditions panel hidden')
  return null
}
