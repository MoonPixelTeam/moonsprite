import { zhCNMessages } from '@/locales/zh-CN'
import { enUSMessages } from '@/locales/en-US'
import { jaJPMessages } from '@/locales/ja-JP'
import { koKRMessages } from '@/locales/ko-KR'
import { esESMessages } from '@/locales/es-ES'
import { frFRMessages } from '@/locales/fr-FR'
import { deDEMessages } from '@/locales/de-DE'
import { ptBRMessages } from '@/locales/pt-BR'
import { ruRUMessages } from '@/locales/ru-RU'
import { readStoredString } from './storage'

export { DEFAULT_APP_LOCALE, AVAILABLE_APP_LOCALES, LANGUAGE_PREFERENCE_KEY } from '@/locales/contracts'
export type { AppLocale, TranslationParams, TranslationKey, TranslationCatalog } from '@/locales/contracts'
import { DEFAULT_APP_LOCALE, AVAILABLE_APP_LOCALES, LANGUAGE_PREFERENCE_KEY, type AppLocale, type TranslationParams, type TranslationKey, type TranslationCatalog } from '@/locales/contracts'

const catalogs: Record<AppLocale, TranslationCatalog> = {
  'zh-CN': zhCNMessages,
  'en-US': enUSMessages,
  'ja-JP': jaJPMessages,
  'ko-KR': koKRMessages,
  'es-ES': esESMessages,
  'fr-FR': frFRMessages,
  'de-DE': deDEMessages,
  'pt-BR': ptBRMessages,
  'ru-RU': ruRUMessages
}

const localeNameKeys: Record<AppLocale, TranslationKey> = {
  'zh-CN': 'locale.zh-CN',
  'en-US': 'locale.en-US',
  'ja-JP': 'locale.ja-JP',
  'ko-KR': 'locale.ko-KR',
  'es-ES': 'locale.es-ES',
  'fr-FR': 'locale.fr-FR',
  'de-DE': 'locale.de-DE',
  'pt-BR': 'locale.pt-BR',
  'ru-RU': 'locale.ru-RU'
}

const sourceTextKeys = new Map<string, TranslationKey>([
  ...Object.entries(enUSMessages),
  ...Object.entries(zhCNMessages)
].map(([key, value]) => [value, key as TranslationKey]))

let runtimeLocale: AppLocale | null = null

export function parseAppLocale(value: string | null | undefined): AppLocale {
  return AVAILABLE_APP_LOCALES.includes(value as AppLocale) ? value as AppLocale : DEFAULT_APP_LOCALE
}

export function formatTranslation(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, key: string) => {
    const value = params[key]
    return value === undefined ? placeholder : String(value)
  })
}

export function translate(locale: AppLocale, key: TranslationKey, params?: TranslationParams): string {
  const catalog = catalogs[parseAppLocale(locale)] ?? catalogs[DEFAULT_APP_LOCALE]
  return formatTranslation(catalog[key] ?? catalogs[DEFAULT_APP_LOCALE][key] ?? key, params)
}

/** Resolve a visible source string through the catalog. This is used by
 * legacy command tables whose ids predate the keyed i18n catalog. */
export function translateSourceText(locale: AppLocale, sourceText: string): string {
  const key = sourceTextKeys.get(sourceText)
  return key ? translate(locale, key) : ''
}

/** Reads the persisted language for non-React code such as core algorithms and stores. */
export function currentAppLocale(storage?: Storage): AppLocale {
  return runtimeLocale ?? parseAppLocale(readStoredString(LANGUAGE_PREFERENCE_KEY, storage))
}

/** Supplies a locale in runtimes without localStorage, such as decoding workers. */
export function setRuntimeAppLocale(locale: AppLocale | null): void {
  runtimeLocale = locale ? parseAppLocale(locale) : null
}

/** Translates runtime messages without coupling core modules to React or Tauri. */
export function translateCurrent(key: TranslationKey, params?: TranslationParams, storage?: Storage): string {
  return translate(currentAppLocale(storage), key, params)
}

export function localeDisplayName(locale: AppLocale, _displayLocale: AppLocale = locale): string {
  return translate(locale, localeNameKeys[locale])
}
