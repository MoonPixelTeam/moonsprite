import { readStoredJson, writeStoredJson } from './storage'

export const HOME_FILE_DISPLAY_FORMATS = ['project', 'png', 'jpg', 'webp', 'bmp', 'gif'] as const

export type HomeFileDisplayFormat = (typeof HOME_FILE_DISPLAY_FORMATS)[number]

export const HOME_FILE_DISPLAY_FORMATS_STORAGE_KEY = 'moonsprite.home-file-display-formats.v1'

const extensionsByFormat: Readonly<Record<HomeFileDisplayFormat, readonly string[]>> = {
  project: ['moonsprite', 'ase', 'aseprite'],
  png: ['png'],
  jpg: ['jpg', 'jpeg'],
  webp: ['webp'],
  bmp: ['bmp'],
  gif: ['gif']
}

export const normalizeHomeFileDisplayFormats = (value: unknown): HomeFileDisplayFormat[] => {
  if (!Array.isArray(value)) return [...HOME_FILE_DISPLAY_FORMATS]
  const selected = new Set(value.filter((item): item is HomeFileDisplayFormat =>
    typeof item === 'string' && HOME_FILE_DISPLAY_FORMATS.includes(item as HomeFileDisplayFormat)
  ))
  return HOME_FILE_DISPLAY_FORMATS.filter((format) => selected.has(format))
}

export const getHomeFileDisplayFormats = (storage?: Storage): HomeFileDisplayFormat[] =>
  normalizeHomeFileDisplayFormats(readStoredJson<unknown>(HOME_FILE_DISPLAY_FORMATS_STORAGE_KEY, HOME_FILE_DISPLAY_FORMATS, storage))

export const saveHomeFileDisplayFormats = (formats: readonly HomeFileDisplayFormat[], storage?: Storage): HomeFileDisplayFormat[] => {
  const normalized = normalizeHomeFileDisplayFormats(formats)
  writeStoredJson(HOME_FILE_DISPLAY_FORMATS_STORAGE_KEY, normalized, storage)
  return normalized
}

export const homeFileDisplayFormatForPath = (filePath: string): HomeFileDisplayFormat | null => {
  const extension = filePath.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase()
  if (!extension) return null
  for (const format of HOME_FILE_DISPLAY_FORMATS) {
    if (extensionsByFormat[format].includes(extension)) return format
  }
  return null
}

export const matchesHomeFileDisplayFormats = (filePath: string, formats: readonly HomeFileDisplayFormat[]): boolean => {
  const format = homeFileDisplayFormatForPath(filePath)
  return format !== null && formats.includes(format)
}
