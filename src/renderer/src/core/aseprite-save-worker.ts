import type { SpriteDocument } from '@shared/types-document'
import type { DocumentExportWorkerRequest, DocumentExportWorkerResult } from './document-export-worker-client'
import { projectDocumentForWorkerTransfer } from './project-save-transfer'

/** Reuse the export worker without cloning or detaching the live project's pixels. */
export function encodeAsepriteInWorker(document: SpriteDocument, format: 'ase' | 'aseprite', scalePercent: number, onProgress?: (value: number) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/document-export.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-ase-save' })
    let output: Uint8Array | undefined
    const fail = (error: unknown) => { worker.terminate(); reject(error instanceof Error ? error : new Error(String(error))) }
    worker.onerror = event => fail(new Error(event.message || 'ASE save worker failed.'))
    worker.onmessageerror = () => fail(new Error('ASE save worker response could not be decoded.'))
    worker.onmessage = (event: MessageEvent<{ error?: string; progress?: number; result?: DocumentExportWorkerResult; done?: boolean }>) => {
      const message = event.data
      if (message.error) { fail(new Error(message.error)); return }
      if (message.result) output = message.result.bytes
      onProgress?.(message.progress ?? 0)
      if (message.done) {
        worker.terminate()
        if (output) resolve(output)
        else reject(new Error('ASE save worker returned no data.'))
      }
    }
    try {
      const request: DocumentExportWorkerRequest = { id: 1, document: projectDocumentForWorkerTransfer(document), job: 'document', format, scalePercent }
      worker.postMessage(request)
    } catch (error) { fail(error) }
  })
}
