import type { ManifestTimelapse } from './project-format-manifest-types'

export function migrateTimelapseReferences(value: unknown, version: number): ManifestTimelapse | undefined {
  if (!value || typeof value !== 'object') return undefined
  const settings = value as ManifestTimelapse
  if (version >= 20) return settings
  return { ...settings, snapshots: Array.isArray(settings.snapshots) ? settings.snapshots.map(frame => ({ ...frame, local: undefined })) : [] }
}
