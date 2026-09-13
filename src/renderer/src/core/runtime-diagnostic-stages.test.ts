import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureRuntimeDiagnostics, resetRuntimeDiagnosticsForTests, runtimeDiagnosticSnapshot, runtimeDiagnosticSpanOverlap } from './runtime-diagnostics'
import { createRuntimeLatencyReporter, measureRuntimeStages, runtimeEventStartTime } from './runtime-diagnostic-stages'

let now = 0
beforeEach(() => {
  vi.useFakeTimers()
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); resetRuntimeDiagnosticsForTests() })

it('includes short exclusive stages when their enclosing frame is slow', () => {
  configureRuntimeDiagnostics(() => {})
  expect(measureRuntimeStages('canvas.stage.draw', checkpoint => {
    now = 8; checkpoint('geometry')
    now = 17; checkpoint('content')
    now = 20
    return 42
  }, () => ({ documentId: 'a' }))).toBe(42)
  expect(runtimeDiagnosticSnapshot()[0].detail).toMatchObject({
    documentId: 'a', durationMs: 20, stages: 'geometry:8.0ms,content:9.0ms,tail:3.0ms', stageTiming: 'exclusive-wall-time'
  })
  expect(runtimeDiagnosticSpanOverlap(0, 120).measuredSpanCount).toBe(1)
})

it('does not inspect context or allocate timers on disabled and fast paths', () => {
  const detail = vi.fn(() => ({ documentId: 'a' }))
  measureRuntimeStages('disabled', checkpoint => { now = 50; checkpoint('content') }, detail)
  const waits = createRuntimeLatencyReporter('wait')
  waits.record(0, detail)
  configureRuntimeDiagnostics(() => {})
  measureRuntimeStages('fast', checkpoint => { now += 1; checkpoint('content') }, detail)
  waits.record(now - 16, detail)
  expect(detail).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  expect(runtimeDiagnosticSnapshot()).toHaveLength(0)
})

it('summarizes waits once per second with the worst sample and never attributes waits as CPU work', () => {
  configureRuntimeDiagnostics(() => {})
  const waits = createRuntimeLatencyReporter('canvas.frame.wait')
  now = 80
  waits.record(10, () => ({ documentId: 'a', input: 'wheel' }))
  now = 90
  waits.record(20, () => ({ documentId: 'b' }))
  now = 130
  waits.record(15, () => ({ documentId: 'c', input: 'pointer-down' }))
  expect(vi.getTimerCount()).toBe(1)
  expect(runtimeDiagnosticSnapshot()).toHaveLength(0)
  vi.advanceTimersByTime(1000)
  expect(runtimeDiagnosticSnapshot()[0].detail).toMatchObject({
    samples: 3, maxMs: 115, documentId: 'c', startTimeMs: 15, timing: 'elapsed-wait', input: 'pointer-down'
  })
  expect(runtimeDiagnosticSpanOverlap(0, 200).measuredSpanCount).toBe(0)
})

it('flushes the final burst on disposal and prevents duplicate trailing reports', () => {
  configureRuntimeDiagnostics(() => {})
  const waits = createRuntimeLatencyReporter('canvas.input.wait')
  now = 60; waits.record(10, () => ({ documentId: 'a' }))
  waits.flush(); waits.flush()
  expect(vi.getTimerCount()).toBe(0)
  vi.advanceTimersByTime(2000)
  expect(runtimeDiagnosticSnapshot()).toHaveLength(1)
})

it('counts observer deliveries even when their callback duration is zero', () => {
  configureRuntimeDiagnostics(() => {})
  const observer = createRuntimeLatencyReporter('canvas.viewport.observer', 0, 'notification-count')
  for (let index = 0; index < 100; index++) observer.record(0, () => ({ observer: 'canvas-stage', documentId: 'a' }))
  observer.flush()
  expect(runtimeDiagnosticSnapshot()[0].detail).toMatchObject({ samples: 100, timing: 'notification-count', observer: 'canvas-stage', documentId: 'a' })
  expect(runtimeDiagnosticSnapshot()[0].detail.maxMs).toBeUndefined()
})

it('normalizes timestamp origins and ignores missing/future timestamps', () => {
  expect(runtimeEventStartTime(10)).toBeNull()
  configureRuntimeDiagnostics(() => {})
  now = 100
  vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1_700_000_000_000)
  expect(runtimeEventStartTime(25)).toBe(25)
  expect(runtimeEventStartTime(1_700_000_000_025)).toBe(25)
  for (const timestamp of [0, -10, NaN, Infinity, 101]) expect(runtimeEventStartTime(timestamp)).toBeNull()
})

it('preserves operation errors even if collecting diagnostic context fails', () => {
  configureRuntimeDiagnostics(() => {})
  const error = new Error('operation failed')
  expect(() => measureRuntimeStages('failed', () => { throw error }, () => { throw new Error('context') })).toThrow(error)
  const waits = createRuntimeLatencyReporter('wait')
  now = 80
  expect(() => waits.record(0, () => { throw new Error('context') })).not.toThrow()
  expect(vi.getTimerCount()).toBe(0)
})
