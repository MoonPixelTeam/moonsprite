import { zhCNMessages } from '@/locales/zh-CN'
import { AVAILABLE_APP_LOCALES, translate, type AppLocale, type TranslationKey } from '@/core/localization'
import { readStoredJson } from '@/core/storage'

export const HISTORY_DISPLAY_KEY = 'moonsprite.preference.history-hidden-types'
const historyKeys = (Object.keys(zhCNMessages) as TranslationKey[]).filter((key) => key.includes('.history.'))
const keyByLabel = new Map<string, string>()
for (const key of historyKeys) {
  // Identical labels represent the same visible operation category.
  const canonical = historyKeys.find((candidate) => zhCNMessages[candidate] === zhCNMessages[key])!
  for (const locale of AVAILABLE_APP_LOCALES) keyByLabel.set(translate(locale, key), canonical)
}
export const historyDisplayType = (label: string): string => keyByLabel.get(label) ?? `label:${label}`
export const readHiddenHistoryTypes = (): string[] => {
  const value = readStoredJson<unknown>(HISTORY_DISPLAY_KEY, [])
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
export function historyDisplayOptions(locale: AppLocale, labels: readonly string[], hidden: readonly string[]): Array<{ id: string; label: string }> {
  const options = new Map<string, string>()
  for (const key of historyKeys) options.set(historyDisplayType(zhCNMessages[key]), translate(locale, key))
  for (const label of labels) {
    const id = historyDisplayType(label)
    if (!options.has(id)) options.set(id, label)
  }
  for (const id of hidden) if (id.startsWith('label:') && !options.has(id)) options.set(id, id.slice(6))
  return [...options].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, locale))
}
