// Perseverance landing site (Mars 2020 mission records). Real reference
// position, not a scenario parameter. Shown on the main map and the overview.

export const LANDING_SITE = {
  name: 'Octavia E. Butler Landing',
  /** Planetocentric degrees, east-positive. */
  lon: 77.4508,
  lat: 18.4447,
  touchdown: '18 Feb 2021',
} as const

export const LANDING_LABEL = 'Perseverance landing site (approx.)'

export const LANDING_INFO =
  `${LANDING_SITE.name} – Perseverance touched down here on ${LANDING_SITE.touchdown}. ` +
  'Position approximate (lon/lat converted to this map).'
