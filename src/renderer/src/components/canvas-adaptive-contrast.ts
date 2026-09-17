import type { RasterContext2D } from './canvas-selection-renderer'

// Grayscale uses the same luminance weights as canvas-visuals. Move the
// threshold to 145/255, then invert to black on light and white on dark.
export const AUTO_CONTRAST_FILTER = 'grayscale(1) brightness(0.8793103448) contrast(10000) invert(1)'
const buffers = new WeakMap<object, OffscreenCanvas>()
const masks = new WeakMap<object, OffscreenCanvas>()
const backdrops = new WeakMap<object, OffscreenCanvas>()

type ContrastBounds = { x: number; y: number; width: number; height: number }
function backingBounds(context: RasterContext2D, bounds?: ContrastBounds) {
  if (!bounds) return { left: 0, top: 0, width: context.canvas.width, height: context.canvas.height }
  const matrix = context.getTransform()
  const points = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]]
    .map(([x, y]) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }))
  const left = Math.max(0, Math.floor(Math.min(...points.map(point => point.x))))
  const top = Math.max(0, Math.floor(Math.min(...points.map(point => point.y))))
  const right = Math.min(context.canvas.width, Math.ceil(Math.max(...points.map(point => point.x))))
  const bottom = Math.min(context.canvas.height, Math.ceil(Math.max(...points.map(point => point.y))))
  return { left, top, width: right - left, height: bottom - top }
}

/** Samples the rendered backdrop at each mark pixel, without CPU readback. */
export function canvasAdaptiveContrast(context: RasterContext2D, bounds?: ContrastBounds, backdrop?: HTMLCanvasElement): CanvasPattern | string {
  const transform = context.getTransform()
  const { left, top, width, height } = backingBounds(context, bounds)
  if (width <= 0 || height <= 0) return '#ffffff'
  let buffer = buffers.get(context)
  if (!buffer) { buffer = new OffscreenCanvas(width, height); buffers.set(context, buffer) }
  if (buffer.width !== width) buffer.width = width
  if (buffer.height !== height) buffer.height = height
  const target = buffer.getContext('2d')!
  target.clearRect(0, 0, width, height)
  target.filter = AUTO_CONTRAST_FILTER
  if (backdrop) {
    let composite = backdrops.get(context)
    if (!composite) { composite = new OffscreenCanvas(width, height); backdrops.set(context, composite) }
    if (composite.width !== width) composite.width = width
    if (composite.height !== height) composite.height = height
    const source = composite.getContext('2d')!
    source.clearRect(0, 0, width, height)
    source.drawImage(backdrop, left, top, width, height, 0, 0, width, height)
    source.drawImage(context.canvas, left, top, width, height, 0, 0, width, height)
    // Composite translucent preview paint over the document before deciding
    // contrast; filtering a transparent overlay alone has no background.
    target.drawImage(composite, 0, 0)
  } else target.drawImage(context.canvas, left, top, width, height, 0, 0, width, height)
  const pattern = context.createPattern(buffer, 'no-repeat')!
  pattern.setTransform(transform.inverse().translate(left, top))
  return pattern
}

export function drawCanvasAdaptiveMask(context: RasterContext2D, bitmap: ImageBitmap, bounds: { x: number; y: number; width: number; height: number }): void {
  const transform = context.getTransform()
  const { left, top, width, height } = backingBounds(context, bounds)
  if (width <= 0 || height <= 0) return
  const pattern = canvasAdaptiveContrast(context, bounds)
  let mask = masks.get(context)
  if (!mask) { mask = new OffscreenCanvas(width, height); masks.set(context, mask) }
  mask.width = width
  mask.height = height
  const target = mask.getContext('2d')!
  target.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e - left, transform.f - top)
  target.imageSmoothingEnabled = false
  target.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height)
  target.globalCompositeOperation = 'source-in'
  target.fillStyle = pattern
  target.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(mask, left, top)
  context.restore()
}
