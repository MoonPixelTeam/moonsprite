import { describe, expect, it } from 'vitest'
import { zhCNMessages } from './zh-CN'
import { enUSMessages } from './en-US'
import { jaJPMessages } from './ja-JP'
import { koKRMessages } from './ko-KR'
import { esESMessages } from './es-ES'
import { frFRMessages } from './fr-FR'
import { deDEMessages } from './de-DE'
import { ptBRMessages } from './pt-BR'
import { ruRUMessages } from './ru-RU'
import { AVAILABLE_APP_LOCALES, type AppLocale } from './contracts'
import { translate } from '@/core/localization'

const catalogs: Record<AppLocale, Record<string, string>> = {
  'zh-CN': zhCNMessages, 'en-US': enUSMessages, 'ja-JP': jaJPMessages,
  'ko-KR': koKRMessages, 'es-ES': esESMessages, 'fr-FR': frFRMessages,
  'de-DE': deDEMessages, 'pt-BR': ptBRMessages, 'ru-RU': ruRUMessages
}
const source: Record<string, string> = zhCNMessages
const english: Record<string, string> = enUSMessages
const placeholders = (text: string): string[] => (text.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) ?? []).sort()
const incompleteCopy: Partial<Record<AppLocale, RegExp>> = {
  'ja-JP': /データ/, 'ko-KR': /데이터/, 'de-DE': /Nicht angegeben/i,
  'pt-BR': /Não especificado/i, 'ru-RU': /Не указано/i
}

describe('registered language catalogs', () => {
  it.each(AVAILABLE_APP_LOCALES)('%s has the exact source keys and interpolation parameters', (locale) => {
    const catalog = catalogs[locale]
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort())
    const errors: string[] = []
    for (const [key, value] of Object.entries(catalog)) {
      if (!value.trim()) errors.push(`${key}: empty`)
      if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(source[key]))) errors.push(`${key}: interpolation mismatch`)
      if (value in source || /componentLibrary\.[a-z]/i.test(value)) errors.push(`${key}: unresolved translation key`)
      if (/9000\d{2}/.test(value) && !/9000\d{2}/.test(english[key])) errors.push(`${key}: translation marker`)
      if (incompleteCopy[locale]?.test(value) && !/data|unspecified|not specified|not set|unknown|metadata|information/i.test(english[key])) errors.push(`${key}: placeholder copy`)
    }
    expect(errors).toEqual([])
  })

  it.each(AVAILABLE_APP_LOCALES)('%s interpolates values without translating user content', (locale) => {
    const name = '用户作品-{index}.aseprite'
    expect(translate(locale, 'home.openArtwork', { name })).toContain(name)
    expect(translate(locale, 'history.display.shown', { shown: 3, total: 8 })).not.toMatch(/\{(?:shown|total)\}/)
    expect(translate(locale, 'usageStats.hoursMinutes', { hours: 2, minutes: 17 })).toContain('17')
  })
})
