import { strFromU8, unzip } from 'fflate'
import type { MoonSpriteApi, SpriteDocument } from '@shared/types'
import { decodeProject, encodeProjectAsync } from '@/core/project-format'
import { HistoryStack, type HistoryEntry, type HistoryStackChange } from '@/core/history'
import { captureCommittedHistoryDelta, cloneHistoryDocument, historyDocumentTransferView, hydrateLocalHistoryDelta, historyDocumentBytes } from '@/core/local-history-delta'
import { decodeHistoryDelta, materializeLocalHistorySnapshot, unpackLocalHistorySnapshots, type LocalHistoryManifest, type LocalHistorySnapshot } from '@/core/local-history-archive'
import { packLocalHistoryAsync } from '@/core/local-history-worker'
import { getLayerStorageOrigin, setLayerStorageOrigin } from '@/core/document'
import { loadEditorPreferences } from '@/core/file-preferences'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import type { DocumentSession } from './workspace-types'
import { invalidateSessionContent } from './workspace-session'

const HISTORY_FORMAT_VERSION = 4

const cloneDocument = cloneHistoryDocument
const encodedSnapshots = new WeakMap<LocalHistorySnapshot, Promise<Uint8Array>>()
const snapshotShapes = new WeakMap<LocalHistorySnapshot, string>()
const documentShape = (document: SpriteDocument): string => JSON.stringify([
  document.width, document.height, document.colorMode, document.palette,
  document.layers.map(layer => [layer.id, layer.kind, layer.format, layer.width, layer.height, layer.offsetX, layer.offsetY, getLayerStorageOrigin(layer)]),
  document.animation?.frames.map(frame => frame.id), document.animation?.cels.map(cel => [cel.id, cel.layerId, cel.frameId])
])
const captureSnapshot = (document: SpriteDocument): LocalHistorySnapshot => {
  const snapshot = cloneDocument(document)
  snapshotShapes.set(snapshot, documentShape(document))
  return snapshot
}
const writeQueues = new Map<string, Promise<void>>()
interface HistoryWrite {
  manifest: LocalHistoryManifest
  snapshots: LocalHistorySnapshot[]
  completion: Promise<void>
}
const sessionWrites = new WeakMap<DocumentSession, HistoryWrite>()
// Weak references avoid retaining closed projects, while another session writing
// the same path invalidates a previously acknowledged timeline.
const latestWrites = new Map<string, WeakRef<HistoryWrite>>()
const sameHistoryWrite = (write: HistoryWrite, manifest: LocalHistoryManifest, snapshots: LocalHistorySnapshot[]): boolean =>
  write.manifest.projectKey === manifest.projectKey && write.manifest.position === manifest.position &&
  write.manifest.labels.length === manifest.labels.length && write.snapshots.length === snapshots.length &&
  manifest.labels.every((label, index) => write.manifest.labels[index] === label) &&
  snapshots.every((snapshot, index) => write.snapshots[index] === snapshot)
const deltaCaches = new WeakMap<LocalHistorySnapshot, WeakMap<LocalHistorySnapshot, Uint8Array | null>>()
const cacheDelta = (before: LocalHistorySnapshot, after: LocalHistorySnapshot, delta: Uint8Array | null): void => {
  let next = deltaCaches.get(before)
  if (!next) { next = new WeakMap(); deltaCaches.set(before, next) }
  next.set(after, delta)
}

const encodeSnapshot = (snapshot: LocalHistorySnapshot): Promise<Uint8Array> => {
  if ('archive' in snapshot) return Promise.resolve(snapshot.archive)
  const cached = encodedSnapshots.get(snapshot)
  if (cached) return cached
  const source = 'base' in snapshot ? materializeLocalHistorySnapshot(snapshot) : snapshot
  const encoded = encodeProjectAsync(historyDocumentTransferView(source), { includePreview: false }).catch(error => {
    encodedSnapshots.delete(snapshot)
    throw error
  })
  encodedSnapshots.set(snapshot, encoded)
  return encoded
}

/**
 * `document.id` is deliberately regenerated every time a project is decoded.
 * The local-history key must therefore be based on its stable source path.
 * Unsaved documents fall back to the in-session id and become persistent after
 * their first normal project save.
 */
const historyId = (document: SpriteDocument): string => {
  const source = (document.filePath || document.sourceFilePath || document.id).trim().toLocaleLowerCase()
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `project-${(hash >>> 0).toString(36)}`
}

const clampPosition = (position: number, labels: readonly string[]): number => Math.max(0, Math.min(labels.length, Math.trunc(position)))

