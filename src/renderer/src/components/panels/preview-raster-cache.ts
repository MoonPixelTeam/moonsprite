import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import { createPreviewProjectedRenderer } from '@/core/preview-projected-renderer'
import { applyRelativeLuminance } from '@/core/raster'
import { documentPointFromViewportPointContinuous } from '@/core/view-geometry'
import { PreviewDirtyRows } from './preview-dirty-rows'

export interface PreviewRasterView {
  width: number
  height: number
  originX: number
  originY: number
  scale: number
  luminance: boolean
}

const TILE = 1

/** Output-sized backing: one shared-source bootstrap, then dirty pixel sampling.
 * Pending tiles coalesce independently, so distant strokes cannot create a
 * document-sized dirty bounding box. A draw presents all pending changes together. */
export class PreviewRasterCache {
  private document: SpriteDocument | null = null
  private key = ''
  private view: PreviewRasterView | null = null
  private sampler: ReturnType<typeof createPreviewProjectedRenderer> | null = null
  private dirty = new PreviewDirtyRows()
  private fullDirty = false
  private fullLiveDirty = false
  private exposed: SelectionRect[] = []
  private liveDirty = new PreviewDirtyRows()
  private revision = -1
  private columns = 0
  private canvas: HTMLCanvasElement | null = null
  private context: CanvasRenderingContext2D | null = null

  private needsSeed = true
  private preferSharedSeed = false

  configure(document: SpriteDocument, frameId: string, revision: number, view: PreviewRasterView,
    invalidation?: { kind: 'full' | 'region'; rect?: SelectionRect; frameId?: string; fromRevision: number; revision: number } | null): void {
    const key = [document.id, frameId, revision, document.width, document.height,
      view.width, view.height, view.originX, view.originY, view.scale, view.luminance].join(':')
    if (this.key === key && this.document === document) return
    const previous = this.view
    const rawDx = previous ? view.originX - previous.originX : 0
    const rawDy = previous ? view.originY - previous.originY : 0
    const dx = Math.round(rawDx), dy = Math.round(rawDy)
    const canTranslate = previous && this.canvas && this.context && this.document === document
      && revision === this.revision && this.key.startsWith(`${document.id}:${frameId}:`)
      && previous.width === view.width && previous.height === view.height
      && previous.scale === view.scale && previous.luminance === view.luminance
      && !this.fullDirty && !this.fullLiveDirty && !this.dirty.size && !this.liveDirty.size && !this.exposed.length
      && Math.abs(rawDx - dx) < 1e-6 && Math.abs(rawDy - dy) < 1e-6 && Math.abs(dx) < view.width && Math.abs(dy) < view.height
    if (canTranslate) {
      this.key = key
      this.view = view
      if (dx || dy) {
        const left = Math.max(0, dx), top = Math.max(0, dy)
        const width = view.width - Math.abs(dx), height = view.height - Math.abs(dy)
        const context = this.context!
        const composite = context.globalCompositeOperation
        // Copy, rather than blend, so translucent pixels retain their alpha.
        context.globalCompositeOperation = 'copy'
        context.drawImage(this.canvas!, Math.max(0, -dx), Math.max(0, -dy), width, height, left, top, width, height)
        context.globalCompositeOperation = composite
        if (dy) this.exposed.push({ x: 0, y: dy > 0 ? 0 : view.height + dy, width: view.width, height: Math.abs(dy) })
        if (dx) this.exposed.push({ x: dx > 0 ? 0 : view.width + dx, y: top, width: Math.abs(dx), height })
      }
      return
    }
    const geometryChanged = !this.view || this.view.width !== view.width || this.view.height !== view.height
      || this.view.originX !== view.originX || this.view.originY !== view.originY || this.view.scale !== view.scale
      || this.document?.id !== document.id || !this.key.startsWith(`${document.id}:${frameId}:`)
    const regionalCommit = !geometryChanged && this.view?.luminance === view.luminance
      && invalidation?.kind === 'region' && invalidation.fromRevision <= this.revision && this.revision < revision && invalidation.revision === revision
      && (!invalidation.frameId || invalidation.frameId === frameId)
    this.document = document
    this.revision = revision
    this.key = key
    this.view = view
    this.columns = Math.ceil(view.width / TILE)
    if (!this.canvas) {
      this.canvas = window.document.createElement('canvas')
      this.context = this.canvas.getContext('2d')

    }
    if (geometryChanged) {
      this.dirty.clear()
      this.liveDirty.clear()
      this.fullLiveDirty = false
      this.exposed = []
      if (this.canvas.width !== view.width) this.canvas.width = view.width
      if (this.canvas.height !== view.height) this.canvas.height = view.height
    }
    this.needsSeed = !regionalCommit
    this.preferSharedSeed = Boolean(regionalCommit && invalidation?.rect
      && invalidation.rect.width * view.scale * invalidation.rect.height * view.scale >= view.width * view.height / 4)
    this.invalidate(regionalCommit ? invalidation?.rect : undefined)
  }

