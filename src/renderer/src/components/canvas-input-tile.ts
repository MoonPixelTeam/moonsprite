import type { TilemapCell } from '@shared/types-tiles'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { cloneSelection, shiftSelection } from '@/core/selection'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { constrainedTranslation, selectionMovePointerDelta } from '@/core/canvas-input-resize'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { symmetrySelectionDragDelta } from '@/core/symmetry'
import { activeTilemapCelTarget, applyTilemapDocumentEdit, previewTilemapSelectionMove, writeTilemapCell } from '@/core/tilemap-document'
import { beginTilemapEdit, tilemapCellBounds, tilemapCellIndexAtPoint, tilemapCellLineIndices } from '@/core/tilemap'

interface Ports {
  tilemapCellAllowedBySelection: (target: NonNullable<ReturnType<typeof activeTilemapCelTarget>>, index: number, selection: SelectionMask | null) => boolean
  invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  inputRef: import('react').RefObject<CanvasInputState>
  scheduleDraw: () => void
  localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  repeatedDocumentPointsAt: (
    clientX: number,
    clientY: number,
    continuous?: boolean,
    allowOutsideCopies?: boolean
  ) => {
    local: Point
    repeated: Point
    offset: {
      x: number
      y: number
    }
  } | null
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  endSelectionAdjustmentEdit: () => void
  draw: () => void
}

