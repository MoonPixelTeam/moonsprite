import type { RgbaColor, SelectionRect, SpriteDocument } from '@shared/types'
import { compositeAnimationFrameRegion, tintOnionSkinPixels, type OnionSkinFrameRef } from '@/core/onion-skin'
import { deviceAlignedCanvasRect, type CanvasDeviceScaleInput } from '@/core/canvas-render-plan'
import type { RasterContext2D } from './canvas-selection-renderer'

interface OnionSkinTile {
  canvas: OffscreenCanvas
  frameId: string
  revision: number
  x: number
  y: number
  width: number
  height: number
}

interface OnionSkinRegion {
  canvas: OffscreenCanvas
  revision: number
  x: number
  y: number
  width: number
  height: number
  scale: number
}

interface OnionSkinFrameCache {
  ref: OnionSkinFrameRef
  tiles: Map<string, OnionSkinTile>
  region?: OnionSkinRegion
}

export interface OnionSkinCompositeStyle {
  previousColor: RgbaColor
  nextColor: RgbaColor
  previousOpacity: number
  nextOpacity: number
}

interface OnionSkinInvalidation {
  kind: 'full' | 'region'
  fromRevision: number
  revision: number
  frameId?: string
  rect?: SelectionRect
}

interface DrawOnionSkinOptions {
  context: RasterContext2D
  document: SpriteDocument
  refs: OnionSkinFrameRef[]
  style: OnionSkinCompositeStyle
  originX: number
  originY: number
  canvasWidth: number
  canvasHeight: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  zoom: number
  revision: number
  invalidation?: OnionSkinInvalidation | null
  imageSmoothingEnabled?: boolean
  devicePixelRatio?: CanvasDeviceScaleInput
}

const TILE_SIZE = 512
const MAX_TILE_COUNT = 64
const rectsIntersect = (left: Pick<SelectionRect, 'x' | 'y' | 'width' | 'height'>, right: Pick<SelectionRect, 'x' | 'y' | 'width' | 'height'>): boolean =>
  left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y

const styleKey = (style: OnionSkinCompositeStyle): string => [
  style.previousOpacity,
  style.nextOpacity,
  style.previousColor.r,
  style.previousColor.g,
  style.previousColor.b,
  style.previousColor.a,
  style.nextColor.r,
  style.nextColor.g,
  style.nextColor.b,
  style.nextColor.a
].join(':')

export class OnionSkinCompositeCache {
  private namespace = ''
  private revision = Number.NaN
  private frames = new Map<string, OnionSkinFrameCache>()

  invalidateAll(): void {
    this.namespace = ''
    this.revision = Number.NaN
    this.frames.clear()
  }

  invalidateFrames(frameIds: readonly string[]): void {
    for (const frameId of new Set(frameIds)) this.frames.delete(frameId)
  }

  draw({ context, document, refs, style, originX, originY, canvasWidth, canvasHeight, fromX, fromY, toX, toY, zoom, revision, invalidation = null, imageSmoothingEnabled = false, devicePixelRatio = 1 }: DrawOnionSkinOptions): void {
    const namespace = `${document.id}:${document.animation?.activeFrameId ?? 'static'}:${refs.map((ref) => `${ref.frameId}:${ref.side}:${ref.distance}`).join(',')}:${styleKey(style)}`
    if (this.namespace !== namespace) {
      this.namespace = namespace
      this.revision = revision
      this.frames.clear()
    } else if (this.revision !== revision) {
      const canPatch = invalidation?.revision === revision && invalidation.fromRevision === this.revision && invalidation.kind === 'region'
      if (!canPatch) this.frames.clear()
      else if (invalidation.rect) {
        for (const frame of this.frames.values()) {
          const affected = !invalidation.frameId || frame.ref.frameId === invalidation.frameId
          for (const tile of frame.tiles.values()) {
            if (affected && rectsIntersect(tile, invalidation.rect)) tile.revision = -1
            else tile.revision = revision
          }
          if (affected && frame.region && rectsIntersect(frame.region, invalidation.rect)) frame.region = undefined
          else if (frame.region) frame.region.revision = revision
        }
      }
      this.revision = revision
    }

    context.save()
    context.beginPath()
    const boundary = deviceAlignedCanvasRect(originX, originY, canvasWidth, canvasHeight, devicePixelRatio)
    context.rect(boundary.left, boundary.top, boundary.width, boundary.height)
    context.clip()
    context.imageSmoothingEnabled = imageSmoothingEnabled
    if (imageSmoothingEnabled) context.imageSmoothingQuality = 'high'
    for (const ref of refs) {
      const frame = this.frameCache(ref)
      const region = this.regionFor(document, frame, style, fromX, fromY, toX, toY, zoom, revision, imageSmoothingEnabled)
      const destination = deviceAlignedCanvasRect(
        originX + region.x * zoom,
        originY + region.y * zoom,
        region.width * zoom,
        region.height * zoom,
        devicePixelRatio
      )
      context.drawImage(region.canvas, destination.left, destination.top, destination.width, destination.height)
    }
    context.restore()
  }

