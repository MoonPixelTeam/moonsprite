import type { SpriteDocument } from '@shared/types-document'
import type { GifDirection } from './gif'
import { prepareRuntimeRasterDocumentForTransfer } from './runtime-raster'

export type LayerWorkerFormat = 'png-auto' | 'png-rgba' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico'

export interface LayerExportWorkerRequest {
  id: number
  document: SpriteDocument
  layerIds: string[]
  scalePercent: number
  trim?: boolean
  trimMode?: 'individual' | 'common'
  format: LayerWorkerFormat
  gifFrameRange?: 'all' | 'range' | 'loop-section'
  gifFrameStart?: number
  gifFrameEnd?: number
  gifLoopSectionId?: string
  gifDirection?: GifDirection
}

export interface LayerExportWorkerResult {
  index: number
  layerId: string
  bytes: Uint8Array
  extension: 'png' | 'jpg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico'
  indexed: boolean
}

interface LayerExportWorkerResponse {
  id: number
  progress?: number
  result?: LayerExportWorkerResult
  done?: boolean
  error?: string
}

let sequence = 0

const collectTransferables = (value: unknown): Transferable[] => {
  const buffers = new Set<ArrayBuffer>()
  const visited = new WeakSet<object>()
  const visit = (current: unknown): void => {
    if (!current || typeof current !== 'object') return
    if (ArrayBuffer.isView(current)) {
      if (current.buffer instanceof ArrayBuffer) buffers.add(current.buffer)
      return
    }
    if (current instanceof ArrayBuffer) { buffers.add(current); return }
    if (visited.has(current)) return
    visited.add(current)
    if (Array.isArray(current)) for (const item of current) visit(item)
    else for (const item of Object.values(current)) visit(item)
  }
  visit(value)
  return [...buffers]
}

export const exportLayersInWorker = (
  document: SpriteDocument,
  layerIds: readonly string[],
  options: Omit<LayerExportWorkerRequest, 'id' | 'document' | 'layerIds'>,
  callbacks: {
    onProgress?: (value: number) => void
    onResult: (result: LayerExportWorkerResult) => Promise<void> | void
    isCanceled?: () => boolean
  }
): Promise<void> => {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Layer export worker unavailable'))
  const worker = new Worker(new URL('../workers/layer-export.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-layer-export' })
  const id = ++sequence
  const payload = structuredClone(document)
  prepareRuntimeRasterDocumentForTransfer(payload)
  return new Promise((resolve, reject) => {
    let settled = false
    let resultQueue = Promise.resolve()
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      worker.terminate()
      if (error) reject(error)
      else resolve()
    }
    worker.onmessage = (event: MessageEvent<LayerExportWorkerResponse>) => {
      if (event.data.id !== id) return
      if (event.data.error) { finish(new Error(event.data.error)); return }
      if (callbacks.isCanceled?.()) { finish(new Error('MoonSprite export canceled.')); return }
      callbacks.onProgress?.(event.data.progress ?? 0)
      if (event.data.result) {
        resultQueue = resultQueue.then(() => callbacks.onResult(event.data.result!)).catch((error) => {
          finish(error instanceof Error ? error : new Error(String(error)))
        })
      }
      if (event.data.done) resultQueue.then(() => finish()).catch((error) => finish(error instanceof Error ? error : new Error(String(error))))
    }
    worker.onerror = (event) => finish(new Error(event.message || 'Layer export worker failed'))
    try {
      const request: LayerExportWorkerRequest = { id, document: payload, layerIds: [...layerIds], ...options }
      worker.postMessage(request, collectTransferables(request))
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
