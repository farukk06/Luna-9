import { useEffect, useState } from 'react'
import { type Stop, isContentPending } from '../services/stops'
import {
  AT_LOCATION_PENDING,
  AT_LOCATION_TITLE,
  IMAGE_ID_PENDING,
  REFERENCE_TAG,
  REFERENCE_TITLE,
  type ReferenceView,
  stopCardView,
} from './stopCardView'

interface StopCardProps {
  stop: Stop
  /** popup: next to the stop on the map (desktop); sheet: slides up from the bottom (phone). */
  variant: 'popup' | 'sheet'
  onSetTarget: () => void
  onClose: () => void
}

/** The photo hides itself if the file is missing or fails to load; the card keeps working. */
function ReferencePhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <figure className="stop-photo">
      <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    </figure>
  )
}

function ReferenceSection({ reference, stopName }: { reference: ReferenceView; stopName: string }) {
  const { sol, camera, imageId, imageIdPending, rawUrl, sources } = reference
  const hasImageFacts = sol !== null || camera !== null || imageId !== null || imageIdPending
  return (
    <section className="stop-ref" aria-label={REFERENCE_TITLE}>
      <div className="stop-ref-head">
        <h4>{REFERENCE_TITLE}</h4>
        <span className="stop-ref-tag">{REFERENCE_TAG}</span>
      </div>

      {/* key: a new image URL gets a fresh "failed" state. */}
      {reference.imageSrc && <ReferencePhoto key={reference.imageSrc} src={reference.imageSrc} alt={`Reference image for ${stopName}`} />}

      {reference.description && <p className="stop-card-text">{reference.description}</p>}

      {reference.whyItMatters && (
        <>
          <h5>Why it matters</h5>
          <p className="stop-card-text">{reference.whyItMatters}</p>
        </>
      )}

      {hasImageFacts && (
        <dl className="stats stats--compact stop-ref-facts">
          {sol !== null && (
            <>
              <dt>Sol</dt>
              <dd>{sol}</dd>
            </>
          )}
          {camera !== null && (
            <>
              <dt>Camera</dt>
              <dd>{camera}</dd>
            </>
          )}
          {(imageId !== null || imageIdPending) && (
            <>
              <dt>Image ID</dt>
              <dd className="stop-ref-id">{imageIdPending ? <em>{IMAGE_ID_PENDING}</em> : imageId}</dd>
            </>
          )}
        </dl>
      )}

      {(rawUrl || sources.length > 0) && (
        <ul className="stop-ref-links">
          {rawUrl && (
            <li>
              <a href={rawUrl} target="_blank" rel="noopener noreferrer">
                NASA Raw Images
              </a>
            </li>
          )}
          {sources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="stop-ref-credit">Credit: {reference.credit}</p>
    </section>
  )
}

/** Two parts: what is at the map point, then a reference image of comparable geology (not taken here). */
function StopCard({ stop, variant, onSetTarget, onClose }: StopCardProps) {
  const pending = isContentPending(stop)
  const view = stopCardView(stop)

  // Escape closes the card, as with any dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const card = (
    <div className={`stop-card stop-card--${variant}`} role="dialog" aria-label={stop.name}>
      {variant === 'sheet' && <div className="sheet-handle" aria-hidden="true" />}
      <div className="stop-card-head">
        <div className="stop-card-heading">
          <span className="eyebrow">Science stop</span>
          <h3>{stop.name}</h3>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {pending && <span className="badge badge--pending">Content pending</span>}

      <section className="stop-here" aria-label={AT_LOCATION_TITLE}>
        <h4>{AT_LOCATION_TITLE}</h4>
        {view.atLocation ? (
          <p className="stop-card-text">{view.atLocation}</p>
        ) : (
          <p className="stop-card-text muted">{AT_LOCATION_PENDING}</p>
        )}
      </section>

      {view.reference && <ReferenceSection reference={view.reference} stopName={stop.name} />}

      <div className="stop-card-foot">
        <span className="stop-card-cell">
          Cell ({stop.col}, {stop.row})
        </span>
        <button type="button" className="btn btn--primary" onClick={onSetTarget}>
          Set as target
        </button>
      </div>
    </div>
  )

  if (variant === 'popup') return card
  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Close stop card" onClick={onClose} />
      {card}
    </div>
  )
}

export default StopCard
