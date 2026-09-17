import type { ColorMode } from '@shared/types-raster'
import { readStoredJson, writeStoredJson } from './storage'

export interface NewDocumentPreset {
  presetName: string
  width: number
  height: number
  mode: ColorMode
  recordDrawing: boolean
}

const STORAGE_KEY = 'moonsprite.new-document-presets'
export function loadNewDocumentPresets(): NewDocumentPreset[] {
  const stored = readStoredJson<unknown>(STORAGE_KEY, [])
  if (!Array.isArray(stored)) return []
  return stored.filter((item): item is NewDocumentPreset => Boolean(item
    && typeof item.presetName === 'string' && item.presetName.trim()
    && Number.isSafeInteger(item.width) && item.width > 0
    && Number.isSafeInteger(item.height) && item.height > 0
    && ['rgba', 'indexed', 'grayscale'].includes(item.mode)
    && typeof item.recordDrawing === 'boolean'))
}
export const saveNewDocumentPresets = (presets: readonly NewDocumentPreset[]): boolean => writeStoredJson(STORAGE_KEY, presets)
