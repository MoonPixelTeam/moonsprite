import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import type { MoonSpriteApi } from '@shared/types-platform'
import { useWorkspace } from './workspace'
import * as history from './local-history-service'
import * as files from './document-file-service'
import { startDocumentCloseTask, waitForDocumentCloseTasks } from './document-close-tasks'

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: { deleteRecovery: vi.fn(async () => {}) } as unknown as MoonSpriteApi })
  useWorkspace.setState({ sessions: [], activeId: null, dialog: null, message: null, recoveryRecords: [] })
})
afterEach(() => vi.restoreAllMocks())

function openSaved() {
  const document = createDocument('close', 4, 4, 'rgba')
  document.filePath = 'D:/history/close.moonsprite'
  document.dirty = false
  useWorkspace.getState().addSession(document)
  return document
}

it('routes actual workspace drawing into the journal only when enabled', async () => {
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, localHistoryEnabled: true })
  Object.assign(window.moonSprite, { writeLocalHistory: vi.fn(async () => {}) })
  const document = openSaved(), layer = document.layers[0]
  const edit = beginPixelEdit(layer.id)
  recordPixel(document, layer, edit, 0, 0xff112233)
  useWorkspace.getState().commitPixelEdit(edit, 'paint')
  const session = useWorkspace.getState().sessions[0]
  expect(session.localHistory!.snapshots.at(-1)).toHaveProperty('base')
  await history.flushLocalHistoryPersist(window.moonSprite, session)
})

it('removes the tab before history completes, while exit still waits for persistence', async () => {
  const document = openSaved(), saved = deferred()
  const flush = vi.spyOn(history, 'flushLocalHistoryPersist').mockReturnValue(saved.promise)
  await useWorkspace.getState().closeDocument(document.id)
  expect(useWorkspace.getState().sessions).toHaveLength(0)
  expect(flush).toHaveBeenCalledTimes(1)
  let exited = false
  const exit = waitForDocumentCloseTasks().then(() => { exited = true })
  await Promise.resolve()
  expect(exited).toBe(false)
  saved.resolve()
  await exit
  expect(window.moonSprite.deleteRecovery).toHaveBeenCalledWith(document.id)
})

it('waits before reading a project whose previous tab is still writing', async () => {
  const document = openSaved(), saved = deferred()
  vi.spyOn(history, 'flushLocalHistoryPersist').mockReturnValue(saved.promise)
  const read = vi.spyOn(files, 'openDocumentFile').mockResolvedValue(createDocument('reopened', 4, 4, 'rgba'))
  vi.spyOn(history, 'restoreLocalHistory').mockResolvedValue(false)
  await useWorkspace.getState().closeDocument(document.id)
  const opening = useWorkspace.getState().openPath('d:\\history\\close.moonsprite')
  await Promise.resolve()
  expect(read).not.toHaveBeenCalled()
  saved.resolve()
  expect(await opening).toBe(true)
  expect(read).toHaveBeenCalledTimes(1)
})

it('restores the session with its history and reports failure instead of silently dropping it', async () => {
  const document = openSaved(), saved = deferred()
  const session = useWorkspace.getState().sessions[0]
  const recoverySuppressed = session.recoverySuppressed
  vi.spyOn(history, 'flushLocalHistoryPersist').mockReturnValue(saved.promise)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await useWorkspace.getState().closeDocument(document.id)
  const exit = expect(waitForDocumentCloseTasks()).rejects.toThrow('disk full')
  saved.reject(new Error('disk full'))
  await exit
  expect(useWorkspace.getState().sessions[0]).toBe(session)
  expect(session.recoverySuppressed).toBe(recoverySuppressed)
  expect(useWorkspace.getState().message).toContain('disk full')
  expect(window.moonSprite.deleteRecovery).not.toHaveBeenCalled()
})

it('keeps the dirty tab when closing is canceled', async () => {
  const document = openSaved()
  document.dirty = true
  vi.spyOn(useWorkspace.getState(), 'requestDialog').mockResolvedValue('cancel')
  const flush = vi.spyOn(history, 'flushLocalHistoryPersist')
  await useWorkspace.getState().closeDocument(document.id)
  expect(useWorkspace.getState().sessions).toHaveLength(1)
  expect(flush).not.toHaveBeenCalled()
})

it.each([true, false])('keeps a tab open until its pending save settles (success: %s)', async succeeds => {
  const document = openSaved(), writing = deferred()
  document.dirty = true
  vi.spyOn(history, 'flushLocalHistoryPersist').mockResolvedValue(undefined)
  const requestChoice = vi.spyOn(useWorkspace.getState(), 'requestDialog').mockResolvedValue('discard')
  const write = vi.spyOn(files, 'saveDocumentFile').mockImplementation(async () => {
    await writing.promise
    if (!succeeds) throw new Error('disk full')
    return { filePath: document.filePath!, revision: useWorkspace.getState().sessions[0].contentRevision, setDocumentFilePath: true }
  })
  const save = useWorkspace.getState().saveActive()
  // Close immediately, including the recording flush before the file write starts.
  const close = useWorkspace.getState().closeDocument(document.id)
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(useWorkspace.getState().sessions).toHaveLength(1)
  expect(requestChoice).not.toHaveBeenCalled()
  writing.resolve()
  expect(await save).toBe(succeeds)
  await close
  await waitForDocumentCloseTasks()
  expect(useWorkspace.getState().sessions).toHaveLength(succeeds ? 0 : 1)
  expect(requestChoice).not.toHaveBeenCalled()
  if (!succeeds) expect(useWorkspace.getState().message).toBe('disk full')
})

it('includes tabs closed while the exit barrier is already waiting', async () => {
  const first = deferred(), second = deferred()
  const failure = vi.fn()
  startDocumentCloseTask('first', () => first.promise, failure)
  let exited = false
  const exit = waitForDocumentCloseTasks().then(() => { exited = true })
  startDocumentCloseTask('second', () => second.promise, failure)
  first.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(exited).toBe(false)
  second.resolve()
  await exit
  expect(failure).not.toHaveBeenCalled()
})
