import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { GifDirection } from './gif'
import type { ImageExportKind } from './png'
import { readStoredJson, writeStoredJson } from './storage'

export const EXPORT_PRESETS_STORAGE_KEY = 'moonsprite.export-presets.v2'
export const LEGACY_EXPORT_PRESETS_STORAGE_KEY = 'moonsprite.export-presets.v1'
export const RECENT_EXPORT_PATHS_STORAGE_KEY = 'moonsprite.recent-export-paths.v1'
export const DOCUMENT_EXPORT_SETTINGS_STORAGE_KEY = 'moonsprite.document-export-settings.v1'
export const RECENT_EXPORTS_CHANGED_EVENT = 'moonsprite:recent-exports-changed'

const EXPORT_PRESET_SCHEMA_VERSION = 2
const RECENT_EXPORT_PATHS_SCHEMA_VERSION = 1
const DOCUMENT_EXPORT_SETTINGS_SCHEMA_VERSION = 1
const MAX_RECENT_EXPORT_PATHS = 10
const MAX_DOCUMENT_EXPORT_SETTINGS = 100
const exportFormats: readonly ImageExportKind[] = ['png-auto', 'png-rgba', 'jpeg', 'webp', 'svg', 'gif', 'psd']

export interface ExportPreset {
  presetName: string
  name: string
  format: ImageExportKind
  scalePercent: number
  target?: 'document' | 'slices' | 'frames' | 'selection' | 'layer'
  layerId?: string
  sliceId?: string
  directory?: string
  gifFrameRange?: 'all' | 'range' | 'loop-section'
  gifFrameStart?: number
  gifFrameEnd?: number
  gifLoopSectionId?: string
  gifDirection?: GifDirection
}

export interface RecentExportPath {
  filePath: string
  exportedAt: string
}

export interface DocumentExportSettings {
  name: string
  format: ImageExportKind
  scalePercent: number
  target?: 'document' | 'slices' | 'frames' | 'selection' | 'layer'
  /** Runtime-only mask used when target is selection; never persisted. */
  selection?: SelectionMask | null
  sliceId?: string
  /** Runtime/persisted layer target. Missing means all layers when target is layer. */
  layerId?: string
  directory?: string
  gifFrameRange?: 'all' | 'range' | 'loop-section'
  gifFrameStart?: number
  gifFrameEnd?: number
  gifLoopSectionId?: string
  gifDirection?: GifDirection
  presetName?: string
}

export type DocumentExportSettingsOwner = Pick<SpriteDocument, 'id' | 'filePath' | 'sourceFilePath'>

interface StoredExportPresets {
  schemaVersion: number
  presets: unknown[]
}

interface StoredRecentExportPaths {
  schemaVersion: number
  paths: unknown[]
}

interface StoredDocumentExportSettingsEntry {
  identities: string[]
  updatedAt: number
  settings: DocumentExportSettings
}

interface StoredDocumentExportSettings {
  schemaVersion: number
  entries: StoredDocumentExportSettingsEntry[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isExportFormat = (value: unknown): value is ImageExportKind => typeof value === 'string' && exportFormats.includes(value as ImageExportKind)
const finiteInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const number = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback
}
const optionalFiniteInteger = (value: unknown, min: number, max: number): number | undefined => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(min, Math.min(max, Math.round(value)))
  : undefined

function normalizeExportPreset(value: unknown): ExportPreset | null {
  if (!isRecord(value)) return null
  const presetName = typeof value.presetName === 'string' ? value.presetName.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!presetName || !name) return null
  const format = isExportFormat(value.format) ? value.format : 'png-auto'
  const legacyScalePercent = typeof value.scale === 'number' ? value.scale * 100 : 100
  const scalePercent = finiteInteger(value.scalePercent, finiteInteger(legacyScalePercent, 100, 1, 6400), 1, 6400)
  const directory = typeof value.directory === 'string' ? value.directory.trim() : ''
  const target = format === 'psd'
    ? 'document'
    : value.target === 'slices' || value.target === 'selection' || value.target === 'layer' || (format !== 'gif' && value.target === 'frames') ? value.target : 'document'
  const sliceId = typeof value.sliceId === 'string' ? value.sliceId.trim() : ''
  const layerId = typeof value.layerId === 'string' ? value.layerId.trim() : ''
  const gifLoopSectionId = typeof value.gifLoopSectionId === 'string' ? value.gifLoopSectionId.trim() : ''
  const gifFrameRange = value.gifFrameRange === 'range' ? 'range' : value.gifFrameRange === 'loop-section' && gifLoopSectionId ? 'loop-section' : 'all'
  const gifDirection: GifDirection = value.gifDirection === 'reverse'
    || value.gifDirection === 'forward-ping-pong'
    || value.gifDirection === 'reverse-ping-pong'
    ? value.gifDirection
    : 'forward'
  const gifFrameStart = optionalFiniteInteger(value.gifFrameStart, 1, 1_000_000)
  const gifFrameEnd = optionalFiniteInteger(value.gifFrameEnd, 1, 1_000_000)
  return {
    presetName,
    name: withExportFileExtension(name, format),
    format,
    scalePercent,
    ...(target !== 'document' ? { target } : {}),
    ...(target === 'slices' && sliceId ? { sliceId } : {}),
    ...(target === 'layer' && layerId ? { layerId } : {}),
    ...(directory ? { directory } : {}),
    ...(format === 'gif' ? {
      gifFrameRange,
      ...(gifFrameStart !== undefined ? { gifFrameStart } : {}),
      ...(gifFrameEnd !== undefined ? { gifFrameEnd } : {}),
      ...(gifFrameRange === 'loop-section' ? { gifLoopSectionId } : {}),
      gifDirection
    } : {})
  }
}

