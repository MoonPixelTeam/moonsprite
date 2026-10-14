export const LAYER_PANEL_REVEAL_EVENT = 'moonsprite:reveal-layer-in-panel'
export const ANIMATION_CELL_OPERATION_FINISHED_EVENT = 'moonsprite:animation-cell-operation-finished'
export const CANVAS_SELECTION_STARTED_EVENT = 'moonsprite:canvas-selection-started'
export const CANVAS_SELECTION_PRESERVE_EVENT = 'moonsprite:canvas-selection-preserve'

export interface LayerPanelRevealDetail {
  documentId: string
  layerId: string
}

export interface AnimationCellOperationFinishedDetail {
  documentId: string
}

export interface CanvasSelectionStartedDetail {
  documentId: string
}

export interface CanvasSelectionPreserveDetail {
  documentId: string
}

export function revealLayerInPanel(documentId: string, layerId: string): void {
  window.dispatchEvent(new CustomEvent<LayerPanelRevealDetail>(LAYER_PANEL_REVEAL_EVENT, {
    detail: { documentId, layerId }
  }))
}

export function finishAnimationCellOperation(documentId: string): void {
  window.dispatchEvent(new CustomEvent<AnimationCellOperationFinishedDetail>(ANIMATION_CELL_OPERATION_FINISHED_EVENT, {
    detail: { documentId }
  }))
}

export function startCanvasSelection(documentId: string): void {
  window.dispatchEvent(new CustomEvent<CanvasSelectionStartedDetail>(CANVAS_SELECTION_STARTED_EVENT, {
    detail: { documentId }
  }))
}

export function preserveCanvasSelection(documentId: string): void {
  window.dispatchEvent(new CustomEvent<CanvasSelectionPreserveDetail>(CANVAS_SELECTION_PRESERVE_EVENT, {
    detail: { documentId }
  }))
}
