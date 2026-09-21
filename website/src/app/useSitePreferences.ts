import { useEffect, useRef, useState } from 'react'
import type { Language } from '../content'

export type SiteTheme = 'dark' | 'light'

export function useSitePreferences() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('moonsprite-language')
    if (saved === 'zh' || saved === 'en') return saved
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  })
  const [theme, setTheme] = useState<SiteTheme>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const langMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('moonsprite-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('moonsprite-site-theme', theme)
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [theme])

  useEffect(() => {
    if (!langOpen) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [langOpen])

  useEffect(() => {
    document.body.dataset.menuOpen = String(menuOpen)
    return () => { delete document.body.dataset.menuOpen }
  }, [menuOpen])

  return { language, setLanguage, theme, setTheme, menuOpen, setMenuOpen, langOpen, setLangOpen, langMenuRef }
}
