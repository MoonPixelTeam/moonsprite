import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiagnosticWriter } from './runtime-diagnostic-writer'
import type { RuntimeDiagnosticEvent } from '@/core/runtime-diagnostics'

const event = (sequence: number, kind: RuntimeDiagnosticEvent['kind'] = 'operation-stage'): RuntimeDiagnosticEvent => ({
  version: 1, sessionId: 'test', sequence, timestamp: '', monotonicMs: 0, kind, name: 'paint', detail: {}
})

describe('diagnostic persistence batching', () => {
  it('discards queued writes and suppresses fallback for an in-flight failure after disabling', async () => {
    vi.useFakeTimers()
    let rejectWrite!: (reason: Error) => void
    const persist = vi.fn(() => new Promise<void>((_, reject) => { rejectWrite = reject }))
    const fallback = vi.fn()
    const writer = createDiagnosticWriter(persist, fallback)
    writer.enqueue([event(1)])
    writer.discardPending()
    await vi.advanceTimersByTimeAsync(250)
    expect(persist).not.toHaveBeenCalled()
    writer.enqueue([event(2, 'error')])
    writer.enqueue([event(3)])
    writer.discardPending()
    writer.checkpoint()
    rejectWrite(new Error('write failed'))
    await writer.flush()
    expect(fallback).not.toHaveBeenCalled()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  afterEach(() => { vi.useRealTimers() })

  it('defers a burst of 80 events to one write and preserves their order', async () => {
    vi.useFakeTimers()
    const persist = vi.fn(async () => {})
    const writer = createDiagnosticWriter(persist, vi.fn())
    const events = Array.from({ length: 80 }, (_, i) => event(i))
    for (const item of events) writer.enqueue([item])
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(persist).toHaveBeenCalledExactlyOnceWith(events)
  })

  it('limits each IPC batch to 100 while retaining all events', async () => {
    vi.useFakeTimers()
    const batches: number[][] = []
    const writer = createDiagnosticWriter(async (events) => { batches.push(events.map((item) => item.sequence)) }, vi.fn())
    writer.enqueue(Array.from({ length: 240 }, (_, i) => event(i)))
    await vi.runAllTimersAsync()
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 40])
    expect(batches.flat()).toEqual(Array.from({ length: 240 }, (_, i) => i))
  })

  it('bounds a stalled persistence queue and reports dropped routine events', async () => {
    vi.useFakeTimers()
    const batches: RuntimeDiagnosticEvent[][] = []
    const writer = createDiagnosticWriter(async (events) => { batches.push([...events]) }, vi.fn())
    writer.enqueue(Array.from({ length: 700 }, (_, i) => event(i)))
    await vi.runAllTimersAsync()
    const written = batches.flat()
    expect(written).toHaveLength(500)
    expect(written.map((item) => item.sequence)).toEqual(Array.from({ length: 500 }, (_, i) => i))
    expect(written[0].detail).toMatchObject({
      diagnosticWriterDroppedEvents: 200,
      diagnosticWriterPendingLimit: 500
    })
  })

  it('retains an error when a full queue contains only routine events', async () => {
    vi.useFakeTimers()
    const written: RuntimeDiagnosticEvent[] = []
    const writer = createDiagnosticWriter(async (events) => { written.push(...events) }, vi.fn())
    writer.enqueue(Array.from({ length: 500 }, (_, i) => event(i)))
    writer.enqueue([event(999, 'error')])
    await vi.runAllTimersAsync()
    await writer.flush()
    expect(written).toHaveLength(500)
    expect(written.some((item) => item.sequence === 0)).toBe(false)
    expect(written.some((item) => item.sequence === 999 && item.kind === 'error')).toBe(true)
    expect(written[0].detail.diagnosticWriterDroppedEvents).toBe(1)
  })

  it('flushes errors immediately, serializes writes, and checkpoints outstanding events', async () => {
    vi.useFakeTimers()
    let finishWrite!: () => void
    const persist = vi.fn< (events: readonly RuntimeDiagnosticEvent[]) => Promise<void> >()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve }))
      .mockResolvedValue(undefined)
    const fallback = vi.fn()
    const writer = createDiagnosticWriter(persist, fallback)
    writer.enqueue([event(1)])
    writer.enqueue([event(2, 'error')])
    expect(persist).toHaveBeenCalledTimes(1)
    writer.enqueue([event(3, 'error')])
    expect(persist).toHaveBeenCalledTimes(1)
    writer.checkpoint()
    expect(fallback.mock.calls[0][0].map((item: RuntimeDiagnosticEvent) => item.sequence)).toEqual([1, 2, 3])
    finishWrite()
    await vi.runAllTimersAsync()
    await writer.flush()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist.mock.calls[1][0].map((item) => item.sequence)).toEqual([3])
  })

  it('falls back on failed IPC and continues writing later events', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('disk unavailable')).mockResolvedValue(undefined)
    const fallback = vi.fn()
    const writer = createDiagnosticWriter(persist, fallback)
    writer.enqueue([event(1)])
    await writer.flush()
    expect(fallback).toHaveBeenCalledExactlyOnceWith([event(1)])
    writer.enqueue([event(2)])
    await writer.flush()
    expect(persist).toHaveBeenCalledTimes(2)
  })
})
