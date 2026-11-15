/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ConditionsPanel from './ConditionsPanel'
import {
  bestObservationIndex,
  codeLegend,
  daytimeDistance,
  defaultSelection,
  filledCount,
  historicalLabel,
  measurementDetail,
  observationOption,
  sortedObservations,
  visibleReadings,
} from './conditionsText'
import { validMedaFixture } from '../mocks/fixtures/medaFixture'
import { type MedaFile, type MedaObservation, type MedaValueField, isValidMedaFile } from '../services/meda'

const UNITS: Record<MedaValueField, string> = {
  pressurePa: 'Pa',
  relativeHumidityPct: '%',
  airTempC: '°C',
  sensorTempC: '°C',
  windSpeedMps: 'm/s',
  opacity: '1',
}

/** Observation with only the given values (made-up numbers, format only), as in the per-sensor real file. */
function obs(localTime: string, values: Partial<Record<MedaValueField, number>>): MedaObservation {
  const o: MedaObservation = {
    localTime,
    timeSystem: 'LMST',
    earthDate: null,
    pressurePa: null,
    relativeHumidityPct: null,
    sensorTempC: null,
    airTempC: null,
    windSpeedMps: null,
    opacity: null,
    measurements: {},
    isSample: false,
  }
  for (const [field, value] of Object.entries(values) as [MedaValueField, number][]) {
    o[field] = value
    o.measurements[field] = { file: 'F.CSV', column: field.toUpperCase(), unit: UNITS[field], uncertainty: null, quality: null }
  }
  return o
}

function file(sols: { sol: number; observations: MedaObservation[] }[]): MedaFile {
  return { ...validMedaFixture(), sols }
}

const sol100 = () => validMedaFixture().sols[0]
const obs1305 = () => sortedObservations(sol100().observations)[0]

describe('conditions text', () => {
  it('builds the historical label', () => {
    expect(historicalLabel(100, { localTime: '13:05' })).toBe(
      'Historical MEDA data – Sol 100, LMST 13:05 – not current conditions',
    )
  })

  it('shows only non-null values', () => {
    expect(visibleReadings(obs1305()).map((r) => r.field)).toEqual(['pressurePa', 'sensorTempC'])
  })

  it('labels the sensor temperature as not air temperature, with units', () => {
    const readings = visibleReadings(obs1305())
    expect(readings[1].label).toBe('Sensor temperature (not air temperature)')
    expect(readings.map((r) => r.value)).toEqual(['700.0 Pa', '-20.0 °C'])
  })

  it('describes uncertainty and quality only when the source gives them', () => {
    const { pressurePa, sensorTempC } = obs1305().measurements
    if (!pressurePa || !sensorTempC) throw new Error('fixture changed')
    expect(measurementDetail('pressurePa', pressurePa)).toBe('± 1.00 Pa')
    expect(measurementDetail('sensorTempC', sensorTempC)).toBe('Quality: example-flag')
  })

  it('sorts observations by LMST', () => {
    expect(sortedObservations(sol100().observations).map((o) => o.localTime)).toEqual(['13:05', '13:20'])
  })
})

describe('ConditionsPanel', () => {
  const render = (meda = validMedaFixture()) => renderToStaticMarkup(createElement(ConditionsPanel, { meda, defaultOpen: true }))
  const html = render()

  it('shows the historical badge and label for the first sol and earliest time', () => {
    expect(html).toContain('>Historical<')
    expect(html).toContain('Historical MEDA data – Sol 100, LMST 13:05 – not current conditions')
    expect(html).toContain('Earth date 2021-06-01 (UTC)')
  })

  it('renders no row for null fields', () => {
    expect(html).toContain('Pressure')
    expect(html).toContain('Sensor temperature (not air temperature)')
    for (const hidden of ['Relative humidity', 'Air temperature<', 'Wind speed', 'Atmospheric opacity', 'N/A']) {
      expect(html).not.toContain(hidden)
    }
  })

  it('shows source file and column next to each value', () => {
    expect(html).toContain('EXAMPLE_PS.CSV · PRESSURE')
    expect(html).toContain('EXAMPLE_RHS.CSV · SENSOR_TEMP')
  })

  it('never presents the data as current or gives an EVA verdict', () => {
    expect(html).not.toMatch(/current weather|\blive\b|today|EVA ready|suitable for EVA/i)
    expect(html).toContain('No EVA suitability verdict is derived from these values.')
  })

  it('marks sample observations and hides a null Earth date', () => {
    const file = validMedaFixture()
    file.sols = [file.sols[1]] // sol 101 holds the sample observation
    const sample = render(file)
    expect(sample).toContain('>Sample<')
    expect(sample).toContain('Sample scenario – not a measurement')
    expect(sample).not.toContain('Earth date')
    expect(html).not.toContain('>Sample<')
  })
})

