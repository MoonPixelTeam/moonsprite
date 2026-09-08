import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RasterLayer } from '@shared/types'
import { MagicWandWorkerClient } from './magic-wand-worker'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  readonly messages: Array<{ type?: string }> = []

  constructor() { FakeWorker.instances.push(this) }

  postMessage(message: { type?: string }): void { this.messages.push(message) }
  terminate(): void {}
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

  it('reinitializes when the active animation frame changes without a content revision', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer = raster()

    client.initialize(layer, 0, [], 'frame-34')
    client.initialize(layer, 0, [], 'frame-33')

    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].messages.filter((message) => message.type === 'initialize')).toHaveLength(2)
  })

  it('does not reinitialize for the same frame source key', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const client = new MagicWandWorkerClient()
    const layer = raster()

    client.initialize(layer, 0, [], 'frame-34')
    client.initialize(layer, 0, [], 'frame-34')

    expect(FakeWorker.instances[0].messages.filter((message) => message.type === 'initialize')).toHaveLength(1)
  })
})
