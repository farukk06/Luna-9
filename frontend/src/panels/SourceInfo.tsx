import { linkParts, shortSourceLabel, sourceSegments } from './sourceText'

function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((part, k) =>
        part.href ? (
          <a key={k} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          <span key={k}>{part.text}</span>
        ),
      )}
    </>
  )
}

/** "Source: <short name>" with the full text (DOI, links, notes) in a collapsible "Details". */
function SourceInfo({ text }: { text: string }) {
  const short = shortSourceLabel(text)
  if (!short) {
    return (
      <p className="layer-source">
        Source: <LinkedText text={text} />
      </p>
    )
  }
  return (
    <div className="layer-source">
      <span>Source: {short}</span>
      <details className="source-details">
        <summary>Details</summary>
        <ul>
          {sourceSegments(text).map((segment, k) => (
            <li key={k}>
              <LinkedText text={segment} />
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export default SourceInfo
