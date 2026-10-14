import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from './document-model'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })

it('releases pending save requests and a silent worker without running a blocking fallback', async () => {
  vi.useFakeTimers()
  let instance!: FakeWorker
  class FakeWorker {
    onmessage = null
    onmessageerror = null
    onerror = null
    terminate = vi.fn()
    constructor() { instance = this }
    postMessage() {}
  }
  vi.stubGlobal('Worker', FakeWorker)
  const { encodeProjectInWorker } = await import('./project-save-worker-client')
  const fallback = vi.fn()
  const operation = encodeProjectInWorker({ document: createDocument('silent save', 1, 1, 'rgba', false), includePreview: false, compressionLevel: 1, incremental: false, resourceRevisions: [], layerStorageOrigins: [] }, fallback)
  const rejection = expect(operation).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(300_000)
  await rejection
  expect(instance.terminate).toHaveBeenCalledOnce()
  expect(fallback).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
