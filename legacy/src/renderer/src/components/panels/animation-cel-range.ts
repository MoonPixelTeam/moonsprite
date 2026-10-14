import { parseAnimationCelKey } from '@/core/animation'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

/** Group slots describe the marquee but never become editable selection keys. */
export function commitAnimationCelRange(session: Readonly<DocumentSession>, keys: readonly string[], target: string): string[] {
  const store = useWorkspace.getState()
  const layers = new Set(session.document.layers.map(layer => layer.id))
  const groups = new Set(session.document.groups.map(group => group.id))
  const realKeys = keys.filter(key => layers.has(parseAnimationCelKey(key)?.layerId ?? ''))
  const targetFrame = parseAnimationCelKey(target)?.frameId
  const focus = realKeys.includes(target) ? target : realKeys.find(key => parseAnimationCelKey(key)?.frameId === targetFrame)
  if (focus) store.selectAnimationCell(focus, 'replace', keys)
  else store.clearAnimationSelection()
  if (targetFrame && session.document.animation?.activeFrameId !== targetFrame) store.setActiveAnimationFrame(targetFrame)
  return keys.filter(key => groups.has(parseAnimationCelKey(key)?.layerId ?? ''))
}
