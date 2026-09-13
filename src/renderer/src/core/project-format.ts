/** Stable public entry. Implementations live in the responsibility modules below. */
export {
  PROJECT_SCHEMA_VERSION,
  type ProjectGalleryMetadata,
  type ProjectGalleryReadOptions,
  type ProjectEncodeOptions,
  type ProjectArchiveReuseEntry,
  type EncodedProjectSave,
  type ProjectEncodeWorkerPayload,
  type ProjectEncodeWorkerResult
} from './project-format-manifest-types'
export { compactProjectRasterStorage } from './project-format-raster'
export { encodeProjectPreview, migrateProjectManifest } from './project-format-manifest'
export {
  encodeProjectAsync,
  encodeProjectWorkerPayload,
  registerProjectSaveBaseline,
  encodeProjectSaveAsync,
  acceptProjectSaveBaseline,
  clearProjectSaveBaseline
} from './project-format-save'
export { encodeProject } from './project-format-encode'
export { readProjectExpandedRasterBytes, readProjectGalleryMetadata } from './project-format-metadata'
export { decodeProject } from './project-format-decode'
