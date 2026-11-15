import { useEffect, useState } from 'react'

/** Below this width the app switches to the stacked phone layout (must match index.css). */
export const MOBILE_QUERY = '(max-width: 899.98px)'
/** Touch-first devices: no hover, so pointer hints are replaced by tap hints. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/** True while the CSS media query matches; follows rotation and window resizes. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matches(query))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setMatch(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return match
}
