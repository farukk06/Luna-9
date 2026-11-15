import type { ReactNode } from 'react'
import type { LayerId, LayerInfo } from '../services/data'
import { RoughnessLegend, RouteLegend, SlopeLegend } from './Legends'
import SourceInfo from './SourceInfo'

export interface OverlayState {
  visible: boolean
  /** 0–1 */
  opacity: number
}

interface LayersPanelProps {
  layers: LayerInfo[]
  sources: Record<LayerId, string>
  maxSlopeDeg: number
  slope: OverlayState
  onSlopeChange: (next: OverlayState) => void
  roughness: OverlayState
  onRoughnessChange: (next: OverlayState) => void
  stopCount: number
  stopsVisible: boolean
  onStopsVisibleChange: (visible: boolean) => void
}

function findLayer(layers: LayerInfo[], id: LayerId): LayerInfo | undefined {
  return layers.find((layer) => layer.id === id)
}

interface OverlayControlProps {
  title: string
  state: OverlayState
  onChange: (next: OverlayState) => void
  source: string
  children: ReactNode // legend
}

function OverlayControl({ title, state, onChange, source, children }: OverlayControlProps) {
  const opacityPct = Math.round(state.opacity * 100)
  return (
    <section className="layer-item">
      <label className="layer-row">
        <input type="checkbox" checked={state.visible} onChange={(e) => onChange({ ...state, visible: e.target.checked })} />
        <span className="layer-title">{title}</span>
      </label>
      <label className="layer-opacity">
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacityPct}
          disabled={!state.visible}
          onChange={(e) => onChange({ ...state, opacity: Number(e.target.value) / 100 })}
        />
        <span className="layer-opacity-value">{opacityPct}%</span>
      </label>
      {children}
      <SourceInfo text={source} />
    </section>
  )
}

function LayersPanel(props: LayersPanelProps) {
  const { layers, sources, maxSlopeDeg } = props
  const ortho = findLayer(layers, 'ortho')
  const slopeInfo = findLayer(layers, 'slope')
  const roughnessInfo = findLayer(layers, 'roughness')

  return (
    <>
      <h2>Layers</h2>

      <section className="layer-item">
        <div className="layer-row">
          <span className="layer-title">{ortho?.title ?? 'Base image'}</span>
          <span className="layer-tag">Base image · always on</span>
        </div>
        <SourceInfo text={sources.ortho} />
      </section>

      <OverlayControl title={slopeInfo?.title ?? 'Slope'} state={props.slope} onChange={props.onSlopeChange} source={sources.slope}>
        {/* The slope image is always drawn from the grid with this scale, so this legend always matches. */}
        <SlopeLegend maxSlopeDeg={maxSlopeDeg} />
      </OverlayControl>

      <OverlayControl
        title={roughnessInfo?.title ?? 'Roughness'}
        state={props.roughness}
        onChange={props.onRoughnessChange}
        source={sources.roughness}
      >
        <RoughnessLegend />
      </OverlayControl>

      <section className="layer-item">
        <label className="layer-row">
          <input
            type="checkbox"
            checked={props.stopsVisible}
            onChange={(e) => props.onStopsVisibleChange(e.target.checked)}
          />
          <span className="layer-title">Science stops</span>
          <span className="layer-tag">{props.stopCount === 0 ? 'none available' : `${props.stopCount} on map`}</span>
        </label>
        <p className="layer-source">Click a stop to open its card.</p>
      </section>

      <h2 className="panel-subheading">Routes</h2>
      <RouteLegend />
    </>
  )
}

export default LayersPanel
