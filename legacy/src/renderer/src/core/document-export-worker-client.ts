import type { ExportProtection } from './export-protection'
import type { DocumentSlice, SpriteDocument } from '@shared/types-document'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteSheetExportOptions, SpriteSheetExportSelection, SpriteSheetBuildNames } from './sprite-sheet'
import type { GifDirection } from './gif'
import { projectDocumentForWorkerTransfer, projectDocumentTransferables } from './project-save-transfer'
import { documentForExportTransfer } from './document-export-transfer'

export type DocumentExportWorkerFormat = 'png-auto' | 'png-rgba' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico' | 'psd' | 'ase' | 'aseprite'
export type DocumentExportWorkerJob = 'document' | 'selection' | 'slices' | 'frames' | 'layers' | 'timelapse' | 'sprite-sheet'

export interface DocumentExportWorkerRequest {
  id: number
  document: SpriteDocument
  job: DocumentExportWorkerJob
  format: DocumentExportWorkerFormat
  protection?: ExportProtection
  scalePercent: number
  trim?: boolean
  trimMode?: 'individual' | 'common'
  selection?: SelectionMask | null
  slices?: DocumentSlice[]
  layerIds?: string[]
  gifFrameRange?: 'all' | 'range' | 'loop-section'
  gifFrameStart?: number
  gifFrameEnd?: number
  gifLoopSectionId?: string
  gifDirection?: GifDirection
  spriteSheetOptions?: SpriteSheetExportOptions
  spriteSheetSelection?: SpriteSheetExportSelection
  spriteSheetNames?: SpriteSheetBuildNames
  /** The encoder waits until each result has been consumed before continuing. */
  resultAcknowledgments?: boolean
}

export interface DocumentExportWorkerAcknowledgment {
  id: number
  acknowledgedIndex: number
}

export interface DocumentExportWorkerResult {
  index: number
  bytes: Uint8Array
  extension: 'png' | 'jpg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico' | 'psd' | 'ase' | 'aseprite'
  indexed: boolean
}

interface DocumentExportWorkerResponse {
  id: number
  progress?: number
  result?: DocumentExportWorkerResult
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

export const exportDocumentInWorker = (
  document: SpriteDocument,
  options: Omit<DocumentExportWorkerRequest, 'id' | 'document'>,
  callbacks: {
    onProgress?: (value: number) => void
    onResult: (result: DocumentExportWorkerResult) => Promise<void> | void
    isCanceled?: () => boolean
    signal?: AbortSignal
  }
): Promise<void> => {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Document export worker unavailable'))
  const worker = new Worker(new URL('../workers/document-export.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-document-export' })
  const id = ++sequence
  // Copy only the document shell and pixel ownership before posting. A plain
  // structuredClone would duplicate every dense raster before transfer, which
  // blocks the renderer for large multi-layer exports.
  return new Promise((resolve, reject) => {
    let settled = false
    let resultQueue = Promise.resolve()
    let cancelTimer: ReturnType<typeof setInterval> | undefined
    const cancel = (): void => finish(new Error('MoonSprite export canceled.'))
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (cancelTimer !== undefined) clearInterval(cancelTimer)
      callbacks.signal?.removeEventListener('abort', cancel)
      worker.terminate()
      if (error) reject(error)
      else resolve()
    }
    worker.onmessage = (event: MessageEvent<DocumentExportWorkerResponse>) => {
      if (settled) return
      if (!event.data) { finish(new Error('Document export worker message could not be decoded')); return }
      if (event.data.id !== id) return
      if (event.data.error) { finish(new Error(event.data.error)); return }
      if (callbacks.isCanceled?.()) { finish(new Error('MoonSprite export canceled.')); return }
      try { callbacks.onProgress?.(event.data.progress ?? 0) }
      catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return }
      if (event.data.result) {
        const result = event.data.result
        resultQueue = resultQueue.then(async () => {
          if (settled) return
          await callbacks.onResult(result)
          if (settled) return
          if (callbacks.isCanceled?.() || callbacks.signal?.aborted) { cancel(); return }
          worker.postMessage({ id, acknowledgedIndex: result.index } satisfies DocumentExportWorkerAcknowledgment)
        }).catch((error) => finish(error instanceof Error ? error : new Error(String(error))))
      }
      if (event.data.done) resultQueue.then(() => finish()).catch((error) => finish(error instanceof Error ? error : new Error(String(error))))
    }
    worker.onerror = (event) => finish(new Error(event.message || 'Document export worker failed'))
    worker.onmessageerror = () => finish(new Error('Document export worker message could not be decoded'))
    callbacks.signal?.addEventListener('abort', cancel, { once: true })
    if (callbacks.signal?.aborted || callbacks.isCanceled?.()) { cancel(); return }
    // Legacy callers expose a cancellation predicate rather than an AbortSignal.
    // Poll only for this job, including while its encoder or disk write is busy.
    if (callbacks.isCanceled) cancelTimer = setInterval(() => { if (callbacks.isCanceled?.()) cancel() }, 50)
    try {
      const payload = projectDocumentForWorkerTransfer(documentForExportTransfer(document, options))
      const request: DocumentExportWorkerRequest = { id, document: payload, ...options, resultAcknowledgments: true }
      const transferables = [...new Set<Transferable>([...projectDocumentTransferables(payload), ...collectTransferables(options)])]
      worker.postMessage(request, transferables)
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
