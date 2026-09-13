import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, writeLayerColor } from './document'
import { decodePng } from './png'
import { commitPreparedTimelapseSnapshot, prepareTimelapseSnapshot } from './timelapse'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('timelapse worker recovery', () => {
  it.each(['startup', 'error', 'messageerror', 'timeout'])('preserves captured pixels on worker %s', async (failure) => {
    vi.useFakeTimers()
    class FailedWorker {
      onerror: ((event: { message: string }) => void) | null = null
      onmessageerror: (() => void) | null = null
      constructor() { if (failure === 'startup') throw new Error('worker unavailable') }
      postMessage() {
        if (failure === 'error') this.onerror?.({ message: 'worker crashed' })
        if (failure === 'messageerror') this.onmessageerror?.()
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FailedWorker)
    const document = createDocument('worker recovery', 2, 2, 'rgba', true)
    document.timelapse!.mode = 'full'
    writeLayerColor(document, getActiveLayer(document), 0, { r: 77, g: 0, b: 0, a: 255 })
    const prepared = prepareTimelapseSnapshot(document)!
    const committing = commitPreparedTimelapseSnapshot(document, prepared)
    // A later edit must not change the frame being recovered.
    writeLayerColor(document, getActiveLayer(document), 0, { r: 99, g: 0, b: 0, a: 255 })
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(30_000)
    await committing
    expect(document.timelapse!.snapshots).toHaveLength(1)
    expect(getActiveLayer(decodePng(document.timelapse!.snapshots[0].data, 'frame')).pixels[0]).toBe(77)
    expect(vi.getTimerCount()).toBe(0)
  })
})
