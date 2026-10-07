import { publishEditorEvent } from '@/core/extension-editor-events'
import type { SpriteDocument } from '@shared/types-document'
import { beginRuntimeDiagnosticOperation, measureRuntimeDiagnostic, recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { documentDiagnosticDetail } from '@/core/document-diagnostics'
import { normalizeProjectStatistics, normalizeTimelapseSettings } from '@/core/project-metadata'
import { commitPreparedTimelapseSnapshot, createTimelapseCaptureCache, prepareTimelapseSnapshot, prepareTimelapseSnapshotAsync, resetTimelapseSmartCapture, type PreparedTimelapseSnapshot, type TimelapseCaptureCache } from '@/core/timelapse'
import { recordUsageDrawingActivity } from '@/platform/usage-statistics'
import type { DocumentSession } from './workspace-types'
import { persistTimelapseFrames } from './timelapse-library-service'

/** A capture is either triggered by an edit or by an undo/redo history step. */
export type TimelapseCaptureKind = 'edit' | 'undo-step'

export function createWorkspaceRecording(onCaptureCommitted: (document: SpriteDocument) => void, onCaptureError?: (message: string) => void) {
const timelapseCaptureCaches = new WeakMap<SpriteDocument, TimelapseCaptureCache>()
const timelapseCaptureTasks = new WeakMap<SpriteDocument, Promise<void>>()
// Small documents finish preparation faster than a timer round trip and are
// also common in deterministic store tests. Keep their historical immediate
// semantics; large canvases take the deferred path below.
const TIMELAPSE_DEFER_SOURCE_BYTES = 4 * 1024 * 1024
const timelapseCaptureGenerations = new WeakMap<SpriteDocument, number>()
// Changes since the current preparation began must be repainted before a
// provisional cache can become a committed frame. Keep only their union.
const preparingRevisions = new WeakMap<SpriteDocument, number>()
const preparationInvalidations = new WeakMap<SpriteDocument, DocumentSession['contentInvalidation']>()
const pendingCounts = new WeakMap<SpriteDocument, number>()
const pendingBytes = new WeakMap<SpriteDocument, number>()
const releaseCaptureBytes = new WeakMap<() => Promise<void>, () => void>()
// A failed encode retains its original pixels and blocks later frames from
// overtaking it. An explicit flush retries once, never a background retry loop.
const failedCaptures = new WeakMap<SpriteDocument, Array<() => Promise<void>>>()
const retryTasks = new WeakMap<SpriteDocument, Promise<void>>()
// Undo-step captures are invalidated on their own so that toggling
// "record undo steps" never discards an in-flight drawing frame.
const timelapseUndoStepGenerations = new WeakMap<SpriteDocument, number>()
const timelapseDiagnosticQueues = new WeakMap<SpriteDocument, { pending: number; peak: number; completed: number; skipped: number; failed: number; maxQueueMs: number; maxEncodeMs: number; lastReportAt: number }>()

const captureCacheFor = (document: SpriteDocument): TimelapseCaptureCache => {
  const cached = timelapseCaptureCaches.get(document)
  if (cached) return cached
  const created = createTimelapseCaptureCache()
  timelapseCaptureCaches.set(document, created)
  return created
}

const queueTimelapseCaptureNow = (session: DocumentSession, kind: TimelapseCaptureKind = 'edit', registerTask = true, preparedSnapshot?: PreparedTimelapseSnapshot): Promise<void> => {
  const document = session.document
  const captureRevision = session.contentRevision
  const captureInvalidation = session.contentInvalidation
  const prepared = preparedSnapshot ?? measureRuntimeDiagnostic('timelapse.prepare', () => prepareTimelapseSnapshot(document, Date.now(), {
    cache: captureCacheFor(document),
    contentRevision: captureRevision,
    contentInvalidation: captureInvalidation
  }), () => ({ ...documentDiagnosticDetail(document), tool: session.tool, contentRevision: captureRevision }))
  if (!prepared) return Promise.resolve()
  // Conservative full-frame budget; do not materialize the lazy tiled snapshot
  // on the drawing thread just to measure its size.
  const preparedBytes = prepared.width * prepared.height * 4
  const queuedBytes = pendingBytes.get(document) ?? 0
  if (queuedBytes + preparedBytes > 64 * 1024 * 1024) {
    if (document.timelapse) document.timelapse.enabled = false
    const error = new Error('缩时录像写入积压，已暂停新帧录制。已有帧已保留，请检查磁盘后重新开启录制。')
    onCaptureError?.(error.message)
    recordRuntimeDiagnostic('error', 'timelapse.backpressure', { documentId: document.id, pendingBytes: queuedBytes })
    onCaptureCommitted(document)
    return Promise.reject(error)
  }
  pendingBytes.set(document, queuedBytes + preparedBytes)
  let released = false
  const releaseBytes = () => {
    if (released) return
    released = true
    pendingBytes.set(document, Math.max(0, (pendingBytes.get(document) ?? 0) - preparedBytes))
  }
  const queuedAt = runtimeDiagnosticsActive() ? performance.now() : null
  let diagnostics = timelapseDiagnosticQueues.get(document)
  if (queuedAt !== null) {
    if (!diagnostics) {
      diagnostics = { pending: 0, peak: 0, completed: 0, skipped: 0, failed: 0, maxQueueMs: 0, maxEncodeMs: 0, lastReportAt: queuedAt }
      timelapseDiagnosticQueues.set(document, diagnostics)
    }
    diagnostics.pending += 1
    diagnostics.peak = Math.max(diagnostics.peak, diagnostics.pending)
  }
  const generation = timelapseCaptureGenerations.get(document) ?? 0
  const undoStepGeneration = timelapseUndoStepGenerations.get(document) ?? 0
  // The delayed wrapper already serializes captures. Keep the original
  // promise chain for direct callers and tests that invoke this helper while
  // allowing the wrapper to reserve the queue slot before the next task runs.
  const previous = registerTask ? (timelapseCaptureTasks.get(document) ?? Promise.resolve()) : Promise.resolve()
  let appended = false
  const commit = async (): Promise<void> => {
    if (appended) { await persistTimelapseFrames(document, window.moonSprite); onCaptureCommitted(document); return }
    const snapshots = document.timelapse?.snapshots
    await commitPreparedTimelapseSnapshot(document, prepared, () => (timelapseCaptureGenerations.get(document) ?? 0) === generation
      && (kind !== 'undo-step' || (timelapseUndoStepGenerations.get(document) ?? 0) === undoStepGeneration))
    appended = document.timelapse?.snapshots !== snapshots
    if (appended) { await persistTimelapseFrames(document, window.moonSprite); onCaptureCommitted(document) }
  }
  releaseCaptureBytes.set(commit, releaseBytes)
  pendingCounts.set(document, (pendingCounts.get(document) ?? 0) + 1)
  let tracked = Promise.resolve()
  tracked = previous.catch(() => undefined).then(async () => {
    const encodingAt = queuedAt !== null ? performance.now() : null
    if (diagnostics && encodingAt !== null && queuedAt !== null) diagnostics.maxQueueMs = Math.max(diagnostics.maxQueueMs, encodingAt - queuedAt)
    const snapshots = document.timelapse?.snapshots
    if (failedCaptures.get(document)?.length) throw new Error('Timelapse capture is waiting for a failed earlier frame')
    await commit()
    const skipped = (timelapseCaptureGenerations.get(document) ?? 0) !== generation || document.timelapse?.snapshots === snapshots
    if (diagnostics && encodingAt !== null) {
      diagnostics.maxEncodeMs = Math.max(diagnostics.maxEncodeMs, performance.now() - encodingAt)
      if (skipped) diagnostics.skipped += 1
      else diagnostics.completed += 1
    }
  }).catch((error) => {
    onCaptureError?.(`缩时录像未能保存：${error instanceof Error ? error.message : String(error)}`)
    const failures = failedCaptures.get(document) ?? []
    failures.push(commit)
    failedCaptures.set(document, failures)
    if (diagnostics) diagnostics.failed += 1
    recordRuntimeDiagnostic('error', 'timelapse.capture', {
      documentId: document.id, contentRevision: captureRevision,
      pending: diagnostics?.pending ?? 0,
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  }).finally(() => {
    if (!failedCaptures.get(document)?.includes(commit)) releaseBytes()
    pendingCounts.set(document, Math.max(0, (pendingCounts.get(document) ?? 1) - 1))
    if (diagnostics && queuedAt !== null) {
      diagnostics.pending -= 1
      const now = performance.now()
      if (now - diagnostics.lastReportAt >= 5000) {
        recordRuntimeDiagnostic('operation-stage', 'timelapse.queue', {
          documentId: document.id, timing: 'async-wall',
          windowMs: Math.round(now - diagnostics.lastReportAt), pending: diagnostics.pending,
          peakPending: diagnostics.peak, completed: diagnostics.completed, skipped: diagnostics.skipped,
          failed: diagnostics.failed, maxQueueMs: Math.round(diagnostics.maxQueueMs), maxEncodeMs: Math.round(diagnostics.maxEncodeMs),
          mode: document.timelapse?.mode ?? 'smart', recordUndoSteps: document.timelapse?.recordUndoSteps === true,
          samplingStride: captureCacheFor(document).smartStride,
          frames: document.timelapse?.snapshots.length ?? 0
        })
        Object.assign(diagnostics, { peak: diagnostics.pending, completed: 0, skipped: 0, failed: 0, maxQueueMs: 0, maxEncodeMs: 0, lastReportAt: now })
      }
    }
    if (registerTask && timelapseCaptureTasks.get(document) === tracked) timelapseCaptureTasks.delete(document)
  })
  if (registerTask) timelapseCaptureTasks.set(document, tracked)
  return tracked
}

/**
 * Reserve the capture queue immediately, but defer snapshot preparation until
 * the current document-record task has yielded. Large-canvas preparation
 * yields between sample batches and freezes tiles before encoding.
 */
const queueTimelapseCapture = (session: DocumentSession, kind: TimelapseCaptureKind = 'edit'): Promise<void> => {
  const document = session.document
  if (document.width * document.height * 4 <= TIMELAPSE_DEFER_SOURCE_BYTES) return queueTimelapseCaptureNow(session, kind)
  const queuedRevision = session.contentRevision
  const cache = captureCacheFor(document)
  const previousInvalidation = preparationInvalidations.get(document)
  const invalidation = session.contentInvalidation
  const expectedFrom = previousInvalidation?.revision ?? preparingRevisions.get(document) ?? cache.revision
  if (previousInvalidation?.revision !== queuedRevision) {
    const rect = invalidation?.kind === 'region' ? invalidation.rect : undefined
    const previousRect = previousInvalidation?.kind === 'region' ? previousInvalidation.rect : undefined
    const continuousRegion = invalidation?.kind === 'region' && rect
      && invalidation.fromRevision === expectedFrom && previousInvalidation?.kind !== 'full'
    preparationInvalidations.set(document, continuousRegion ? {
      kind: 'region', fromRevision: previousInvalidation?.fromRevision ?? invalidation.fromRevision, revision: queuedRevision,
      rect: previousRect ? {
        x: Math.min(previousRect.x, rect.x), y: Math.min(previousRect.y, rect.y),
        width: Math.max(previousRect.x + previousRect.width, rect.x + rect.width) - Math.min(previousRect.x, rect.x),
        height: Math.max(previousRect.y + previousRect.height, rect.y + rect.height) - Math.min(previousRect.y, rect.y)
      } : { ...rect }
    } : { kind: 'full', fromRevision: expectedFrom, revision: queuedRevision })
  }
  const generation = timelapseCaptureGenerations.get(document) ?? 0
  const undoGeneration = timelapseUndoStepGenerations.get(document) ?? 0
  const frameId = document.animation?.activeFrameId
  const shouldContinue = () => session.document === document
    && document.animation?.activeFrameId === frameId
    && (timelapseCaptureGenerations.get(document) ?? 0) === generation
    && (kind !== 'undo-step' || (timelapseUndoStepGenerations.get(document) ?? 0) === undoGeneration)
  const previous = timelapseCaptureTasks.get(document) ?? Promise.resolve()
  let scheduled!: Promise<void>
  scheduled = new Promise<void>((resolve, reject) => {
    globalThis.setTimeout(() => {
      void previous.catch(() => undefined)
        .then(async () => {
          // A later edit may have landed before this timer got a turn. Drop
          // that stale intermediate frame instead of encoding the same latest
          // document twice; the later queue entry owns the current revision.
          if (!shouldContinue() || session.contentRevision !== queuedRevision) return
          const pendingInvalidation = preparationInvalidations.get(document)
          preparationInvalidations.delete(document)
          preparingRevisions.set(document, queuedRevision)
          const diagnostic = runtimeDiagnosticsActive() ? beginRuntimeDiagnosticOperation('timelapse.prepare', {
            documentId: document.id, contentRevision: queuedRevision, timing: 'async-wall'
          }) : null
          let prepared: PreparedTimelapseSnapshot | null
          try {
            prepared = await prepareTimelapseSnapshotAsync(document, Date.now(), {
              cache, contentRevision: queuedRevision,
              contentInvalidation: pendingInvalidation ? { ...pendingInvalidation, fromRevision: cache.revision, revision: queuedRevision } : session.contentInvalidation,
              shouldCommit: shouldContinue
            })
            diagnostic?.finish(prepared && session.contentRevision === queuedRevision ? 'ok' : 'canceled')
          } catch (error) {
            cache.pixels = null
            cache.revision = Number.NaN
            diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
            onCaptureError?.(`缩时录像未能准备：${error instanceof Error ? error.message : String(error)}`)
            throw error
          } finally {
            preparingRevisions.delete(document)
          }
          // An intervening edit makes the output provisional, never a frame.
          // Its pending union repairs all changed samples on the next task,
          // rather than discarding it and starving continuous drawing.
          if (!prepared || !shouldContinue() || session.contentRevision !== queuedRevision) return
          return queueTimelapseCaptureNow(session, kind, false, prepared)
        })
        .then(resolve, reject)
    }, 0)
  })
  timelapseCaptureTasks.set(document, scheduled)
  // Do not leave the promise returned by finally() unhandled when a capture
  // fails; the caller still receives the original rejection from scheduled.
  void scheduled.then(
    () => { if (timelapseCaptureTasks.get(document) === scheduled) timelapseCaptureTasks.delete(document) },
    () => { if (timelapseCaptureTasks.get(document) === scheduled) timelapseCaptureTasks.delete(document) }
  )
  return scheduled
}

const scheduleTimelapseCapture = (session: DocumentSession, kind: TimelapseCaptureKind = 'edit'): void => {
  const settings = normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? [])
  session.document.timelapse = settings
  if (!settings.enabled) return
  if (!session.animationPlaying) void queueTimelapseCapture(session, kind).catch(() => undefined)
}

/** Awaits the encodes that are already in flight for this document. */
const flushTimelapseCapture = async (session: DocumentSession): Promise<void> => {
  const document = session.document
  const diagnostic = runtimeDiagnosticsActive() ? beginRuntimeDiagnosticOperation('timelapse.flush', {
    documentId: document.id, frames: document.timelapse?.snapshots.length ?? 0,
    pending: timelapseDiagnosticQueues.get(document)?.pending ?? 0, timing: 'async-wall'
  }) : null
  try {
    // Take the current queue barrier. Frames queued after a save begins remain
    // dirty for the next save; they must not keep a live drawing session waiting.
    const barrier = timelapseCaptureTasks.get(document)
    try { await barrier } catch (error) {
      if (!failedCaptures.get(document)?.length) throw error
    }
    let retry = retryTasks.get(document)
    if (!retry) {
      retry = (async () => {
        const failures = failedCaptures.get(document)
        while (failures?.length) {
          const failed = failures[0]
          await failed()
          releaseCaptureBytes.get(failed)?.()
          failures.shift()
        }
      })().finally(() => { retryTasks.delete(document) })
      retryTasks.set(document, retry)
    }
    await retry
    if (!failedCaptures.get(document)?.length && (pendingCounts.get(document) ?? 0) === 0) pendingBytes.set(document, 0)
    diagnostic?.finish('ok', { frames: document.timelapse?.snapshots.length ?? 0, pending: timelapseDiagnosticQueues.get(document)?.pending ?? 0 })
  } catch (error) {
    diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/** Attempt every session, but never report a successful close after a failed flush. */
const flushTimelapseCaptures = async (sessions: readonly DocumentSession[]): Promise<void> => {
  const errors: string[] = []
  for (const session of sessions) {
    try {
      await flushTimelapseCapture(session)
    } catch (error) {
      errors.push(`${session.document.name}: ${error instanceof Error ? error.message : String(error)}`)
      recordRuntimeDiagnostic('error', 'timelapse.flush', {
        documentId: session.document.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

const recordDocumentOperation = (session: DocumentSession, activity?: { stroke?: boolean; durationMs?: number }, captureTimelapse = true, kind: TimelapseCaptureKind = 'edit'): void => {
  const statistics = normalizeProjectStatistics(session.document.statistics)
  statistics.operationCount += 1
  if (activity?.stroke) statistics.strokeCount += 1
  if (activity?.durationMs) statistics.drawingTimeMs += Math.max(0, Math.round(activity.durationMs))
  session.document.statistics = statistics
  if (activity?.stroke && kind === 'edit') publishEditorEvent(session.tool === 'fill' ? 'fill.completed' : 'drawing.completed', session.document.id, { tool: session.tool })
  if (activity) recordUsageDrawingActivity(activity)
  if (captureTimelapse) scheduleTimelapseCapture(session, kind)
}

  return { recordDocumentOperation, flushTimelapseCapture, flushTimelapseCaptures,
    pendingCount: (document: SpriteDocument): number => (pendingCounts.get(document) ?? 0) + (failedCaptures.get(document)?.length ?? 0),
    resetSmartCapture(document: SpriteDocument) {
      const cache = timelapseCaptureCaches.get(document)
      if (cache) resetTimelapseSmartCapture(cache)
    },
    cancelPending(document: SpriteDocument) {
      preparationInvalidations.delete(document)
      const cache = timelapseCaptureCaches.get(document)
      if (cache) { cache.pixels = null; cache.revision = Number.NaN }
      for (const failed of failedCaptures.get(document) ?? []) releaseCaptureBytes.get(failed)?.()
      failedCaptures.delete(document)
      timelapseCaptureGenerations.set(document, (timelapseCaptureGenerations.get(document) ?? 0) + 1)
      timelapseUndoStepGenerations.set(document, (timelapseUndoStepGenerations.get(document) ?? 0) + 1)
    },
    cancelPendingUndoSteps(document: SpriteDocument) {
      timelapseUndoStepGenerations.set(document, (timelapseUndoStepGenerations.get(document) ?? 0) + 1)
    }
  }
}

export type WorkspaceRecording = ReturnType<typeof createWorkspaceRecording>
