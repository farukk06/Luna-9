import type { LayerInfo } from '../services/data'

// Minimal layer controls; the full layer panel (legend etc.) comes in Stage 2.

export interface OverlayState {
  visible: boolean
  /** 0–1 */
  opacity: number
}

interface LayersPanelProps {
  layers: LayerInfo[]
  slope: OverlayState
  onSlopeChange: (next: OverlayState) => void
}

function findLayer(layers: LayerInfo[], id: string): LayerInfo | undefined {
  return layers.find((layer) => layer.id === id)
}

function SourceNote({ layer }: { layer: LayerInfo | undefined }) {
  return <p className="layer-source">Source: {layer?.source ?? 'not specified'}</p>
}

function LayersPanel({ layers, slope, onSlopeChange }: LayersPanelProps) {
  const ortho = findLayer(layers, 'ortho')
  const slopeInfo = findLayer(layers, 'slope')
  const opacityPct = Math.round(slope.opacity * 100)

  return (
    <>
      <h2>Layers</h2>

      <section className="layer-item">
        <div className="layer-row">
          <span className="layer-title">{ortho?.title ?? 'Base image'}</span>
          <span className="layer-tag">Base image · always on</span>
        </div>
        <SourceNote layer={ortho} />
      </section>

      <section className="layer-item">
        <label className="layer-row">
          <input
            type="checkbox"
            checked={slope.visible}
            onChange={(e) => onSlopeChange({ ...slope, visible: e.target.checked })}
          />
          <span className="layer-title">{slopeInfo?.title ?? 'Slope'}</span>
        </label>
        <label className="layer-opacity">
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={opacityPct}
            disabled={!slope.visible}
            onChange={(e) => onSlopeChange({ ...slope, opacity: Number(e.target.value) / 100 })}
          />
          <span className="layer-opacity-value">{opacityPct}%</span>
        </label>
        <SourceNote layer={slopeInfo} />
      </section>
    </>
  )
}

export default LayersPanel
