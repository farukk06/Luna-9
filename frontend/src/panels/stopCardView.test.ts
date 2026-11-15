/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StopCard from './StopCard'
import { AT_LOCATION_PENDING, IMAGE_ID_PENDING, REFERENCE_TAG, sourceLabel, stopCardView } from './stopCardView'
import { type Stop, parseStop, parseStops } from '../services/stops'

const shipped = (): Stop[] =>
  parseStops(JSON.parse(readFileSync(new URL('../../public/content/stops.json', import.meta.url), 'utf-8')) as unknown)

/** Shipped Stop 2 with its image ID marked unverified again (none is unverified in the file now). */
const unverified = (): Stop => {
  const stop = shipped()[1]
  if (!stop.reference) throw new Error('fixture changed')
  return { ...stop, reference: { ...stop.reference, imageIdVerified: false } }
}

const render = (stop: Stop) =>
  renderToStaticMarkup(createElement(StopCard, { stop, variant: 'popup', onSetTarget: () => {}, onClose: () => {} }))

describe('stopCardView', () => {
  it('has location text for every shipped stop', () => {
    expect(shipped().every((s) => (stopCardView(s).atLocation ?? '').length > 0)).toBe(true)
  })

  it('hides the raw link and ID of an unverified image', () => {
    const ref = stopCardView(unverified()).reference
    expect(ref?.imageIdPending).toBe(true)
    expect(ref?.imageId).toBeNull()
    expect(ref?.rawUrl).toBeNull()
  })

  it('keeps the raw link of a verified image and credits Mastcam-Z', () => {
    const ref = stopCardView(shipped()[0]).reference
    expect(ref?.imageIdPending).toBe(false)
    expect(ref?.rawUrl).toMatch(/^https:\/\/mars\.nasa\.gov\/mars2020\/multimedia\/raw-images\/ZL0_0530_/)
    expect(ref?.credit).toBe('NASA/JPL-Caltech/ASU')
    expect(ref?.imageSrc).toBe('/content/images/stop1_sol530.jpg')
  })

  it('maps an older entry (description + photo) onto the two parts', () => {
    const old = parseStop({
      id: 'old',
      name: 'Old stop',
      col: 1,
      row: 2,
      description: 'Older description',
      whyImportant: 'Older why',
      sourceUrl: 'https://example.org/src',
      photo: { file: 'photos/a.jpg', sol: 12, camera: 'Cam', imageId: 'ID1', url: 'https://example.org/raw' },
    })
    if (!old) throw new Error('fixture invalid')
    const view = stopCardView(old)
    expect(view.atLocation).toBe('Older description')
    expect(view.reference).toMatchObject({ imageSrc: '/content/photos/a.jpg', whyItMatters: 'Older why', imageId: 'ID1' })
  })

  it('labels sources without the protocol', () => {
    expect(sourceLabel('https://doi.org/10.3133/sim3292')).toBe('doi.org/10.3133/sim3292')
    expect(sourceLabel('https://trek.nasa.gov/mars/')).toBe('trek.nasa.gov/mars')
  })
})

describe('StopCard', () => {
  it('shows both parts and the not-at-this-location tag', () => {
    const html = render(shipped()[0])
    expect(html).toContain('At this location')
    expect(html).toContain('Light-toned, polygonally fractured bedrock outcrop')
    expect(html).not.toContain(AT_LOCATION_PENDING)
    expect(html).toContain('Reference field image')
    expect(html).toContain(REFERENCE_TAG)
    expect(html).toContain('Why it matters')
    expect(html).toContain('NASA Raw Images')
    expect(html).toContain('Credit: NASA/JPL-Caltech/ASU')
    expect(html).toContain('<img')
  })

  it('writes "Image ID pending verification" instead of an unverified ID and link', () => {
    const html = render(unverified())
    expect(html).toContain(IMAGE_ID_PENDING)
    expect(html).not.toContain('ZR0_0507_')
    expect(html).not.toContain('NASA Raw Images')
  })

  it('shows "Location description pending" when a stop has no location text', () => {
    expect(render({ ...shipped()[0], atLocation: null })).toContain(AT_LOCATION_PENDING)
  })

  it('shows the verified Stop 2 image ID and its raw-image link', () => {
    const html = render(shipped()[1])
    expect(html).toContain('ZR0_0507_0711941426_456EBY_N0261222ZCAM08527_1100LMJ')
    expect(html).toContain('NASA Raw Images')
    expect(html).not.toContain(IMAGE_ID_PENDING)
  })

  it('works without any image file configured', () => {
    const stop = shipped()[2]
    const html = render({ ...stop, reference: stop.reference && { ...stop.reference, image: null } })
    expect(html).not.toContain('<img')
    expect(html).toContain('Set as target')
  })
})
