export const SELECTION_SIZE_PREVIEW_EVENT = 'moonsprite:selection-size-preview'

export interface SelectionSizePreviewDetail {
  documentId: string
  size: { width: number; height: number } | null
  toolDetails?: string | null
}

export function publishSelectionSizePreview(detail: SelectionSizePreviewDetail): void {
  window.dispatchEvent(new CustomEvent<SelectionSizePreviewDetail>(SELECTION_SIZE_PREVIEW_EVENT, { detail }))
}