const trimSnapshots = (session: DocumentSession): void => {
  const state = session.localHistory
  if (!state) return
  const limit = loadEditorPreferences().localHistoryLimit
  while (state.labels.length > limit) {
    state.labels.shift()
    state.snapshots.shift()
    state.position = Math.max(0, state.position - 1)
  }
}

/** Starts or stops recording a session according to the current preference. */
export const configureLocalHistory = (session: DocumentSession, api: MoonSpriteApi): void => {
  if (!loadEditorPreferences().localHistoryEnabled) {
    session.localHistory = null
    session.history.setChangeListener(null)
    return
  }
  if (!session.localHistory) {
    const started = performance.now()
    session.localHistory = { snapshots: [captureSnapshot(session.document)], labels: [], position: 0 }
    if (runtimeDiagnosticsActive()) recordRuntimeDiagnostic('operation-stage', 'local-history.baseline', { durationMs: Math.round((performance.now() - started) * 10) / 10, width: session.document.width, height: session.document.height, layers: session.document.layers.length })
  }
  session.history.setChangeListener((change) => {
    recordLocalHistoryChange(session, change)
    scheduleLocalHistoryPersist(api, session)
  })
}

export const recordLocalHistoryChange = (session: DocumentSession, change: HistoryStackChange): void => {
  const state = session.localHistory
  if (!state) return
  switch (change.kind) {
    case 'push': {
      const base = state.snapshots[state.position]
      const shape = documentShape(session.document)
      const previousShape = snapshotShapes.get(base) ?? (!('archive' in base) && !('base' in base) ? documentShape(base) : undefined)
      const delta = loadEditorPreferences().localHistoryEnabled && change.entry && previousShape === shape
        ? captureCommittedHistoryDelta(session.document, change.entry) : null
      state.snapshots.splice(state.position + 1)
      state.labels.splice(state.position)
      const snapshot: LocalHistorySnapshot = delta ? { base, delta } : captureSnapshot(session.document)
      snapshotShapes.set(snapshot, shape)
      state.snapshots.push(snapshot)
      state.labels.push(change.entry?.label ?? '编辑')
      state.position = state.labels.length
      const discarded = change.discardedUndoEntries ?? 0
      if (discarded > 0) {
        state.snapshots.splice(0, discarded)
        state.labels.splice(0, discarded)
        state.position = Math.max(0, state.position - discarded)
      }
      trimSnapshots(session)
      break
    }
    case 'undo': state.position = Math.max(0, state.position - 1); break
    case 'redo': state.position = Math.min(state.labels.length, state.position + 1); break
    case 'clear': session.localHistory = { snapshots: [captureSnapshot(session.document)], labels: [], position: 0 }; break
  }
  if (change.kind === 'undo' || change.kind === 'redo') snapshotShapes.set(state.snapshots[state.position], documentShape(session.document))
}

const pendingWrites = new Map<string, number>()

export const scheduleLocalHistoryPersist = (api: MoonSpriteApi, session: DocumentSession): void => {
  const id = historyId(session.document)
  const prior = pendingWrites.get(id)
  if (prior !== undefined) window.clearTimeout(prior)
  pendingWrites.set(id, window.setTimeout(() => {
    pendingWrites.delete(id)
    void persistLocalHistory(api, session).catch((error) => console.error('MoonSprite local history save failed', error))
  }, 750))
}

/** Flushes a pending debounced write before the session is removed. */
export const flushLocalHistoryPersist = async (api: MoonSpriteApi, session: DocumentSession): Promise<void> => {
  const id = historyId(session.document)
  const pending = pendingWrites.get(id)
  if (pending !== undefined) {
    window.clearTimeout(pending)
    pendingWrites.delete(id)
  }
  await persistLocalHistory(api, session)
}

