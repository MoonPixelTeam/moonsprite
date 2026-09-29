import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from './document'
import { encodeDocumentForPath } from './document-files'
import { encodeAseprite, decodeAseprite } from './aseprite'
import type { DocumentExportWorkerRequest } from './document-export-worker-client'

const workers: FakeWorker[] = []
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void
  onerror?: (event: { message: string }) => void
  onmessageerror?: () => void
  terminate = vi.fn()
  request?: DocumentExportWorkerRequest
  postMessage(request: DocumentExportWorkerRequest) { this.request = request }
  constructor() { workers.push(this) }
}
afterEach(() => { vi.unstubAllGlobals(); workers.length = 0 })
it.each(['ase', 'aseprite'] as const)('saves %s through the worker without cloning or detaching live pixels', async format => {
  vi.stubGlobal('Worker', FakeWorker)
  const document = createDocument('save', 2, 1, 'rgba')
  const pixels = document.layers[0].pixels
  const progress = vi.fn()
  const pending = encodeDocumentForPath(document, `save.${format}`, format, 100, progress)
  const worker = workers[0]
  expect(worker.request?.format).toBe(format)
  expect(worker.request?.document).not.toBe(document)
  expect(worker.request?.document.layers[0]).not.toBe(document.layers[0])
  expect(worker.request?.document.layers[0].pixels).toBe(pixels)
  // postMessage's snapshot is simulated here; encoding must not mutate the live document.
  const bytes = encodeAseprite(structuredClone(worker.request!.document))
  worker.onmessage!({ data: { progress: 100, result: { bytes }, done: true } })
  expect(await pending).toEqual(bytes)
  expect(decodeAseprite(bytes).width).toBe(2)
  expect(pixels.byteLength).toBe(8)
  expect(progress).toHaveBeenCalledWith(100)
  expect(worker.terminate).toHaveBeenCalledOnce()
})
it('rejects worker errors rather than silently blocking the UI with a retry', async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const pending = encodeDocumentForPath(createDocument('save', 1, 1, 'rgba'), 'save.ase', 'ase', 100)
  workers[0].onmessage!({ data: { error: 'encoding failed' } })
  await expect(pending).rejects.toThrow('encoding failed')
  expect(workers[0].terminate).toHaveBeenCalledOnce()
})
