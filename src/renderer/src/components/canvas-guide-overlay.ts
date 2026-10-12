import type { ViewState } from '@shared/types-view'
import { clearCanvasBacking, syncCanvasDisplaySize } from './canvas-display-size'

/** Guides retain their own transparent surface above all paint previews. */
export function prepareCanvasGuideOverlay(
  canvas: HTMLCanvasElement | null,
  size: { width: number; height: number },
  displaySize: { width: number; height: number },
  dpr: number,
  reserve: boolean,
  view: ViewState,
  applyViewRotation: (context: CanvasRenderingContext2D, width: number, height: number, view: ViewState) => void
): CanvasRenderingContext2D | null {
  if (!canvas) return null
  const scale = syncCanvasDisplaySize(canvas, size.width, size.height, dpr, displaySize.width, displaySize.height, reserve)
  const context = canvas.getContext('2d')
  if (!context) return null
  clearCanvasBacking(context, canvas)
  context.setTransform(scale.x, 0, 0, scale.y, 0, 0)
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  applyViewRotation(context, size.width, size.height, view)
  return context
}
