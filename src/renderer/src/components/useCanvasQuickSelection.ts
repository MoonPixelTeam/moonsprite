import { useRef } from 'react'
import type { SelectionMask, SelectionMode, SelectionRect } from '@shared/types-selection'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { DEFAULT_GRID_SETTINGS, gridCellBoundsAt } from '@/core/grid'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { cloneSelection, combineSelection, rectSelection } from '@/core/selection'
import { CanvasInputState, type CanvasPoint as Point, type QuickSelectionPress } from '@/core/canvas-input'
interface Ports {
  readonly checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly commitPolygonShape: () => void
  readonly commitPolygonLasso: () => void
  readonly session: DocumentSession
  readonly localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  readonly modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  readonly tilemapPaintSelectionForIncoming: (incoming: SelectionMask | null, current?: DocumentSession) => SelectionMask | null
  readonly t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  readonly scheduleDraw: () => void
}

export function useCanvasQuickSelection(ports: Ports) {
  const quickSelectionPressRef = useRef<QuickSelectionPress | null>(null)

  const quickSelectionHandledAtRef = useRef<number | null>(null)

  const quickSelectionCellAt = (active: DocumentSession, point: Point): SelectionRect | null => {
    const grid = active.view.showGrid
      ? (active.view.grid ?? DEFAULT_GRID_SETTINGS)
      : { x: 0, y: 0, width: ports.checkerboard.size, height: ports.checkerboard.size }
    return gridCellBoundsAt(point, grid, active.document.width, active.document.height)
  }

  const quickSelectCell = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (ports.inputRef.current.drag?.kind === 'polygon-lasso' || ports.inputRef.current.drag?.kind === 'polygon-shape') {
      event.preventDefault()
      if (ports.inputRef.current.drag.kind === 'polygon-shape') ports.commitPolygonShape()
      else ports.commitPolygonLasso()
      return
    }
    if (ports.session.tool !== 'selection' || ports.session.selectionKind !== 'rectangle') return
    const handledAt = quickSelectionHandledAtRef.current
    // dblclick arrives after pointerup, even when its second press was held
    // for a long drag. The next press resets this gesture-owned marker.
    if (handledAt !== null) {
      quickSelectionHandledAtRef.current = null
      event.preventDefault()
      return
    }
    const point = ports.localPointAt(event.clientX, event.clientY)
    if (!point) return
    const state = useWorkspace.getState()
    state.commitFloatingPaste()
    const active = state.sessions.find((item) => item.document.id === ports.session.document.id)
    if (
      !active ||
      (!active.activeLayerMaskId &&
        (active.selectedGroupIds.length > 0 || !active.selectedLayerIds.some((id) => active.document.layers.some((layer) => layer.id === id))))
    )
      return
    const layer = activePaintLayer(active)
    if (!isLayerEffectivelyVisible(active.document, layer) || isLayerEffectivelyLocked(active.document, layer)) return
    const cell = quickSelectionCellAt(active, point)
    if (!cell) return
    const before = cloneSelection(active.selection)
    const mode: SelectionMode = event.shiftKey || ports.modifierActive(event.nativeEvent, 'addToSelection') ? 'add' : active.selectionMode
    const incoming = ports.tilemapPaintSelectionForIncoming(rectSelection(cell.x, cell.y, cell.width, cell.height), active)
    const after = combineSelection(before, incoming, mode)
    state.commitSelectionChange(before, after, ports.t('canvas.history.createSelection'))
    event.preventDefault()
    ports.scheduleDraw()
  }
  return { quickSelectionPressRef, quickSelectionHandledAtRef, quickSelectionCellAt, quickSelectCell }
}
