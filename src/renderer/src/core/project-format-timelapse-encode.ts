import type { SpriteDocument } from '@shared/types-document'
import type { ManifestTimelapse, ProjectArchiveResource } from './project-format-manifest-types'
import { normalizeTimelapseSettings } from './project-metadata'
import { validTimelapseReference } from './timelapse-reference'

export function buildTimelapseManifest(document: SpriteDocument, files: Record<string, Uint8Array>, resources: ProjectArchiveResource[]): ManifestTimelapse {
  const timelapseSettings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  return {
    enabled: timelapseSettings.enabled,
    recordUndoSteps: timelapseSettings.recordUndoSteps,
    quality: timelapseSettings.quality,
    fps: timelapseSettings.fps,
    speed: timelapseSettings.speed,
    mode: timelapseSettings.mode,
    snapshots: timelapseSettings.snapshots.map((snapshot) => {
      if (snapshot.local && !validTimelapseReference(snapshot.local)) throw new Error('Invalid local recording reference')
      const dataFile = `timelapse/${snapshot.id}.png`
      const external = validTimelapseReference(snapshot.local) && snapshot.data.byteLength === 0
      if (!external) files[dataFile] = snapshot.data
      if (!external) resources.push({
        key: `timelapse:${snapshot.id}`,
        path: dataFile,
        revision: null
      })
      return {
        id: snapshot.id,
        capturedAt: snapshot.capturedAt,
        elapsedMs: snapshot.elapsedMs,
        width: snapshot.width,
        height: snapshot.height,
        changeScore: snapshot.changeScore,
        ...(external ? { local: snapshot.local } : { dataFile })
      }
    })
  }
}
