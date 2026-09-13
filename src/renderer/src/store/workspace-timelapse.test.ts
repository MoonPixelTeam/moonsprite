import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types'
import { unzipSync, zipSync } from 'fflate'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import { decodeProject, encodeProject } from '@/core/project-format'
import * as timelapse from '@/core/timelapse'
import { configureRuntimeDiagnostics, resetRuntimeDiagnosticsForTests, runtimeDiagnosticSnapshot } from '@/core/runtime-diagnostics'
import { useWorkspace } from './workspace'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { decodePng } from '@/core/png'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  configureRuntimeDiagnostics(() => {})
  localStorage.clear()
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: false })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, recoveryRecords: [] })
})
afterEach(() => { vi.restoreAllMocks(); resetRuntimeDiagnosticsForTests(); localStorage.clear() })

describe('timelapse save interleaving', () => {
  it.each(['during write', 'after write'])('preserves a queued recording completed %s across save and reopen', async (completion) => {
    const gates = [deferred(), deferred()]
    const writeGate = deferred()
    const commit = timelapse.commitPreparedTimelapseSnapshot
    let started = 0
    vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockImplementation(async (...args) => {
      await gates[started++].promise
      return commit(...args)
    })
    let archive = new Uint8Array()
    const writeBinaryAtomic = vi.fn(async (_path: string, data: Uint8Array) => {
      archive = data.slice()
      await writeGate.promise
    })
    const writeProjectIncremental = vi.fn(async (_path: string, _source: string, patch: Uint8Array) => {
      archive = zipSync({ ...unzipSync(archive), ...unzipSync(patch) })
    })
    Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: {
      writeBinaryAtomic, writeProjectIncremental,
      readUsageStatistics: vi.fn(async () => null), writeUsageStatistics: vi.fn(async () => {}),
      writeRecovery: vi.fn(async () => {}), deleteRecovery: vi.fn(async () => {})
    } as unknown as MoonSpriteApi })
    const document = createDocument('recording race', 2, 2, 'rgba', true)
    document.filePath = 'D:/recording-race.moonsprite'
    useWorkspace.getState().addSession(document)
    const paint = (value: number) => useWorkspace.getState().mutateActive((session) => {
      writeLayerColor(session.document, getActiveLayer(session.document), 0, { r: value, g: 0, b: 0, a: 255 })
    })

    paint(50)
    const saving = useWorkspace.getState().saveActive()
    // The second stroke is queued after save began waiting for the first PNG.
    paint(100)
    gates[0].resolve()
    await vi.waitFor(() => expect(writeBinaryAtomic).toHaveBeenCalledTimes(1))
    expect(decodeProject(archive).timelapse?.snapshots).toHaveLength(1)
    if (completion === 'after write') {
      writeGate.resolve()
      await saving
    }
    gates[1].resolve()
    await vi.waitFor(() => expect(document.timelapse?.snapshots).toHaveLength(2))
    writeGate.resolve()
    await saving

    expect(document.dirty).toBe(true)
    await expect(useWorkspace.getState().saveActive()).resolves.toBe(true)
    expect(writeProjectIncremental).toHaveBeenCalledTimes(1)
    expect(decodeProject(archive).timelapse?.snapshots).toEqual(document.timelapse?.snapshots)
    expect(document.dirty).toBe(false)
    const saves = runtimeDiagnosticSnapshot().filter((event) => event.name === 'project.save.recording')
    expect(saves[0].detail).toMatchObject({ documentId: document.id, encodedFrames: 1 })
    expect(saves.at(-1)?.detail).toMatchObject({ encodedFrames: 2, currentFrames: 2, pending: 0, fullySaved: true })
  })

  it('records background capture failures even when the drawing command does not await encoding', async () => {
    vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockRejectedValueOnce(new Error('PNG worker failed'))
    const document = createDocument('capture error', 2, 2, 'rgba', true)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().mutateActive((session) => {
      writeLayerColor(session.document, getActiveLayer(session.document), 0, { r: 100, g: 0, b: 0, a: 255 })
    })
    await vi.waitFor(() => expect(runtimeDiagnosticSnapshot().find((event) => event.name === 'timelapse.capture')?.detail)
      .toMatchObject({ documentId: document.id, message: 'PNG worker failed' }))
  })
})

