import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, readLayerPacked, DocumentCompositeCache, compositeRegion } from '@/core/document'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { DocumentSession } from './workspace-types'
import { configureLocalHistory, flushLocalHistoryPersist, persistLocalHistory, recordLocalHistoryChange, restoreLocalHistory } from './local-history-service'
import * as projectFormat from '@/core/project-format'
import { beginPixelEdit, commitPixelEdit, HistoryStack, recordPixel } from '@/core/history'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import * as historyWorker from '@/core/local-history-worker'
import { unpackLocalHistorySnapshots, type ArchivedHistorySnapshot } from '@/core/local-history-archive'
import { surfacePixelsMaterialized, readSurfacePackedLocal } from '@/core/runtime-raster'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const sessionWithLocalHistory = (): DocumentSession => {
  const document = createDocument('local history', 4, 4, 'rgba')
  return {
    document,
    revision: 0,
    contentRevision: 0,
    layersPanelRevision: 0,
    history: new HistoryStack(),
    localHistory: { snapshots: [structuredClone(document)], labels: [], position: 0 }
  } as unknown as DocumentSession
}

describe('local history snapshots', () => {
  it('preserves the saved recording when restoring a history with only a baseline snapshot', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/recording-baseline.moonsprite'
    let archive = new Uint8Array()
    const api = {
      writeLocalHistory: vi.fn(async (_key: string, data: Uint8Array) => { archive = data.slice() }),
      readLocalHistory: vi.fn(async () => archive)
    } as unknown as MoonSpriteApi
    await flushLocalHistoryPersist(api, source)
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    const recording = reopened.document.timelapse!
    recording.enabled = true
    recording.snapshots = [{ id: 'saved-frame', capturedAt: 1, elapsedMs: 0, width: 1, height: 1, data: new Uint8Array([1, 2, 3]) }]

    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    expect(reopened.document.timelapse).toBe(recording)
    expect(reopened.document.timelapse?.snapshots).toHaveLength(1)
  })

  it.each(['rgba', 'indexed'] as const)('records %s drawing changes without cloning a document and restores navigation/branches', async mode => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document = createDocument('journal', 64, 64, mode)
    source.document.filePath = `D:/history/journal-${mode}.moonsprite`
    source.localHistory = null
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, bytes: Uint8Array) => { archive = bytes.slice() }, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    configureLocalHistory(source, api)
    const paint = (session: DocumentSession, value: number) => {
      const layer = getActiveLayer(session.document), edit = beginPixelEdit(layer.id)
      for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) recordPixel(session.document, layer, edit, y * layer.width + x, value)
      const entry = commitPixelEdit(session.document, edit, 'paint', true)!
      const cloning = vi.spyOn(globalThis, 'structuredClone')
      session.history.push(entry)
      expect(cloning).not.toHaveBeenCalled()
      cloning.mockRestore()
      expect(session.localHistory!.snapshots.at(-1)).toHaveProperty('base')
    }
    const first = mode === 'rgba' ? 0xff112233 : 1, second = mode === 'rgba' ? 0xff445566 : 2
    paint(source, first); paint(source, second)
    source.history.undo()
    const encode = vi.spyOn(projectFormat, 'encodeProjectAsync')
    await flushLocalHistoryPersist(api, source)
    expect(encode).toHaveBeenCalledTimes(1)
    const manifest = JSON.parse(strFromU8(unzipSync(archive)['manifest.json']))
    expect(manifest.snapshotDeltas).toEqual([false, true, true])
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    const recording = reopened.document.timelapse
    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    expect(reopened.document.timelapse).toBe(recording)
    const value = () => readLayerPacked(reopened.document, getActiveLayer(reopened.document), 8 * 64 + 8)
    expect(value()).toBe(first)
    reopened.history.redo(); expect(value()).toBe(second)
    reopened.history.undo(); reopened.history.undo(); expect(value()).toBe(0)
    reopened.history.redo(); paint(reopened, second)
    expect(reopened.history.canRedo).toBe(false)
    await flushLocalHistoryPersist(api, reopened)
    expect(encode).toHaveBeenCalledTimes(1)
  })

  it('disables recording and file writes when the preference is off', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: false })
    const source = sessionWithLocalHistory(), write = vi.fn()
    const api = { writeLocalHistory: write } as unknown as MoonSpriteApi
    configureLocalHistory(source, api)
    const edit = beginPixelEdit(source.document.layers[0].id)
    recordPixel(source.document, source.document.layers[0], edit, 0, 0xff112233)
    source.history.push(commitPixelEdit(source.document, edit, 'paint')!)
    source.history.undo(); source.history.redo()
    await flushLocalHistoryPersist(api, source)
    expect(source.localHistory).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it('checkpoints a trimmed journal and releases its discarded prefix without changing undo', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/checkpoint.moonsprite'
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, bytes: Uint8Array) => { archive = bytes.slice() }, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    for (let index = 1; index <= 3; index++) {
      const layer = getActiveLayer(source.document), edit = beginPixelEdit(layer.id)
      recordPixel(source.document, layer, edit, 0, 0xff000000 + index)
      recordLocalHistoryChange(source, { kind: 'push', entry: commitPixelEdit(source.document, edit, 'paint', true)!, discardedUndoEntries: index === 3 ? 1 : 0 })
    }
    expect(source.localHistory!.snapshots[0]).toHaveProperty('base')
    await flushLocalHistoryPersist(api, source)
    expect(source.localHistory!.snapshots[0]).toHaveProperty('archive')
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    await restoreLocalHistory(api, reopened)
    reopened.history.undo(); reopened.history.undo()
    expect(readLayerPacked(reopened.document, getActiveLayer(reopened.document), 0)).toBe(0xff000001)
    reopened.history.redo(); reopened.history.redo()
    expect(readLayerPacked(reopened.document, getActiveLayer(reopened.document), 0)).toBe(0xff000003)
    await flushLocalHistoryPersist(api, reopened)
  })

  it('closes an unchanged reopened history without packing or writing it again', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/unchanged-close.moonsprite'
    let archive = new Uint8Array()
    const write = vi.fn(async (_id: string, bytes: Uint8Array) => { archive = bytes.slice() })
    const api = { writeLocalHistory: write, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    await persistLocalHistory(api, source)
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    await restoreLocalHistory(api, reopened)
    const pack = vi.spyOn(historyWorker, 'packLocalHistoryAsync')
    write.mockClear()
    await flushLocalHistoryPersist(api, reopened)
    expect(pack).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('waits for an in-flight write on close without queuing a duplicate archive', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    let release!: () => void, started!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const begun = new Promise<void>(resolve => { started = resolve })
    const write = vi.fn(async () => { started(); await blocked })
    const api = { writeLocalHistory: write } as unknown as MoonSpriteApi
    const saving = persistLocalHistory(api, source)
    await begun
    let closed = false
    const closing = flushLocalHistoryPersist(api, source).then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false)
    release()
    await Promise.all([saving, closing])
    expect(write).toHaveBeenCalledTimes(1)
    await flushLocalHistoryPersist(api, source)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('retries failed writes and persists again when the file path changes', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/retry.moonsprite'
    const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const api = { writeLocalHistory: write } as unknown as MoonSpriteApi
    await expect(persistLocalHistory(api, source)).rejects.toThrow('disk full')
    await flushLocalHistoryPersist(api, source)
    expect(write).toHaveBeenCalledTimes(2)
    source.document.filePath = 'D:/history/another.moonsprite'
    await flushLocalHistoryPersist(api, source)
    expect(write).toHaveBeenCalledTimes(3)
    expect(write.mock.calls[2][0]).not.toBe(write.mock.calls[1][0])
  })

  it('does not reuse an acknowledgement after another session writes the same path', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const first = sessionWithLocalHistory(), second = sessionWithLocalHistory()
    first.document.filePath = second.document.filePath = 'D:/history/shared-path.moonsprite'
    const write = vi.fn(async () => {})
    const api = { writeLocalHistory: write } as unknown as MoonSpriteApi
    await persistLocalHistory(api, first)
    await persistLocalHistory(api, second)
    await flushLocalHistoryPersist(api, first)
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('records a post-edit snapshot and discards redo snapshots on a new edit', () => {
    const session = sessionWithLocalHistory()
    session.document.name = 'after first edit'
    recordLocalHistoryChange(session, { kind: 'push', entry: { label: 'first', bytes: 1, undo: () => undefined, redo: () => undefined } })
    recordLocalHistoryChange(session, { kind: 'undo' })
    session.document.name = 'replacement edit'
    recordLocalHistoryChange(session, { kind: 'push', entry: { label: 'replacement', bytes: 1, undo: () => undefined, redo: () => undefined } })

    expect(session.localHistory).toMatchObject({ labels: ['replacement'], position: 1 })
    expect(session.localHistory?.snapshots.map((snapshot) => 'archive' in snapshot || 'base' in snapshot ? null : snapshot.name)).toEqual(['local history', 'replacement edit'])
  })

  it('tracks undo and redo without mutating the captured snapshot timeline', () => {
    const session = sessionWithLocalHistory()
    recordLocalHistoryChange(session, { kind: 'push', entry: { label: 'first', bytes: 1, undo: () => undefined, redo: () => undefined } })
    recordLocalHistoryChange(session, { kind: 'undo' })
    expect(session.localHistory?.position).toBe(0)
    recordLocalHistoryChange(session, { kind: 'redo' })
    expect(session.localHistory?.position).toBe(1)
    expect(session.localHistory?.snapshots).toHaveLength(2)
  })

  it('round-trips snapshots through the local-only history archive', async () => {
    localStorage.clear()
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const saved = new Map<string, Uint8Array>()
    const api = {
      writeLocalHistory: async (id: string, data: Uint8Array) => { saved.set(id, data.slice()) },
      readLocalHistory: async (id: string) => {
        const data = saved.get(id)
        if (!data) throw new Error('missing history')
        return data.slice()
      }
    } as MoonSpriteApi
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/MoonSprite/local-history-test.moonsprite'
    source.document.name = 'after edit'
    recordLocalHistoryChange(source, { kind: 'push', entry: { label: 'rename', bytes: 1, undo: () => undefined, redo: () => undefined } })
    await persistLocalHistory(api, source)

    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    const reopenedRuntimeId = reopened.document.id
    await restoreLocalHistory(api, reopened)
    expect(reopened.document.name).toBe('after edit')
    expect(reopened.document.id).toBe(reopenedRuntimeId)
    reopened.history.undo()
    expect(reopened.document.name).toBe('local history')
    await flushLocalHistoryPersist(api, reopened)
    localStorage.clear()
  })

  it('reuses encoded snapshots for navigation, reopening and subsequent saves', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const encode = vi.spyOn(projectFormat, 'encodeProjectAsync')
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, data: Uint8Array) => { archive = data.slice() }, readLocalHistory: async () => archive.slice() } as unknown as MoonSpriteApi
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/cache.moonsprite'
    source.document.name = 'renamed'
    recordLocalHistoryChange(source, { kind: 'push' })
    await persistLocalHistory(api, source)
    expect(encode).toHaveBeenCalledTimes(2)
    recordLocalHistoryChange(source, { kind: 'undo' })
    await persistLocalHistory(api, source)
    expect(encode).toHaveBeenCalledTimes(2)
    expect(JSON.parse(strFromU8(unzipSync(archive)['manifest.json'])).position).toBe(0)
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    const layer = reopened.document.layers[0]
    reopened.history.redo(); expect(reopened.document.name).toBe('renamed')
    reopened.history.undo(); expect(reopened.document.name).toBe('local history')
    expect(reopened.document.layers[0]).toBe(layer)
    await flushLocalHistoryPersist(api, reopened)
    expect(encode).toHaveBeenCalledTimes(2)
    // A new branch encodes only its new snapshot, retaining the baseline archive.
    reopened.document.name = 'new branch'
    reopened.history.push({ label: 'new', bytes: 32, undo: () => {}, redo: () => {} })
    await flushLocalHistoryPersist(api, reopened)
    expect(encode).toHaveBeenCalledTimes(3)
  })

  it('serializes overlapping writes so an older save cannot overwrite a newer position', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/queue.moonsprite'
    recordLocalHistoryChange(source, { kind: 'push' })
    let release!: () => void, started!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const firstStarted = new Promise<void>(resolve => { started = resolve })
    const positions: number[] = []
    const api = { writeLocalHistory: async (_id: string, data: Uint8Array) => {
      positions.push(JSON.parse(strFromU8(unzipSync(data)['manifest.json'])).position)
      if (positions.length === 1) { started(); await blocked }
    } } as unknown as MoonSpriteApi
    const first = persistLocalHistory(api, source)
    await firstStarted
    recordLocalHistoryChange(source, { kind: 'undo' })
    const second = persistLocalHistory(api, source)
    expect(positions).toEqual([1])
    release(); await Promise.all([first, second])
    expect(positions).toEqual([1, 0])
  })

  it('does not overwrite a live edit made while local history is loading', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/loading.moonsprite'
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, data: Uint8Array) => { archive = data.slice() }, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    await persistLocalHistory(api, source)
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    const loading = restoreLocalHistory(api, reopened)
    reopened.document.name = 'new live edit'
    reopened.history.push({ label: 'live', bytes: 32, undo: () => {}, redo: () => {} })
    expect(await loading).toBe(false)
    expect(reopened.document.name).toBe('new live edit')
    expect(reopened.history.position).toBe(1)
  })

  it('opens a cached timeline by decoding only its current snapshot and never recompiles it', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/open-cache.moonsprite'
    for (let index = 0; index < 12; index++) {
      source.document.name = `edit-${index}`
      recordLocalHistoryChange(source, { kind: 'push' })
    }
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, data: Uint8Array) => { archive = data.slice() }, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    await persistLocalHistory(api, source)
    const decode = vi.spyOn(projectFormat, 'decodeProject')
    const prepare = vi.spyOn(historyWorker, 'packLocalHistoryAsync')
    const reopened = sessionWithLocalHistory()
    reopened.document.filePath = source.document.filePath
    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(prepare).not.toHaveBeenCalled()
    expect(reopened.localHistory!.snapshots.every(snapshot => 'archive' in snapshot)).toBe(true)
    for (let index = 0; index < 12; index++) reopened.history.undo()
    expect(reopened.document.name).toBe('local history')
    for (let index = 0; index < 12; index++) reopened.history.redo()
    expect(reopened.document.name).toBe('edit-11')
    expect(decode).toHaveBeenCalledTimes(1)
    await flushLocalHistoryPersist(api, reopened)
  })

  it('migrates a version 2 archive without a delta cache and persists the result for the next opening', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document.filePath = 'D:/history/legacy.moonsprite'
    source.document.name = 'legacy edit'; recordLocalHistoryChange(source, { kind: 'push' })
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, data: Uint8Array) => { archive = data.slice() }, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    await persistLocalHistory(api, source)
    const files = unzipSync(archive), manifest = JSON.parse(strFromU8(files['manifest.json']))
    const snapshots = unpackLocalHistorySnapshots(files, manifest) as ArchivedHistorySnapshot[]
    snapshots.forEach((snapshot, index) => { files[`snapshots/${index}.moonsprite`] = snapshot.archive.slice() })
    manifest.version = 2
    delete manifest.snapshotChunks; delete manifest.chunkLengths; delete files['snapshots.bin']
    delete manifest.deltaVersion; delete manifest.deltas
    files['manifest.json'] = strToU8(JSON.stringify(manifest))
    archive = zipSync(files)
    const prepare = vi.spyOn(historyWorker, 'packLocalHistoryAsync')
    const reopened = sessionWithLocalHistory(); reopened.document.filePath = source.document.filePath
    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    expect(prepare).toHaveBeenCalledTimes(1)
    reopened.history.undo(); expect(reopened.document.name).toBe('local history')
    await flushLocalHistoryPersist(api, reopened)
    expect(JSON.parse(strFromU8(unzipSync(archive)['manifest.json'])).deltaVersion).toBe(1)
  })

  it('keeps sparse layers lazy when restoring the current snapshot and when persisting it again', async () => {
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
    const source = sessionWithLocalHistory()
    source.document = createDocument('sparse', 2000, 2000, 'rgba')
    source.document.filePath = 'D:/history/sparse-open.moonsprite'
    source.document.layers[0].pixels[3] = 255
    source.document.layers[0].pixels[source.document.layers[0].pixels.length - 1] = 255
    // Use an actual archive as the reopening fixture. Browser worker transfers
    // rehome typed arrays; Node's structuredClone/JSDOM fallback does not.
    source.localHistory = { snapshots: [{ archive: projectFormat.encodeProject(source.document) }], labels: [], position: 0 }
    let archive = new Uint8Array()
    const api = { writeLocalHistory: async (_id: string, data: Uint8Array) => { archive = data.slice() }, readLocalHistory: async () => archive } as unknown as MoonSpriteApi
    await persistLocalHistory(api, source)
    const reopened = sessionWithLocalHistory()
    reopened.document = projectFormat.decodeProject(projectFormat.encodeProject(source.document))
    reopened.document.filePath = source.document.filePath
    reopened.revision = reopened.contentRevision = reopened.layersPanelRevision = 0
    // openPath exposes the session while the history file is still loading.
    const cache = new DocumentCompositeCache()
    const oldLayers = cache.renderLayersFor(reopened.document, reopened.contentRevision)
    const wasDirty = reopened.document.dirty
    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    expect(reopened.contentInvalidation).toEqual({ kind: 'full', fromRevision: 0, revision: 1 })
    expect(reopened.revision).toBe(1)
    expect(reopened.layersPanelRevision).toBe(1)
    expect(reopened.document.dirty).toBe(wasDirty)
    expect(reopened.history.position).toBe(0)
    expect(surfacePixelsMaterialized(reopened.document.layers[0])).toBe(false)
    expect(readSurfacePackedLocal(reopened.document.layers[0], 0, 0)).toBe(0xff000000)
    await flushLocalHistoryPersist(api, reopened)
    expect(surfacePixelsMaterialized(reopened.document.layers[0])).toBe(false)
    const layer = reopened.document.layers[0]
    const cel = reopened.document.animation!.cels.find(cel => cel.layerId === layer.id && cel.frameId === reopened.document.animation!.activeFrameId)!
    const edit = beginPixelEdit(layer.id)
    recordPixel(reopened.document, layer, edit, 0, 0)
    recordPixel(reopened.document, layer, edit, 1, 0xff112233)
    // The held first stroke must be visible through the active frame before commit.
    expect(readSurfacePackedLocal(cel.surface!, 0, 0)).toBe(0)
    expect(readSurfacePackedLocal(cel.surface!, 1, 0)).toBe(0xff112233)
    const renderedLayers = cache.renderLayersFor(reopened.document, reopened.contentRevision)!
    expect(renderedLayers === oldLayers).toBe(false)
    expect(readSurfacePackedLocal(renderedLayers[0], 0, 0)).toBe(0)
    expect(readSurfacePackedLocal(renderedLayers[0], 1, 0)).toBe(0xff112233)
    const pixels = compositeRegion(reopened.document, 0, 0, 2, 1, cache, reopened.contentRevision)
    expect(Array.from(pixels)).toEqual([0, 0, 0, 0, 0x33, 0x22, 0x11, 0xff])
  })
})
