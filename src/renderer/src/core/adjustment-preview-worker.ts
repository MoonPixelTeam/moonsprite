import type { ColorAdjustment } from './adjustments'
import type { AdjustmentPreviewBaseline, AdjustmentPreviewResult, AdjustmentPreviewWorkerRequest, AdjustmentPreviewWorkerResponse } from './adjustment-preview-protocol'
import type { SelectionRect } from '@shared/types-selection'

const MAX_WORKER_BASELINE_BYTES = 256 * 1024 * 1024
const BASELINE_COPY_CHUNK_BYTES = 4 * 1024 * 1024

const yieldBaselineCopy = (): Promise<void> => new Promise((resolve) => {
  if (typeof MessageChannel === 'undefined') {
    globalThis.setTimeout(resolve, 0)
    return
  }
  const channel = new MessageChannel()
  channel.port1.onmessage = () => {
    channel.port1.close()
    channel.port2.close()
    resolve()
  }
  channel.port2.postMessage(null)
})

const clonePixelsChunked = async <T extends Uint8ClampedArray | Uint32Array>(source: T, shouldContinue: () => boolean): Promise<T | null> => {
  const target = (source instanceof Uint8ClampedArray ? new Uint8ClampedArray(source.length) : new Uint32Array(source.length)) as T
  const elementsPerChunk = Math.max(1, Math.floor(BASELINE_COPY_CHUNK_BYTES / source.BYTES_PER_ELEMENT))
  for (let offset = 0; offset < source.length; offset += elementsPerChunk) {
    if (!shouldContinue()) return null
    const end = Math.min(source.length, offset + elementsPerChunk)
    target.set(source.subarray(offset, end), offset)
    if (end < source.length) await yieldBaselineCopy()
  }
  return shouldContinue() ? target : null
}

interface PendingRequest {
  id: number
  resolve: (result: AdjustmentPreviewResult | null) => void
}

export class AdjustmentPreviewWorkerClient {
  private worker: Worker | null = null
  private pending: PendingRequest | null = null
  private sequence = 0
  private initialization = 0
  private ready = false
  private failed = false

  async initialize(source: AdjustmentPreviewBaseline): Promise<boolean> {
    const initialization = ++this.initialization
    this.cancel()
    this.ready = false
    const bytes = source.layers.reduce((total, layer) => total + layer.pixels.byteLength, 0)
    if (typeof Worker === 'undefined' || bytes > MAX_WORKER_BASELINE_BYTES || this.failed) {
      return false
    }
    const worker = this.ensureWorker()
    if (!worker) return false
    const layers: AdjustmentPreviewBaseline['layers'] = []
    for (const layer of source.layers) {
      const pixels = await clonePixelsChunked(layer.pixels, () => initialization === this.initialization)
      if (!pixels || initialization !== this.initialization) return false
      layers.push({ ...layer, pixels })
    }
    const baseline: AdjustmentPreviewBaseline = {
      ...source,
      palette: source.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
      paletteOrder: [...source.paletteOrder],
      selection: source.selection ? { ...source.selection, mask: source.selection.mask?.slice() } : null,
      layers
    }
    if (initialization !== this.initialization || this.worker !== worker) return false
    const transfer = baseline.layers.flatMap((layer) => layer.pixels.buffer instanceof ArrayBuffer ? [layer.pixels.buffer] : [])
    worker.postMessage({ type: 'initialize', baseline } satisfies AdjustmentPreviewWorkerRequest, transfer)
    this.ready = true
    return true
  }

  request(adjustment: ColorAdjustment, region: SelectionRect): Promise<AdjustmentPreviewResult | null> {
    if (!this.ready || !this.worker) return Promise.resolve(null)
    if (this.pending) {
      this.pending.resolve(null)
      this.pending = null
    }
    const id = ++this.sequence
    return new Promise((resolve) => {
      this.pending = { id, resolve }
      this.worker!.postMessage({ type: 'adjust', id, adjustment, region } satisfies AdjustmentPreviewWorkerRequest)
    })
  }

  cancel(): void {
    if (this.pending) {
      this.pending.resolve(null)
      this.pending = null
    }
    if (this.worker) this.worker.postMessage({ type: 'cancel' } satisfies AdjustmentPreviewWorkerRequest)
  }

  dispose(): void {
    this.initialization += 1
    this.cancel()
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker
    try {
      const worker = new Worker(new URL('../workers/adjustment-preview.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-adjustment-preview' })
      worker.onmessage = (event: MessageEvent<AdjustmentPreviewWorkerResponse>) => {
        const pending = this.pending
        if (!pending || event.data.id !== pending.id) return
        this.pending = null
        pending.resolve('error' in event.data ? null : event.data)
      }
      worker.onerror = () => {
        this.failed = true
        this.ready = false
        this.pending?.resolve(null)
        this.pending = null
        worker.terminate()
        if (this.worker === worker) this.worker = null
      }
      this.worker = worker
      return worker
    } catch {
      this.failed = true
      return null
    }
  }
}
