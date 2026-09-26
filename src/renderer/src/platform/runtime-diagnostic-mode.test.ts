import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DIAGNOSTIC_MODE_KEY, saveDiagnosticMode } from '@/core/diagnostic-preferences'
import { beginRuntimeDiagnosticOperation, measureRuntimeDiagnostic, recordRuntimeDiagnostic, resetRuntimeDiagnosticsForTests, runtimeDiagnosticSnapshot, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { createRuntimeLatencyReporter } from '@/core/runtime-diagnostic-stages'
import { installRuntimeDiagnostics } from './runtime-diagnostics'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
let dispose: (() => void) | undefined
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  mocks.invoke.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('__TAURI_INTERNALS__', {})
})
afterEach(() => {
  dispose?.(); dispose = undefined
  resetRuntimeDiagnosticsForTests()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

it('starts fully disabled from the saved preference without collectors, timers, or writes', async () => {
  localStorage.setItem(DIAGNOSTIC_MODE_KEY, 'off')
  // jsdom schedules a storage-event delivery; it is not a diagnostic timer.
  await vi.advanceTimersByTimeAsync(0)
  const context = vi.fn(() => ({}))
  dispose = installRuntimeDiagnostics(context)
  recordRuntimeDiagnostic('error', 'error', {}, true)
  expect(measureRuntimeDiagnostic('draw', () => 42, context)).toBe(42)
  const operation = beginRuntimeDiagnosticOperation('save', {}, 10)
  operation.mark('encode'); operation.finish()
  expect(runtimeDiagnosticsActive()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(5000)
  expect(context).not.toHaveBeenCalled()
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(runtimeDiagnosticSnapshot()).toHaveLength(0)
})

it('keeps memory mode bounded and does not persist its records when full logging is enabled', async () => {
  localStorage.setItem(DIAGNOSTIC_MODE_KEY, 'memory')
  dispose = installRuntimeDiagnostics(() => ({}))
  for (let index = 0; index < 250; index++) recordRuntimeDiagnostic('operation-stage', `memory-${index}`)
  expect(runtimeDiagnosticSnapshot()).toHaveLength(200)
  expect(runtimeDiagnosticSnapshot()[0].name).toBe('memory-50')
  await vi.advanceTimersByTimeAsync(1500)
  window.dispatchEvent(new Event('pagehide'))
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(localStorage.getItem('moonsprite.runtime-diagnostics.v1')).toBeNull()
  saveDiagnosticMode('full')
  recordRuntimeDiagnostic('operation-stage', 'persist-this')
  await vi.advanceTimersByTimeAsync(250)
  const written = mocks.invoke.mock.calls.flatMap(([, args]) => args.events)
  expect(written.some(event => event.name === 'persist-this')).toBe(true)
  expect(written.some(event => event.name.startsWith('memory-'))).toBe(false)
})

it('cancels pending writes, operation warnings and latency timers immediately on disable', async () => {
  dispose = installRuntimeDiagnostics(() => ({}))
  recordRuntimeDiagnostic('operation-stage', 'queued')
  const operation = beginRuntimeDiagnosticOperation('pending-operation', {}, 100)
  const wait = createRuntimeLatencyReporter('pending-wait')
  vi.advanceTimersByTime(50)
  wait.record(0, () => ({ documentId: 'doc' }))
  expect(vi.getTimerCount()).toBeGreaterThan(1)
  saveDiagnosticMode('off')
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(2000)
  expect(mocks.invoke).not.toHaveBeenCalled()
  saveDiagnosticMode('memory')
  operation.finish(); wait.flush()
  expect(runtimeDiagnosticSnapshot().some(event => event.name === 'pending-operation' || event.name === 'pending-wait')).toBe(false)
  recordRuntimeDiagnostic('operation-stage', 'new-record')
  expect(runtimeDiagnosticSnapshot().at(-1)?.name).toBe('new-record')
})

it('stops queued browser fallback writes when switching to memory mode', async () => {
  vi.unstubAllGlobals()
  dispose = installRuntimeDiagnostics(() => ({}))
  recordRuntimeDiagnostic('operation-stage', 'queued-browser-record')
  saveDiagnosticMode('memory')
  await vi.advanceTimersByTimeAsync(1000)
  window.dispatchEvent(new Event('pagehide'))
  expect(localStorage.getItem('moonsprite.runtime-diagnostics.v1')).toBeNull()
})

it('installs native sampling only in lag mode and preserves its final marker on disable', async () => {
  mocks.invoke.mockImplementation(async (command) => command === 'sample_lag_resources' ? { summary: {}, processes: [] } : undefined)
  dispose = installRuntimeDiagnostics(() => ({}))
  await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.invoke.mock.calls.some(([command]) => command === 'sample_lag_resources')).toBe(false)
  saveDiagnosticMode('lag')
  await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.invoke.mock.calls.filter(([command]) => command === 'sample_lag_resources')).toHaveLength(1)
  saveDiagnosticMode('off')
  await vi.advanceTimersByTimeAsync(1000)
  const written = mocks.invoke.mock.calls.filter(([command]) => command === 'append_diagnostic_events').flatMap(([, args]) => args.events)
  expect(written.some(event => event.name === 'lag.capture-stop')).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(30000)
  expect(mocks.invoke.mock.calls.filter(([command]) => command === 'sample_lag_resources')).toHaveLength(1)
})

it('serializes native capture transitions so rapid enable-disable cannot leave a worker running', async () => {
  mocks.invoke.mockImplementation(async (command) => command === 'sample_lag_resources' ? { summary: {}, processes: [] } : undefined)
  localStorage.setItem(DIAGNOSTIC_MODE_KEY, 'off')
  dispose = installRuntimeDiagnostics(() => ({}))
  saveDiagnosticMode('lag'); saveDiagnosticMode('off'); saveDiagnosticMode('lag'); saveDiagnosticMode('off')
  await vi.advanceTimersByTimeAsync(1000)
  const controls = mocks.invoke.mock.calls.filter(([command]) => command === 'set_lag_capture').map(([, args]) => args.enabled)
  expect(controls).toEqual([true, false, true, false])
})