export const persistLocalHistory = async (api: MoonSpriteApi, session: DocumentSession): Promise<void> => {
  const state = session.localHistory
  if (!loadEditorPreferences().localHistoryEnabled || !state) return
  const manifest: LocalHistoryManifest = {
    version: HISTORY_FORMAT_VERSION,
    projectKey: historyId(session.document),
    labels: [...state.labels],
    position: clampPosition(state.position, state.labels)
  }
  // Capture an immutable generation before any await. Edits may trim/branch the
  // live timeline while the previous write is still running.
  const snapshots = [...state.snapshots]
  const id = manifest.projectKey
  const known = sessionWrites.get(session)
  if (known && latestWrites.get(id)?.deref() === known && sameHistoryWrite(known, manifest, snapshots)) {
    await known.completion
    return
  }
  const previous = writeQueues.get(id)
  const write = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
    const archives: Uint8Array[] = []
    const incrementalDeltas = snapshots.map((snapshot, index) => index > 0 && 'base' in snapshot && snapshot.base === snapshots[index - 1] ? snapshot.delta : null)
    for (let index = 0; index < snapshots.length; index++) {
      archives.push(incrementalDeltas[index] ? new Uint8Array() : await encodeSnapshot(snapshots[index]))
    }
    const packed = await packLocalHistoryAsync({ manifest, snapshots: archives, incrementalDeltas, cachedDeltas: manifest.labels.map((_, index) => deltaCaches.get(snapshots[index])?.get(snapshots[index + 1])) })
    packed.deltas.forEach((delta, index) => cacheDelta(snapshots[index], snapshots[index + 1], delta))
    await api.writeLocalHistory(id, packed.archive)
    // Once trimming advances into a journal, its first state is encoded as a
    // checkpoint. Rebase the live chain so discarded strokes can be collected.
    const live = session.localHistory
    if ('base' in snapshots[0] && live?.snapshots[0] === snapshots[0]) {
      const replacements = new Map<LocalHistorySnapshot, LocalHistorySnapshot>([[snapshots[0], { archive: archives[0] }]])
      const old = live.snapshots
      const rebased = old.map(snapshot => {
        const next = replacements.get(snapshot) ?? ('base' in snapshot && replacements.has(snapshot.base)
          ? { base: replacements.get(snapshot.base)!, delta: snapshot.delta } : snapshot)
        replacements.set(snapshot, next)
        const shape = snapshotShapes.get(snapshot)
        if (shape) snapshotShapes.set(next, shape)
        return next
      })
      for (let index = 0; index + 1 < old.length; index++) {
        const cached = deltaCaches.get(old[index])?.get(old[index + 1])
        if (cached !== undefined) cacheDelta(rebased[index], rebased[index + 1], cached)
      }
      live.snapshots = rebased
      record.snapshots = record.snapshots.map(snapshot => replacements.get(snapshot) ?? snapshot)
    }
  })
  const record: HistoryWrite = { manifest, snapshots, completion: write }
  sessionWrites.set(session, record)
  latestWrites.set(id, new WeakRef(record))
  writeQueues.set(id, write)
  try { await write } catch (error) {
    if (sessionWrites.get(session) === record) sessionWrites.delete(session)
    if (latestWrites.get(id)?.deref() === record) latestWrites.delete(id)
    throw error
  } finally { if (writeQueues.get(id) === write) writeQueues.delete(id) }
}

const replaceDocument = (target: SpriteDocument, source: SpriteDocument): void => {
  const runtimeIdentity = {
    id: target.id,
    filePath: target.filePath,
    sourceFilePath: target.sourceFilePath
  }
  const targetRecord = target as unknown as Record<string, unknown>
  for (const key of Object.keys(targetRecord)) delete targetRecord[key]
  Object.assign(targetRecord, cloneDocument(source), runtimeIdentity)
  target.layers.forEach((layer, index) => setLayerStorageOrigin(layer, getLayerStorageOrigin(source.layers[index])))
}

