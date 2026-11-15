import { type Stop, safeImagePath } from '../services/stops'

// What the science stop card shows, derived from a parsed stop. Kept apart
// from StopCard.tsx so the wording rules are unit-tested.

export const AT_LOCATION_TITLE = 'At this location'
export const AT_LOCATION_PENDING = 'Location description pending'
export const REFERENCE_TITLE = 'Reference field image'
export const REFERENCE_TAG = 'Not taken at this map location – comparable geology observed by Perseverance'
export const IMAGE_ID_PENDING = 'Image ID pending verification'
/** Mastcam-Z images: NASA/JPL-Caltech/ASU. */
export const DEFAULT_CREDIT = 'NASA/JPL-Caltech/ASU'
/** Credit the card used for the older "photo" block, kept as it was. */
const LEGACY_CREDIT = 'NASA/JPL-Caltech'

export interface SourceLink {
  href: string
  label: string
}

export interface ReferenceView {
  /** Site-absolute image URL, or null when no file is configured. */
  imageSrc: string | null
  description: string | null
  whyItMatters: string | null
  sol: number | null
  camera: string | null
  /** Shown only when verified. */
  imageId: string | null
  /** True when an ID exists but is not verified: show IMAGE_ID_PENDING instead of the ID and link. */
  imageIdPending: boolean
  /** NASA Raw Images link, only for a verified ID. */
  rawUrl: string | null
  sources: SourceLink[]
  credit: string
}

export interface StopCardView {
  /** Text for "At this location", or null → AT_LOCATION_PENDING. */
  atLocation: string | null
  reference: ReferenceView | null
}

/** "https://doi.org/10.3133/sim3292" → "doi.org/10.3133/sim3292" */
export function sourceLabel(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

const toLinks = (urls: string[]): SourceLink[] => urls.map((href) => ({ href, label: sourceLabel(href) }))

function referenceView(stop: Stop): ReferenceView | null {
  const ref = stop.reference
  if (ref) {
    const verified = ref.imageIdVerified
    return {
      imageSrc: ref.image ? `/${ref.image}` : null,
      description: ref.description,
      whyItMatters: ref.whyItMatters,
      sol: ref.sol,
      camera: ref.camera,
      imageId: verified ? ref.imageId : null,
      imageIdPending: !verified && ref.imageId !== null,
      rawUrl: verified ? ref.rawUrl : null,
      sources: toLinks(ref.sources),
      credit: ref.credit ?? DEFAULT_CREDIT,
    }
  }
  // Older entries: the "photo" block and the stop-level "why it matters"/source.
  const { photo } = stop
  if (!photo && !stop.whyImportant && !stop.sourceUrl) return null
  const image = photo ? safeImagePath(`content/${photo.file}`) : null
  return {
    imageSrc: image ? `/${image}` : null,
    description: null,
    whyItMatters: stop.whyImportant,
    sol: photo?.sol ?? null,
    camera: photo?.camera ?? null,
    imageId: photo?.imageId || null,
    imageIdPending: false,
    rawUrl: photo && /^https?:\/\//i.test(photo.url) ? photo.url : null,
    sources: toLinks(stop.sourceUrl ? [stop.sourceUrl] : []),
    credit: LEGACY_CREDIT,
  }
}

export function stopCardView(stop: Stop): StopCardView {
  return {
    // Older files described the stop in "description".
    atLocation: stop.atLocation ?? stop.description,
    reference: referenceView(stop),
  }
}
