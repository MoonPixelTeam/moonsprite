import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaletteEntry } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import { MagicWandWorkerClient } from './magic-wand-worker'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  readonly messages: Array<{ id?: number; type?: string }> = []

  constructor() { FakeWorker.instances.push(this) }

  postMessage(message: { id?: number; type?: string }): void { this.messages.push(message) }
  terminate(): void {}

  respond(id: number, selection: { x: number; y: number; width: number; height: number } | null): void {
    this.onmessage?.({ data: { id, result: { selection, boundarySegments: null, computeMs: 1, boundaryMs: 1 } } } as MessageEvent)
  }
}

const raster = (): RasterLayer => ({
  id: 'layer-1',
  name: 'Layer',
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  width: 2,
  height: 2,
  offsetX: 0,
  offsetY: 0,
  format: 'rgba',
  pixels: new Uint8ClampedArray(16)
})

describe('magic wand worker source invalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeWorker.instances = []
  })

  it('reinitializes when the active animation frame changes without a content revision', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer = raster()

    await client.initialize(layer, 0, [], 'frame-34')
    await client.initialize(layer, 0, [], 'frame-33')

    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].messages.filter((message) => message.type === 'initialize')).toHaveLength(2)
  })

  it('does not reinitialize for the same frame source key', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer = raster()

    await client.initialize(layer, 0, [], 'frame-34')
    await client.initialize(layer, 0, [], 'frame-34')

    expect(FakeWorker.instances[0].messages.filter((message) => message.type === 'initialize')).toHaveLength(1)
  })

  it('reinitializes an indexed source when only its palette colors change', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer: RasterLayer = { ...raster(), format: 'indexed', pixels: new Uint32Array([1, 1, 1, 1]) }
    const palette: PaletteEntry[] = [{ id: 1, name: 'Ink', color: { r: 10, g: 20, b: 30, a: 255 } }]

    await client.initialize(layer, 0, palette, 'frame-34')
    palette[0].color = { r: 30, g: 20, b: 10, a: 255 }
    await client.initialize(layer, 0, palette, 'frame-34')

    expect(FakeWorker.instances[0].messages.filter((message) => message.type === 'initialize')).toHaveLength(2)
  })

  it('does not invalidate an rgba source for an unrelated palette edit', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer = raster()
    const palette: PaletteEntry[] = [{ id: 1, name: 'Ink', color: { r: 10, g: 20, b: 30, a: 255 } }]

    await client.initialize(layer, 0, palette, 'frame-34')
    palette[0].color = { r: 30, g: 20, b: 10, a: 255 }
    await client.initialize(layer, 0, palette, 'frame-34')

    expect(FakeWorker.instances[0].messages.filter((message) => message.type === 'initialize')).toHaveLength(1)
  })

  it('runs one request and retains only the latest queued pointer sample', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer = raster()
    const first = client.request(layer, 2, 2, 0, 0, 0, 0, [], 'frame-34')
    const replaced = client.request(layer, 2, 2, 1, 0, 0, 0, [], 'frame-34')
    const latest = client.request(layer, 2, 2, 1, 1, 0, 0, [], 'frame-34')
    const worker = FakeWorker.instances[0]
    await vi.waitFor(() => expect(worker.messages.some((message) => message.type === 'request')).toBe(true))
    const firstRequest = worker.messages.find((message) => message.type === 'request')!

    expect(worker.messages.filter((message) => message.type === 'request')).toHaveLength(1)
    await expect(replaced).resolves.toBeNull()
    worker.respond(firstRequest.id!, { x: 0, y: 0, width: 1, height: 1 })
    await expect(first).resolves.toEqual({ selection: { x: 0, y: 0, width: 1, height: 1 }, boundarySegments: null, computeMs: 1, boundaryMs: 1 })
    await vi.waitFor(() => expect(worker.messages.filter((message) => message.type === 'request')).toHaveLength(2))
    const requests = worker.messages.filter((message) => message.type === 'request')
    expect(requests).toHaveLength(2)
    worker.respond(requests[1].id!, { x: 1, y: 1, width: 1, height: 1 })
    await expect(latest).resolves.toEqual({ selection: { x: 1, y: 1, width: 1, height: 1 }, boundarySegments: null, computeMs: 1, boundaryMs: 1 })
  })
})
