import { animationCelAt, animationCelKey } from '@/core/animation'
import { animationMaskAt } from '@/core/document-model'
import { COMMAND_SCOPE_EVENT } from '@/core/command-context'
import { useWorkspace } from '@/store/workspace'

export interface LayerCellShortcutModifiers {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

// Both panel modes resolve their modified clicks through these bindings.
const shortcutModifiers = { cel: 'altKey', mask: 'altKey' } as const

export const isLayerCellShortcut = (event: LayerCellShortcutModifiers, kind: 'cel' | 'mask'): boolean =>
  event[shortcutModifiers[kind]]

export function toggleLayerMaskIsolatedView(documentId: string, ownerId: string, frameId: string, additive = false): boolean {
  const store = useWorkspace.getState()
  const session = store.sessions.find(item => item.document.id === documentId)
  const timeline = session?.document.animation
  const mask = timeline ? animationMaskAt(timeline, ownerId, frameId) : null
  if (store.activeId !== documentId || !session || !timeline || !mask) return false
  const cel = animationCelAt(timeline, ownerId, frameId)
  if (!additive && session.layerMaskIsolatedView && session.activeLayerMaskId === mask.id) store.selectAnimationMaskCell(animationCelKey(ownerId, frameId))
  else if (cel) store.selectLayerMask(cel.id, additive)
  else store.selectGroupMask(ownerId, frameId, additive)
  return true
}

export function runLayerCellShortcut(event: LayerCellShortcutModifiers, documentId: string, ownerId: string, frameId: string, kind: 'cel' | 'mask'): boolean {
  if (!isLayerCellShortcut(event, kind)) return false
  if (kind === 'mask') return toggleLayerMaskIsolatedView(documentId, ownerId, frameId, event.shiftKey)
  const store = useWorkspace.getState()
  if (store.activeId !== documentId) return false
  store.selectAnimationCelContent(animationCelKey(ownerId, frameId), event.shiftKey)
  window.dispatchEvent(new CustomEvent(COMMAND_SCOPE_EVENT, { detail: { scope: 'canvas', preferSelection: true } }))
  return true
}
