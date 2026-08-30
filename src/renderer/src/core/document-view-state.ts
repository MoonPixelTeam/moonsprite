import type { SpriteDocument, ViewState } from '@shared/types'
import type { SymmetryCenter } from './symmetry'
import { readStoredJson, writeStoredJson } from './storage'

export interface StoredDocumentViewState {
  zoom: number
  panX: number
  panY: number
  rotation: number
  mirrored: boolean
  mirroredVertical: boolean
  symmetryCenter: SymmetryCenter
}

const VIEW_STATE_KEY_PREFIX = 'moonsprite.document-view.v1:'

const documentIdentity = (document: SpriteDocument): string => document.filePath ?? document.sourceFilePath ?? document.id

const viewStateKey = (document: SpriteDocument): string => `${VIEW_STATE_KEY_PREFIX}${encodeURIComponent(documentIdentity(document))}`

const validNumber = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function loadDocumentViewState(document: SpriteDocument): Partial<StoredDocumentViewState> | null {
  const stored = readStoredJson<Partial<StoredDocumentViewState> | null>(viewStateKey(document), null)
  if (!stored || typeof stored !== 'object') return null
  return {
    zoom: validNumber(stored.zoom, 16),
    panX: validNumber(stored.panX, 0),
    panY: validNumber(stored.panY, 0),
    rotation: validNumber(stored.rotation, 0),
    mirrored: Boolean(stored.mirrored),
    mirroredVertical: Boolean(stored.mirroredVertical),
    symmetryCenter: stored.symmetryCenter && Number.isFinite(stored.symmetryCenter.x) && Number.isFinite(stored.symmetryCenter.y)
      ? { x: stored.symmetryCenter.x, y: stored.symmetryCenter.y }
      : undefined
  }
}

export function saveDocumentViewState(document: SpriteDocument, view: Pick<ViewState, 'zoom' | 'panX' | 'panY' | 'rotation' | 'mirrored' | 'mirroredVertical'>, symmetryCenter: SymmetryCenter): void {
  writeStoredJson(viewStateKey(document), {
    zoom: view.zoom,
    panX: view.panX,
    panY: view.panY,
    rotation: view.rotation,
    mirrored: view.mirrored,
    mirroredVertical: view.mirroredVertical,
    symmetryCenter: { ...symmetryCenter }
  } satisfies StoredDocumentViewState)
}