export function createTileCanvasInput(ports: Ports) {
  function beginTile({
    tilemapTarget,
    session,
    point,
    event
  }: {
    tilemapTarget: import('@/core/tilemap-document').TilemapCelTarget | null
    session: DocumentSession
    point: Point
    event: React.PointerEvent<HTMLCanvasElement>
  }): boolean {
    const { tilemapCellAllowedBySelection, invalidateCompositeRect, inputRef, scheduleDraw } = ports
    if (tilemapTarget && session.tilemapMode === 'paint') {
      const cellIndex = tilemapCellIndexAtPoint(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, point.x, point.y)
      if (cellIndex === null || !tilemapCellAllowedBySelection(tilemapTarget, cellIndex, session.selection)) return true
      const selectedTileset = session.document.tilesets?.find(
        (tileset) =>
          tileset.id === session.selectedTilesetId &&
          tileset.tileWidth === tilemapTarget.tilemap.tileWidth &&
          tileset.tileHeight === tilemapTarget.tilemap.tileHeight
      )
      const roleTileId = event.button === 2 ? session.secondaryTileId : session.selectedTileId
      const tilemapCell: TilemapCell | null =
        session.tool === 'eraser'
          ? null
          : selectedTileset && roleTileId && selectedTileset.tileIds.includes(roleTileId)
            ? { tilesetId: selectedTileset.id, tileId: roleTileId }
            : null
      if (session.tool === 'pencil' && !tilemapCell) return true
      const tilemapEdit = beginTilemapEdit(tilemapTarget.layer.id, tilemapTarget.cel.frameId)
      if (writeTilemapCell(session.document, tilemapTarget, tilemapEdit, cellIndex, tilemapCell)) {
        invalidateCompositeRect(tilemapCellBounds(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, cellIndex))
      }
      inputRef.current.drag = {
        kind: 'tile-draw',
        start: point,
        last: point,
        tilemapEdit,
        tilemapCell,
        tilemapCellIndex: cellIndex,
        startedAt: Date.now()
      }
      scheduleDraw()
      return true
    }
    return false
  }

  function moveTile({
    drag,
    session,
    pointerSamples
  }: {
    drag: DragState
    session: DocumentSession
    pointerSamples: {
      clientX: number
      clientY: number
      timeStamp?: number
      pointerType: string
      pressure: number | undefined
      pressureAvailable: boolean
      previousPressure: number | undefined
    }[]
  }): boolean {
    const { localPointAt, tilemapCellAllowedBySelection, invalidateCompositeRect, scheduleDraw } = ports
    if (drag.kind === 'tile-draw' && drag.tilemapEdit && drag.tilemapCellIndex !== undefined) {
      const target = activeTilemapCelTarget(session.document)
      if (!target || target.layer.id !== drag.tilemapEdit.layerId || target.cel.frameId !== drag.tilemapEdit.frameId) return true
      let previousIndex = drag.tilemapCellIndex
      for (const sample of pointerSamples) {
        const samplePoint = localPointAt(sample.clientX, sample.clientY, true)
        if (!samplePoint) continue
        const nextIndex = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, samplePoint.x, samplePoint.y)
        if (nextIndex === null) continue
        for (const index of tilemapCellLineIndices(target.tilemap, previousIndex, nextIndex, session.view.tileRepeatMode ?? 'off')) {
          if (!tilemapCellAllowedBySelection(target, index, session.selection)) continue
          if (!writeTilemapCell(session.document, target, drag.tilemapEdit, index, drag.tilemapCell ?? null)) continue
          invalidateCompositeRect(tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, index))
        }
        previousIndex = nextIndex
      }
      drag.tilemapCellIndex = previousIndex
      scheduleDraw()
      return true
    }
    return false
  }

  function moveTileSelection({
    drag,
    event,
    point,
    session
  }: {
    drag: DragState
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    session: DocumentSession
  }): boolean {
    const { repeatedDocumentPointsAt, symmetryCenter, modifierActive, compositeCacheRef, scheduleDraw } = ports
    if (drag.kind === 'move-content' && drag.selectionStart && drag.tilemapSelectionMoveSource) {
      const source = drag.tilemapSelectionMoveSource
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(
        drag.selectionStart,
        drag.start,
        pointerDelta,
        session.document.width,
        session.document.height,
        session.symmetryAxes,
        symmetryCenter,
        true
      )
      const distance = constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      const columns = Math.round(distance.x / source.tileWidth)
      const rows = Math.round(distance.y / source.tileHeight)
      if (drag.tilemapSelectionMoveDelta?.columns === columns && drag.tilemapSelectionMoveDelta.rows === rows) return true
      if (drag.tilemapEdit) applyTilemapDocumentEdit(session.document, drag.tilemapEdit, 'before')
      drag.tilemapEdit = previewTilemapSelectionMove(session.document, source, columns, rows, Boolean(drag.copy)) ?? undefined
      drag.tilemapSelectionMoveDelta = { columns, rows }
      const deltaX = columns * source.tileWidth
      const deltaY = rows * source.tileHeight
      const start = drag.transformStartTarget ?? drag.selectionStart
      drag.previewTarget = { ...start, x: start.x + deltaX, y: start.y + deltaY }
      drag.previewSelection = shiftSelection(drag.selectionStart, deltaX, deltaY, session.document.width, session.document.height)
      drag.appliedSelection = drag.previewSelection
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + deltaX, y: drag.selectionPivotStart.y + deltaY }
      compositeCacheRef.current.invalidateAll()
      scheduleDraw()
      return true
    }
    return false
  }

  function endTileSelection({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { t, endSelectionAdjustmentEdit, draw } = ports
    if (drag.kind === 'move-content' && drag.selectionStart && drag.tilemapSelectionMoveSource) {
      const beforeSelection = cloneSelection(drag.selectionStart)
      const afterSelection = cloneSelection(drag.previewSelection ?? null)
      const edit = drag.tilemapEdit
      const moved = Boolean(drag.tilemapSelectionMoveDelta && (drag.tilemapSelectionMoveDelta.columns !== 0 || drag.tilemapSelectionMoveDelta.rows !== 0))
      if (edit && edit.before.size > 0 && edit.after.size > 0) {
        state.commitTilemapSelectionMove(
          edit,
          beforeSelection,
          afterSelection,
          t(drag.copy ? 'workspace.history.copySelectionContent' : 'workspace.history.moveSelectionContent')
        )
      } else if (moved) state.commitSelectionChange(beforeSelection, afterSelection, t('canvas.history.moveSelectionBox'))
      if (drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
      endSelectionAdjustmentEdit()
      draw()
      return true
    }
    return false
  }

  function endTile({ drag, state, session }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState>; session: DocumentSession }): boolean {
    const { t, draw } = ports
    if (drag.kind === 'tile-draw' && drag.tilemapEdit) {
      state.commitTilemapEdit(drag.tilemapEdit, t(session.tool === 'eraser' ? 'canvas.history.eraseTiles' : 'canvas.history.paintTiles'), {
        stroke: true,
        durationMs: Math.max(1, Date.now() - (drag.startedAt ?? Date.now()))
      })
      // The edit carries the layer that actually received the stroke. Keep
      // that layer active after commit even if React rendered the old layer
      // between pointer-down and pointer-up.
      state.activateTilemapLayerForDrawing(drag.tilemapEdit.layerId)
      draw()
      return true
    }
    return false
  }
  return { beginTile, moveTile, moveTileSelection, endTileSelection, endTile }
}
