import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidMedaFile, loadMeda } from './meda'
import { validMedaFixture } from '../mocks/fixtures/medaFixture'

type Mutable = Record<string, unknown>
/** Fixture as plain JSON, so tests can break it in ways the types forbid. */
const raw = (): Mutable => JSON.parse(JSON.stringify(validMedaFixture())) as Mutable
/** The 13:05 observation of sol 100 (pressure + sensor temperature). */
const obs = (file: Mutable): Mutable => ((file.sols as Mutable[])[0].observations as Mutable[])[1]
const measurements = (file: Mutable): Mutable => obs(file).measurements as Mutable

describe('isValidMedaFile', () => {
  it('accepts the schema v2 fixture', () => {
    expect(isValidMedaFile(raw())).toBe(true)
  })

  const breakers: [string, (f: Mutable) => void][] = [
    ['version 1', (f) => (f.version = 1)],
    ['historical false', (f) => (f.historical = false)],
    ['no sols', (f) => (f.sols = [])],
    ['duplicate sol', (f) => (f.sols = [(f.sols as Mutable[])[0], (f.sols as Mutable[])[0]])],
    ['dataset without url and doi', (f) => ((f.source as Mutable).datasets = [{ name: 'x', url: null, doi: null }])],
    ['latitude out of range', (f) => ((f.site as Mutable).approxLat = 95)],
    ['bad localTime', (f) => (obs(f).localTime = '1:05 pm')],
    ['other time system', (f) => (obs(f).timeSystem = 'LTST')],
    ['bad earthDate', (f) => (obs(f).earthDate = '01/06/2021')],
    ['missing value key (must be an explicit null)', (f) => delete obs(f).opacity],
    ['value as string', (f) => (obs(f).pressurePa = '700')],
    [
      'humidity above 100 %',
      (f) => {
        obs(f).relativeHumidityPct = 120
        measurements(f).relativeHumidityPct = { file: 'a', column: 'b', unit: '%', uncertainty: null, quality: null }
      },
    ],
    ['filled value without measurement', (f) => delete measurements(f).pressurePa],
    ['wrong unit', (f) => ((measurements(f).sensorTempC as Mutable).unit = 'K')],
    ['negative uncertainty', (f) => ((measurements(f).pressurePa as Mutable).uncertainty = -1)],
    [
      'observation with only nulls',
      (f) => {
        obs(f).pressurePa = null
        obs(f).sensorTempC = null
      },
    ],
    ['isSample missing', (f) => delete obs(f).isSample],
  ]

  it.each(breakers)('rejects: %s', (_name, breakIt) => {
    const file = raw()
    breakIt(file)
    expect(isValidMedaFile(file)).toBe(false)
  })

  it('ignores a measurement entry written for a null field', () => {
    const file = raw()
    measurements(file).airTempC = { file: 'a', column: 'b', unit: '°C', uncertainty: null, quality: null }
    expect(isValidMedaFile(file)).toBe(true)
  })
})

describe('loadMeda', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const serve = (body: unknown, status = 200) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
    )

  it('returns the file when it is valid', async () => {
    serve(validMedaFixture())
    expect((await loadMeda())?.sols).toHaveLength(2)
  })

  it('returns null when the file is missing', async () => {
    serve({}, 404)
    expect(await loadMeda()).toBeNull()
  })

  it('returns null (panel hidden) for an invalid file, e.g. the old v1 schema', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    serve({ site: 'Jezero Crater', source: 'x', sols: [{ sol: 1, earthDate: '2021-01-01', localTime: '13:00', airTempC: 0 }] })
    expect(await loadMeda()).toBeNull()
  })
})
