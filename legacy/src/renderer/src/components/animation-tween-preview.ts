import type { PixelLinePoint } from '@/core/pixel-line'
import { perfectPixelPathPoints } from '@/core/tools-shapes'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { PaletteEntry } from '@shared/types-color'
import type { CheckerboardPreferences } from '@/core/file-preferences'
import { readSurfacePackedLocal } from '@/core/runtime-raster'
import { deviceAlignedCanvasRect, type CanvasDeviceScale } from '@/core/canvas-render-plan'
import type { RasterContext2D } from './canvas-selection-renderer'

export interface AnimationTweenPreview {
  canvas: HTMLCanvasElement
  offsetX: number
  offsetY: number
  move?: { owner: object; x: number; y: number; onChange(x: number, y: number): void }
}
const previews = new Map<string, AnimationTweenPreview>()
const PREVIEW_EVENT = 'moonsprite:animation-tween-preview'
export const animationTweenPreviewFor = (documentId: string): AnimationTweenPreview | undefined => previews.get(documentId)

/** Ephemeral UI state; never added to document pixels, history or exports. */
export function publishAnimationTweenPreview(documentId: string, preview: AnimationTweenPreview | null): void {
  if (preview) previews.set(documentId, preview)
  else previews.delete(documentId)
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: documentId }))
}

export function subscribeAnimationTweenPreview(documentId: string, redraw: () => void): () => void {
  const listener = (event: Event): void => { if ((event as CustomEvent<string>).detail === documentId) redraw() }
  window.addEventListener(PREVIEW_EVENT, listener)
  return () => window.removeEventListener(PREVIEW_EVENT, listener)
}

export function tweenPreviewCanvas(surface: AnimationCelSurface, palette: readonly PaletteEntry[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = surface.width
  canvas.height = surface.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const image = context.createImageData(surface.width, surface.height)
  const colors = new Map(palette.map((entry) => [entry.id, entry.color]))
  for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
    const packed = readSurfacePackedLocal(surface, x, y)
    const color = surface.format === 'indexed' ? colors.get(packed) : { r: packed & 255, g: packed >>> 8 & 255, b: packed >>> 16 & 255, a: packed >>> 24 }
    if (color) image.data.set([color.r, color.g, color.b, color.a], (y * surface.width + x) * 4)
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/** Called inside the existing canvas-copy clip and view transform. */
export function drawAnimationTweenPreview(context: RasterContext2D, documentId: string, originX: number, originY: number, zoom: number, deviceScale: CanvasDeviceScale): void {
  const preview = previews.get(documentId)
  if (!preview) return
  const bounds = deviceAlignedCanvasRect(originX + preview.offsetX * zoom, originY + preview.offsetY * zoom, preview.canvas.width * zoom, preview.canvas.height * zoom, deviceScale)
  context.save()
  context.imageSmoothingEnabled = false
  context.globalAlpha = 0.4
  context.drawImage(preview.canvas, bounds.left, bounds.top, bounds.width, bounds.height)
  context.restore()
}

export function drawTweenCheckerboard(context: CanvasRenderingContext2D, width: number, height: number, checker: CheckerboardPreferences, zoom: number, originX: number, originY: number): void {
  context.globalAlpha = 1
  context.fillStyle = `rgb(${checker.lightColor.r} ${checker.lightColor.g} ${checker.lightColor.b})`
  context.fillRect(0, 0, width, height)
  const cell = checker.size * zoom
  // Match the main canvas: avoid dense subpixel checks when zoomed far out.
  if (cell < 2 || !Number.isFinite(cell)) return
  context.fillStyle = `rgb(${checker.darkColor.r} ${checker.darkColor.g} ${checker.darkColor.b})`
  for (let row = Math.floor(-originY / cell); row < Math.ceil((height - originY) / cell); row++) {
    for (let column = Math.floor(-originX / cell); column < Math.ceil((width - originX) / cell); column++) {
      if ((row + column) % 2 === 0) continue
      const left = Math.max(0, originX + column * cell), top = Math.max(0, originY + row * cell)
      const right = Math.min(width, originX + (column + 1) * cell), bottom = Math.min(height, originY + (row + 1) * cell)
      context.fillRect(left, top, right - left, bottom - top)
    }
  }
}

/** Rasterize in document pixels, then display each pixel with the artwork's exact transform. */
export function drawTweenPixelPath(context: Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>, points: readonly PixelLinePoint[], width: number, height: number,
  view: { zoom: number; originX: number; originY: number; dpr?: number; showAnchor?: boolean }): void {
  const { zoom, originX, originY, dpr = 1 } = view
  if (!Number.isFinite(zoom) || zoom <= 0) return
  const minX = Math.floor(-originX / zoom), maxX = Math.ceil((width - originX) / zoom)
  const minY = Math.floor(-originY / zoom), maxY = Math.ceil((height - originY) / zoom)
  const grid = (point: PixelLinePoint) => ({ x: Math.round(point.x), y: Math.round(point.y) })
  const pixel = (point: PixelLinePoint) => {
    const bounds = deviceAlignedCanvasRect(originX + point.x * zoom, originY + point.y * zoom, zoom, zoom, { x: dpr, y: dpr })
    context.fillRect(bounds.left, bounds.top, bounds.width, bounds.height)
  }
  context.fillStyle = '#2979FF'
  for (let index = 1; index < points.length; index++) {
    const from = grid(points[index - 1]), to = grid(points[index])
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) continue
    const dx = to.x - from.x, dy = to.y - from.y
    let enter = 0, leave = 1, visible = true
    for (const [p, q] of [[-dx, from.x - minX], [dx, maxX - from.x], [-dy, from.y - minY], [dy, maxY - from.y]]) {
      if (p === 0) { if (q < 0) visible = false; continue }
      const ratio = q / p
      if (p < 0) enter = Math.max(enter, ratio)
      else leave = Math.min(leave, ratio)
    }
    if (!visible || enter > leave) continue
    for (const point of perfectPixelPathPoints([{ x: Math.round(from.x + dx * enter), y: Math.round(from.y + dy * enter) },
      { x: Math.round(from.x + dx * leave), y: Math.round(from.y + dy * leave) }])) pixel(point)
  }
  if (!points.length) return
  for (const [index, source] of [points[points.length - 1], points[0]].entries()) {
    if (index === 1 && view.showAnchor === false) continue
    const point = grid(source)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < minX || point.y < minY || point.x > maxX || point.y > maxY) continue
    context.fillStyle = index === 1 ? '#FFB300' : '#FFFFFF'
    pixel(point)
  }
}
