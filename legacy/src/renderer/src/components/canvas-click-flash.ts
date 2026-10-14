import type { PaletteEntry } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { deviceAlignedCanvasRect, deviceAlignedCoordinate, type CanvasDeviceScale } from '@/core/canvas-render-plan'
import { getLayerContentRevision } from '@/core/document-model'
import { rasterStorageIdentity, visitSurfaceRasterRows } from '@/core/runtime-raster'
import type { RasterContext2D } from './canvas-selection-renderer'

export interface CanvasClickFlashTiming { duration: number; expiresAt: number | null }

/** Start the lifetime only after the first frame containing the flash is drawn. */
export function presentCanvasClickFlash(flash: CanvasClickFlashTiming, now: number): boolean {
  if (flash.expiresAt !== null) return false
  flash.expiresAt = now + flash.duration
  return true
}

interface FlashRasterRequest {
  contentKey: string
  layer: RasterLayer
  palette: readonly PaletteEntry[]
  region: SelectionRect
  originX: number
  originY: number
  zoom: number
  deviceScale: CanvasDeviceScale
}

const flashGeometry = ({ region, originX, originY, zoom, deviceScale }: FlashRasterRequest) => {
  const boundary = deviceAlignedCanvasRect(originX + region.x * zoom, originY + region.y * zoom, region.width * zoom, region.height * zoom, deviceScale)
  const minifyX = zoom * deviceScale.x < 1, minifyY = zoom * deviceScale.y < 1
  const width = minifyX ? Math.max(1, Math.round(boundary.width * deviceScale.x)) : region.width
  const height = minifyY ? Math.max(1, Math.round(boundary.height * deviceScale.y)) : region.height
  return { boundary, minifyX, minifyY, width, height }
}

/** Read native rows directly: no color objects, per-pixel sampling calls or empty-tile scans. */
export function buildCanvasClickFlashRaster(request: FlashRasterRequest) {
  const { layer, region, originX, originY, zoom, deviceScale } = request
  const { boundary, minifyX, minifyY, width, height } = flashGeometry(request)
  const pixels = new Uint8ClampedArray(width * height * 4)
  const localX = region.x - layer.offsetX, localY = region.y - layer.offsetY
  const columns = minifyX ? Array.from({ length: region.width }, (_, x) =>
    Math.min(width - 1, Math.max(0, Math.round((deviceAlignedCoordinate(originX + (region.x + x) * zoom, deviceScale.x) - boundary.left) * deviceScale.x)))) : null
  const palette = layer.format === 'indexed' ? new Map(request.palette.map(({ id, color }) => {
    const value = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 > 145 ? 0 : 255
    return [id, { value, alpha: color.a }]
  })) : null
  const opaqueColumns = minifyY ? new Uint32Array(height) : null
  let visitedPixels = 0
  visitSurfaceRasterRows(layer, localX, localY, region.width, region.height, (data, start, count, x, y, packedBytes) => {
    const row = minifyY
      ? Math.min(height - 1, Math.max(0, Math.round((deviceAlignedCoordinate(originY + (layer.offsetY + y) * zoom, deviceScale.y) - boundary.top) * deviceScale.y)))
      : y - localY
    // Once a complete destination row is opaque, later source rows mapped to
    // it cannot add silhouette coverage. Keep sparse/subpixel features by
    // inspecting every source pixel until its destination is fully covered.
    if (opaqueColumns?.[row] === width) return
    visitedPixels += count
    const rowOffset = row * width * 4
    const stride = packedBytes ? 4 : 1
    for (let index = 0, source = start; index < count; index += 1, source += stride) {
      const column = x - localX + index
      const offset = rowOffset + (columns ? columns[column] : column) * 4
      if (pixels[offset + 3] === 255) continue
      let alpha: number, value: number
      if (palette) {
        const id = packedBytes ? (data[source] | data[source + 1] << 8 | data[source + 2] << 16 | data[source + 3] << 24) >>> 0 : data[source]
        const color = palette.get(id)
        if (!color?.alpha || pixels[offset + 3] >= color.alpha) continue
        alpha = color.alpha
        value = color.value
      } else {
        alpha = data[source + 3]
        if (!alpha || pixels[offset + 3] >= alpha) continue
        value = data[source] * 0.2126 + data[source + 1] * 0.7152 + data[source + 2] * 0.0722 > 145 ? 0 : 255
      }
      if (alpha === 255 && opaqueColumns) opaqueColumns[row] += 1
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value
      pixels[offset + 3] = alpha
    }
  })
  return { pixels, width, height, boundary, visitedPixels }
}

interface FlashSurface {
  surface: OffscreenCanvas
  storage: object
  bytes: number
}

/** Render in the first paint, retaining a small LRU across clicks and flash expiry. */
export class CanvasClickFlashCache {
  private surfaces = new Map<string, FlashSurface>()
  private bytes = 0

  constructor(private readonly maxBytes = 16 * 1024 * 1024, private readonly maxEntries = 8) {}

  clear(): void { this.surfaces.clear(); this.bytes = 0 }

  draw(context: RasterContext2D, request: FlashRasterRequest): boolean {
    const { layer, region, originX, originY, zoom, deviceScale } = request
    const { boundary, minifyX, minifyY, width, height } = flashGeometry(request)
    const storage = rasterStorageIdentity(layer)
    const key = [request.contentKey, getLayerContentRevision(layer), layer.offsetX, layer.offsetY,
      region.x, region.y, region.width, region.height, width, height,
      minifyX ? zoom * deviceScale.x : 0, minifyY ? zoom * deviceScale.y : 0,
      minifyX ? (originX + region.x * zoom - boundary.left) * deviceScale.x : 0,
      minifyY ? (originY + region.y * zoom - boundary.top) * deviceScale.y : 0].join(':')
    let entry = this.surfaces.get(key)
    if (entry) {
      this.surfaces.delete(key)
      this.bytes -= entry.bytes
      if (entry.storage !== storage) entry = undefined
    }
    if (!entry) {
      const probe = window.__moonSpriteCanvasProbe
      const startedAt = probe?.recordOperationStage ? performance.now() : 0
      const raster = buildCanvasClickFlashRaster(request)
      const surface = new OffscreenCanvas(width, height)
      surface.getContext('2d')?.putImageData(new ImageData(raster.pixels, width, height), 0, 0)
      entry = { surface, storage, bytes: raster.pixels.byteLength }
      probe?.recordOperationStage?.('move-layer.flash-raster', performance.now() - startedAt, {
        sourcePixels: region.width * region.height, visitedPixels: raster.visitedPixels, outputPixels: width * height
      })
    }
    this.surfaces.set(key, entry)
    this.bytes += entry.bytes
    while (this.surfaces.size > 1 && (this.bytes > this.maxBytes || this.surfaces.size > this.maxEntries)) {
      const oldestKey = this.surfaces.keys().next().value!
      this.bytes -= this.surfaces.get(oldestKey)!.bytes
      this.surfaces.delete(oldestKey)
    }
    context.imageSmoothingEnabled = false
    context.drawImage(entry.surface, boundary.left, boundary.top, boundary.width, boundary.height)
    return true
  }
}
