import type { SelectionQuad } from '@shared/types-selection'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { type HistoryEntry } from '@/core/history'
import { readLayerColorAt } from '@/core/document-model'
import { selectionContains } from '@/core/selection'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import { tilemapCellBounds, tilemapCellIndexAtPoint } from '@/core/tilemap'
import { applyFreeTileSourceSnapshot } from '@/core/free-tile-document'
import { freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { activePaintLayer, cloneSelectionMask } from './workspace-session'
import type { DocumentSession, FloatingPaste, FloatingSelectionBoxHistoryEntry, SelectionPivot } from './workspace-types'
import { cloneSelectionPivot } from './workspace-selection-geometry'
import { cloneSelectionQuad } from './workspace-selection-transform-geometry'

export const tilemapEditCellIndexForSelection = (session: DocumentSession, selection: SelectionMask): number | undefined => {
  if (session.tilemapMode !== 'edit' || activePaintLayer(session).kind !== 'tilemap') return undefined
  const target = activeTilemapCelTarget(session.document)
  if (!target) return undefined
  for (let y = selection.y; y < selection.y + selection.height; y += 1)
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      const index = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, x, y)
      if (index !== null && target.tilemap.cells[index]) return index
    }
  return undefined
}

export const tilemapEditClipForCell = (session: DocumentSession, cellIndex: number | undefined): SelectionRect | undefined => {
  if (cellIndex === undefined) return undefined
  const target = activeTilemapCelTarget(session.document)
  return target?.tilemap.cells[cellIndex] ? tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex) : undefined
}

export const visibleLayerContentBoundsWithinSelection = (document: SpriteDocument, layer: RasterLayer, selection: SelectionMask): SelectionMask | null => {
  // Scan the selection itself. The layer content bounds can be stale or cover
  // another piece of content after the layer has been expanded, while shrink
  // must be based only on pixels inside the current selection.
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let y = selection.y; y < selection.y + selection.height; y += 1) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      if (!selectionContains(selection, x, y) || readLayerColorAt(document, layer, x, y).a === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  if (!selection.mask) return { x: minX, y: minY, width, height }

  // Keep irregular selections irregular while trimming their empty perimeter.
  // The content bounds determine the new frame; the original selection mask
  // determines which pixels remain selected inside that frame.
  const mask = new Uint8Array(width * height)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (selectionContains(selection, x, y)) mask[(y - minY) * width + x - minX] = 1
    }
  }
  return { x: minX, y: minY, width, height, mask }
}

export const syncFloatingPrimaryLayerState = (pending: FloatingPaste): void => {
  const primary = pending.layers?.[0]
  if (!primary) return
  pending.layerId = primary.layerId
  pending.source = primary.source
  pending.previewEdit = primary.previewEdit
  pending.translationPreview = primary.translationPreview
}

export const previewFloatingFreeTileSource = (session: DocumentSession, pending: FloatingPaste): boolean => {
  if (!pending.freeTile) return false
  const changed = applyFreeTileSourceSnapshot(session.document, freeTileSourceSnapshotFromEditRaster(pending.freeTile.edit))
  if (!changed) return false
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.layersPanelRevision += 1
  session.contentInvalidation = {
    kind: 'full',
    fromRevision,
    revision: session.contentRevision
  }
  return true
}

export const clearFloatingSelectionBoxHistory = (pending: FloatingPaste): void => {
  pending.selectionBoxUndo = undefined
  pending.selectionBoxRedo = undefined
}

export const recordFloatingSelectionBoxMove = (
  session: DocumentSession,
  pending: FloatingPaste,
  beforeSelection: SelectionMask,
  afterSelection: SelectionMask,
  beforePivot: SelectionPivot | null,
  afterPivot: SelectionPivot | null
): void => {
  const entry: FloatingSelectionBoxHistoryEntry = {
    beforeSelection: cloneSelectionMask(beforeSelection)!,
    afterSelection: cloneSelectionMask(afterSelection)!,
    beforePivot: cloneSelectionPivot(beforePivot),
    afterPivot: cloneSelectionPivot(afterPivot)
  }
  pending.selectionBoxUndo = [...(pending.selectionBoxUndo ?? []), entry]
  pending.selectionBoxRedo = undefined
  session.selection = cloneSelectionMask(afterSelection)
  session.selectionPivot = cloneSelectionPivot(afterPivot)
}

export const floatingPasteSelectionForCommit = (session: DocumentSession, pending: FloatingPaste): SelectionMask =>
  pending.source.origin === 'clipboard' && (pending.selectionBoxUndo?.length ?? 0) > 0 && session.selection ? cloneSelectionMask(session.selection)! : cloneSelectionMask(pending.target)!

export const combinedPixelHistoryEntry = (
  session: DocumentSession,
  entries: readonly HistoryEntry[],
  label: string,
  beforeSelection: SelectionMask | null,
  afterSelection: SelectionMask,
  beforeSelectionPivot: SelectionPivot | null,
  afterSelectionPivot: SelectionPivot | null = null,
  beforeFreeTransformQuad: SelectionQuad | null = null,
  afterFreeTransformQuad: SelectionQuad | null = null
): HistoryEntry => ({
  label,
  bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection.mask?.byteLength ?? 0) + 64,
  undo: () => {
    for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo()
    session.selection = cloneSelectionMask(beforeSelection)
    session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
  },
  redo: () => {
    for (const entry of entries) entry.redo()
    session.selection = cloneSelectionMask(afterSelection)
    session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
  },
  invalidation: { kind: 'full' },
  affectedLayerIds: [...new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))]
})
