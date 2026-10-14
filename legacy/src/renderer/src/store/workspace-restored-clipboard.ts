import type { PixelEdit } from '@/core/history'
import type { FloatingPaste } from './workspace-types'
import { cloneSelectionMask } from './workspace-session'
import { cloneSelectionQuad } from './workspace-selection-transform-geometry'

/** Keep the original off-canvas payload alongside its materialized baseline. */
export function restoredClipboardSnapshot(pending: FloatingPaste, edit: PixelEdit): FloatingPaste {
  return {
    ...pending,
    source: { ...pending.source, sourceQuad: cloneSelectionQuad(pending.source.sourceQuad) ?? undefined },
    target: cloneSelectionMask(pending.target)!,
    transformTarget: pending.transformTarget ? { ...pending.transformTarget } : undefined,
    transformQuad: cloneSelectionQuad(pending.transformQuad) ?? undefined,
    previewEdit: edit,
    translationPreview: null,
    previewDeferred: false,
    restoredFromDeselect: true
  }
}

export function restoredClipboardBytes(pending: FloatingPaste | null): number {
  if (!pending) return 0
  const source = pending.source
  return source.values.byteLength + source.selectedOffsets.byteLength + source.opaqueOffsets.byteLength
    + source.opaqueIndices.byteLength + source.opaqueValues.byteLength + (source.selection.mask?.byteLength ?? 0)
}
