// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createLayerMask } from './document-model'
import { documentForExportTransfer } from './document-export-transfer'
import { compositeDocument } from './document-composite'
import { createDefaultLayerStyles } from './layer-styles'
import { projectDocumentForWorkerTransfer, projectDocumentTransferables } from './project-save-transfer'
import { exportDocumentInWorker, type DocumentExportWorkerRequest, type DocumentExportWorkerAcknowledgment } from './document-export-worker-client'

type Request = DocumentExportWorkerRequest | DocumentExportWorkerAcknowledgment
let handler: (event: MessageEvent<Request>) => Promise<void>
let instance: TransportWorker
class TransportWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  sent: Request[] = []
  received: unknown[] = []
  constructor() { instance = this }
  postMessage(request: Request, transfer: Transferable[] = []): void {
    if (this.terminated) throw new Error('post after termination')
    const data = structuredClone(request, { transfer })
    this.sent.push(data)
    queueMicrotask(() => { if (!this.terminated) void handler({ data } as MessageEvent<Request>) })
  }
  terminate(): void { this.terminated = true }
}
beforeAll(async () => {
  vi.stubGlobal('Worker', TransportWorker)
  vi.stubGlobal('postMessage', (response: unknown, transfer: Transferable[]) => {
    const target = instance, data = structuredClone(response, { transfer })
    target.received.push(data)
    queueMicrotask(() => { if (!target.terminated) target.onmessage?.({ data } as MessageEvent) })
  })
  await import('../workers/document-export.worker')
  handler = globalThis.onmessage as unknown as typeof handler
})
afterAll(() => { instance?.terminate(); vi.unstubAllGlobals() })
beforeEach(() => { instance?.terminate() })

const fixture = () => {
  const doc = createDocument('linked export', 2, 1, 'rgba')
  doc.layers[0].pixels.set([10, 20, 30, 255, 40, 50, 60, 255])
  const t = doc.animation!, root = t.cels[0]
  t.frames.push({ id: 'other', duration: 150 }, { id: 'third', duration: 200 })
  t.cels.push({ ...root, id: 'target', frameId: 'other', surface: { ...root.surface!, format: 'rgba', pixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) } })
  t.cels.push({ ...root, id: 'unused', frameId: 'third', surface: { ...root.surface!, format: 'rgba', pixels: new Uint8ClampedArray(8) } })
  root.linkedCelId = 'target'
  t.layerMasks = [{ layerId: doc.layers[0].id, frameId: t.activeFrameId, mask: createLayerMask('mask', 2, 1) }]
  return doc
}
const options = { job: 'slices' as const, format: 'bmp' as const, scalePercent: 100, slices: [0, 1, 2].map(i => ({ id: `${i}`, name: `${i}`, x: 0, y: 0, width: 2, height: 1 })) }

