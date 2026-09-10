import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import type { MoonSpriteApi } from '@shared/types'
import type { DocumentSession } from './workspace-types'
import { flushLocalHistoryPersist, persistLocalHistory, recordLocalHistoryChange, restoreLocalHistory } from './local-history-service'
import * as projectFormat from '@/core/project-format'
import { HistoryStack } from '@/core/history'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import * as historyWorker from '@/core/local-history-worker'
import { surfacePixelsMaterialized, readSurfacePackedLocal } from '@/core/runtime-raster'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const sessionWithLocalHistory = (): DocumentSession => {
  const document = createDocument('local history', 4, 4, 'rgba')
  return {
    document,
    history: new HistoryStack(),
    localHistory: { snapshots: [structuredClone(document)], labels: [], position: 0 }
  } as unknown as DocumentSession
}

describe('local history snapshots', () => {
  it('records a post-edit snapshot and discards redo snapshots on a new edit', () => {
    const session = sessionWithLocalHistory()
    session.document.name = 'after first edit'
    recordLocalHistoryChange(session, { kind: 'push', entry: { label: 'first', bytes: 1, undo: () => undefined, redo: () => undefined } })
    recordLocalHistoryChange(session, { kind: 'undo' })
    session.document.name = 'replacement edit'
    recordLocalHistoryChange(session, { kind: 'push', entry: { label: 'replacement', bytes: 1, undo: () => undefined, redo: () => undefined } })

    expect(session.localHistory).toMatchObject({ labels: ['replacement'], position: 1 })
    expect(session.localHistory?.snapshots.map((snapshot) => 'archive' in snapshot ? null : snapshot.name)).toEqual(['local history', 'replacement edit'])
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
    const reopened = sessionWithLocalHistory(); reopened.document.filePath = source.document.filePath
    expect(await restoreLocalHistory(api, reopened)).toBe(true)
    expect(surfacePixelsMaterialized(reopened.document.layers[0])).toBe(false)
    expect(readSurfacePackedLocal(reopened.document.layers[0], 0, 0)).toBe(0xff000000)
    await flushLocalHistoryPersist(api, reopened)
    expect(surfacePixelsMaterialized(reopened.document.layers[0])).toBe(false)
  })
})
