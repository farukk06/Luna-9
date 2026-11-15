import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ConditionsPanel from './ConditionsPanel'
import { historicalLabel, measurementDetail, sortedObservations, visibleReadings } from './conditionsText'
import { validMedaFixture } from '../mocks/fixtures/medaFixture'

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
