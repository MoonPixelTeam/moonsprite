import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  type CompositeStackItem
} from '@/core/document-composite-plan'
import { readSurfacePackedRegion, readSurfaceRgbaRegion } from '@/core/runtime-raster'
import { type GpuMovePreviewSurface, imageData, gpuBlendModeFor } from './canvas-composite-cache-surfaces'

/** Browser-composited movement surfaces; failures leave the CPU fallback available. */
export class CanvasGpuMovePreview {
  /**
   * A browser-composited move preview for normal-blend opacity groups.  It is kept
   * separate from the pixel-accurate preview so a failed GPU operation can
   * never expose a partially rendered surface.
   */
  private gpuMovePreview: GpuMovePreviewSurface | null = null
  constructor(private readonly maxCacheBytes: number) {}
  clear(): void { this.gpuMovePreview = null }
/** Upload a layer once so subsequent move frames can use browser compositing. */
  private gpuLayerSourceFor(surface: GpuMovePreviewSurface, document: SpriteDocument, layer: RasterLayer): OffscreenCanvas | null {
    const cached = surface.sources.get(layer.id)
    if (cached) return cached
    if (layer.width <= 0 || layer.height <= 0 || layer.width * layer.height * 4 > this.maxCacheBytes) return null
    try {
      const canvas = new OffscreenCanvas(layer.width, layer.height)
      const sourceContext = canvas.getContext('2d')
      if (!sourceContext) return null
      sourceContext.imageSmoothingEnabled = false
      let pixels: Uint8ClampedArray
      if (layer.format === 'rgba') {
        pixels = readSurfaceRgbaRegion(layer, 0, 0, layer.width, layer.height)
      } else {
        const packed = readSurfacePackedRegion(layer, 0, 0, layer.width, layer.height)
        const palette = new Map(document.palette.map((entry) => [entry.id, entry.color]))
        pixels = new Uint8ClampedArray(layer.width * layer.height * 4)
        for (let index = 0; index < packed.length; index += 1) {
          const color = palette.get(packed[index])
          if (!color) continue
          const offset = index * 4
          pixels[offset] = color.r
          pixels[offset + 1] = color.g
          pixels[offset + 2] = color.b
          pixels[offset + 3] = color.a
        }
      }
      sourceContext.putImageData(imageData(pixels, layer.width, layer.height), 0, 0)
      surface.sources.set(layer.id, canvas)
      return canvas
    } catch {
      return null
    }
  }

/**
   * Draw a validated flat layer list into an offscreen target. Returning
   * false is deliberately strict: a browser that cannot honour one blend
   * operation must use the complete CPU preview, never a partial frame.
   */
  private drawGpuLayerList(target: OffscreenCanvasRenderingContext2D, surface: GpuMovePreviewSurface, document: SpriteDocument, layers: readonly RasterLayer[], originX: number, originY: number): boolean {
    try {
      for (const layer of layers) {
        const operation = gpuBlendModeFor(layer.blendMode)
        if (!operation || !layer.visible || layer.opacity <= 0) return false
        const source = this.gpuLayerSourceFor(surface, document, layer)
        if (!source) return false
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return false
        target.globalAlpha = layer.opacity
        target.drawImage(source, 0, 0, layer.width, layer.height, layer.offsetX - originX, layer.offsetY - originY, layer.width, layer.height)
      }
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over'
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return false
    }
  }

/**
   * Cache a contiguous source-over run for the duration of one move gesture.
   * A moved layer never enters this cache, so changing its offset cannot leave
   * stale pixels behind. The enclosing GPU surface key includes the document
   * revision and blend settings, which invalidates the run after a real edit.
   */
  private gpuStaticLayerRunCanvas(surface: GpuMovePreviewSurface, document: SpriteDocument, layers: readonly RasterLayer[], originX: number, originY: number): OffscreenCanvas | null {
    if (layers.length === 0) return null
    const key = `run:${originX}:${originY}:${layers.map((layer) => `${layer.id}:${layer.opacity}`).join(',')}`
    let canvas = surface.layerRunCanvases.get(key)
    if (canvas) return canvas
    try {
      canvas = new OffscreenCanvas(surface.width, surface.height)
      const context = canvas.getContext('2d')
      if (!context) return null
      context.imageSmoothingEnabled = false
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
      context.clearRect(0, 0, surface.width, surface.height)
      if (!this.drawGpuLayerList(context, surface, document, layers, originX, originY)) return null
      surface.layerRunCanvases.set(key, canvas)
      return canvas
    } catch {
      return null
    }
  }

  private gpuStackContainsLayers(items: readonly CompositeStackItem[], movingLayerIds: readonly string[]): boolean {
    const available = new Set<string>()
    const visit = (entries: readonly CompositeStackItem[]): void => {
      for (const item of entries) {
        if (item.kind === 'layer') available.add(item.layer.id)
        else visit(item.children)
      }
    }
    visit(items)
    return movingLayerIds.every((id) => available.has(id))
  }

