import type { SpriteDocument } from '@shared/types-document'
import type { ProjectManifest, ProjectPreviewCache, ProjectSaveBaseline } from './project-format-manifest-types'
import { encodeProjectPreview } from './project-format-manifest'

export function createSavedProjectPreview(
  document: SpriteDocument,
  manifest: ProjectManifest,
  files: Record<string, Uint8Array>,
  baseline?: ProjectSaveBaseline
): ProjectPreviewCache {
  // The successfully saved baseline owns this cache. Reuse proves the pixels
  // match that baseline, and metadata covers palette, frame, geometry, effects,
  // visibility and order. Unknown metadata conservatively invalidates.
  const { name: _name, updatedAt: _updatedAt, statistics: _statistics, timelapse: _recording, ...visualMetadata } = manifest.document
  const key = JSON.stringify(visualMetadata)
  const pixelsReused = !Object.keys(files).some(path => path !== 'manifest.json' && !path.startsWith('timelapse/'))
  const data = pixelsReused && baseline?.preview?.key === key ? baseline.preview.data : encodeProjectPreview(document)
  return { key, data }
}
