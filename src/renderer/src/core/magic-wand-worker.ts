import type { PaletteEntry, RasterLayer, SelectionMask } from '@shared/types'
import { cachedRasterContentBounds } from './document'
import { lazyRuntimeRasterForSurface, rasterStorageIdentity } from './runtime-raster'
import { cooperativeCopy } from './cooperative-copy'
import type { MagicWandOperation } from './magic-wand-operation'

export interface MagicWandWorkerResult {
  selection: SelectionMask | null
  boundarySegments: Int32Array | null
  previewRectangles: Int32Array | null
  previewBitmap?: ImageBitmap | null
  computeMs: number
  boundaryMs: number
}

interface WorkerRequestMessage {
  id: number
  type: 'request'
  width: number
  height: number
  x: number
  y: number
  tolerance: number
  contiguous: boolean
  gapClosingThreshold: number
}

interface Pending {
  id: number
  message: WorkerRequestMessage
  resolve: (value: MagicWandWorkerResult | null) => void
  reject: (reason: unknown) => void
  prepare: () => Promise<void>
}

const indexedPaletteKey = (layer: RasterLayer, palette?: readonly PaletteEntry[]): string => {
  if (layer.format !== 'indexed') return ''
  return (palette ?? []).map((entry) => [
    entry.id,
    entry.color.r,
    entry.color.g,
    entry.color.b,
    entry.color.a
  ].join(',')).join(';')
}

export class MagicWandWorkerClient {
  private worker: Worker | null = null
  private sequence = 0
  private pending: Pending | null = null
  private queued: Pending | null = null
  private baselineKey = ''
  private baselineStorage: object | null = null
  private operation: MagicWandOperation | null = null
  private epoch = 0

  start(): void { this.ensureWorker() }

