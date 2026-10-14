import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeDiagnosticEvent } from '@/core/runtime-diagnostics'

const mocks = vi.hoisted(() => ({ configure: vi.fn(), invoke: vi.fn(), download: vi.fn() }))
vi.mock('@/core/runtime-diagnostics', () => ({
  configureRuntimeDiagnostics: mocks.configure,
  installRuntimeDiagnosticWatchdog: vi.fn(() => () => {}),
  setRuntimeDiagnosticCollection: vi.fn(),
  recordRuntimeDiagnostic: vi.fn(),
  runtimeDiagnosticSnapshot: () => []
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('./export-success-sound', () => ({ playExportSuccessSound: vi.fn() }))

const key = 'moonsprite.runtime-diagnostics.v1'
const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(blob)
})
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
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = mocks.download.mockReturnValue('blob:diagnostics')
      static revokeObjectURL = vi.fn()
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
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

  it.each([false, true])('exports failed writes even when opening the native folder also fails: %s', async (folderFails) => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    mocks.invoke.mockRejectedValueOnce(new Error('native logging unavailable'))
    if (folderFails) mocks.invoke.mockRejectedValueOnce(new Error('folder unavailable'))
    const { installRuntimeDiagnostics, openRuntimeDiagnosticLogs } = await import('./runtime-diagnostics')
    installRuntimeDiagnostics(() => ({}))
    const enqueue = mocks.configure.mock.calls[0][0] as (events: RuntimeDiagnosticEvent[]) => void
    enqueue([event(1)])
    await openRuntimeDiagnosticLogs()
    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual(['append_diagnostic_events', 'open_diagnostic_logs'])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([{ ...event(1), detail: { diagnosticPersistenceError: 'Error: native logging unavailable' } }])
    expect(mocks.download).toHaveBeenCalledOnce()
    vi.useRealTimers()
    expect(await readBlob(mocks.download.mock.calls[0][0])).toContain('native logging unavailable')
  })

  it('exports the prior-session emergency copy even if native writes now succeed', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    localStorage.setItem(key, JSON.stringify([event(99)]))
    const { installRuntimeDiagnostics, openRuntimeDiagnosticLogs } = await import('./runtime-diagnostics')
    installRuntimeDiagnostics(() => ({}))
    await openRuntimeDiagnosticLogs()
    vi.useRealTimers()
    expect(JSON.parse(await readBlob(mocks.download.mock.calls[0][0]))).toEqual([event(99)])
  })
})
