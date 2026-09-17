import { findLayerMask, getPaletteEntry } from '@/core/document-model'
import { packColor } from '@/core/raster'
import { translateSelectionQuad } from './workspace-selection-transform-geometry'
import { selectionTransformCells } from '@/core/tools-selection-transform-raster'
import type { SelectionClipboard } from './clipboard-service'
import type { DocumentSession } from './workspace-types'

/** Rasterize only the floating payload, never its materialized background. */
export function floatingSelectionClipboard(session: DocumentSession): SelectionClipboard | null {
  const pending = session.pendingPaste
  if (!pending) return null
  const layer = pending.freeTile?.edit.layer
    ?? session.document.layers.find((candidate) => candidate.id === pending.layerId)
    ?? findLayerMask(session.document, pending.layerId)
  if (!layer) return null
  const document = pending.freeTile?.edit.document ?? session.document
  const bounds = pending.target
  const target = pending.transformTarget ?? bounds
  const pixels = new Uint32Array(bounds.width * bounds.height)
  const mask = new Uint8Array(pixels.length)
  // Use local destination coordinates to retain content outside the canvas.
  const cells = selectionTransformCells(
    { ...document, width: bounds.width, height: bounds.height }, pending.source,
    { ...target, x: target.x - bounds.x, y: target.y - bounds.y },
    pending.transformAngle ?? 0, pending.transformShear, layer,
    pending.transformQuad ? translateSelectionQuad(pending.transformQuad, -bounds.x, -bounds.y) ?? undefined : undefined,
    false, session.selectionRotationAlgorithm === 'rotsprite'
  )
  for (const cell of cells) {
    const index = cell.y * bounds.width + cell.x
    pixels[index] = layer.format === 'rgba' ? cell.value : packColor(getPaletteEntry(document, cell.value).color)
    mask[index] = 1
  }
  return { width: bounds.width, height: bounds.height, originX: bounds.x, originY: bounds.y, pixels, mask }
}
