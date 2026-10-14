import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { createCompositePointSampler } from '@/core/document-composite'
import { combineSelection, magicWandSelection, selectionContains } from '@/core/selection'
import { clearSelection } from '@/core/tools-fill'
import { useWorkspace } from './workspace'
import { activePaintLayer, isToolAvailableForSession, persistToolSettings } from './workspace-session'
import { shortcutLabels } from '@/locales/shortcut-labels'
import { currentAppLocale } from '@/core/localization'
import type { PixelEdit } from '@/core/history'

export function setMagicEraserContiguous(value: boolean): void {
  useWorkspace.getState().mutateActive(session => {
    session.magicEraserContiguous = value
    persistToolSettings(session)
  }, false)
}

export function eraseWorkspaceMatchingColor(point: { x: number; y: number }, preview = false): PixelEdit | undefined {
  // This command runs inside pointerdown, after the canvas acquires its gesture
  // lock. That lock defers shortcuts; it must not block the gesture's own edit.
  const state = useWorkspace.getState()
  state.commitFloatingPaste()
  const session = state.sessions.find(item => item.document.id === state.activeId)
  if (!session || !isToolAvailableForSession(session, 'magic-eraser')) return
  const layer = activePaintLayer(session)
  if (layer.kind || isLayerEffectivelyLocked(session.document, layer) || !isLayerEffectivelyVisible(session.document, layer)) return
  const x = Math.floor(point.x), y = Math.floor(point.y)
  if (session.selection && !selectionContains(session.selection, x, y)) return
  const matched = magicWandSelection(session.document, layer, x, y, session.wandTolerance, session.magicEraserContiguous,
    session.magicEraserContiguous && session.wandGapClosing ? session.wandGapThreshold : 0,
    { connectivity: session.fillConnectivity, sourceColorAt: session.fillReference === 'visible-layers' && !session.activeLayerMaskId ? createCompositePointSampler(session.document) : undefined })
  if (!matched) return
  const target = session.selection ? combineSelection(session.selection, matched, 'intersect') : matched
  if (!target) return
  const edit = clearSelection(session.document, target, layer)
  if (preview) return edit ?? undefined
  if (edit) state.commitPixelEdit(edit, shortcutLabels(currentAppLocale())['tool.magicEraser'])
}