  private frameCache(ref: OnionSkinFrameRef): OnionSkinFrameCache {
    const cached = this.frames.get(ref.frameId)
    if (cached) return cached
    const created = { ref, tiles: new Map<string, OnionSkinTile>() }
    this.frames.set(ref.frameId, created)
    return created
  }

  private regionFor(document: SpriteDocument, frame: OnionSkinFrameCache, style: OnionSkinCompositeStyle, fromX: number, fromY: number, toX: number, toY: number, zoom: number, revision: number, imageSmoothingEnabled: boolean): OnionSkinRegion {
    const x = Math.max(0, Math.floor(fromX))
    const y = Math.max(0, Math.floor(fromY))
    const right = Math.min(document.width, Math.ceil(toX))
    const bottom = Math.min(document.height, Math.ceil(toY))
    const width = Math.max(0, right - x)
    const height = Math.max(0, bottom - y)
    const scale = zoom < 1 ? zoom : 1
    const cached = frame.region
    if (cached && cached.revision === revision && cached.x === x && cached.y === y && cached.width === width && cached.height === height && cached.scale === scale) return cached

    const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)))
    const regionContext = canvas.getContext('2d')
    if (regionContext) {
      regionContext.imageSmoothingEnabled = imageSmoothingEnabled
      if (imageSmoothingEnabled) regionContext.imageSmoothingQuality = 'high'
      const firstColumn = Math.floor(x / TILE_SIZE)
      const lastColumn = Math.floor((right - 1) / TILE_SIZE)
      const firstRow = Math.floor(y / TILE_SIZE)
      const lastRow = Math.floor((bottom - 1) / TILE_SIZE)
      for (let row = firstRow; row <= lastRow; row += 1) for (let column = firstColumn; column <= lastColumn; column += 1) {
        const tile = this.tileFor(document, frame, style, column, row, revision)
        if (scale < 1) regionContext.drawImage(tile.canvas, 0, 0, tile.width, tile.height, (tile.x - x) * scale, (tile.y - y) * scale, tile.width * scale, tile.height * scale)
        else regionContext.drawImage(tile.canvas, tile.x - x, tile.y - y)
      }
    }
    frame.region = { canvas, revision, x, y, width, height, scale }
    return frame.region
  }

  private tileFor(document: SpriteDocument, frame: OnionSkinFrameCache, style: OnionSkinCompositeStyle, column: number, row: number, revision: number): OnionSkinTile {
    const key = `${column}:${row}`
    let tile = frame.tiles.get(key)
    if (tile?.revision === revision) {
      frame.tiles.delete(key)
      frame.tiles.set(key, tile)
      return tile
    }
    const x = column * TILE_SIZE
    const y = row * TILE_SIZE
    const width = Math.min(TILE_SIZE, document.width - x)
    const height = Math.min(TILE_SIZE, document.height - y)
    const tint = frame.ref.side === 'previous' ? style.previousColor : style.nextColor
    const opacity = frame.ref.side === 'previous' ? style.previousOpacity : style.nextOpacity
    const pixels = tintOnionSkinPixels(compositeAnimationFrameRegion(document, frame.ref.frameId, x, y, width, height), tint, opacity, frame.ref.distance)
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d')?.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)
    tile = { canvas, frameId: frame.ref.frameId, revision, x, y, width, height }
    frame.tiles.delete(key)
    frame.tiles.set(key, tile)
    this.pruneTiles()
    return tile
  }

  private pruneTiles(): void {
    const tileCount = (): number => [...this.frames.values()].reduce((total, frame) => total + frame.tiles.size, 0)
    while (tileCount() > MAX_TILE_COUNT) {
      const largest = [...this.frames.values()].sort((left, right) => right.tiles.size - left.tiles.size)[0]
      const key = largest?.tiles.keys().next().value
      if (!largest || key === undefined) return
      largest.tiles.delete(key)
      largest.region = undefined
    }
  }
}
