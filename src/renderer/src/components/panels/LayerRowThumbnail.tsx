import { useShallow } from 'zustand/react/shallow'
import { animationCelAt, resolveAnimationCel } from '@/core/animation'
import { pixelSource } from '@/components/pixel-source'
import { useWorkspace } from '@/store/workspace'
import { CelThumbnail } from './layer-timeline-thumbnails'
import { runLayerCellShortcut, type LayerCellShortcutModifiers } from './layer-cell-shortcuts'

export function LayerRowThumbnail({ documentId, layerId, size }: { documentId: string; layerId: string; size: number }) {
  useWorkspace(useShallow(state => {
    const session = state.sessions.find(item => item.document.id === documentId)
    return [session?.contentRevision, session?.layersPanelRevision, session?.document.animation?.activeFrameId, session?.activeLayerMaskId, session?.document.activeLayerId]
  }))
  const session = useWorkspace.getState().sessions.find(item => item.document.id === documentId)
  if (!session) return null
  const { document } = session
  const timeline = document.animation
  const cel = timeline ? resolveAnimationCel(timeline, animationCelAt(timeline, layerId, timeline.activeFrameId)) : null
  const active = !session.activeLayerMaskId && document.activeLayerId === layerId
  const activate = (event: LayerCellShortcutModifiers): void => {
    const store = useWorkspace.getState()
    if (timeline) runLayerCellShortcut(event, documentId, layerId, timeline.activeFrameId, 'cel')
    store.activateLayerForCanvas(layerId)
  }
  return <span className={`layer-row-thumbnail${active ? ' active' : ''}`} role="button" tabIndex={0}
    aria-label={document.layers.find(layer => layer.id === layerId)?.name} aria-pressed={active} data-preserve-animation-selection style={{ width: size, height: size }}
    onPointerDown={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); activate(event) }}
    onKeyDown={event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault(); event.stopPropagation(); activate(event)
    }}>
    {cel?.surface && <CelThumbnail key={cel.id} documentId={documentId} layerId={layerId} celSource={pixelSource(cel)}
      palette={document.palette} revision={session.contentRevision} documentWidth={document.width} documentHeight={document.height} thumbnailSize={size} framing="canvas" />}
  </span>
}
