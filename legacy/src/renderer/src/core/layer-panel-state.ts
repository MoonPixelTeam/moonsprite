import type { ProjectLayerPanelState, SpriteDocument } from '@shared/types-document'
import { readStoredJson, writeStoredJson } from './storage'

export const LAYER_PANEL_STATE_STORAGE_KEY = 'moonsprite.layer-panel-state.v1'

const MAX_STORED_LAYER_PANEL_STATES = 100

interface StoredLayerPanelStateEntry {
  filePath: string
  updatedAt: number
  state: ProjectLayerPanelState
}

interface StoredLayerPanelStates {
  entries: StoredLayerPanelStateEntry[]
}

export interface LayerPanelStateSource {
  document: SpriteDocument
  selectedLayerIds: string[]
  selectedGroupIds: string[]
  selectedGroupId: string | null
  layerSelectionAnchorId: string | null
  collapsedGroupIds: string[]
}

const uniqueValidIds = (value: unknown, validIds: ReadonlySet<string>): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && validIds.has(id)))]
}

const storedPath = (document: SpriteDocument): string | null => {
  const path = document.filePath ?? document.sourceFilePath
  return typeof path === 'string' && path.trim() ? path.trim() : null
}

const normalizedPathKey = (filePath: string): string => filePath.replace(/\\/g, '/').toLocaleLowerCase('en-US')

export function normalizeProjectLayerPanelState(document: SpriteDocument, value: unknown): ProjectLayerPanelState {
  const source = value && typeof value === 'object' ? value as Partial<ProjectLayerPanelState> : {}
  const validLayerIds = new Set(document.layers.map((layer) => layer.id))
  const validGroupIds = new Set(document.groups.map((group) => group.id))
  const selectedLayerIds = uniqueValidIds(source.selectedLayerIds, validLayerIds)
  const selectedGroupIds = uniqueValidIds(source.selectedGroupIds, validGroupIds)
  const requestedActiveLayerId = typeof source.activeLayerId === 'string' ? source.activeLayerId : document.activeLayerId
  const activeLayerId = validLayerIds.has(requestedActiveLayerId)
    ? requestedActiveLayerId
    : selectedLayerIds.at(-1) ?? (validLayerIds.has(document.activeLayerId) ? document.activeLayerId : document.layers.at(-1)?.id ?? '')
  const selectedGroupId = typeof source.selectedGroupId === 'string'
    && validGroupIds.has(source.selectedGroupId)
    && selectedGroupIds.includes(source.selectedGroupId)
    ? source.selectedGroupId
    : null
  if (selectedLayerIds.length === 0 && selectedGroupIds.length === 0 && activeLayerId) selectedLayerIds.push(activeLayerId)
  const requestedAnchorId = typeof source.layerSelectionAnchorId === 'string' ? source.layerSelectionAnchorId : null
  const layerSelectionAnchorId = requestedAnchorId && (validLayerIds.has(requestedAnchorId) || validGroupIds.has(requestedAnchorId))
    ? requestedAnchorId
    : selectedGroupIds.at(-1) ?? selectedLayerIds.at(-1) ?? (activeLayerId || null)
  return {
    activeLayerId,
    selectedLayerIds,
    selectedGroupIds,
    selectedGroupId,
    layerSelectionAnchorId,
    collapsedGroupIds: uniqueValidIds(source.collapsedGroupIds, validGroupIds)
  }
}

export function captureProjectLayerPanelState(source: LayerPanelStateSource): ProjectLayerPanelState {
  return normalizeProjectLayerPanelState(source.document, {
    activeLayerId: source.document.activeLayerId,
    selectedLayerIds: source.selectedLayerIds,
    selectedGroupIds: source.selectedGroupIds,
    selectedGroupId: source.selectedGroupId,
    layerSelectionAnchorId: source.layerSelectionAnchorId,
    collapsedGroupIds: source.collapsedGroupIds
  })
}

export function loadLocalLayerPanelState(document: SpriteDocument, storage?: Storage): ProjectLayerPanelState | null {
  const filePath = storedPath(document)
  if (!filePath) return null
  const stored = readStoredJson<StoredLayerPanelStates>(LAYER_PANEL_STATE_STORAGE_KEY, { entries: [] }, storage)
  const entry = Array.isArray(stored.entries)
    ? stored.entries.find((candidate) => candidate && typeof candidate.filePath === 'string' && normalizedPathKey(candidate.filePath) === normalizedPathKey(filePath))
    : undefined
  return entry ? normalizeProjectLayerPanelState(document, entry.state) : null
}

export function saveLocalLayerPanelState(document: SpriteDocument, state: ProjectLayerPanelState, storage?: Storage, now = Date.now()): boolean {
  const filePath = storedPath(document)
  if (!filePath) return false
  const stored = readStoredJson<StoredLayerPanelStates>(LAYER_PANEL_STATE_STORAGE_KEY, { entries: [] }, storage)
  const pathKey = normalizedPathKey(filePath)
  const entries = (Array.isArray(stored.entries) ? stored.entries : [])
    .filter((entry) => entry && typeof entry.filePath === 'string' && normalizedPathKey(entry.filePath) !== pathKey)
  entries.unshift({ filePath, updatedAt: now, state: normalizeProjectLayerPanelState(document, state) })
  return writeStoredJson(LAYER_PANEL_STATE_STORAGE_KEY, { entries: entries.slice(0, MAX_STORED_LAYER_PANEL_STATES) }, storage)
}

export function applyProjectLayerPanelState<T extends LayerPanelStateSource>(source: T, state: ProjectLayerPanelState): void {
  const normalized = normalizeProjectLayerPanelState(source.document, state)
  source.document.activeLayerId = normalized.activeLayerId
  source.document.layerPanelState = normalized
  source.selectedLayerIds = [...normalized.selectedLayerIds]
  source.selectedGroupIds = [...normalized.selectedGroupIds]
  source.selectedGroupId = normalized.selectedGroupId
  source.layerSelectionAnchorId = normalized.layerSelectionAnchorId
  source.collapsedGroupIds = [...normalized.collapsedGroupIds]
}

export function persistProjectLayerPanelState(source: LayerPanelStateSource, storage?: Storage): ProjectLayerPanelState {
  const state = captureProjectLayerPanelState(source)
  const previous = source.document.layerPanelState
  source.document.layerPanelState = state
  if (!previous
    || previous.activeLayerId !== state.activeLayerId
    || previous.selectedGroupId !== state.selectedGroupId
    || previous.layerSelectionAnchorId !== state.layerSelectionAnchorId
    || previous.selectedLayerIds.join('\u0000') !== state.selectedLayerIds.join('\u0000')
    || previous.selectedGroupIds.join('\u0000') !== state.selectedGroupIds.join('\u0000')
    || previous.collapsedGroupIds.join('\u0000') !== state.collapsedGroupIds.join('\u0000')) {
    saveLocalLayerPanelState(source.document, state, storage)
  }
  return state
}
