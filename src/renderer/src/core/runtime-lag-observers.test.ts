import { afterEach, expect, it, vi } from 'vitest'
import { installLagAttribution } from './runtime-lag-observers'
afterEach(() => vi.unstubAllGlobals())
it('bounds slow-frame attribution and strips paths and URL queries', () => {
  const callbacks: ((list: { getEntries: () => unknown[] }) => void)[] = []
  const disconnect = vi.fn()
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['event', 'long-animation-frame']
    constructor(cb: typeof callbacks[number]) { callbacks.push(cb) }
    observe() {} disconnect = disconnect
  })
  const collector = installLagAttribution()
  for (let i = 0; i < 1000; i++) callbacks[0]({ getEntries: () => [{ duration: 200 + i, startTime: 1,
    scripts: [{ duration: 180, sourceURL: 'https://host/private/path/app.js?token=secret', sourceFunctionName: 'paint', forcedStyleAndLayoutDuration: 40 }] }] })
  callbacks[1]({ getEntries: () => [{ name: 'pointerdown', startTime: 100, duration: 600, processingStart: 500, processingEnd: 550 }] })
  const entries = collector.drain()
  expect(entries).toHaveLength(2)
  expect(entries[0].durationMs).toBe(1199)
  expect(entries[0].scripts).toBe('app.js:-1 paint 180ms layout:40ms')
  expect(entries[1]).toMatchObject({ inputWaitMs: 400, handlerMs: 50, presentationWaitEstimateMs: 150 })
  expect(collector.drain()).toEqual([])
  collector.stop(); expect(disconnect).toHaveBeenCalledTimes(2)
})
it('degrades safely on browsers without attribution support', () => {
  vi.stubGlobal('PerformanceObserver', undefined)
  const collector = installLagAttribution()
  expect(collector.capabilities).toEqual({ event: false, 'long-animation-frame': false })
  collector.stop()
})
