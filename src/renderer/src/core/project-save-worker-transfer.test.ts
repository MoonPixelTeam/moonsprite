// @vitest-environment node
import { MessageChannel } from 'node:worker_threads'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { createDocument, markLayerContentChanged, setLayerStorageOrigin } from './document-model'
import { decodeProject, encodeProject, encodeProjectAsync, encodeProjectSaveAsync, registerProjectSaveBaseline } from './project-format'
import type { ProjectEncodeWorkerPayload, ProjectEncodeWorkerResponse } from './project-format-manifest-types'
import { assignRasterStorage, installRuntimeRaster, readSurfacePackedLocal, surfacePixelsMaterialized } from './runtime-raster'
import { encodePng } from './png-encode'

type Request = { id: number; payload: ProjectEncodeWorkerPayload }
let workerHandler: (event: MessageEvent<Request>) => void
let instance: TransportWorker

// Actual structured-clone message transport and the production worker handler.
// No browser Worker scheduling or WebView2 memory accounting is simulated here.
class TransportWorker {
  readonly channel = new MessageChannel()
  onmessage: ((event: MessageEvent<ProjectEncodeWorkerResponse>) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  received: Request | null = null
  failNextPost = false

  constructor() {
    instance = this
    this.channel.port2.on('message', (request: Request) => {
      this.received = request
      workerHandler({ data: request } as MessageEvent<Request>)
    })
    this.channel.port1.on('message', (data: ProjectEncodeWorkerResponse) => {
      this.onmessage?.({ data } as MessageEvent<ProjectEncodeWorkerResponse>)
    })
  }

  postMessage(request: Request): void {
    if (this.failNextPost) {
      this.failNextPost = false
      throw new Error('test transport failure')
    }
    this.channel.port1.postMessage(request)
  }

  terminate(): void {
    this.channel.port1.close()
    this.channel.port2.close()
  }
}

beforeAll(async () => {
  vi.stubGlobal('Worker', TransportWorker)
  vi.stubGlobal('onmessage', null)
  vi.stubGlobal('postMessage', (response: ProjectEncodeWorkerResponse, transfer: ArrayBuffer[]) => {
    instance.channel.port2.postMessage(response, transfer)
  })
  await import('../workers/project-encode.worker')
  workerHandler = globalThis.onmessage as unknown as typeof workerHandler
})

afterAll(() => {
  instance?.onerror?.({ message: 'test cleanup' })
  vi.unstubAllGlobals()
})

const sparseDocument = (format: 'rgba' | 'indexed') => {
  const document = createDocument('sparse worker save', 128, 128, format)
  const layer = document.layers[0]
  const surface = document.animation!.cels[0].surface!
  const data = new Uint8Array(64 * 64 * 4)
  data.set(format === 'rgba' ? [11, 22, 33, 255] : [1, 0, 0, 0])
  installRuntimeRaster(layer, {
    kind: 'sparse-tiles-v1', format, width: 128, height: 128, tileSize: 64,
    data, tileOffsets: new Int32Array([1, 0, 0, 0])
  })
  assignRasterStorage(surface, layer)
  return document
}

describe('project save worker transport', () => {
  it('rejects a null worker request without an uncaught exception and permits a fresh save', async () => {
    const responses: ProjectEncodeWorkerResponse[] = []
    const original = globalThis.postMessage
    vi.stubGlobal('postMessage', (response: ProjectEncodeWorkerResponse) => responses.push(response))
    try {
      expect(() => workerHandler({ data: null } as unknown as MessageEvent<Request>)).not.toThrow()
      expect(responses[0]?.error).toMatch(/message/i)
    } finally { vi.stubGlobal('postMessage', original) }
    const restored = decodeProject(await encodeProjectAsync(sparseDocument('rgba'), { includePreview: false }))
    expect(readSurfacePackedLocal(restored.layers[0], 0, 0)).toBe(0xff21160b)
  })

  it.each(['null response', 'messageerror'])('rejects pending saves on %s and replaces the worker', async failure => {
    const saving = encodeProjectAsync(sparseDocument('rgba'), { includePreview: false })
    const rejected = expect(saving).rejects.toThrow(/message/i)
    const failedWorker = instance
    if (failure === 'null response') failedWorker.onmessage?.({ data: null } as unknown as MessageEvent<ProjectEncodeWorkerResponse>)
    else failedWorker.onmessageerror?.()
    await rejected
    const next = encodeProjectAsync(sparseDocument('rgba'), { includePreview: false })
    expect(instance).not.toBe(failedWorker)
    // A delayed error from the terminated instance must not abort this save.
    failedWorker.onerror?.({ message: 'late worker failure' })
    expect(readSurfacePackedLocal(decodeProject(await next).layers[0], 0, 0)).toBe(0xff21160b)
  })

  it('captures dense edits when posted, without detaching the live buffers', async () => {
    const document = createDocument('save snapshot', 2, 1, 'rgba')
    const layer = document.layers[0]
    layer.pixels.set([11, 22, 33, 255])
    const saving = encodeProjectAsync(document, { includePreview: false })
    layer.pixels[0] = 99
    const restored = decodeProject(await saving)
    expect(readSurfacePackedLocal(restored.layers[0], 0, 0)).toBe(0xff21160b)
    expect(layer.pixels[0]).toBe(99)
    expect(layer.pixels.byteLength).toBe(8)
  })

  it('keeps a log-sized 4200x2400 sparse layer compact across repeated saves', async () => {
    const document = sparseDocument('rgba')
    document.width = 4200
    document.height = 2400
    const layer = document.layers[0], surface = document.animation!.cels[0].surface!
    for (const target of [layer, surface]) { target.width = 4200; target.height = 2400 }
    const data = new Uint8Array(64 * 64 * 4)
    data.set([11, 22, 33, 255])
    const tileOffsets = new Int32Array(Math.ceil(4200 / 64) * Math.ceil(2400 / 64))
    tileOffsets[0] = 1
    installRuntimeRaster(layer, { kind: 'sparse-tiles-v1', format: 'rgba', width: 4200, height: 2400, tileSize: 64, data, tileOffsets })
    assignRasterStorage(surface, layer)
    for (let save = 0; save < 3; save++) {
      const archive = await encodeProjectAsync(document, { includePreview: false })
      expect(surfacePixelsMaterialized(layer)).toBe(false)
      expect(surfacePixelsMaterialized(surface)).toBe(false)
      const sent = instance.received!.payload.document.layers[0]
      expect(surfacePixelsMaterialized(sent)).toBe(false)
      expect(sent.runtimeRaster!.data.byteLength + sent.runtimeRaster!.tileOffsets.byteLength).toBe(26416)
      expect(readSurfacePackedLocal(decodeProject(archive).layers[0], 0, 0)).toBe(0xff21160b)
    }
  })

  it.each(['rgba', 'indexed'] as const)('saves sparse %s layers and shared cels without expanding the source', async format => {
    const document = sparseDocument(format)
    const layer = document.layers[0]
    const surface = document.animation!.cels[0].surface!
    const descriptor = Object.getOwnPropertyDescriptor(layer, 'pixels')!
    const progress: number[] = []
    const archive = await encodeProjectAsync(document, { includePreview: false, onProgress: value => progress.push(value) })
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(surfacePixelsMaterialized(surface)).toBe(false)
    expect(Object.getOwnPropertyDescriptor(layer, 'pixels')!.get === descriptor.get).toBe(true)
    const sent = instance.received!.payload.document
    expect(sent.layers[0].runtimeRaster === sent.animation!.cels[0].surface!.runtimeRaster).toBe(true)
    expect(surfacePixelsMaterialized(sent.layers[0])).toBe(false)
    expect(sent.layers[0].runtimeRaster!.data.byteLength).toBe(64 * 64 * 4)
    const restored = decodeProject(archive)
    expect(readSurfacePackedLocal(restored.layers[0], 0, 0)).toBe(format === 'rgba' ? 0xff21160b : 1)
    expect(readSurfacePackedLocal(restored.layers[0], 127, 127)).toBe(0)
    expect(progress).toEqual([0, 0.05, 1])
    expect(layer.pixels.buffer.byteLength).toBe(128 * 128 * 4)
  })

  it('preserves edits to materialized shared pixels instead of restoring stale tiles', async () => {
    const document = sparseDocument('rgba')
    document.layers[0].pixels[0] = 99
    const restored = decodeProject(await encodeProjectAsync(document, { includePreview: false }))
    expect(readSurfacePackedLocal(restored.layers[0], 0, 0)).toBe(0xff211663)
    const sent = instance.received!.payload.document
    expect(sent.layers[0].runtimeRaster).toBeUndefined()
    expect(sent.layers[0].pixels === sent.animation!.cels[0].surface!.pixels).toBe(true)
    expect(document.layers[0].pixels[0]).toBe(99)
  })

  it('preserves inactive animation cels, offsets and preview while leaving the source sparse', async () => {
    const document = sparseDocument('rgba')
    const layer = document.layers[0]
    layer.offsetX = -2
    layer.offsetY = 3
    setLayerStorageOrigin(layer, { x: -2, y: 3 })
    const timeline = document.animation!
    timeline.frames.push({ id: 'second', duration: 180 })
    timeline.cels.push({ id: 'second-cel', layerId: layer.id, frameId: 'second', surface: {
      format: 'rgba', width: 1, height: 1, offsetX: 7, offsetY: 8,
      pixels: new Uint8ClampedArray([77, 88, 99, 255])
    } })
    const archive = await encodeProjectAsync(document)
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(Object.keys(unzipSync(archive)).some(path => path.includes('preview'))).toBe(true)
    const restored = decodeProject(archive)
    expect(restored.layers[0].offsetX).toBe(-2)
    expect(restored.layers[0].offsetY).toBe(3)
    expect(restored.animation!.frames[1].duration).toBe(180)
    const other = restored.animation!.cels.find(cel => cel.frameId === 'second')!
    expect(other.surface!.offsetX).toBe(7)
    expect(readSurfacePackedLocal(other.surface!, 0, 0)).toBe(0xff63584d)
  })

  it('reuses unchanged sparse resources and saves subsequent edits in incremental archives', async () => {
    const document = sparseDocument('rgba')
    const baseline = encodeProject(document, { includePreview: false })
    expect(registerProjectSaveBaseline(document, 'C:/test/sparse.moonsprite', baseline)).toBe(true)
    const unchanged = await encodeProjectSaveAsync(document, { includePreview: false })
    expect(unchanged.reusableEntries.length).toBeGreaterThan(0)
    expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
    document.layers[0].pixels[0] = 55
    markLayerContentChanged(document.layers[0])
    const changed = await encodeProjectSaveAsync(document, { includePreview: false })
    const files = unzipSync(changed.data)
    const original = unzipSync(baseline)
    for (const entry of changed.reusableEntries) files[entry.path] = original[entry.path]
    delete files['.moonsprite-save-plan.json']
    const restored = decodeProject(zipSync(files))
    expect(readSurfacePackedLocal(restored.layers[0], 0, 0)).toBe(0xff211637)
  })

  it('round-trips recording bytes and recovers after a failed post without changing the source accessors', async () => {
    const document = sparseDocument('rgba')
    const bytes = encodePng(new Uint8ClampedArray([11, 22, 33, 255]), 1, 1, true).bytes
    document.timelapse = { enabled: true, quality: 'medium', fps: 12, speed: 8, snapshots: [
      { id: 'recording', capturedAt: 1, elapsedMs: 1, width: 1, height: 1, data: bytes }
    ] }
    instance.failNextPost = true
    await expect(encodeProjectAsync(document)).rejects.toThrow('test transport failure')
    expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
    const restored = decodeProject(await encodeProjectAsync(document, { includePreview: false }))
    expect(Array.from(restored.timelapse!.snapshots[0].data)).toEqual(Array.from(bytes))
    expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
  })

  it('propagates worker encoding errors and can save the next request', async () => {
    const invalid = sparseDocument('rgba')
    // Structured clone accepts BigInt, but the archive JSON encoder must reject it.
    invalid.name = 1n as unknown as string
    await expect(encodeProjectAsync(invalid, { includePreview: false })).rejects.toThrow()
    expect(surfacePixelsMaterialized(invalid.layers[0])).toBe(false)
    const restored = decodeProject(await encodeProjectAsync(sparseDocument('rgba'), { includePreview: false }))
    expect(readSurfacePackedLocal(restored.layers[0], 0, 0)).toBe(0xff21160b)
  })
})
