import type { StoredFont } from '@shared/types-library'
import { TEXT_FONT_FAMILIES } from '@/core/text-raster'

const loadedFonts = new Map<string, FontFace>()
const loadingFonts = new Map<string, Promise<void>>()
const deletingFontFamilies = new Set<string>()
const BUILTIN_FONT_ID_PREFIX = 'moonsprite-builtin-'
const FONT_USAGE_STORAGE_KEY = 'moonsprite:text-font-usage:v1'
const TEXT_FONT_SIZE_STORAGE_KEY = 'moonsprite:text-font-size:v1'

export interface TextFontOption {
  id?: string
  family: string
  source: 'built-in' | 'imported' | 'local'
  filePath?: string
}

const registerFont = (font: StoredFont): Promise<void> => {
  const key = `${font.family}\n${font.filePath}`
  if (loadedFonts.has(key) || deletingFontFamilies.has(font.family) || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve()
  const pending = loadingFonts.get(key)
  if (pending) return pending
  let operation!: Promise<void>
  operation = (async () => {
    const bytes = await window.moonSprite.readBinary(font.filePath)
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const face = new FontFace(font.family, source)
    await face.load()
    if (loadingFonts.get(key) !== operation || deletingFontFamilies.has(font.family)) return
    document.fonts.add(face)
    loadedFonts.set(key, face)
  })().finally(() => { if (loadingFonts.get(key) === operation) loadingFonts.delete(key) })
  loadingFonts.set(key, operation)
  return operation
}

const asOption = (font: StoredFont): TextFontOption => ({
  id: font.id,
  family: font.family,
  source: font.id.startsWith(BUILTIN_FONT_ID_PREFIX) ? 'built-in' : font.imported ? 'imported' : 'local',
  filePath: font.filePath
})

const uniqueOptions = (options: TextFontOption[]): TextFontOption[] => {
  const seen = new Set<string>()
  return options.filter((option) => {
    const key = option.family.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const fontUsageKey = (family: string): string => family.trim().toLocaleLowerCase()

const readFontUsage = (): Record<string, number> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FONT_USAGE_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).flatMap(([family, count]) => typeof count === 'number' && Number.isFinite(count) && count > 0
      ? [[family, Math.floor(count)]]
      : []))
  } catch {
    return {}
  }
}

export const sortTextFontsByUsage = (fonts: readonly TextFontOption[]): TextFontOption[] => {
  const usage = readFontUsage()
  const builtInOrder = new Map<string, number>(TEXT_FONT_FAMILIES.map((family, index) => [fontUsageKey(family), index]))
  return fonts.map((font, index) => ({ font, index, count: usage[fontUsageKey(font.family)] ?? 0, builtInRank: builtInOrder.get(fontUsageKey(font.family)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) => right.count - left.count || left.builtInRank - right.builtInRank || left.index - right.index)
    .map(({ font }) => font)
}

export const recordTextFontUsage = (family: string): void => {
  const usage = readFontUsage()
  const key = fontUsageKey(family)
  usage[key] = (usage[key] ?? 0) + 1
  localStorage.setItem(FONT_USAGE_STORAGE_KEY, JSON.stringify(usage))
}

export const loadLastTextFontSize = (): number | undefined => {
  const value = Number(localStorage.getItem(TEXT_FONT_SIZE_STORAGE_KEY))
  return Number.isFinite(value) && value >= 1 && value <= 512 ? Math.round(value) : undefined
}

export const recordLastTextFontSize = (fontSize: number): void => {
  if (!Number.isFinite(fontSize)) return
  localStorage.setItem(TEXT_FONT_SIZE_STORAGE_KEY, String(Math.max(1, Math.min(512, Math.round(fontSize)))))
}

export async function loadTextFontCatalog(): Promise<TextFontOption[]> {
  const imported = typeof window.moonSprite?.listFonts === 'function' ? (await window.moonSprite.listFonts()).fonts : []
  await Promise.allSettled(imported.map(registerFont))
  return sortTextFontsByUsage(uniqueOptions([
    ...imported.map(asOption),
    ...TEXT_FONT_FAMILIES.map((family) => ({ family, source: 'built-in' as const }))
  ]))
}

export async function loadSystemFontCatalog(): Promise<TextFontOption[]> {
  if (typeof window.moonSprite?.listSystemFonts !== 'function') return []
  return uniqueOptions((await window.moonSprite.listSystemFonts()).map(asOption))
}

export async function importTextFont(): Promise<TextFontOption | null> {
  if (typeof window.moonSprite?.importFont !== 'function') return null
  const font = await window.moonSprite.importFont()
  if (!font) return null
  await registerFont(font)
  return asOption(font)
}

export async function importSystemTextFont(font: TextFontOption): Promise<TextFontOption | null> {
  if (!font.id || typeof window.moonSprite?.importSystemFont !== 'function') return null
  const imported = await window.moonSprite.importSystemFont(font.id)
  await registerFont(imported)
  return asOption(imported)
}

export async function deleteTextFont(font: TextFontOption): Promise<void> {
  if (font.source !== 'imported' || !font.id || typeof window.moonSprite?.deleteFont !== 'function') return
  deletingFontFamilies.add(font.family)
  try {
    await window.moonSprite.deleteFont(font.id)
    for (const key of loadingFonts.keys()) if (key.startsWith(`${font.family}\n`)) loadingFonts.delete(key)
    for (const [key, face] of loadedFonts) {
      if (!key.startsWith(`${font.family}\n`)) continue
      document.fonts?.delete?.(face)
      loadedFonts.delete(key)
    }
  } finally { deletingFontFamilies.delete(font.family) }
}

export function resetTextFontServiceForTests(): void {
  for (const face of loadedFonts.values()) document.fonts?.delete?.(face)
  loadedFonts.clear()
  loadingFonts.clear()
  deletingFontFamilies.clear()
}
