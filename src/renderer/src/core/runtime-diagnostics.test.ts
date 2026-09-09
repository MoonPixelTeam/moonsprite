import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginRuntimeDiagnosticOperation,
  configureRuntimeDiagnostics,
  createRuntimeDiagnosticSessionId,
  mainThreadStallDuration,
  recordRuntimeDiagnostic,
  resetRuntimeDiagnosticsForTests,
  runtimeDiagnosticSnapshot
} from './runtime-diagnostics'

describe('runtime diagnostics', () => {
  it('summarizes accidental pixel payloads without reading getters or serializing document objects', () => {
    const readPixels = vi.fn(() => { throw new Error('must not read') })
    const detail = {
      width: 4000, pixels: new Uint8Array(4000 * 4000), nested: { toJSON: readPixels },
      get expensive() { return readPixels() }
    }
    recordRuntimeDiagnostic('session', 'safe-detail', detail as unknown as import('./runtime-diagnostics').RuntimeDiagnosticDetail)
    const logged = runtimeDiagnosticSnapshot()[0].detail
    expect(logged).toEqual({ width: 4000, pixels: '[Pixel/binary data: 16000000 bytes]', nested: '[object]', expensive: '[accessor]' })
    expect(JSON.stringify(logged).length).toBeLessThan(200)
    expect(readPixels).not.toHaveBeenCalled()
  })

  it('normalizes operation data before spreading and bounds detail size', () => {
    const pixels = new Uint8Array(4000 * 4000) as unknown as import('./runtime-diagnostics').RuntimeDiagnosticDetail
    const operation = beginRuntimeDiagnosticOperation('test', pixels)
    operation.mark('preview', pixels)
    operation.finish('ok', pixels)
    for (const logged of runtimeDiagnosticSnapshot()) {
      expect(logged.detail.omittedDetail).toBe('[Pixel/binary data: 16000000 bytes]')
      expect(JSON.stringify(logged).length).toBeLessThan(1000)
    }
    const read = vi.fn()
    const detail = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`key${i}`, 'x'.repeat(1000)]))
    Object.defineProperty(detail, 'extra', { enumerable: true, get: read })
    recordRuntimeDiagnostic('session', 'bounded', detail)
    expect(Object.keys(runtimeDiagnosticSnapshot().at(-1)!.detail)).toHaveLength(32)
    expect(read).not.toHaveBeenCalled()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetRuntimeDiagnosticsForTests()
  })

  it('creates diagnostic session ids from secure Web Crypto sources', () => {
    const uuid = '01234567-89ab-4def-8123-456789abcdef'
    expect(createRuntimeDiagnosticSessionId({ randomUUID: () => uuid })).toBe(uuid)

    const getRandomValues = ((bytes: Uint8Array): Uint8Array => {
      bytes.fill(0xab)
      return bytes
    }) as Crypto['getRandomValues']
    expect(createRuntimeDiagnosticSessionId({ getRandomValues })).toBe('abababab-abab-4bab-abab-abababababab')
  })

  it('keeps diagnostic session ids unique when Web Crypto is unavailable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const first = createRuntimeDiagnosticSessionId(null)
    const second = createRuntimeDiagnosticSessionId(null)

    expect(first).toMatch(/^runtime-[a-z0-9]+-[a-z0-9]+$/)
    expect(second).not.toBe(first)
  })

  it('persists queued events and records operation stages without document data', () => {
    recordRuntimeDiagnostic('session', 'before-sink', { width: 4000 })
    const batches: string[][] = []
    configureRuntimeDiagnostics((events) => { batches.push(events.map((event) => event.name)) })

    const operation = beginRuntimeDiagnosticOperation('project.save', { layers: 73 }, 60_000)
    operation.mark('encode')
    operation.finish('ok', { bytes: 1024 })

    expect(batches.flat()).toEqual(['before-sink', 'project.save', 'project.save', 'project.save'])
    expect(runtimeDiagnosticSnapshot().map((event) => event.kind)).toEqual([
      'session',
      'operation-start',
      'operation-stage',
      'operation-end'
    ])
  })

  it('reports a slow operation once and keeps only a bounded recent ring', () => {
    vi.useFakeTimers()
    const kinds: string[] = []
    configureRuntimeDiagnostics((events) => { kinds.push(...events.map((event) => event.kind)) }, () => ({ width: 4096, layers: 80 }))
    const operation = beginRuntimeDiagnosticOperation('project.encode', undefined, 100)

    vi.advanceTimersByTime(100)
    operation.finish()
    expect(kinds.filter((kind) => kind === 'operation-slow')).toHaveLength(1)
    for (let index = 0; index < 240; index += 1) recordRuntimeDiagnostic('session', `event-${index}`)

    const snapshot = runtimeDiagnosticSnapshot()
    expect(snapshot).toHaveLength(200)
    expect(snapshot.at(-1)?.name).toBe('event-239')
  })

  it('classifies only event-loop delays above the configured threshold', () => {
    expect(mainThreadStallDuration(1_249, 500, 750)).toBeNull()
    expect(mainThreadStallDuration(1_250, 500, 750)).toBe(750)
    expect(mainThreadStallDuration(Number.NaN, 500, 750)).toBeNull()
  })
})
