import type Map from 'ol/Map'

// Development diagnostics: how long after a map click the target marker and
// the routes actually appear on screen. "Drawn" = the next OpenLayers
// postrender after the layer was updated. Logged only in development builds.

type Stage = 'handler' | 'marker' | 'routes'

let clickAt: number | null = null
const pending = new Set<Stage>()

function log(stage: Stage, t0: number): void {
  const text = stage === 'handler' ? 'click handler' : `${stage} drawn`
  console.info(`[timing] click → ${text}: ${(performance.now() - t0).toFixed(0)} ms`)
}

/** Starts a measurement; timeStamp is the DOM event's time (same clock as performance.now()). */
export function recordMapClick(timeStamp: number): void {
  if (!import.meta.env.DEV) return
  clickAt = timeStamp
  pending.clear()
  pending.add('marker')
  pending.add('routes')
  log('handler', timeStamp)
}

/** Call right after updating a layer: logs once, when that frame has been rendered. */
export function logWhenDrawn(map: Map | null, stage: 'marker' | 'routes'): void {
  if (!import.meta.env.DEV || !map || clickAt === null || !pending.has(stage)) return
  pending.delete(stage)
  const t0 = clickAt
  map.once('postrender', () => log(stage, t0))
  map.render() // make sure a frame follows even if nothing else changed
}
