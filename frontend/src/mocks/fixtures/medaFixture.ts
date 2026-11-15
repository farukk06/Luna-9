import type { MedaFile } from '../../services/meda'

// Test fixture for meda.json schema v2 (CONTRACT Section 7).
// FORMAT ONLY: every number, date, file and column name here is made up to
// exercise the parser and the panel. None of it is a real MEDA measurement,
// and it is never served by the app (public/data/ is not touched).

export function validMedaFixture(): MedaFile {
  return {
    version: 2,
    site: { name: 'Jezero Crater', approxLon: 77.5, approxLat: 18.4 },
    source: { datasets: [{ name: 'Example dataset (fixture)', url: 'https://example.org/dataset', doi: null }] },
    historical: true,
    sols: [
      {
        sol: 100,
        observations: [
          // Listed out of LMST order on purpose: the panel sorts by time.
          {
            localTime: '13:20',
            timeSystem: 'LMST',
            earthDate: '2021-06-01',
            pressurePa: null,
            relativeHumidityPct: null,
            sensorTempC: null,
            airTempC: null,
            windSpeedMps: 5,
            opacity: null,
            measurements: {
              windSpeedMps: { file: 'EXAMPLE_WS.CSV', column: 'WIND_SPEED', unit: 'm/s', uncertainty: 0.5, quality: null },
            },
            isSample: false,
          },
          {
            localTime: '13:05',
            timeSystem: 'LMST',
            earthDate: '2021-06-01',
            pressurePa: 700,
            relativeHumidityPct: null,
            sensorTempC: -20,
            airTempC: null,
            windSpeedMps: null,
            opacity: null,
            measurements: {
              pressurePa: { file: 'EXAMPLE_PS.CSV', column: 'PRESSURE', unit: 'Pa', uncertainty: 1, quality: null },
              sensorTempC: { file: 'EXAMPLE_RHS.CSV', column: 'SENSOR_TEMP', unit: '°C', uncertainty: null, quality: 'example-flag' },
            },
            isSample: false,
          },
        ],
      },
      {
        sol: 101,
        observations: [
          {
            localTime: '09:00',
            timeSystem: 'LMST',
            earthDate: null,
            pressurePa: null,
            relativeHumidityPct: 10,
            sensorTempC: null,
            airTempC: null,
            windSpeedMps: null,
            opacity: 0.5,
            measurements: {
              relativeHumidityPct: { file: 'EXAMPLE_RHS.CSV', column: 'RH', unit: '%', uncertainty: null, quality: null },
              opacity: { file: 'EXAMPLE_OPACITY.CSV', column: 'TAU', unit: '1', uncertainty: null, quality: null },
            },
            isSample: true,
          },
        ],
      },
    ],
  }
}
