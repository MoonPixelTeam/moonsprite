export const CANVAS_REFERENCE_PASTE_EVENT = 'moonsprite:replace-canvas-reference'
import { isCanvasViewNavigationTool } from '@/core/canvas-input'

export function isCanvasMiddlePanPointer(event: { button: number; target: EventTarget | null }): boolean {
  return event.button === 1 && event.target instanceof Element
    && Boolean(event.target.closest('canvas.stage-canvas, .canvas-references'))
}

/** Reference surfaces belong to their own canvas, even before its cursor becomes visible. */
export function targetsCanvasSurface(path: EventTarget[], canvas: HTMLCanvasElement): boolean {
  return path.includes(canvas) || path.some((target) => target instanceof Element
    && target.classList.contains('canvas-references') && target.parentElement === canvas.parentElement)
}

export function referenceNavigationActive(spaceHeld: boolean, tool: Parameters<typeof isCanvasViewNavigationTool>[0], animationPlaying: boolean): boolean {
  return spaceHeld || animationPlaying || isCanvasViewNavigationTool(tool)
}