/** Restores local snapshots to a fresh runtime HistoryStack after a project reopens. */
export const restoreLocalHistory = async (api: MoonSpriteApi, session: DocumentSession): Promise<boolean> => {
  if (!loadEditorPreferences().localHistoryEnabled) return false
  const restoreStarted = performance.now()
  const initialDocument = session.document, initialRevision = session.revision, initialHistory = session.history, initialHistoryRevision = session.history?.revision
  let archive: Uint8Array
  try {
    archive = await api.readLocalHistory(historyId(session.document))
  } catch {
    configureLocalHistory(session, api)
    return false
  }
  const readCompleted = performance.now()
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(archive, (error, result) => error ? reject(error) : resolve(result)))
  const unzipCompleted = performance.now()
  const manifestData = files['manifest.json']
  if (!manifestData) throw new Error('本地历史数据缺少索引')
  const manifest = JSON.parse(strFromU8(manifestData)) as LocalHistoryManifest
  if (![2, 3, HISTORY_FORMAT_VERSION].includes(manifest.version) || manifest.projectKey !== historyId(session.document) || !Array.isArray(manifest.labels)) {
    throw new Error('本地历史数据版本不兼容')
  }
  const snapshots = unpackLocalHistorySnapshots(files, manifest)
  const hasCache = manifest.deltaVersion === 1 && manifest.deltas?.length === manifest.labels.length
  let deltas: Array<Uint8Array | null>
  if (hasCache) {
    deltas = manifest.deltas!.map((present, index) => {
      if (!present) return null
      const delta = files[`deltas/${index}.zip`]
      if (!delta) throw new Error('本地历史差分数据不完整')
      return delta
    })
  } else {
    // Migrate legacy snapshots once, off the UI thread. Subsequent saves retain
    // these compiled deltas, so reopening no longer decodes the whole timeline.
    const prepared = await packLocalHistoryAsync({ manifest, snapshots: snapshots.map(snapshot => (snapshot as { archive: Uint8Array }).archive), cachedDeltas: [] })
    deltas = prepared.deltas
  }
  deltas.forEach((delta, index) => cacheDelta(snapshots[index], snapshots[index + 1], delta))
  const position = clampPosition(manifest.position, manifest.labels)
  const structuralSnapshots = new Map<number, SpriteDocument>()
  const decodeSnapshot = (index: number): SpriteDocument => {
    const existing = structuralSnapshots.get(index)
    if (existing) return existing
    const source = snapshots[index]
    const snapshot = 'archive' in source ? decodeProject(source.archive) : materializeLocalHistorySnapshot(source)
    structuralSnapshots.set(index, snapshot)
    return snapshot
  }
  const restoredStack = new HistoryStack()
  const entries: HistoryEntry[] = []
  for (let index = 0; index < manifest.labels.length; index++) {
    const cached = deltas[index]
    if (cached) {
      const delta = decodeHistoryDelta(cached)
      delta.label = manifest.labels[index]
      entries.push(hydrateLocalHistoryDelta(session.document, delta))
    } else {
      // Structural operations still prepare their snapshots before becoming
      // available: do not move decoding delays onto the first undo operation.
      const before = decodeSnapshot(index), after = decodeSnapshot(index + 1)
      entries.push({ label: manifest.labels[index], bytes: historyDocumentBytes(before) + historyDocumentBytes(after), undo: () => replaceDocument(session.document, before), redo: () => replaceDocument(session.document, after), invalidation: { kind: 'full' }, requiresAnimationSync: true, requiresAnimationSelectionNormalization: true })
      await new Promise<void>(resolve => window.setTimeout(resolve, 0))
    }
  }
  const current = decodeSnapshot(position)
  // A drawing journal changes pixels, not the independently saved recording.
  const recording = manifest.snapshotDeltas?.some(Boolean) ? { timelapse: session.document.timelapse } : null
  const prepareCompleted = performance.now()
  // The session is already visible while history loads. Never overwrite an edit
  // or a new history stack that arrived during asynchronous preparation.
  if (session.document !== initialDocument || session.revision !== initialRevision || session.history !== initialHistory || session.history?.revision !== initialHistoryRevision) return false
  replaceDocument(session.document, recording ? { ...current, timelapse: undefined } : current)
  if (recording) session.document.timelapse = recording.timelapse
  // The session can already have render plans and point samplers referring to
  // the pre-restore layers. Replace their generation before the first live edit,
  // without marking the saved document dirty or adding an undo entry.
  invalidateSessionContent(session)
  restoredStack.restoreTimeline(entries, position)
  session.history = restoredStack
  session.localHistory = { snapshots, labels: [...manifest.labels], position }
  snapshotShapes.set(snapshots[position], documentShape(session.document))
  if (hasCache && !writeQueues.has(manifest.projectKey)) {
    const record: HistoryWrite = { manifest: { ...manifest, position }, snapshots: [...snapshots], completion: Promise.resolve() }
    sessionWrites.set(session, record)
    latestWrites.set(manifest.projectKey, new WeakRef(record))
  }
  configureLocalHistory(session, api)
  if (!hasCache) scheduleLocalHistoryPersist(api, session)
  if (runtimeDiagnosticsActive()) recordRuntimeDiagnostic('operation-stage', 'local-history.restore', {
    durationMs: Math.round((performance.now() - restoreStarted) * 10) / 10,
    archiveBytes: archive.byteLength,
    readMs: Math.round((readCompleted - restoreStarted) * 10) / 10,
    unzipMs: Math.round((unzipCompleted - readCompleted) * 10) / 10,
    prepareMs: Math.round((prepareCompleted - unzipCompleted) * 10) / 10,
    installMs: Math.round((performance.now() - prepareCompleted) * 10) / 10,
    cacheHit: hasCache,
    historyEntries: entries.length,
    snapshots: snapshots.length,
    decodedSnapshots: structuralSnapshots.size,
    deltaEntries: deltas.filter(Boolean).length,
    width: session.document.width,
    height: session.document.height
  })
  return true
}
