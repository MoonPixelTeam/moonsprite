import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { decodePng } from '@/core/png'
import * as timelapse from '@/core/timelapse'
import { configureRuntimeDiagnostics, resetRuntimeDiagnosticsForTests } from '@/core/runtime-diagnostics'
import { createWorkspaceRecording } from './workspace-recording'
import { sessionFromDocument, touch } from './workspace-session'

beforeEach(() => { localStorage.clear(); configureRuntimeDiagnostics(() => {}) })
afterEach(() => { vi.restoreAllMocks(); resetRuntimeDiagnosticsForTests() })

const setup = () => {
  const session = sessionFromDocument(createDocument('durable recording', 2, 2, 'rgba', true))
  session.document.timelapse!.mode = 'full'
  const committed = vi.fn()
  const recording = createWorkspaceRecording(committed)
  const paint = (red: number) => {
    writeLayerColor(session.document, getActiveLayer(session.document), 0, { r: red, g: 0, b: 0, a: 255 })
    touch(session)
    recording.recordDocumentOperation(session)
  }
  const colors = () => session.document.timelapse!.snapshots.map(frame => getActiveLayer(decodePng(frame.data, 'frame')).pixels[0])
  return { session, recording, paint, colors, committed }
}

describe('recording failure durability', () => {
  it('retries a failed local write without appending or encoding the frame twice', async () => {
    const { session, recording, paint, committed } = setup()
    const append = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockImplementation(async (store, data) =>
      ({ store, chunk: 'chunk-1', offset: 0, length: data.length, checksum: 123 }))
    const previous = window.moonSprite
    Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: { ...previous, appendTimelapseFrame: append } })
    try {
      const encode = vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot')
      paint(40)
      await recording.flushTimelapseCapture(session)
      expect(append).toHaveBeenCalledTimes(2)
      expect(encode).toHaveBeenCalledTimes(1)
      expect(session.document.timelapse!.snapshots).toHaveLength(1)
      expect(session.document.timelapse!.snapshots[0].data.byteLength).toBe(0)
      expect(session.document.timelapse!.snapshots[0].local).toBeDefined()
      expect(committed).toHaveBeenCalledTimes(1)
    } finally { window.moonSprite = previous }
  })

  it('retains failed pixels and subsequent frames in chronological order until an explicit flush', async () => {
    const { session, recording, paint, colors } = setup()
    const encode = vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockRejectedValueOnce(new Error('encode unavailable'))
    paint(40)
    paint(80)
    await vi.waitFor(() => expect(encode).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(colors()).toEqual([])
    expect(recording.pendingCount(session.document)).toBe(2)
    await recording.flushTimelapseCapture(session)
    expect(colors()).toEqual([40, 80])
    expect(recording.pendingCount(session.document)).toBe(0)
  })

  it('does not mask persistent failures after the queue settles, and flushes other documents', async () => {
    const { session, recording, paint } = setup()
    const other = sessionFromDocument(createDocument('other', 1, 1, 'rgba', true))
    const original = timelapse.commitPreparedTimelapseSnapshot
    vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockImplementation((document, ...args) =>
      document === session.document ? Promise.reject(new Error('PNG failed')) : original(document, ...args))
    paint(40)
    recording.recordDocumentOperation(other)
    await expect(recording.flushTimelapseCaptures([session, other])).rejects.toThrow('PNG failed')
    await expect(recording.flushTimelapseCapture(session)).rejects.toThrow('PNG failed')
    expect(other.document.timelapse!.snapshots).toHaveLength(1)
    expect(recording.pendingCount(session.document)).toBe(1)
  })

  it('coalesces concurrent flush retries instead of appending the same frame twice', async () => {
    const { session, recording, paint, colors } = setup()
    vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockRejectedValueOnce(new Error('retry me'))
    paint(50)
    await Promise.all([recording.flushTimelapseCapture(session), recording.flushTimelapseCapture(session)])
    expect(colors()).toEqual([50])
  })

  it('explicit clearing releases failed frames and never resurrects them', async () => {
    const { session, recording, paint, colors } = setup()
    vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockRejectedValue(new Error('failed'))
    paint(40)
    await expect(recording.flushTimelapseCapture(session)).rejects.toThrow('failed')
    recording.cancelPending(session.document)
    vi.restoreAllMocks()
    await recording.flushTimelapseCapture(session)
    paint(90)
    await recording.flushTimelapseCapture(session)
    expect(colors()).toEqual([90])
  })
})
