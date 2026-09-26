import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installRuntimeLagCapture, type LagResourceSample } from './runtime-lag-capture'

let stop: (() => void) | undefined
let now = 1000
let callback: FrameRequestCallback | undefined
const record = vi.fn()
const raf = vi.fn((cb: FrameRequestCallback) => { callback = cb; return 1 })
beforeEach(() => {
  vi.useFakeTimers(); now = 1000; record.mockClear(); raf.mockClear(); callback = undefined
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const input = () => {
  const event = new Event('pointermove')
  Object.defineProperty(event, 'timeStamp', { value: now - 400 })
  document.dispatchEvent(event)
}
it('aggregates thousands of delayed inputs without per-event logging or resource work', async () => {
  const resources = vi.fn().mockResolvedValue({ summary: {}, processes: [] })
  stop = installRuntimeLagCapture({ record, resources })
  await vi.advanceTimersByTimeAsync(0)
  record.mockClear()
  for (let index = 0; index < 5000; index++) input()
  expect(record).not.toHaveBeenCalled()
  expect(resources).toHaveBeenCalledTimes(1)
  expect(raf).toHaveBeenCalledTimes(1)
  now += 80; callback?.(now)
  expect(raf).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(record).toHaveBeenCalledWith('lag.input-summary', expect.objectContaining({ samples: 5000, maxMs: 400, over300Ms: 5000 }))
  expect(record).toHaveBeenCalledWith('lag.scheduler', expect.objectContaining({ frameSamples: 1, frameWaitMaxMs: 80 }))
  await vi.advanceTimersByTimeAsync(1000)
  expect(record.mock.calls.filter(([name]) => name === 'lag.incident')).toHaveLength(1)
})
it('never overlaps stalled resource requests and ignores responses after disposal', async () => {
  let resolve!: (value: LagResourceSample) => void
  const resources = vi.fn(() => new Promise<LagResourceSample>(done => { resolve = done }))
  stop = installRuntimeLagCapture({ record, resources })
  await vi.advanceTimersByTimeAsync(0)
  now += 30000; await vi.advanceTimersByTimeAsync(30000)
  expect(resources).toHaveBeenCalledTimes(1)
  expect(record).toHaveBeenCalledWith('lag.scheduler', expect.objectContaining({ resourceRequestPending: true, resourceRequestAgeMs: 30000 }))
  input(); stop(); stop()
  expect(vi.getTimerCount()).toBe(0)
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
  record.mockClear(); input()
  resolve({ summary: {}, processes: [{}] })
  await vi.advanceTimersByTimeAsync(0)
  expect(record).not.toHaveBeenCalled()
})
it('records resource errors once without an automatic retry loop, including synchronous throws', async () => {
  const resources = vi.fn(() => { throw new Error('unavailable') })
  stop = installRuntimeLagCapture({ record, resources })
  await vi.advanceTimersByTimeAsync(0)
  now += 60000; await vi.advanceTimersByTimeAsync(60000)
  expect(resources).toHaveBeenCalledTimes(1)
  expect(record.mock.calls.filter(([name]) => name === 'lag.resources-error')).toHaveLength(1)
})
it('records short long-tasks and heartbeat delay, without idle animation polling', async () => {
  let deliver!: (entries: { getEntries: () => { duration: number }[] }) => void
  const disconnect = vi.fn()
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['longtask']
    constructor(cb: typeof deliver) { deliver = cb }
    observe() {} disconnect = disconnect
  })
  stop = installRuntimeLagCapture({ record })
  deliver({ getEntries: () => [{ duration: 70 }, { duration: 90 }] })
  now += 12000; await vi.advanceTimersByTimeAsync(1000)
  expect(record).toHaveBeenCalledWith('lag.scheduler', expect.objectContaining({ longTaskCount: 2, longTaskTotalMs: 160, heartbeatDelayMaxMs: 11000 }))
  expect(raf).not.toHaveBeenCalled()
  stop(); expect(disconnect).toHaveBeenCalledTimes(1)
})

it('retains bounded preceding evidence and post-incident windows automatically', async () => {
  stop = installRuntimeLagCapture({ record })
  for (let tick = 0; tick < 40; tick++) { now += 1000; await vi.advanceTimersByTimeAsync(1000) }
  record.mockClear()
  input(); now += 1000; await vi.advanceTimersByTimeAsync(1000)
  expect(record).toHaveBeenCalledWith('lag.incident', expect.objectContaining({ precedingWindows: 30, inputPeakMs: 400 }))
  expect(record.mock.calls.filter(([name, detail]) => name === 'lag.incident-window' && detail.phase === 'before')).toHaveLength(30)
  for (let tick = 0; tick < 12; tick++) { input(); now += 1000; await vi.advanceTimersByTimeAsync(1000) }
  expect(record.mock.calls.filter(([name]) => name === 'lag.incident')).toHaveLength(1)
  expect(record.mock.calls.filter(([name, detail]) => name === 'lag.incident-window' && detail.phase === 'after')).toHaveLength(11)
})
it('does not classify hidden-tab timer throttling as a foreground incident', async () => {
  stop = installRuntimeLagCapture({ record })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  now += 60000; await vi.advanceTimersByTimeAsync(1000)
  expect(record.mock.calls.some(([name]) => name === 'lag.incident')).toBe(false)
})

it('backs off expensive workspace inventory instead of repeating it every ten seconds', async () => {
  const costlyRecord = vi.fn((name: string, detail: unknown) => {
    record(name, detail)
    if (name === 'lag.workspace') now += 12
  })
  stop = installRuntimeLagCapture({ record: costlyRecord })
  for (let tick = 0; tick < 50; tick++) { now += 1000; await vi.advanceTimersByTimeAsync(1000) }
  expect(record.mock.calls.filter(([name]) => name === 'lag.workspace')).toHaveLength(1)
  expect(record).toHaveBeenCalledWith('lag.capture-budget', expect.objectContaining({ inventoryIntervalMs: 60000 }))
  for (let tick = 0; tick < 21; tick++) { now += 1000; await vi.advanceTimersByTimeAsync(1000) }
  expect(record.mock.calls.filter(([name]) => name === 'lag.workspace')).toHaveLength(2)
})
