import { applyRelativeLuminance } from '@/core/raster'

// Pasted reference canvases are immutable. Reuse the converted surface when panning,
// zooming or toggling the display, and allow it to be collected when a picture is removed.
const luminanceSurfaces = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

export function referenceImageDisplayCanvas(source: HTMLCanvasElement, relativeLuminance: boolean): HTMLCanvasElement {
  if (!relativeLuminance) return source
  const cached = luminanceSurfaces.get(source)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const sourceContext = source.getContext('2d')
  const context = canvas.getContext('2d')
  if (!sourceContext || !context) return source
  const image = sourceContext.getImageData(0, 0, source.width, source.height)
  applyRelativeLuminance(image.data)
  context.putImageData(image, 0, 0)
  luminanceSurfaces.set(source, canvas)
  return canvas
}