  gpuStackSignature(items: readonly CompositeStackItem[]): string {
    return items
      .map((item) => (item.kind === 'layer' ? `l:${item.layer.id}:${item.layer.blendMode}:${item.layer.opacity}` : `g:${item.group.id}:${item.group.blendMode}:${item.group.opacity}[${this.gpuStackSignature(item.children)}]`))
      .join(';')
  }

/** Render groups into isolated textures so their blend mode remains local to the group. */
  private drawGpuStackItems(
    target: OffscreenCanvasRenderingContext2D,
    surface: GpuMovePreviewSurface,
    document: SpriteDocument,
    items: readonly CompositeStackItem[],
    originX: number,
    originY: number,
    movingLayerIds: ReadonlySet<string>
  ): boolean {
    try {
      const staticRun: RasterLayer[] = []
      const flushStaticRun = (): boolean => {
        if (staticRun.length === 0) return true
        const runCanvas = this.gpuStaticLayerRunCanvas(surface, document, staticRun, originX, originY)
        staticRun.length = 0
        if (!runCanvas) return false
        target.globalCompositeOperation = 'source-over'
        if (target.globalCompositeOperation !== 'source-over') return false
        target.globalAlpha = 1
        target.drawImage(runCanvas, 0, 0, surface.width, surface.height, 0, 0, surface.width, surface.height)
        return true
      }
      for (const item of items) {
        if (item.kind === 'layer') {
          if (item.layer.blendMode === 'normal' && !movingLayerIds.has(item.layer.id)) {
            if (!item.layer.visible || item.layer.opacity <= 0) continue
            staticRun.push(item.layer)
            continue
          }
          if (!flushStaticRun()) return false
          const operation = gpuBlendModeFor(item.layer.blendMode)
          if (!operation || !item.layer.visible || item.layer.opacity <= 0) return false
          const source = this.gpuLayerSourceFor(surface, document, item.layer)
          if (!source) return false
          target.globalCompositeOperation = operation
          if (target.globalCompositeOperation !== operation) return false
          target.globalAlpha = item.layer.opacity
          target.drawImage(source, 0, 0, item.layer.width, item.layer.height, item.layer.offsetX - originX, item.layer.offsetY - originY, item.layer.width, item.layer.height)
          continue
        }
        if (!flushStaticRun()) return false
        if (item.group.opacity <= 0 || !item.group.visible) continue
        if (item.group.blendMode === 'normal' && item.group.opacity === 1) {
          if (!this.drawGpuStackItems(target, surface, document, item.children, originX, originY, movingLayerIds)) return false
          continue
        }
        let groupCanvas = surface.groupCanvases.get(item.group.id)
        if (!groupCanvas || groupCanvas.width !== surface.width || groupCanvas.height !== surface.height) {
          groupCanvas = new OffscreenCanvas(surface.width, surface.height)
          surface.groupCanvases.set(item.group.id, groupCanvas)
        }
        const groupContext = groupCanvas.getContext('2d')
        if (!groupContext) return false
        groupContext.imageSmoothingEnabled = false
        groupContext.globalCompositeOperation = 'source-over'
        if (groupContext.globalCompositeOperation !== 'source-over') return false
        groupContext.globalAlpha = 1
        groupContext.clearRect(0, 0, surface.width, surface.height)
        if (!this.drawGpuStackItems(groupContext, surface, document, item.children, originX, originY, movingLayerIds)) return false
        const operation = gpuBlendModeFor(item.group.blendMode)
        if (!operation) return false
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return false
        target.globalAlpha = item.group.opacity
        target.drawImage(groupCanvas, 0, 0, surface.width, surface.height, 0, 0, surface.width, surface.height)
      }
      if (!flushStaticRun()) return false
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over'
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return false
    }
  }

  drawGpuStackMovePreview(
    document: SpriteDocument,
    view: ViewState,
    x: number,
    y: number,
    width: number,
    height: number,
    key: string,
    stack: readonly CompositeStackItem[],
    movingLayerIds: readonly string[]
  ): OffscreenCanvas | null {
    if (view.relativeLuminance || !this.gpuStackContainsLayers(stack, movingLayerIds)) return null
    let surface = this.gpuMovePreview
    if (!surface || surface.key !== key) {
      try {
        const canvas = new OffscreenCanvas(width, height)
        if (!canvas.getContext('2d')) return null
        surface = {
          key,
          x,
          y,
          width,
          height,
          canvas,
          baseCanvas: new OffscreenCanvas(width, height),
          movingLayers: [],
          upperLayers: [],
          groupCanvases: new Map(),
          layerRunCanvases: new Map(),
          sources: new Map()
        }
        this.gpuMovePreview = surface
      } catch {
        return null
      }
    }
    const target = surface.canvas.getContext('2d')
    if (!target) return null
    try {
      target.imageSmoothingEnabled = false
      target.globalCompositeOperation = 'source-over'
      if (target.globalCompositeOperation !== 'source-over') return null
      target.globalAlpha = 1
      target.clearRect(0, 0, width, height)
      if (!this.drawGpuStackItems(target, surface, document, stack, x, y, new Set(movingLayerIds))) return null
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over' ? surface.canvas : null
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return null
    }
  }
}
