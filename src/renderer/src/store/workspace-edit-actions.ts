import { useWorkspace } from './workspace'
import { cloneSelectionMask, selectedTransformLayersForSession } from './workspace-session'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerContentBounds } from '@/core/document-model'
import { captureSelectionTransform, applySelectionTransform } from '@/core/tools-selection-transform'
import { transformSelectionMask } from '@/core/selection'
import { commitPixelEdit, type HistoryEntry } from '@/core/history'
import { combinedPixelHistoryEntry } from './workspace-view-selection-helpers'
import { unionRects } from './workspace-selection-geometry'
import { isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { tr } from './workspace-translation'

export function rotateWorkspaceContent(angle: 90 | -90 | 180): void {
  if (isCanvasToolGestureLocked()) return
  const state = useWorkspace.getState()
  state.commitFloatingPaste()
  const active = state.sessions.find(item => item.document.id === state.activeId)
  if (!active) return
  const layers = selectedTransformLayersForSession(active)
  if (!layers.length) return
  if (layers.some(layer => layer.kind)) { state.setMessage(tr('workspace.transform.multipleUnsupported')); return }
  if (layers.some(layer => isLayerEffectivelyLocked(active.document, layer))) { state.setMessage(tr('workspace.transform.locked')); return }
  if (layers.some(layer => !isLayerEffectivelyVisible(active.document, layer))) { state.setMessage(tr('workspace.transform.hidden')); return }
  const bounds = active.selection ?? layers.map(layer => layerContentBounds(active.document, layer)).reduce((all, next) => next ? all ? unionRects(all, next) : next : all, null)
  if (!bounds) return
  const after = transformSelectionMask(bounds, bounds, active.document.width, active.document.height, angle, undefined, false)
  if (!after) return
  const label = tr('workspace.history.rotateSelectionContent')
  state.mutateActive(session => {
    const before = cloneSelectionMask(session.selection)
    const entries: HistoryEntry[] = []
    for (const layer of layers) {
      const source = captureSelectionTransform(session.document, bounds, layer)
      if (!source) continue
      const edit = applySelectionTransform(session.document, source, bounds, angle, false, undefined, undefined, undefined, layer)
      const entry = edit && commitPixelEdit(session.document, edit, label)
      if (entry) entries.push(entry)
    }
    if (!entries.length) return
    const history = combinedPixelHistoryEntry(session, entries, label, before, after, session.selectionPivot ?? null, null, session.freeTransformQuad)
    history.redo()
    session.history.push(history)
  })
}

export function invertWorkspaceColors(): void {
  useWorkspace.getState().applyActiveLayerAdjustment({ kind: 'curves', curvePoints: [{ x: 0, y: 255 }, { x: 255, y: 0 }] })
}
