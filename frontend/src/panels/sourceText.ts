// Splits the long source strings of layers.json / grid.json for display.
// Nothing is invented: the short label is a verbatim part of the text, and
// when it cannot be found the caller shows the full text.

const NAME_SEPARATOR = ' — ' // "<file name> — <dataset name>; <DOI>; <URL>; <notes>"
const DERIVED_SUFFIX = '(derived)'

/**
 * Dataset name between the first " — " and the next ";", plus "(derived)" when
 * the full text ends with it; null when the text does not have that shape.
 */
export function shortSourceLabel(full: string): string | null {
  const text = full.trim()
  const dash = text.indexOf(NAME_SEPARATOR)
  if (dash < 0) return null
  const rest = text.slice(dash + NAME_SEPARATOR.length)
  const end = rest.indexOf(';')
  const name = (end < 0 ? rest : rest.slice(0, end)).trim()
  if (!name || name === DERIVED_SUFFIX) return null
  return text.endsWith(DERIVED_SUFFIX) && !name.endsWith(DERIVED_SUFFIX) ? `${name} ${DERIVED_SUFFIX}` : name
}

/** The ";"-separated parts of the full text, for a readable details list. */
export function sourceSegments(full: string): string[] {
  return full
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
}

export interface TextPart {
  text: string
  /** Set for http(s) URLs (DOI links included), which become clickable. */
  href?: string
}

const URL_PATTERN = /(https?:\/\/[^\s;]+)/

/** Splits text into plain parts and http(s) links. */
export function linkParts(text: string): TextPart[] {
  return text
    .split(URL_PATTERN)
    .filter(Boolean)
    .map((part) => (URL_PATTERN.test(part) ? { text: part, href: part } : { text: part }))
}
