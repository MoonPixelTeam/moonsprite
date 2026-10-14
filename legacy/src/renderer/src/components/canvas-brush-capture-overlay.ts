/** Dim only the surround; the document hole follows the existing view transform. */
export function drawBrushCaptureSurround(
  context: CanvasRenderingContext2D,
  viewport: { width: number; height: number },
  canvas: { left: number; top: number; width: number; height: number },
  applyView: () => void
): void {
  context.save()
  context.beginPath()
  context.rect(0, 0, viewport.width, viewport.height)
  context.save()
  applyView()
  context.rect(canvas.left, canvas.top, canvas.width, canvas.height)
  context.restore()
  context.clip('evenodd')
  context.fillStyle = 'rgba(0, 0, 0, 0.5)'
  context.fillRect(0, 0, viewport.width, viewport.height)
  context.restore()
}