describe('export task source and result backpressure', () => {
  it('reports an undecodable worker request without an uncaught exception', async () => {
    const original = globalThis.postMessage, responses: Array<{ error?: string }> = []
    vi.stubGlobal('postMessage', (message: { error?: string }) => responses.push(message))
    try {
      await handler({ data: null } as unknown as MessageEvent<Request>)
      expect(responses[0].error).toMatch(/decoded/)
    } finally { vi.stubGlobal('postMessage', original) }
  })
  it('keeps active linked dependencies and masks without changing the live source', () => {
    const doc = fixture(), projected = documentForExportTransfer(doc, options)
    expect(projected.animation!.cels[1].surface).toBe(doc.animation!.cels[1].surface)
    expect(projected.animation!.cels[2].surface).toBeUndefined()
    expect(doc.animation!.cels[2].surface!.pixels.byteLength).toBe(8)
    const shell = projectDocumentForWorkerTransfer(projected)
    const sent = structuredClone(shell, { transfer: projectDocumentTransferables(shell) })
    expect(compositeDocument(sent)).toEqual(compositeDocument(doc))
    expect(doc.layers[0].pixels.byteLength).toBe(8)
  })
  it('preserves styled, masked group compositing after source pruning', () => {
    const doc = fixture(), layer = doc.layers[0], styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 2 }
    styles.shadow = { ...styles.shadow, enabled: true, blur: 2, offsetX: 1, offsetY: 1 }
    layer.layerStyles = styles; layer.groupId = 'g'
    doc.groups = [{ id: 'g', name: 'g', opacity: .7, visible: true, locked: false, blendMode: 'multiply' }]
    const shell = projectDocumentForWorkerTransfer(documentForExportTransfer(doc, options))
    const sent = structuredClone(shell, { transfer: projectDocumentTransferables(shell) })
    expect(compositeDocument(sent)).toEqual(compositeDocument(doc))
  })
  it.each(['frames', 'sprite-sheet', 'timelapse'] as const)('retains full source for %s', job => {
    const doc = fixture()
    expect(documentForExportTransfer(doc, { ...options, job })).toBe(doc)
  })
  it.each(['gif', 'webp', 'psd', 'ase', 'aseprite'] as const)('retains full source for %s', format => {
    const doc = fixture()
    expect(documentForExportTransfer(doc, { ...options, format })).toBe(doc)
  })
  it('terminates a cyclic dependency walk and retains every dependency', () => {
    const doc = fixture(); doc.animation!.cels[1].linkedCelId = doc.animation!.cels[0].id
    expect(documentForExportTransfer(doc, options).animation!.cels[1].surface).toBeDefined()
  })
  it('waits for actual result consumption before producing the next result', async () => {
    const gates: Array<() => void> = [], indices: number[] = []
    const exporting = exportDocumentInWorker(fixture(), options, { onResult: r => { indices.push(r.index); return new Promise<void>(resolve => gates.push(resolve)) } })
    await vi.waitFor(() => expect(indices).toEqual([0]))
    await new Promise(resolve => setTimeout(resolve, 15))
    expect(instance.received).toHaveLength(1)
    // Wrong acknowledgments must not release the next result.
    instance.postMessage({ id: 999, acknowledgedIndex: 0 })
    await new Promise(resolve => setTimeout(resolve, 10)); expect(indices).toEqual([0])
    gates[0](); await vi.waitFor(() => expect(indices).toEqual([0, 1]))
    gates[1](); await vi.waitFor(() => expect(indices).toEqual([0, 1, 2]))
    gates[2](); await exporting
    expect(instance.terminated).toBe(true)
  })
  it('observes write errors and leaves the next job usable', async () => {
    await expect(exportDocumentInWorker(fixture(), options, { onResult: () => { throw new Error('disk full') } })).rejects.toThrow('disk full')
    expect(instance.terminated).toBe(true)
    const indices: number[] = []
    await exportDocumentInWorker(fixture(), options, { onResult: r => { indices.push(r.index) } })
    expect(indices).toEqual([0, 1, 2])
  })
  it('aborts while a writer is blocked without issuing a late ACK', async () => {
    const controller = new AbortController(); let release!: () => void
    const exporting = exportDocumentInWorker(fixture(), options, { signal: controller.signal, onResult: () => new Promise<void>(resolve => { release = resolve }) })
    const rejection = expect(exporting).rejects.toThrow('canceled')
    await vi.waitFor(() => expect(release).toBeDefined()); const target = instance
    controller.abort(); await rejection; release(); await Promise.resolve(); await Promise.resolve()
    expect(target.terminated).toBe(true)
    expect(target.sent).toHaveLength(1)
  })
  it('cancels legacy callers even before any worker message arrives', async () => {
    const original = handler; handler = async () => {}; let canceled = false
    try {
      const exporting = exportDocumentInWorker(fixture(), options, { isCanceled: () => canceled, onResult: () => {} })
      const rejected = expect(exporting).rejects.toThrow('canceled'); canceled = true; await rejected
      expect(instance.terminated).toBe(true)
    } finally { handler = original }
  })
  it.each(['message', 'progress'] as const)('observes %s failures', async kind => {
    const exporting = exportDocumentInWorker(fixture(), options, { onProgress: () => { if (kind === 'progress') throw new Error('progress failed') }, onResult: () => {} })
    const rejected = expect(exporting).rejects.toThrow(kind === 'message' ? 'decoded' : 'progress failed')
    if (kind === 'message') instance.onmessageerror?.()
    await rejected; expect(instance.terminated).toBe(true)
  })
})
