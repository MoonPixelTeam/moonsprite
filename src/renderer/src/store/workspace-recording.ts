import type { SpriteDocument } from '@shared/types-document'
import { beginRuntimeDiagnosticOperation, measureRuntimeDiagnostic, recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { documentDiagnosticDetail } from '@/core/document-diagnostics'
import { normalizeProjectStatistics, normalizeTimelapseSettings } from '@/core/project-metadata'
import { commitPreparedTimelapseSnapshot, createTimelapseCaptureCache, prepareTimelapseSnapshot, resetTimelapseSmartCapture, type TimelapseCaptureCache } from '@/core/timelapse'
import { recordUsageEvent } from '@/platform/usage-statistics'
import type { DocumentSession } from './workspace-types'

export function createWorkspaceRecording(onCaptureCommitted: (document: SpriteDocument) => void) {
const timelapseCaptureCaches = new WeakMap<SpriteDocument, TimelapseCaptureCache>()
const timelapseCaptureTasks = new WeakMap<SpriteDocument, Promise<void>>()
const timelapseCaptureGenerations = new WeakMap<SpriteDocument, number>()
const timelapseDiagnosticQueues = new WeakMap<SpriteDocument, { pending: number; peak: number; completed: number; skipped: number; failed: number; maxQueueMs: number; maxEncodeMs: number; lastReportAt: number }>()

const captureCacheFor = (document: SpriteDocument): TimelapseCaptureCache => {
  const cached = timelapseCaptureCaches.get(document)
  if (cached) return cached
  const created = createTimelapseCaptureCache()
  timelapseCaptureCaches.set(document, created)
  return created
}

const queueTimelapseCapture = (session: DocumentSession): Promise<void> => {
  const document = session.document
  const captureRevision = session.contentRevision
  const captureInvalidation = session.contentInvalidation
  const prepared = measureRuntimeDiagnostic('timelapse.prepare', () => prepareTimelapseSnapshot(document, Date.now(), {
    cache: captureCacheFor(document),
    contentRevision: captureRevision,
    contentInvalidation: captureInvalidation
  }), () => ({ ...documentDiagnosticDetail(document), tool: session.tool, contentRevision: captureRevision }))
  if (!prepared) return Promise.resolve()
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
  const previous = timelapseCaptureTasks.get(document) ?? Promise.resolve()
  let tracked = Promise.resolve()
  tracked = previous.catch(() => undefined).then(async () => {
    const encodingAt = queuedAt !== null ? performance.now() : null
    if (diagnostics && encodingAt !== null && queuedAt !== null) diagnostics.maxQueueMs = Math.max(diagnostics.maxQueueMs, encodingAt - queuedAt)
    const snapshots = document.timelapse?.snapshots
    await commitPreparedTimelapseSnapshot(document, prepared, () => (timelapseCaptureGenerations.get(document) ?? 0) === generation)
    const skipped = (timelapseCaptureGenerations.get(document) ?? 0) !== generation || document.timelapse?.snapshots === snapshots
    if (diagnostics && encodingAt !== null) {
      diagnostics.maxEncodeMs = Math.max(diagnostics.maxEncodeMs, performance.now() - encodingAt)
      if (skipped) diagnostics.skipped += 1
      else diagnostics.completed += 1
    }
    if (skipped) return
    onCaptureCommitted(document)
  }).catch((error) => {
    if (diagnostics) diagnostics.failed += 1
    recordRuntimeDiagnostic('error', 'timelapse.capture', {
      documentId: document.id, contentRevision: captureRevision,
      pending: diagnostics?.pending ?? 0,
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  }).finally(() => {
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

const scheduleTimelapseCapture = (session: DocumentSession): void => {
  const settings = normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? [])
  session.document.timelapse = settings
  if (!settings.enabled) return
  if (!session.animationPlaying) void queueTimelapseCapture(session).catch(() => undefined)
}

const flushTimelapseCapture = async (session: DocumentSession): Promise<void> => {
  const document = session.document
  const diagnostic = runtimeDiagnosticsActive() ? beginRuntimeDiagnosticOperation('timelapse.flush', {
    documentId: document.id, frames: document.timelapse?.snapshots.length ?? 0,
    pending: timelapseDiagnosticQueues.get(document)?.pending ?? 0, timing: 'async-wall'
  }) : null
  try {
    await timelapseCaptureTasks.get(document)
    diagnostic?.finish('ok', { frames: document.timelapse?.snapshots.length ?? 0, pending: timelapseDiagnosticQueues.get(document)?.pending ?? 0 })
  } catch (error) {
    diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

const recordDocumentOperation = (session: DocumentSession, activity?: { stroke?: boolean; durationMs?: number }, captureTimelapse = true): void => {
  const statistics = normalizeProjectStatistics(session.document.statistics)
  statistics.operationCount += 1
  if (activity?.stroke) statistics.strokeCount += 1
  if (activity?.durationMs) statistics.drawingTimeMs += Math.max(0, Math.round(activity.durationMs))
  session.document.statistics = statistics
  if (activity?.stroke) recordUsageEvent('drawingStroke')
  if (captureTimelapse) scheduleTimelapseCapture(session)
}

  return { recordDocumentOperation, flushTimelapseCapture,
    pendingCount: (document: SpriteDocument): number => timelapseDiagnosticQueues.get(document)?.pending ?? 0,
    resetSmartCapture(document: SpriteDocument) {
      const cache = timelapseCaptureCaches.get(document)
      if (cache) resetTimelapseSmartCapture(cache)
    },
    cancelPending(document: SpriteDocument) {
      timelapseCaptureGenerations.set(document, (timelapseCaptureGenerations.get(document) ?? 0) + 1)
    }
  }
}

export type WorkspaceRecording = ReturnType<typeof createWorkspaceRecording>