function normalizeDocumentExportSettings(value: unknown): DocumentExportSettings | null {
  if (!isRecord(value)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name) return null
  const format = isExportFormat(value.format) ? value.format : 'png-auto'
  const scalePercent = finiteInteger(value.scalePercent, 100, 1, 6400)
  const directory = typeof value.directory === 'string' ? value.directory.trim() : ''
  const target = format === 'psd'
    ? 'document'
    : value.target === 'slices' || value.target === 'selection' || value.target === 'layer' || (format !== 'gif' && value.target === 'frames') ? value.target : 'document'
  const sliceId = typeof value.sliceId === 'string' ? value.sliceId.trim() : ''
  const layerId = typeof value.layerId === 'string' ? value.layerId.trim() : ''
  const gifLoopSectionId = typeof value.gifLoopSectionId === 'string' ? value.gifLoopSectionId.trim() : ''
  const gifFrameRange = value.gifFrameRange === 'range' ? 'range' : value.gifFrameRange === 'loop-section' && gifLoopSectionId ? 'loop-section' : 'all'
  const gifDirection: GifDirection = value.gifDirection === 'reverse'
    || value.gifDirection === 'forward-ping-pong'
    || value.gifDirection === 'reverse-ping-pong'
    ? value.gifDirection
    : 'forward'
  const gifFrameStart = optionalFiniteInteger(value.gifFrameStart, 1, 1_000_000)
  const gifFrameEnd = optionalFiniteInteger(value.gifFrameEnd, 1, 1_000_000)
  const presetName = typeof value.presetName === 'string' ? value.presetName.trim() : ''
  return {
    name: withExportFileExtension(name, format),
    format,
    scalePercent,
    target,
    ...(target === 'slices' && sliceId ? { sliceId } : {}),
    ...(target === 'layer' && layerId ? { layerId } : {}),
    ...(directory ? { directory } : {}),
    ...(presetName ? { presetName } : {}),
    ...(format === 'gif' ? {
      gifFrameRange,
      ...(gifFrameStart !== undefined ? { gifFrameStart } : {}),
      ...(gifFrameEnd !== undefined ? { gifFrameEnd } : {}),
      ...(gifFrameRange === 'loop-section' ? { gifLoopSectionId } : {}),
      gifDirection
    } : {})
  }
}

const normalizedPathKey = (filePath: string): string => {
  const trimmed = filePath.trim()
  const normalized = trimmed.replace(/\\/g, '/')
  return trimmed.includes('\\') || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
}

function documentExportIdentityKeys(document: DocumentExportSettingsOwner): string[] {
  const filePath = document.filePath ?? document.sourceFilePath
  if (typeof filePath === 'string' && filePath.trim()) return [`path:${normalizedPathKey(filePath)}`]
  const id = document.id.trim()
  return id ? [`id:${id}`] : []
}

function normalizedStoredIdentities(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((identity): identity is string => typeof identity === 'string' && identity.trim().length > 0).map((identity) => identity.trim()))]
}

export function loadExportPresets(storage?: Storage): ExportPreset[] {
  const current = readStoredJson<unknown>(EXPORT_PRESETS_STORAGE_KEY, null, storage)
  const values = isRecord(current)
    && current.schemaVersion === EXPORT_PRESET_SCHEMA_VERSION
    && Array.isArray(current.presets)
    ? current.presets
    : readStoredJson<unknown>(LEGACY_EXPORT_PRESETS_STORAGE_KEY, [], storage)
  if (!Array.isArray(values)) return []
  return values.flatMap((value) => {
    const preset = normalizeExportPreset(value)
    return preset ? [preset] : []
  })
}

export function saveExportPresets(presets: readonly ExportPreset[], storage?: Storage): boolean {
  const normalized = presets.flatMap((preset) => {
    const value = normalizeExportPreset(preset)
    return value ? [value] : []
  })
  return writeStoredJson(EXPORT_PRESETS_STORAGE_KEY, {
    schemaVersion: EXPORT_PRESET_SCHEMA_VERSION,
    presets: normalized
  } satisfies StoredExportPresets, storage)
}

