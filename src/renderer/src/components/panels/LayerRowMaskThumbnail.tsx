import { useShallow } from 'zustand/react/shallow'
import { animationCelAt, animationCelKey } from '@/core/animation'
import { animationMaskAt } from '@/core/document-model'
import { pixelSource } from '@/components/pixel-source'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { useWorkspace } from '@/store/workspace'
import { ActiveLayerMaskThumbnail } from './layer-timeline-thumbnails'
import { runLayerCellShortcut, type LayerCellShortcutModifiers } from './layer-cell-shortcuts'

export function LayerRowMaskThumbnail({ documentId, ownerId, ownerKind, size, onContextMenu }: {
  documentId: string; ownerId: string; ownerKind: 'layer' | 'group'; size: number
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, ownerId: string, frameId: string, kind: 'mask') => void
}) {
  const { t } = useI18n()
  useWorkspace(useShallow(state => {
    const session = state.sessions.find(item => item.document.id === documentId)
    return [session?.contentRevision, session?.layersPanelRevision, session?.uiRevision, session?.history.revision, session?.document.animation?.activeFrameId]
  }))
  const session = useWorkspace.getState().sessions.find(item => item.document.id === documentId)
  const timeline = session?.document.animation
  const mask = timeline ? animationMaskAt(timeline, ownerId, timeline.activeFrameId) : null
  if (!session || !timeline || !mask) return null
  const frameId = timeline.activeFrameId
  const linked = mask.moveWithOwner !== false
  const active = session.activeLayerMaskId === mask.id
  const linkLabel = t(linked ? 'layers.disableLayerMaskMoveBinding' : 'layers.enableLayerMaskMoveBinding')
  const selectMask = (event: LayerCellShortcutModifiers): void => {
    const store = useWorkspace.getState()
    if (!runLayerCellShortcut(event, documentId, ownerId, frameId, 'mask')) store.selectAnimationMaskCell(animationCelKey(ownerId, frameId))
    store.clearAnimationSelection(true)
  }
  const toggleLink = (): void => {
    const store = useWorkspace.getState()
    if (ownerKind === 'group') store.setGroupMaskMoveWithOwner(ownerId, frameId, !linked)
    else {
      const cel = animationCelAt(timeline, ownerId, frameId)
      if (cel) store.setLayerMaskMoveWithOwner(cel.id, !linked)
    }
  }
  return <span className="layer-inline-mask" data-preserve-animation-selection
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <span className="layer-mask-link" role="button" tabIndex={0} aria-label={linkLabel} title={linkLabel} aria-pressed={linked}
      onClick={event => { event.stopPropagation(); toggleLink() }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault(); event.stopPropagation(); toggleLink()
      }}><PixelUtilityIcon kind="aspectLink" scale={2} /></span>
    <span className={`layer-row-mask-thumbnail${active ? ' active' : ''}${mask.visible === false ? ' disabled' : ''}`}
      role="button" tabIndex={0} aria-pressed={active}
      onContextMenu={event => { event.stopPropagation(); onContextMenu?.(event, ownerId, frameId, 'mask') }}
      aria-label={t(ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask')}
      style={{ width: size, height: size }}
      onClick={event => { event.stopPropagation(); selectMask(event) }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault(); event.stopPropagation(); selectMask(event)
      }}>
      <ActiveLayerMaskThumbnail documentId={documentId} ownerId={ownerId} frameId={frameId} maskSource={pixelSource(mask)}
        revision={session.contentRevision} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={size} />
    </span>
  </span>
}
