import type { SpriteDocument } from '@shared/types-document'
import { beginRuntimeDiagnosticOperation, measureRuntimeDiagnostic, recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { documentDiagnosticDetail } from '@/core/document-diagnostics'
import { normalizeProjectStatistics, normalizeTimelapseSettings } from '@/core/project-metadata'
import { commitPreparedTimelapseSnapshot, createTimelapseCaptureCache, prepareTimelapseSnapshot, resetTimelapseSmartCapture, type TimelapseCaptureCache } from '@/core/timelapse'
import { recordUsageEvent } from '@/platform/usage-statistics'
import type { DocumentSession } from './workspace-types'
import { persistTimelapseFrames } from './timelapse-library-service'

/** A capture is either triggered by an edit or by an undo/redo history step. */
export type TimelapseCaptureKind = 'edit' | 'undo-step'

export function createWorkspaceRecording(onCaptureCommitted: (document: SpriteDocument) => void, onCaptureError?: (message: string) => void) {
const timelapseCaptureCaches = new WeakMap<SpriteDocument, TimelapseCaptureCache>()
const timelapseCaptureTasks = new WeakMap<SpriteDocument, Promise<void>>()
const timelapseCaptureGenerations = new WeakMap<SpriteDocument, number>()
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

const queueTimelapseCapture = (session: DocumentSession, kind: TimelapseCaptureKind = 'edit'): Promise<void> => {
  const document = session.document
  const captureRevision = session.contentRevision
  const captureInvalidation = session.contentInvalidation
  const prepared = measureRuntimeDiagnostic('timelapse.prepare', () => prepareTimelapseSnapshot(document, Date.now(), {
    cache: captureCacheFor(document),
    contentRevision: captureRevision,
    contentInvalidation: captureInvalidation
  }), () => ({ ...documentDiagnosticDetail(document), tool: session.tool, contentRevision: captureRevision }))
  if (!prepared) return Promise.resolve()
  const queuedBytes = pendingBytes.get(document) ?? 0
  if (queuedBytes + prepared.pixels.byteLength > 64 * 1024 * 1024) {
    if (document.timelapse) document.timelapse.enabled = false
    const error = new Error('缩时录像写入积压，已暂停新帧录制。已有帧已保留，请检查磁盘后重新开启录制。')
    onCaptureError?.(error.message)
    recordRuntimeDiagnostic('error', 'timelapse.backpressure', { documentId: document.id, pendingBytes: queuedBytes })
    onCaptureCommitted(document)
    return Promise.reject(error)
  }
  pendingBytes.set(document, queuedBytes + prepared.pixels.byteLength)
  let released = false
  const releaseBytes = () => {
    if (released) return
    released = true
    pendingBytes.set(document, Math.max(0, (pendingBytes.get(document) ?? 0) - prepared.pixels.byteLength))
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
  const previous = timelapseCaptureTasks.get(document) ?? Promise.resolve()
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
    if (timelapseCaptureTasks.get(document) === tracked) timelapseCaptureTasks.delete(document)
  })
  timelapseCaptureTasks.set(document, tracked)
  return tracked
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
  if (activity?.stroke) recordUsageEvent('drawingStroke')
  if (captureTimelapse) scheduleTimelapseCapture(session, kind)
}

  return { recordDocumentOperation, flushTimelapseCapture, flushTimelapseCaptures,
    pendingCount: (document: SpriteDocument): number => (pendingCounts.get(document) ?? 0) + (failedCaptures.get(document)?.length ?? 0),
    resetSmartCapture(document: SpriteDocument) {
      const cache = timelapseCaptureCaches.get(document)
      if (cache) resetTimelapseSmartCapture(cache)
    },
    cancelPending(document: SpriteDocument) {
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