describe('timelapse history retention', () => {
  const setupRecording = (mode: 'smart' | 'full' = 'smart', recordUndoSteps = false) => {
    const document = createDocument('recording retention', 2, 2, 'rgba', true)
    document.timelapse = { ...document.timelapse!, mode, recordUndoSteps }
    useWorkspace.getState().addSession(document)
    const tasks: Promise<void>[] = []
    const prepare = vi.spyOn(timelapse, 'prepareTimelapseSnapshot')
    const commit = timelapse.commitPreparedTimelapseSnapshot
    vi.spyOn(timelapse, 'commitPreparedTimelapseSnapshot').mockImplementation((...args) => {
      const task = commit(...args)
      tasks.push(task)
      return task
    })
    const drain = async () => {
      // Let every queued capture reach the encoder before checking retention.
      await vi.waitFor(() => expect(tasks).toHaveLength(prepare.mock.results.filter((result) => result.value != null).length), { interval: 1 })
      await Promise.all(tasks)
      await Promise.resolve()
    }
    const paint = (red: number) => {
      const layer = getActiveLayer(document)
      const edit = beginPixelEdit(layer.id)
      recordPixel(document, layer, edit, 0, (0xff000000 | red) >>> 0)
      useWorkspace.getState().commitPixelEdit(edit, 'paint')
    }
    return { document, drain, paint }
  }

  it('retains sampled earlier stages through repeated draw/undo and history navigation', async () => {
    const { document, paint, drain } = setupRecording()
    for (let i = 1; i <= 121; i++) { paint(i); await drain() }
    expect(document.timelapse?.snapshots).toHaveLength(61)
    expect(runtimeDiagnosticSnapshot().find((event) => event.name === 'timelapse.compact')?.detail)
      .toMatchObject({ documentId: document.id, reason: 'smart-sampling', beforeFrames: 120, retainedFrames: 60, samplingStride: 2 })
    const earlier = [...document.timelapse!.snapshots]
    // At stride 2 the next stroke is skipped. Undoing it must not delete an
    // older retained frame, which may represent several earlier edits.
    paint(200)
    await drain()
    useWorkspace.getState().undo()
    expect(document.timelapse?.snapshots).toEqual(earlier)
    const session = useWorkspace.getState().sessions[0]
    useWorkspace.getState().setHistoryPosition(session.history.position - 25)
    expect(document.timelapse?.snapshots).toEqual(earlier)
    useWorkspace.getState().setHistoryPosition(session.history.length)
    await drain()
    expect(document.timelapse?.snapshots).toEqual(earlier)
    paint(220)
    await drain()
    expect(document.timelapse?.snapshots.slice(0, earlier.length)).toEqual(earlier)
    expect(decodeProject(encodeProject(document)).timelapse?.snapshots).toEqual(document.timelapse?.snapshots)
  })

  it.each([false, true])('preserves full recordings and respects recordUndoSteps=%s', async (recordUndoSteps) => {
    const { document, paint, drain } = setupRecording('full', recordUndoSteps)
    paint(50); await drain()
    paint(100); await drain()
    const earlier = [...document.timelapse!.snapshots]
    useWorkspace.getState().undo(); await drain()
    expect(document.timelapse?.snapshots.slice(0, 2)).toEqual(earlier)
    expect(document.timelapse?.snapshots).toHaveLength(recordUndoSteps ? 3 : 2)
    if (recordUndoSteps) {
      const frame = decodePng(document.timelapse!.snapshots[2].data, 'undo')
      expect(getActiveLayer(frame).pixels[0]).toBe(50)
    }
    useWorkspace.getState().redo(); await drain()
    expect(document.timelapse?.snapshots).toHaveLength(recordUndoSteps ? 4 : 2)
  })

  it('does not erase previously saved frames when recording is disabled or undo changes only selection', async () => {
    const { document, paint, drain } = setupRecording('full')
    paint(50); await drain()
    const earlier = document.timelapse!.snapshots
    const session = useWorkspace.getState().sessions[0]
    session.history.push({ label: 'selection', bytes: 0, undo: () => {}, redo: () => {}, documentChanged: false, contentChanged: false })
    useWorkspace.getState().undo()
    expect(document.timelapse?.snapshots).toBe(earlier)
    useWorkspace.getState().setTimelapseSettings({ enabled: false })
    useWorkspace.getState().undo()
    expect(document.timelapse?.snapshots).toBe(earlier)
  })

  it('preserves chronological frames when undo happens before queued PNGs finish', async () => {
    const { document, paint, drain } = setupRecording('full')
    paint(50)
    paint(100)
    useWorkspace.getState().undo()
    await drain()
    expect(document.timelapse?.snapshots).toHaveLength(2)
    expect(document.timelapse!.snapshots.map((snapshot) => getActiveLayer(decodePng(snapshot.data, 'queued')).pixels[0])).toEqual([50, 100])
  })
})
