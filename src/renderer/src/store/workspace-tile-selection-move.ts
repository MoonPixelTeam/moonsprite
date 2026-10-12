import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { shiftSelection } from '@/core/selection'
import { expandSelectionToTilemapCells } from '@/core/tilemap'
import { activeTilemapCelTarget, captureTilemapSelectionMove, previewTilemapSelectionMove } from '@/core/tilemap-document'
import { activePaintLayer, cloneSelectionMask } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceState } from './workspace-state'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import type { WorkspaceCommandContext } from './workspace-command-context'

export function withTileSelectionMove(
  context: WorkspaceCommandContext<'commitTilemapSelectionMove' | 'commitSelectionChange'>,
  fallback: Pick<WorkspaceState, 'moveActiveSelectionWithSelectionHistory' | 'moveActiveSelection' | 'centerActiveContent'>
): typeof fallback {
  return {
    ...fallback,
    moveActiveSelectionWithSelectionHistory(deltaX, deltaY, allowOutsideCanvas = false) {
      const state = context.get()
      if (!moveTileSelectionInCells(activeSession(state), deltaX, deltaY, allowOutsideCanvas, state))
        fallback.moveActiveSelectionWithSelectionHistory(deltaX, deltaY, allowOutsideCanvas)
    }
  }
}

/** Preserve cell references when nudging paint-mode selections. */
export function moveTileSelectionInCells(
  session: DocumentSession | null, deltaX: number, deltaY: number, allowOutsideCanvas: boolean,
  commands: Pick<WorkspaceState, 'commitTilemapSelectionMove' | 'commitSelectionChange'>
): boolean {
  if (!session?.selection || session.tilemapMode !== 'paint' || session.freeTransformActive || session.pendingPaste
    || activePaintLayer(session).kind !== 'tilemap') return false
  const target = activeTilemapCelTarget(session.document)
  if (!target || isLayerEffectivelyLocked(session.document, target.layer) || !isLayerEffectivelyVisible(session.document, target.layer)) return true
  const before = cloneSelectionMask(session.selection)!
  const selection = expandSelectionToTilemapCells(before, target.tilemap, target.surface.offsetX, target.surface.offsetY,
    { x: 0, y: 0, width: session.document.width, height: session.document.height })
  if (!selection) return true
  let columns = Math.round(deltaX / target.tilemap.tileWidth)
  let rows = Math.round(deltaY / target.tilemap.tileHeight)
  if (!allowOutsideCanvas) {
    columns = Math.max(Math.ceil((target.surface.offsetX - selection.x) / target.tilemap.tileWidth),
      Math.min(Math.floor((target.surface.offsetX + target.tilemap.columns * target.tilemap.tileWidth - selection.x - selection.width) / target.tilemap.tileWidth), columns))
    rows = Math.max(Math.ceil((target.surface.offsetY - selection.y) / target.tilemap.tileHeight),
      Math.min(Math.floor((target.surface.offsetY + target.tilemap.rows * target.tilemap.tileHeight - selection.y - selection.height) / target.tilemap.tileHeight), rows))
  }
  if (columns === 0 && rows === 0) return true
  const source = captureTilemapSelectionMove(target, selection)
  if (!source) return true
  const edit = previewTilemapSelectionMove(session.document, source, columns, rows, false)
  const after = shiftSelection(selection, columns * source.tileWidth, rows * source.tileHeight, session.document.width, session.document.height)
  if (edit) commands.commitTilemapSelectionMove(edit, before, after, tr('workspace.history.moveSelectionContent'))
  else commands.commitSelectionChange(before, after, tr('canvas.history.moveSelectionBox'))
  return true
}
