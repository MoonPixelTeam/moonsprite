import type { ViewState } from '@shared/types-view'
export const CANVAS_VIEWPORT_EVENT = 'moonsprite:canvas-viewport'
export interface CanvasViewportDetail { documentId: string; width: number; height: number; view: ViewState }
