import { describe, expect, it } from 'vitest'
import { layerTitleWithoutLimit, linkParts, shortSourceLabel, sourceSegments } from './sourceText'

// Same shape as the real layers.json / grid.json source strings.
const ORTHO =
  'FILE_ortho.tif — USGS Mars 2020 TRN HiRISE orthomosaic (geographic variant); https://doi.org/10.5066/P9QJDP48; ' +
  'https://example.org/FILE_ortho.tif; processed from supplied local subset'
const DEM_DERIVED = 'FILE_dtm.tif — USGS Mars 2020 TRN HiRISE DTM mosaic; https://doi.org/10.5066/P9REJ9JN; notes (derived)'

describe('shortSourceLabel', () => {
  it('takes the dataset name between the first " — " and the next ";"', () => {
    expect(shortSourceLabel(ORTHO)).toBe('USGS Mars 2020 TRN HiRISE orthomosaic (geographic variant)')
  })

  it('keeps the "(derived)" marker from the end of the text', () => {
    expect(shortSourceLabel(DEM_DERIVED)).toBe('USGS Mars 2020 TRN HiRISE DTM mosaic (derived)')
  })

  it('returns null when the text has no recognisable name, so the full text is shown', () => {
    expect(shortSourceLabel('Mock data – real data pending')).toBeNull()
    expect(shortSourceLabel('not specified')).toBeNull()
    expect(shortSourceLabel('file.tif — ; https://x.org')).toBeNull()
  })
})

describe('details text', () => {
  it('splits the full text into its ";" parts', () => {
    expect(sourceSegments(DEM_DERIVED)).toEqual([
      'FILE_dtm.tif — USGS Mars 2020 TRN HiRISE DTM mosaic',
      'https://doi.org/10.5066/P9REJ9JN',
      'notes (derived)',
    ])
  })

  it('turns only http(s) URLs into links', () => {
    expect(linkParts('DOI https://doi.org/10.5066/P9QJDP48 here')).toEqual([
      { text: 'DOI ' },
      { text: 'https://doi.org/10.5066/P9QJDP48', href: 'https://doi.org/10.5066/P9QJDP48' },
      { text: ' here' },
    ])
    expect(linkParts('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
  })
})

describe('layerTitleWithoutLimit', () => {
  it('drops the fixed scenario limit from the real slope title', () => {
    expect(layerTitleWithoutLimit('Slope (5 m DEM; scenario limit 25 degrees)')).toBe('Slope (5 m DEM)')
  })

  it('drops a parenthesised limit group and accepts the degree sign', () => {
    expect(layerTitleWithoutLimit('Slope (scenario limit 22.5°)')).toBe('Slope')
  })

  it('keeps titles without that pattern unchanged', () => {
    expect(layerTitleWithoutLimit('Slope')).toBe('Slope')
    expect(layerTitleWithoutLimit('Slope (5 m DEM)')).toBe('Slope (5 m DEM)')
    expect(layerTitleWithoutLimit('Slope; limit 25 degrees')).toBe('Slope; limit 25 degrees')
  })
})
