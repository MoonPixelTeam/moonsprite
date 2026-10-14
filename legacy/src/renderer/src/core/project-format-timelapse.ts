import type { ManifestTimelapse } from './project-format-manifest-types'
import { normalizeTimelapseSettings } from './project-metadata'
import { recordRuntimeDiagnostic } from './runtime-diagnostics'
import { validTimelapseReference } from './timelapse-reference'

/** Why a recorded timelapse frame in the manifest could not be restored. */
export type TimelapseFrameDropReason = 'invalid-metadata' | 'missing-data' | 'invalid-dimensions'

export interface ProjectDecodeReport {
  /** Timelapse frames the manifest declared but that could not be restored. */
  droppedTimelapseFrames: number
  dropReasons: TimelapseFrameDropReason[]
  /** Frames actually restored, so callers can report a truthful count. */
  timelapseFrames: number
}

export function restoreProjectTimelapse(
  value: ManifestTimelapse | undefined,
  storedTimelapseFiles: ReadonlyMap<string, Uint8Array>,
  files: Readonly<Record<string, Uint8Array>>,
  reportItem: () => void,
  onDroppedTimelapseFrames?: (report: ProjectDecodeReport) => void
) {
  const manifestTimelapse = value && typeof value === 'object' ? value : undefined
  const declaredSnapshots = Array.isArray(manifestTimelapse?.snapshots) ? manifestTimelapse.snapshots : []
  const dropReasons: TimelapseFrameDropReason[] = []
  const timelapseSnapshots = declaredSnapshots.flatMap((snapshot) => {
    if (!snapshot || typeof snapshot.id !== 'string' || (typeof snapshot.dataFile !== 'string' && !validTimelapseReference(snapshot.local))) {
      dropReasons.push('invalid-metadata')
      return []
    }
    const width = Number(snapshot.width)
    const height = Number(snapshot.height)
    const local = typeof snapshot.dataFile !== 'string' && validTimelapseReference(snapshot.local) ? snapshot.local : undefined
    const data = snapshot.dataFile ? storedTimelapseFiles.get(snapshot.dataFile) ?? files[snapshot.dataFile] : new Uint8Array()
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      dropReasons.push('invalid-dimensions')
      return []
    }
    if (!local && !data?.byteLength) {
      dropReasons.push('missing-data')
      return []
    }
    reportItem()
    return [
      {
        id: snapshot.id,
        capturedAt: Math.max(0, Math.trunc(Number(snapshot.capturedAt) || 0)),
        elapsedMs: Math.max(0, Math.trunc(Number(snapshot.elapsedMs) || 0)),
        width,
        height,
        changeScore: Number.isFinite(snapshot.changeScore) ? Math.max(0, Math.min(1, Number(snapshot.changeScore))) : undefined,
        data: data ?? new Uint8Array(),
        ...(local ? { local } : {})
      }
    ]
  })
  // A dropped frame used to vanish without a trace. Report it so the caller can
  // warn the user and so a damaged archive stays diagnosable.
  if (dropReasons.length > 0) {
    const report: ProjectDecodeReport = {
      droppedTimelapseFrames: dropReasons.length,
      dropReasons: [...new Set(dropReasons)],
      timelapseFrames: timelapseSnapshots.length
    }
    recordRuntimeDiagnostic('error', 'project.timelapse.restore', {
      declaredFrames: declaredSnapshots.length,
      droppedFrames: report.droppedTimelapseFrames,
      restoredFrames: report.timelapseFrames,
      reasons: report.dropReasons.join(',')
    })
    onDroppedTimelapseFrames?.(report)
  }
  return normalizeTimelapseSettings(manifestTimelapse, timelapseSnapshots)
}
