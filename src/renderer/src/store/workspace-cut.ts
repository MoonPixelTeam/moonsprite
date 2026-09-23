import { isLayerEffectivelyLocked } from '@/core/document-model'
import { parseAnimationCelKey } from '@/core/animation'
import { tr } from './workspace-translation'
import { useWorkspace } from './workspace'

export type WorkspaceCutTarget = 'layers' | 'frames' | 'cels' | 'masks' | 'free-tiles' | 'selection'

/** Copy first, then remove through the existing undoable domain commands. */
export function cutWorkspaceItems(target: WorkspaceCutTarget): void {
  const store = useWorkspace.getState()
  const session = store.sessions.find(item => item.document.id === store.activeId)
  if (!session) return
  if (target === 'selection') { store.cutSelection(); return }
  if (target === 'free-tiles') {
    const ids = session.selectedFreeTileInstanceIds.length ? [...session.selectedFreeTileInstanceIds] : session.selectedFreeTileInstanceId ? [session.selectedFreeTileInstanceId] : []
    if (ids.length && store.copyFreeTileInstances()) store.deleteFreeTileInstances(ids)
    return
  }
  if (target === 'layers') {
    if (store.copySelectedLayersToClipboard()) store.deleteSelectedLayers()
    return
  }
  if (target === 'cels') {
    const ids = new Set(session.selectedAnimationCellKeys.map(key => parseAnimationCelKey(key)?.layerId))
    if (session.document.layers.some(layer => ids.has(layer.id) && isLayerEffectivelyLocked(session.document, layer))) {
      store.setMessage(tr('workspace.layer.structureLocked'))
      return
    }
  }
  if (target === 'masks') store.copySelectedAnimationMasks()
  else if (target === 'cels') store.copySelectedAnimationCels()
  else store.copySelectedAnimationFrames()
  const current = useWorkspace.getState().sessions.find(item => item.document.id === session.document.id)
  const copied = target === 'masks' ? current?.animationMaskClipboard.length
    : target === 'cels' ? current?.animationCellClipboard.length : current?.animationFrameClipboard.length
  if (!copied) return
  if (target === 'cels' && current?.selection) store.deleteSelection()
  else store.deleteSelectedAnimationItems()
}
