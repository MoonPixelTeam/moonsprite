import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { ViewState } from '@shared/types-view'
import {
  type CompositeStackItem
} from '@/core/document-composite-plan'
import { readSurfacePackedRegion, readSurfaceRgbaRegion } from '@/core/runtime-raster'
import type { RasterContext2D } from './canvas-selection-renderer'
import { type GpuMovePreviewSurface, imageData, gpuBlendModeFor, repeatedLayers } from './canvas-composite-cache-surfaces'
import { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'

/** Browser-composited movement surfaces; failures leave the CPU fallback available. */
export class CanvasGpuMovePreview {
  /**
   * A browser-composited move preview for the flat stack path.  It is kept
   * separate from the pixel-accurate preview so a failed GPU operation can
   * never expose a partially rendered surface.
   */
  private gpuMovePreview: GpuMovePreviewSurface | null = null
  constructor(private readonly maxCacheBytes: number, private readonly blitter: CanvasCompositeBlitter) {}
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

  drawGpuMovePreview(
    document: SpriteDocument,
    view: ViewState,
    x: number,
    y: number,
    width: number,
    height: number,
    key: string,
    basePixels: Uint8ClampedArray,
    movingLayers: readonly RasterLayer[],
    upperLayers: readonly RasterLayer[]
  ): OffscreenCanvas | null {
    if (view.relativeLuminance) return null
    let surface = this.gpuMovePreview
    if (!surface || surface.key !== key) {
      try {
        const baseCanvas = new OffscreenCanvas(width, height)
        const baseContext = baseCanvas.getContext('2d')
        const canvas = new OffscreenCanvas(width, height)
        if (!baseContext || !canvas.getContext('2d')) return null
        baseContext.putImageData(imageData(basePixels, width, height), 0, 0)
        surface = {
          key,
          x,
          y,
          width,
          height,
          canvas,
          baseCanvas,
          movingLayers: [...movingLayers],
          upperLayers: [...upperLayers],
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
      target.globalCompositeOperation = 'source-over'
      if (target.globalCompositeOperation !== 'source-over') return null
      target.globalAlpha = 1
      target.imageSmoothingEnabled = false
      target.clearRect(0, 0, width, height)
      target.drawImage(surface.baseCanvas, 0, 0, width, height, 0, 0, width, height)
      if (!this.drawGpuLayerList(target, surface, document, repeatedLayers(movingLayers, document, view), x, y)) return null
      if (upperLayers.length > 0) {
        if (upperLayers.every((layer) => layer.blendMode === 'normal')) {
          const upperCanvas = this.gpuStaticLayerRunCanvas(surface, document, upperLayers, x, y)
          if (!upperCanvas) return null
          target.globalCompositeOperation = 'source-over'
          target.globalAlpha = 1
          target.drawImage(upperCanvas, 0, 0, width, height, 0, 0, width, height)
        } else if (!this.drawGpuLayerList(target, surface, document, upperLayers, x, y)) return null
      }
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return target.globalCompositeOperation === 'source-over' ? surface.canvas : null
    } catch {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      return null
    }
  }

/**
   * A flat move preview does not need an intermediate output canvas. Draw the
   * cached backdrop and the moved layers directly into the already clipped
   * editor target, matching Aseprite's extra-cel render flow.
   */
  drawGpuMovePreviewDirect(
    context: RasterContext2D,
    document: SpriteDocument,
    view: ViewState,
    originX: number,
    originY: number,
    x: number,
    y: number,
    width: number,
    height: number,
    key: string,
    basePixels: Uint8ClampedArray,
    movingLayers: readonly RasterLayer[],
    upperLayers: readonly RasterLayer[]
  ): boolean {
    if (view.relativeLuminance) return false
    let surface = this.gpuMovePreview
    if (!surface || surface.key !== key) {
      try {
        const baseCanvas = new OffscreenCanvas(width, height)
        const baseContext = baseCanvas.getContext('2d')
        const canvas = new OffscreenCanvas(width, height)
        if (!baseContext || !canvas.getContext('2d')) return false
        baseContext.imageSmoothingEnabled = false
        baseContext.putImageData(imageData(basePixels, width, height), 0, 0)
        surface = {
          key,
          x,
          y,
          width,
          height,
          canvas,
          baseCanvas,
          movingLayers: [...movingLayers],
          upperLayers: [...upperLayers],
          groupCanvases: new Map(),
          layerRunCanvases: new Map(),
          sources: new Map()
        }
        this.gpuMovePreview = surface
      } catch {
        return false
      }
    }
    try {
      context.save()
      context.imageSmoothingEnabled = false
      context.globalCompositeOperation = 'source-over'
      if (context.globalCompositeOperation !== 'source-over') {
        context.restore()
        return false
      }
      context.globalAlpha = 1
      const destination = this.blitter.alignedDestination(originX, originY, width * view.zoom, height * view.zoom)
      context.drawImage(surface.baseCanvas, 0, 0, width, height, destination.left, destination.top, destination.width, destination.height)
      if (!this.drawGpuLayerListOnScreen(context, surface, document, repeatedLayers(movingLayers, document, view), originX, originY, view.zoom)) {
        context.restore()
        return false
      }
      if (upperLayers.length > 0) {
        const upperIsSourceOver = upperLayers.every((layer) => layer.blendMode === 'normal')
        const upperDrawn = upperIsSourceOver
          ? this.drawGpuStaticLayerRunOnScreen(context, surface, document, upperLayers, originX, originY, view.zoom)
          : this.drawGpuLayerListOnScreen(context, surface, document, upperLayers, originX, originY, view.zoom)
        if (!upperDrawn) {
          context.restore()
          return false
        }
      }
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      const valid = context.globalCompositeOperation === 'source-over'
      context.restore()
      return valid
    } catch {
      context.restore()
      return false
    }
  }

  private drawGpuLayerListOnScreen(target: RasterContext2D, surface: GpuMovePreviewSurface, document: SpriteDocument, layers: readonly RasterLayer[], originX: number, originY: number, zoom: number): boolean {
    try {
      for (const layer of layers) {
        const operation = gpuBlendModeFor(layer.blendMode)
        if (!operation || !layer.visible || layer.opacity <= 0) return false
        const source = this.gpuLayerSourceFor(surface, document, layer)
        if (!source) return false
        target.globalCompositeOperation = operation
        if (target.globalCompositeOperation !== operation) return false
        target.globalAlpha = layer.opacity
        const destination = this.blitter.alignedDestination(originX + layer.offsetX * zoom, originY + layer.offsetY * zoom, layer.width * zoom, layer.height * zoom)
        target.drawImage(source, 0, 0, layer.width, layer.height, destination.left, destination.top, destination.width, destination.height)
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

  private drawGpuStaticLayerRunOnScreen(target: RasterContext2D, surface: GpuMovePreviewSurface, document: SpriteDocument, layers: readonly RasterLayer[], originX: number, originY: number, zoom: number): boolean {
    const canvas = this.gpuStaticLayerRunCanvas(surface, document, layers, originX, originY)
    if (!canvas) return false
    const destination = this.blitter.alignedDestination(originX, originY, surface.width * zoom, surface.height * zoom)
    target.globalCompositeOperation = 'source-over'
    target.globalAlpha = 1
    target.drawImage(canvas, 0, 0, surface.width, surface.height, destination.left, destination.top, destination.width, destination.height)
    return true
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
