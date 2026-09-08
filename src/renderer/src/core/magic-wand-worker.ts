import type { RasterLayer, SelectionMask, RgbaColor, PaletteEntry } from '@shared/types'
import { runtimeRasterForSurface } from './runtime-raster'

interface Pending { id: number; resolve: (value: SelectionMask | null) => void }

export class MagicWandWorkerClient {
  private worker: Worker | null = null
  private sequence = 0
  private pending: Pending | null = null
  private baselineKey = ''

  initialize(layer: RasterLayer, revision = 0, palette?: readonly PaletteEntry[], sourceKey = ''): void {
    if (typeof Worker === 'undefined') return
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/magic-wand.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-magic-wand' })
      this.worker.onmessage = (event: MessageEvent<{ id: number; selection: SelectionMask | null }>) => {
        if (this.pending && this.pending.id === event.data.id) { const pending = this.pending; this.pending = null; pending.resolve(event.data.selection) }
      }
    }
    // Animation frame switches intentionally do not increment contentRevision.
    // Include the caller's frame/source key so the worker cannot keep using the
    // previous frame's raster when the same layer object is reused.
    const key = `${sourceKey}:${layer.id}:${revision}:${layer.width}:${layer.height}:${layer.pixels.byteLength}`
    if (key === this.baselineKey) return
    const initializeStartedAt = performance.now()
    this.baselineKey = key
    const runtime = runtimeRasterForSurface(layer)
    const pixels = layer.pixels.slice()
    const runtimeData = runtime?.data.slice()
    const runtimeTileOffsets = runtime?.tileOffsets.slice()
    const transfer: Transferable[] = [pixels.buffer]
    if (runtimeData) transfer.push(runtimeData.buffer)
    if (runtimeTileOffsets) transfer.push(runtimeTileOffsets.buffer)
    this.worker.postMessage({
      type: 'initialize',
      width: layer.width,
      height: layer.height,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      format: layer.format,
      pixels,
      palette,
      runtime: runtime
        ? { width: runtime.width, height: runtime.height, tileSize: runtime.tileSize, data: runtimeData, tileOffsets: runtimeTileOffsets }
        : undefined
    }, transfer)
    if (typeof window !== 'undefined') window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.worker-initialize', performance.now() - initializeStartedAt, {
        pixelBytes: layer.pixels.byteLength,
        runtimeBytes: runtime?.data.byteLength ?? 0
      })
  }

  request(layer: RasterLayer, width: number, height: number, x: number, y: number, tolerance: number, revision = 0, palette?: readonly PaletteEntry[], sourceKey = ''): Promise<SelectionMask | null> {
    if (typeof Worker === 'undefined') return Promise.resolve(null)
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/magic-wand.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-magic-wand' })
      this.worker.onmessage = (event: MessageEvent<{ id: number; selection: SelectionMask | null }>) => {
        if (this.pending && this.pending.id === event.data.id) { const pending = this.pending; this.pending = null; pending.resolve(event.data.selection) }
      }
    }
    this.initialize(layer, revision, palette, sourceKey)
    this.pending?.resolve(null)
    const id = ++this.sequence
    return new Promise((resolve) => {
      this.pending = { id, resolve }
      this.worker!.postMessage({ id, width, height, x, y, tolerance, type: 'request' })
    })
  }

  dispose(): void { this.pending?.resolve(null); this.pending = null; this.worker?.terminate(); this.worker = null }
}