  private ensureWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('../workers/magic-wand.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-magic-wand' })
    this.worker.onerror = (event) => this.fail(new Error(event.message || 'Magic wand worker failed'))
    this.worker.onmessageerror = () => this.fail(new Error('Magic wand worker message could not be decoded'))
    this.worker.onmessage = (event: MessageEvent<{ id: number; result: MagicWandWorkerResult; error?: string }>) => {
      if (event.data.error && event.data.id === undefined) { this.fail(new Error(event.data.error)); return }
      if (!this.pending || this.pending.id !== event.data.id) { event.data.result?.previewBitmap?.close(); return }
      const completed = this.pending
      this.pending = null
      if (event.data.error) completed.reject(new Error(event.data.error))
      else completed.resolve(event.data.result)
      if (!this.queued || !this.worker) return
      this.pending = this.queued
      this.queued = null
      void this.dispatch(this.pending)
    }
    return this.worker
  }

  async initialize(layer: RasterLayer, revision = 0, palette?: readonly PaletteEntry[], sourceKey = ''): Promise<void> {
    const worker = this.ensureWorker()
    if (!worker) return
    const epoch = this.epoch
    const valid = () => epoch === this.epoch
    const runtime = lazyRuntimeRasterForSurface(layer)
    const contentBounds = cachedRasterContentBounds(layer, palette)
    const crop = !runtime && contentBounds !== undefined ? contentBounds : undefined
    // Animation frame switches intentionally do not increment contentRevision.
    // Indexed palette edits can also leave contentRevision unchanged.
    const storageBytes = runtime ? runtime.data.byteLength + runtime.tileOffsets.byteLength : layer.pixels.byteLength
    const storage = rasterStorageIdentity(layer)
    const key = `${layer.offsetX}:${layer.offsetY}:${sourceKey}:${layer.id}:${revision}:${layer.width}:${layer.height}:${storageBytes}:${indexedPaletteKey(layer, palette)}`
    if (key === this.baselineKey && storage === this.baselineStorage) return
    const initializeStartedAt = performance.now()

    // A lazy sparse raster already owns the authoritative bytes. Avoid touching
    // layer.pixels here because its getter materializes the complete canvas.
    const pixels = await (async () => {
      if (runtime || crop === null) return layer.format === 'rgba' ? new Uint8ClampedArray(0) : new Uint32Array(0)
      if (!crop) return cooperativeCopy(layer.pixels, valid)
      let deadline = performance.now() + 3
      const yieldIfNeeded = async () => {
        if (!valid()) throw new Error('Magic wand source snapshot cancelled')
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        deadline = performance.now() + 3
      }
      if (layer.format === 'indexed') {
        const result = new Uint32Array(crop.width * crop.height)
        for (let row = 0; row < crop.height; row += 1) {
          const start = (crop.y + row) * layer.width + crop.x
          result.set(layer.pixels.subarray(start, start + crop.width), row * crop.width)
          if (performance.now() >= deadline) await yieldIfNeeded()
        }
        return result
      }
      const result = new Uint8ClampedArray(crop.width * crop.height * 4)
      for (let row = 0; row < crop.height; row += 1) {
        const start = ((crop.y + row) * layer.width + crop.x) * 4
        result.set(layer.pixels.subarray(start, start + crop.width * 4), row * crop.width * 4)
        if (performance.now() >= deadline) await yieldIfNeeded()
      }
      return result
    })()
    const runtimeData = runtime ? await cooperativeCopy(runtime.data, valid) : undefined
    const runtimeTileOffsets = runtime ? await cooperativeCopy(runtime.tileOffsets, valid) : undefined
    if (!valid()) return
    this.baselineKey = key
    this.baselineStorage = storage
    const pixelBytes = pixels.byteLength
    const transfer: Transferable[] = [pixels.buffer]
    if (runtimeData) transfer.push(runtimeData.buffer)
    if (runtimeTileOffsets) transfer.push(runtimeTileOffsets.buffer)
    worker.postMessage({
      type: 'initialize',
      width: crop?.width ?? layer.width,
      height: crop?.height ?? layer.height,
      offsetX: layer.offsetX + (crop?.x ?? 0),
      offsetY: layer.offsetY + (crop?.y ?? 0),
      format: layer.format,
      pixels,
      palette,
      contentBounds: crop ? { x: 0, y: 0, width: crop.width, height: crop.height } : contentBounds,
      runtime: runtime
        ? { width: runtime.width, height: runtime.height, tileSize: runtime.tileSize, data: runtimeData, tileOffsets: runtimeTileOffsets }
        : undefined
    }, transfer)
    if (typeof window !== 'undefined') window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.worker-initialize', performance.now() - initializeStartedAt, {
      pixelBytes,
      runtimeBytes: runtime?.data.byteLength ?? 0
    })
  }

  request(
    layer: RasterLayer,
    width: number,
    height: number,
    x: number,
    y: number,
    tolerance: number,
    revision = 0,
    palette?: readonly PaletteEntry[],
    sourceKey = '',
    contiguous = true,
    gapClosingThreshold = 0,
    operation: MagicWandOperation = {}
  ): Promise<MagicWandWorkerResult | null> {
    const worker = this.ensureWorker()
    if (!worker) return Promise.reject(new Error('Web Workers are unavailable'))
    const id = ++this.sequence
    const message: WorkerRequestMessage = {
      id,
      width,
      height,
      x,
      y,
      tolerance,
      contiguous,
      gapClosingThreshold,
      type: 'request'
    }
    return new Promise((resolve, reject) => {
      const epoch = this.epoch
      const valid = () => epoch === this.epoch
      const request: Pending = { id, message, resolve, reject, prepare: async () => {
        // Give the input event a chance to return before allocating a snapshot.
        await new Promise<void>((done) => setTimeout(done, 0))
        if (!valid()) return
        if (!operation.freeTile) await this.initialize(layer, revision, palette, sourceKey)
        if (!valid()) return
        if (this.operation !== operation) {
          const copied: MagicWandOperation = { ...operation }
          const transfer: Transferable[] = []
          if (operation.before?.mask) {
            const mask = await cooperativeCopy(operation.before.mask, valid)
            copied.before = { ...operation.before, mask }
            transfer.push(mask.buffer)
          }
          if (operation.freeTile) {
            const free = operation.freeTile
            const pixels = await cooperativeCopy(free.source.tileset.pixels, valid)
            copied.freeTile = { ...free, source: { ...free.source, tileset: { ...free.source.tileset, pixels } } }
            transfer.push(pixels.buffer)
          }
          if (!valid()) return
          worker.postMessage({ type: 'operation', operation: copied }, transfer)
          this.operation = operation
        }
      } }
      if (this.pending) {
        this.queued?.resolve(null)
        this.queued = request
        return
      }
      this.pending = request
      void this.dispatch(request)
    })
  }

  private async dispatch(request: Pending): Promise<void> {
    try {
      await request.prepare()
      if (this.pending === request) this.worker?.postMessage(request.message)
    } catch (error) {
      if (this.pending === request) this.fail(error)
    }
  }

  private fail(error: unknown): void {
    this.pending?.reject(error)
    this.queued?.reject(error)
    this.pending = null
    this.queued = null
    this.dispose()
  }

  dispose(): void {
    this.epoch += 1
    this.baselineKey = ''
    this.baselineStorage = null
    this.operation = null
    this.pending?.resolve(null)
    this.queued?.resolve(null)
    this.pending = null
    this.queued = null
    this.worker?.terminate()
    this.worker = null
  }
}
