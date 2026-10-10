import type { RasterContext2D } from './canvas-selection-renderer'

// Grayscale uses the same luminance weights as canvas-visuals. Move the
// threshold to 145/255, then invert to black on light and white on dark.
export const AUTO_CONTRAST_FILTER = 'grayscale(1) brightness(0.8793103448) contrast(10000) invert(1)'
const buffers = new WeakMap<object, OffscreenCanvas>()
const masks = new WeakMap<object, OffscreenCanvas>()
const backdrops = new WeakMap<object, OffscreenCanvas>()

// Keep enough capacity for nearby cropped previews. Release an oversized
// surface when unused capacity would exceed 25% of the requested area.
function adaptiveSurface(cache: WeakMap<object, OffscreenCanvas>, key: object, width: number, height: number): OffscreenCanvas {
  let canvas = cache.get(key)
  if (!canvas) { canvas = new OffscreenCanvas(width, height); cache.set(key, canvas); return canvas }
  let nextWidth = Math.max(canvas.width, width)
  let nextHeight = Math.max(canvas.height, height)
  if (nextWidth * nextHeight > width * height * 1.25) { nextWidth = width; nextHeight = height }
  if (canvas.width !== nextWidth) canvas.width = nextWidth
  if (canvas.height !== nextHeight) canvas.height = nextHeight
  return canvas
}

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
  const buffer = adaptiveSurface(buffers, context, width, height)
  const target = buffer.getContext('2d')!
  target.clearRect(0, 0, buffer.width, buffer.height)
  target.filter = AUTO_CONTRAST_FILTER
  // Materialize the crop before filtering. A source rectangle on a filtered
  // drawImage still hands the backend a viewport-sized texture; keeping the
  // filter input small avoids that dependency as the window grows.
  const composite = adaptiveSurface(backdrops, context, width, height)
  const source = composite.getContext('2d')!
  source.clearRect(0, 0, composite.width, composite.height)
  if (backdrop) source.drawImage(backdrop, left, top, width, height, 0, 0, width, height)
  source.drawImage(context.canvas, left, top, width, height, 0, 0, width, height)
  // Composite translucent preview paint over the document before deciding
  // contrast; filtering a transparent overlay alone has no background.
  target.drawImage(composite, 0, 0)
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
