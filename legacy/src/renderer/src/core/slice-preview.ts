import type { SelectionRect } from '@shared/types-selection'

export const SLICE_PREVIEW_EVENT = 'moonsprite:slice-preview'

export function publishSlicePreview(documentId: string, slices: readonly SelectionRect[] | null): void {
  window.dispatchEvent(new CustomEvent(SLICE_PREVIEW_EVENT, { detail: { documentId, slices } }))
}
