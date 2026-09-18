import type { zhCNMessages } from './zh-CN'

export const DEFAULT_APP_LOCALE = 'zh-CN' as const
export const AVAILABLE_APP_LOCALES = [
  DEFAULT_APP_LOCALE,
  'en-US',
  'ja-JP',
  'ko-KR',
  'es-ES',
  'fr-FR',
  'de-DE',
  'pt-BR',
  'ru-RU'
] as const
export const LANGUAGE_PREFERENCE_KEY = 'moonsprite.preference.language'

export type AppLocale = (typeof AVAILABLE_APP_LOCALES)[number]
export type TranslationParams = Record<string, string | number>
export type TranslationKey = keyof typeof zhCNMessages
export type TranslationCatalog = Partial<Record<TranslationKey, string>>
