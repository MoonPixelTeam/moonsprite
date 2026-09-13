import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types'
import { unzipSync, zipSync } from 'fflate'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import { decodeProject } from '@/core/project-format'
import * as timelapse from '@/core/timelapse'
import { configureRuntimeDiagnostics, resetRuntimeDiagnosticsForTests, runtimeDiagnosticSnapshot } from '@/core/runtime-diagnostics'
import { useWorkspace } from './workspace'

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