describe('time picker labels', () => {
  it('lists the measurements each observation holds, with Ts for sensor temperature', () => {
    const [o1305, o1320] = sortedObservations(sol100().observations)
    expect(observationOption(o1305)).toBe('LMST 13:05 · P, Ts')
    expect(observationOption(o1320)).toBe('LMST 13:20 · Wind')
    expect(observationOption(obs('13:00', { pressurePa: 700, relativeHumidityPct: 5, airTempC: -10 }))).toBe('LMST 13:00 · P, RH, T')
    expect(observationOption(validMedaFixture().sols[1].observations[0])).toBe('LMST 09:00 · RH, Opacity · sample')
  })

  it('explains only the codes used in the sol', () => {
    expect(codeLegend(sol100().observations)).toBe('P pressure · Ts sensor temperature · Wind wind speed')
  })
})

describe('default selection', () => {
  it('measures the distance to the LMST 10:00–16:00 window around the clock', () => {
    expect(daytimeDistance('12:00')).toBe(0)
    expect(daytimeDistance('16:00')).toBe(0)
    expect(daytimeDistance('09:00')).toBe(60)
    expect(daytimeDistance('17:30')).toBe(90)
    expect(daytimeDistance('00:00')).toBe(480) // 8 h after 16:00, not 10 h before 10:00
  })

  it('prefers more values, then daytime, then the earliest', () => {
    const list = sortedObservations([
      obs('00:00', { pressurePa: 700 }),
      obs('00:00', { relativeHumidityPct: 5, sensorTempC: -60 }),
      obs('12:00', { windSpeedMps: 4 }),
      obs('20:00', { relativeHumidityPct: 2, sensorTempC: -40 }),
      obs('12:00', { relativeHumidityPct: 1, sensorTempC: -10 }),
      obs('13:00', { relativeHumidityPct: 1, sensorTempC: -5 }),
    ])
    const best = list[bestObservationIndex(list)]
    expect([best.localTime, filledCount(best)]).toEqual(['12:00', 2])
  })

  it('opens on the sol holding the richest observation, not the first sol', () => {
    const meda = file([
      { sol: 301, observations: [obs('00:00', { pressurePa: 700 }), obs('12:00', { windSpeedMps: 3 })] },
      { sol: 302, observations: [obs('17:00', { pressurePa: 700, relativeHumidityPct: 3 })] },
      { sol: 303, observations: [obs('12:00', { pressurePa: 700, relativeHumidityPct: 3 })] },
    ])
    expect(defaultSelection(meda)).toEqual({ solIndex: 2, obsIndex: 0 })
    // Equal richness: the sol whose best observation is in daytime wins; full ties keep file order.
    const tie = file([
      { sol: 1, observations: [obs('20:00', { pressurePa: 1, sensorTempC: 1 })] },
      { sol: 2, observations: [obs('11:00', { pressurePa: 1, sensorTempC: 1 })] },
      { sol: 3, observations: [obs('12:00', { pressurePa: 1, sensorTempC: 1 })] },
    ])
    expect(defaultSelection(tie).solIndex).toBe(1)
  })

  it('renders the default observation only, without merging other sensors', () => {
    const meda = file([
      {
        sol: 301,
        observations: [obs('00:00', { pressurePa: 700 }), obs('12:00', { relativeHumidityPct: 3, sensorTempC: -10 })],
      },
    ])
    const html = renderToStaticMarkup(createElement(ConditionsPanel, { meda, defaultOpen: true }))
    expect(html).toContain('Historical MEDA data – Sol 301, LMST 12:00 – not current conditions')
    expect(html).toContain('Relative humidity')
    expect(html).toContain('Sensor temperature (not air temperature)')
    expect(html).not.toContain('>Pressure<') // pressure belongs to the 00:00 observation
    expect(html).toContain('LMST 00:00 · P')
  })

  // Read-only check of Person 2's file when it is present.
  const realUrl = new URL('../../public/data/meda.json', import.meta.url)
  it.skipIf(!existsSync(realUrl))('picks a richest daytime observation in the real meda.json', () => {
    const real = JSON.parse(readFileSync(realUrl, 'utf-8')) as unknown
    expect(isValidMedaFile(real)).toBe(true)
    if (!isValidMedaFile(real)) return
    const { solIndex, obsIndex } = defaultSelection(real)
    const chosen = sortedObservations(real.sols[solIndex].observations)[obsIndex]
    const richest = Math.max(...real.sols.flatMap((s) => s.observations.map(filledCount)))
    expect(filledCount(chosen)).toBe(richest)
    expect(visibleReadings(chosen).length).toBeGreaterThan(1)
  })
})
