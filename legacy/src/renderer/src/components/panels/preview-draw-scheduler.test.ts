import { afterEach, expect, it, vi } from 'vitest'
import { createPreviewDrawScheduler } from './preview-draw-scheduler'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
it('runs continuation work on display frames without a second timer', () => {
  vi.useFakeTimers()
  let count = 0
  const scheduler = createPreviewDrawScheduler(() => { count++; scheduler.request() })
  scheduler.request()
  vi.advanceTimersByTime(1000)
  expect(count).toBeGreaterThanOrEqual(60)
  expect(count).toBeLessThanOrEqual(63)
  scheduler.cancel()
  const stopped = count
  vi.advanceTimersByTime(1000)
  expect(count).toBe(stopped)
})
it('coalesces 240 samples per second, refreshes during the stroke and flushes the final state', () => {
  vi.useFakeTimers()
  let latest = 0
  const rendered: number[] = []
  const scheduler = createPreviewDrawScheduler(() => rendered.push(latest))
  for (let i = 0; i < 240; i++) {
    latest = i
    scheduler.request()
    vi.advanceTimersByTime(1000 / 240)
  }
  expect(rendered.length).toBeGreaterThanOrEqual(59)
  expect(rendered.length).toBeLessThanOrEqual(63)
  latest = 999
  scheduler.request(true)
  vi.advanceTimersByTime(17)
  expect(rendered.at(-1)).toBe(999)
  scheduler.request()
  scheduler.cancel()
  const count = rendered.length
  vi.advanceTimersByTime(1000)
  expect(rendered).toHaveLength(count)
})