export function loadDocumentExportSettings(document: DocumentExportSettingsOwner, storage?: Storage): DocumentExportSettings | null {
  const identities = new Set(documentExportIdentityKeys(document))
  if (identities.size === 0) return null
  const stored = readStoredJson<unknown>(DOCUMENT_EXPORT_SETTINGS_STORAGE_KEY, null, storage)
  if (!isRecord(stored) || stored.schemaVersion !== DOCUMENT_EXPORT_SETTINGS_SCHEMA_VERSION || !Array.isArray(stored.entries)) return null
  for (const value of stored.entries) {
    if (!isRecord(value)) continue
    const entryIdentities = normalizedStoredIdentities(value.identities)
    if (!entryIdentities.some((identity) => identities.has(identity))) continue
    const settings = normalizeDocumentExportSettings(value.settings)
    if (settings) return settings
  }
  return null
}

export function saveDocumentExportSettings(document: DocumentExportSettingsOwner, settings: DocumentExportSettings, storage?: Storage, now = Date.now()): boolean {
  const identities = documentExportIdentityKeys(document)
  const normalized = normalizeDocumentExportSettings(settings)
  if (identities.length === 0 || !normalized) return false
  const identitySet = new Set(identities)
  const stored = readStoredJson<unknown>(DOCUMENT_EXPORT_SETTINGS_STORAGE_KEY, null, storage)
  const previousEntries = isRecord(stored)
    && stored.schemaVersion === DOCUMENT_EXPORT_SETTINGS_SCHEMA_VERSION
    && Array.isArray(stored.entries)
    ? stored.entries
    : []
  const entries = previousEntries.flatMap((value) => {
    if (!isRecord(value)) return []
    const entryIdentities = normalizedStoredIdentities(value.identities)
    const entrySettings = normalizeDocumentExportSettings(value.settings)
    if (entryIdentities.length === 0 || !entrySettings || entryIdentities.some((identity) => identitySet.has(identity))) return []
    return [{ identities: entryIdentities, updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0, settings: entrySettings }]
  })
  entries.unshift({ identities, updatedAt: Number.isFinite(now) ? now : Date.now(), settings: normalized })
  return writeStoredJson(DOCUMENT_EXPORT_SETTINGS_STORAGE_KEY, {
    schemaVersion: DOCUMENT_EXPORT_SETTINGS_SCHEMA_VERSION,
    entries: entries.slice(0, MAX_DOCUMENT_EXPORT_SETTINGS)
  } satisfies StoredDocumentExportSettings, storage)
}

export function exportFileExtension(format: ImageExportKind): 'png' | 'jpg' | 'webp' | 'svg' | 'gif' | 'psd' {
  if (format === 'jpeg') return 'jpg'
  if (format === 'webp') return 'webp'
  if (format === 'svg') return 'svg'
  if (format === 'gif') return 'gif'
  if (format === 'psd') return 'psd'
  return 'png'
}

export function withExportFileExtension(name: string, format: ImageExportKind): string {
  const fallback = 'MoonSprite-export'
  const stem = name.trim().replace(/\.(moonsprite|aseprite|ase|png|jpe?g|webp|svg|gif|psd)$/i, '').trim() || fallback
  return `${stem}.${exportFileExtension(format)}`
}

export function parentDirectoryFromPath(filePath: string): string {
  const normalized = filePath.trim().replace(/[\\/]+$/, '')
  const separatorIndex = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  if (separatorIndex < 0) return ''
  if (separatorIndex === 0) return normalized.slice(0, 1)
  if (separatorIndex === 2 && /^[A-Za-z]:/.test(normalized)) return normalized.slice(0, 3)
  return normalized.slice(0, separatorIndex)
}

function normalizeRecentExportPath(value: unknown): RecentExportPath | null {
  if (!isRecord(value) || typeof value.filePath !== 'string') return null
  const filePath = value.filePath.trim()
  if (!filePath) return null
  const exportedAt = typeof value.exportedAt === 'string' && Number.isFinite(Date.parse(value.exportedAt))
    ? value.exportedAt
    : new Date(0).toISOString()
  return { filePath, exportedAt }
}

export function loadRecentExportPaths(storage?: Storage): RecentExportPath[] {
  const stored = readStoredJson<unknown>(RECENT_EXPORT_PATHS_STORAGE_KEY, null, storage)
  if (!isRecord(stored) || stored.schemaVersion !== RECENT_EXPORT_PATHS_SCHEMA_VERSION || !Array.isArray(stored.paths)) return []
  const seen = new Set<string>()
  return stored.paths.flatMap((value) => {
    const item = normalizeRecentExportPath(value)
    if (!item) return []
    const key = item.filePath.toLocaleLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [item]
  }).slice(0, MAX_RECENT_EXPORT_PATHS)
}

export function recordRecentExportPath(filePath: string, storage?: Storage, now = new Date()): boolean {
  const normalizedPath = filePath.trim()
  if (!normalizedPath) return false
  const key = normalizedPath.toLocaleLowerCase()
  const next = [
    { filePath: normalizedPath, exportedAt: now.toISOString() },
    ...loadRecentExportPaths(storage).filter((item) => item.filePath.toLocaleLowerCase() !== key)
  ].slice(0, MAX_RECENT_EXPORT_PATHS)
  return writeStoredJson(RECENT_EXPORT_PATHS_STORAGE_KEY, {
    schemaVersion: RECENT_EXPORT_PATHS_SCHEMA_VERSION,
    paths: next
  } satisfies StoredRecentExportPaths, storage)
}