  seedFromShared(source: CanvasImageSource, dirtyRects: readonly SelectionRect[]): void {
    const { view, document, context } = this
    if ((!this.needsSeed && !this.preferSharedSeed) || !view || !document || !context) return
    context.clearRect(0, 0, view.width, view.height)
    context.imageSmoothingEnabled = false
    context.drawImage(source, view.originX, view.originY, document.width * view.scale, document.height * view.scale)
    this.dirty.clear()
    this.liveDirty.clear()
    this.fullDirty = false
    this.fullLiveDirty = false
    this.exposed = []
    for (const rect of dirtyRects) this.invalidate(rect)
    this.needsSeed = false
    this.preferSharedSeed = false
  }

  get requiresSeed(): boolean { return this.needsSeed }
  get prefersSharedSeed(): boolean { return this.preferSharedSeed }

  invalidate(rect?: SelectionRect, live = false): void {
    this.sampler = null // offsets, masks and live layer objects can change in place
    if (!rect) this.needsSeed = true
    const view = this.view
    if (!view) return
    if (!rect) {
      // A full redraw is one rectangle, not one Set entry per output pixel.
      // Shared seeding can satisfy it without ever allocating those entries.
      this.fullDirty = true
      if (live) this.fullLiveDirty = true
      this.dirty.clear()
      if (live) this.liveDirty.clear()
      return
    }
    const left = rect ? Math.max(0, Math.floor((rect.x * view.scale + view.originX) / TILE)) : 0
    const top = rect ? Math.max(0, Math.floor((rect.y * view.scale + view.originY) / TILE)) : 0
    const right = rect ? Math.min(this.columns, Math.ceil(((rect.x + rect.width) * view.scale + view.originX) / TILE)) : this.columns
    const bottom = rect ? Math.min(Math.ceil(view.height / TILE), Math.ceil(((rect.y + rect.height) * view.scale + view.originY) / TILE)) : Math.ceil(view.height / TILE)
    if (right <= left || bottom <= top) return
    const next = { x: left, y: top, width: right - left, height: bottom - top }
    if (!this.fullDirty) this.dirty.add(next)
    if (live && !this.fullLiveDirty) this.liveDirty.add(next)
  }

  finishLive(): void {
    this.sampler = null
    if (this.fullLiveDirty) this.invalidate()
    this.fullLiveDirty = false
    if (!this.fullDirty) for (const rect of this.liveDirty.rectangles()) this.dirty.add(rect)
    this.liveDirty.clear()
  }

  render(): { pixels: number; pending: boolean } {
    const { document, view, context } = this
    let pixels = 0
    if (!document || !view || !context || (!this.fullDirty && !this.dirty.size && !this.exposed.length)) return { pixels, pending: false }
    this.sampler ??= createPreviewProjectedRenderer(document)
    const sample = this.sampler
    if (!sample) return { pixels, pending: false }
    // Use the shared viewport geometry once, then step through axis-aligned pixels.
    const first = documentPointFromViewportPointContinuous({ x: 0.5, y: 0.5 }, view.width, view.height,
      document.width, document.height, { zoom: view.scale, rotation: 0,
        panX: view.originX - (view.width - document.width * view.scale) / 2,
        panY: view.originY - (view.height - document.height * view.scale) / 2 }, 'canvas')
    // Keep exact coverage, including distant strokes and overlapping stamps.
    const rects: SelectionRect[] = this.fullDirty
      ? [{ x: 0, y: 0, width: view.width, height: view.height }]
      : [...this.exposed, ...this.dirty.rectangles()]
    for (const rect of rects) {
      const xs = Int32Array.from({ length: rect.width }, (_, x) => Math.floor(first.x + (rect.x + x) / view.scale))
      const ys = Int32Array.from({ length: rect.height }, (_, y) => Math.floor(first.y + (rect.y + y) / view.scale))
      const patch = context.createImageData(rect.width, rect.height)
      sample(xs, ys, patch.data)
      if (view.luminance) applyRelativeLuminance(patch.data)
      context.putImageData(patch, rect.x, rect.y)
      pixels += rect.width * rect.height
    }
    this.dirty.clear()
    this.fullDirty = false
    this.exposed = []
    this.needsSeed = false
    return { pixels, pending: false }
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.canvas) {
      const smoothing = context.imageSmoothingEnabled
      context.imageSmoothingEnabled = false
      context.drawImage(this.canvas, 0, 0, width, height)
      context.imageSmoothingEnabled = smoothing
    }
  }

  dispose(): void {
    if (this.canvas) this.canvas.width = this.canvas.height = 1
    this.canvas = this.context = this.document = this.sampler = this.view = null
    this.key = ''
    this.needsSeed = true
    this.preferSharedSeed = false
    this.dirty.clear()
    this.fullDirty = false
    this.liveDirty.clear()
    this.fullLiveDirty = false
    this.exposed = []
  }
}
