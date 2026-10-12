import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules() })

it('terminates a silent worker and rejects pending requests after the timeout', async () => {
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
  const { packLocalHistoryAsync } = await import('./local-history-worker')
  const task = packLocalHistoryAsync({ manifest: { version: 2, projectKey: 'timeout', labels: [], position: 0 }, snapshots: [new Uint8Array([1])], cachedDeltas: [] })
  const failed = expect(task).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(300_000)
  await failed
  expect(instance.terminate).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('uses a real Worker request boundary with compressed input and propagates errors', async () => {
  const requests: unknown[] = [], instances: FakeWorker[] = []
  class FakeWorker {
    onmessage: ((event: unknown) => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    terminate = vi.fn()
    constructor(readonly url: URL, readonly options: WorkerOptions) { instances.push(this) }
    postMessage(value: unknown) { requests.push(value) }
  }
  vi.stubGlobal('Worker', FakeWorker)
  const { packLocalHistoryAsync } = await import('./local-history-worker')
  const request = { manifest: { version: 2, projectKey: 'p', labels: [], position: 0 }, snapshots: [new Uint8Array([1, 2])], cachedDeltas: [] }
  const pending = packLocalHistoryAsync(request)
  expect(instances).toHaveLength(1)
  expect(instances[0].url.pathname).toContain('local-history.worker.ts')
  expect(instances[0].options).toEqual({ type: 'module' })
  expect(requests[0]).toMatchObject({ id: 1, request })
  const result = { archive: new Uint8Array([3]), deltas: [], decodedSnapshots: 0, compiledDeltas: 0 }
  instances[0].onmessage!({ data: { id: 1, result } })
  expect(await pending).toEqual(result)
  const failed = packLocalHistoryAsync(request)
  const rejection = expect(failed).rejects.toThrow('worker failure')
  instances[0].onerror!({ message: 'worker failure' })
  await rejection
  expect(instances[0].terminate).toHaveBeenCalledOnce()
})
