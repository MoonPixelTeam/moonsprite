import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeDiagnosticEvent } from '@/core/runtime-diagnostics'

const mocks = vi.hoisted(() => ({ configure: vi.fn(), invoke: vi.fn() }))
vi.mock('@/core/runtime-diagnostics', () => ({
  configureRuntimeDiagnostics: mocks.configure,
  installRuntimeDiagnosticWatchdog: vi.fn(() => () => {}),
  setRuntimeDiagnosticCollection: vi.fn(),
  recordRuntimeDiagnostic: vi.fn(),
  runtimeDiagnosticSnapshot: () => []
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))

const key = 'moonsprite.runtime-diagnostics.v1'
const event = (sequence: number): RuntimeDiagnosticEvent => ({
  version: 1, sessionId: 'test', sequence, timestamp: '', monotonicMs: 0,
  kind: 'operation-stage', name: 'paint', detail: {}
})

describe('platform diagnostic persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.clear()
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    mocks.invoke.mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reads browser storage once and batches writes while retaining valid earlier records', async () => {
    localStorage.setItem(key, JSON.stringify([null, event(0)]))
    const read = vi.spyOn(Storage.prototype, 'getItem')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const { installRuntimeDiagnostics } = await import('./runtime-diagnostics')
    installRuntimeDiagnostics(() => ({}))
    const enqueue = mocks.configure.mock.calls[0][0] as (events: RuntimeDiagnosticEvent[]) => void
    enqueue([event(1)])
    enqueue([event(2)])
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    enqueue([event(3)])
    await vi.advanceTimersByTimeAsync(250)
    expect(read.mock.calls.filter(([name]) => name === key)).toHaveLength(1)
    expect(write).toHaveBeenCalledTimes(2)
    expect(JSON.parse(write.mock.calls.at(-1)![1]).map((item: RuntimeDiagnosticEvent) => item.sequence)).toEqual([0, 1, 2, 3])
  })

  it('flushes pending native logs before opening the folder and preserves failed writes in fallback storage', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    mocks.invoke.mockRejectedValueOnce(new Error('native logging unavailable'))
    const { installRuntimeDiagnostics, openRuntimeDiagnosticLogs } = await import('./runtime-diagnostics')
    installRuntimeDiagnostics(() => ({}))
    const enqueue = mocks.configure.mock.calls[0][0] as (events: RuntimeDiagnosticEvent[]) => void
    enqueue([event(1)])
    await openRuntimeDiagnosticLogs()
    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual(['append_diagnostic_events', 'open_diagnostic_logs'])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([event(1)])
  })
})
