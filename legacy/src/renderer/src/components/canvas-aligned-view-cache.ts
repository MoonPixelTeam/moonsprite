import { deviceAlignedCoordinate, normalizeCanvasDeviceScale } from '@/core/canvas-render-plan'
import type { RasterContext2D } from './canvas-selection-renderer'
import type { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'

interface AlignedRegion { canvas: OffscreenCanvas; x: number; y: number; right: number; bottom: number }
const MAX_PIXELS = 8 * 1024 * 1024

/** Bounded LRU of aligned source regions, shared by all repeated copies. */
export class CanvasAlignedViewCache {
  private entries: AlignedRegion[] = []
  private source: ImageBitmap | null = null
  private zoom = 0
  private scaleX = 0
  private scaleY = 0
  private pixels = 0

  private evict(): void {
    const entry = this.entries.shift()
    if (!entry) return
    this.pixels -= entry.canvas.width * entry.canvas.height
    entry.canvas.width = 0; entry.canvas.height = 0
  }

  clear(): void {
    while (this.entries.length) this.evict()
    this.source = null
  }

  draw(context: RasterContext2D, source: ImageBitmap | undefined, blitter: CanvasCompositeBlitter,
    originX: number, originY: number, zoom: number, x: number, y: number, width: number, height: number): boolean {
    if (!source || width <= 0 || height <= 0) return false
    const scale = normalizeCanvasDeviceScale(blitter.currentDevicePixelRatio)
    // Fractional device translations must retain their original sampling phase.
    if (Math.abs(originX * scale.x - Math.round(originX * scale.x)) > 1e-7
      || Math.abs(originY * scale.y - Math.round(originY * scale.y)) > 1e-7) return false
    if (this.source !== source || this.zoom !== zoom || this.scaleX !== scale.x || this.scaleY !== scale.y) {
      this.clear()
      this.source = source; this.zoom = zoom; this.scaleX = scale.x; this.scaleY = scale.y
    }
    const edgeX = (v: number): number => Math.round(deviceAlignedCoordinate(v * zoom, scale.x) * scale.x)
    const edgeY = (v: number): number => Math.round(deviceAlignedCoordinate(v * zoom, scale.y) * scale.y)
    const index = this.entries.findIndex(entry => x >= entry.x && y >= entry.y && x + width <= entry.right && y + height <= entry.bottom)
    let entry = index >= 0 ? this.entries.splice(index, 1)[0] : undefined
    if (!entry) {
      const padX = Math.max(1, Math.floor(128 / (zoom * scale.x)))
      const padY = Math.max(1, Math.floor(128 / (zoom * scale.y)))
      const left = Math.max(0, x - padX), top = Math.max(0, y - padY)
      const right = Math.min(source.width, x + width + padX), bottom = Math.min(source.height, y + height + padY)
      const pixelsWide = edgeX(right) - edgeX(left), pixelsHigh = edgeY(bottom) - edgeY(top)
      const size = pixelsWide * pixelsHigh
      if (pixelsWide <= 0 || pixelsHigh <= 0 || size > MAX_PIXELS) return false
      // The 32 MiB limit applies to the entire LRU, not each repeat copy.
      while (this.entries.length && (this.entries.length >= 9 || this.pixels + size > MAX_PIXELS)) this.evict()
      const canvas = new OffscreenCanvas(pixelsWide, pixelsHigh)
      const target = canvas.getContext('2d')
      if (!target) { canvas.width = 0; canvas.height = 0; return false }
      target.setTransform(scale.x, 0, 0, scale.y, 0, 0)
      target.imageSmoothingEnabled = false
      blitter.drawAlignedPixelRegion(target, source, -edgeX(left) / scale.x, -edgeY(top) / scale.y,
        zoom, left, top, left, top, right - left, bottom - top)
      entry = { canvas, x: left, y: top, right, bottom }
      this.pixels += size
    }
    this.entries.push(entry)
    const left = edgeX(x), top = edgeY(y)
    const w = edgeX(x + width) - left, h = edgeY(y + height) - top
    context.drawImage(entry.canvas, left - edgeX(entry.x), top - edgeY(entry.y), w, h,
      (Math.round(originX * scale.x) + left) / scale.x, (Math.round(originY * scale.y) + top) / scale.y, w / scale.x, h / scale.y)
    return true
  }
}
