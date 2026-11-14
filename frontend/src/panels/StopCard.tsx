import { type Stop, isContentPending } from '../services/stops'

interface StopCardProps {
  stop: Stop
  onSetTarget: () => void
  onClose: () => void
}

/** Every optional block renders only when the file actually provides it. */
function StopCard({ stop, onSetTarget, onClose }: StopCardProps) {
  const pending = isContentPending(stop)
  const { photo } = stop
  return (
    <div className="stop-card" role="dialog" aria-label={stop.name}>
      <div className="stop-card-head">
        <h3>{stop.name}</h3>
        <button type="button" className="stop-card-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {pending && <span className="content-pending">Content pending</span>}
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

      <div className="stop-card-cell">
        Cell ({stop.col}, {stop.row})
      </div>
      <button type="button" className="btn" onClick={onSetTarget}>
        Set as target
      </button>
    </div>
  )
}

export default StopCard
