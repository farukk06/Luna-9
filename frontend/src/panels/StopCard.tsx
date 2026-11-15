import { useEffect } from 'react'
import { type Stop, isContentPending } from '../services/stops'

interface StopCardProps {
  stop: Stop
  /** popup: next to the stop on the map (desktop); sheet: slides up from the bottom (phone). */
  variant: 'popup' | 'sheet'
  onSetTarget: () => void
  onClose: () => void
}

/** Every optional block renders only when the file actually provides it. */
function StopCard({ stop, variant, onSetTarget, onClose }: StopCardProps) {
  const pending = isContentPending(stop)
  const { photo } = stop

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
      <p className="stop-card-text">{stop.description}</p>

      {stop.whyImportant && (
        <>
          <h4>Why it matters</h4>
          <p className="stop-card-text">{stop.whyImportant}</p>
        </>
      )}

      {photo && (
        <figure className="stop-photo">
          <img src={`/content/${photo.file}`} alt={stop.name} />
          <figcaption>
            Credit: NASA/JPL-Caltech, sol {photo.sol}, camera {photo.camera}, image ID {photo.imageId}
          </figcaption>
        </figure>
      )}

      {stop.sourceUrl && (
        <p className="stop-card-text">
          <a href={stop.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </p>
      )}

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
