import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadEditorPreferences } from '@/core/file-preferences'
import { DEFAULT_APP_LOCALE, translate, type AppLocale, type TranslationKey, type TranslationParams } from '@/core/localization'

type Translate = (key: TranslationKey, params?: TranslationParams) => string

interface I18nContextValue {
  locale: AppLocale
  t: Translate
}

const defaultValue: I18nContextValue = {
  locale: DEFAULT_APP_LOCALE,
  t: (key, params) => translate(DEFAULT_APP_LOCALE, key, params)
}

const I18nContext = createContext<I18nContextValue>(defaultValue)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() => loadEditorPreferences().language)

  useEffect(() => {
    const syncLocale = (): void => setLocale(loadEditorPreferences().language)
    window.addEventListener('moonsprite:preferences-changed', syncLocale)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncLocale)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale])
  const value = useMemo<I18nContextValue>(() => ({ locale, t }), [locale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
