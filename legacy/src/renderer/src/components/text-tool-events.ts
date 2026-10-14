export const TEXT_TOOL_DIALOG_EVENT = 'moonsprite:text-tool-dialog'
export const TEXT_TOOL_PREVIEW_EVENT = 'moonsprite:text-tool-preview'

export interface TextToolDialogDetail {
  documentId: string
  x: number
  y: number
  width?: number
  height?: number
  layerId?: string
  frameId?: string
}

export const openTextToolDialog = (detail: TextToolDialogDetail): void => {
  window.dispatchEvent(new CustomEvent<TextToolDialogDetail>(TEXT_TOOL_DIALOG_EVENT, { detail }))
}

export interface TextToolPreviewDetail {
  documentId: string
  surface: import('@shared/types-animation').AnimationCelSurface | null
  box?: import('@shared/types-selection').SelectionRect | null
}

export const publishTextToolPreview = (detail: TextToolPreviewDetail): void => {
  window.dispatchEvent(new CustomEvent<TextToolPreviewDetail>(TEXT_TOOL_PREVIEW_EVENT, { detail }))
}
