import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Languages, Menu, Moon, Sun, X } from 'lucide-react'
import { SITE_CONFIG } from './config'
import { copy, type Language } from './content'
import { navigate, useRoute, type Route } from './router'
import { scrollToId } from './ui'
import { Home } from './pages/Home'
import { DocsPage } from './pages/Docs'
import { FaqPage } from './pages/Faq'
import { BlogPage } from './pages/Blog'
import { MarketPage, PackDetailPage } from './pages/Market'

type SiteTheme = 'dark' | 'light'

function FooterLink({ linkKey, label }: { linkKey: string; label: string }) {
  const href = (SITE_CONFIG.footerLinks as Record<string, string>)[linkKey]
  if (href) {
    const external = href.startsWith('http')
    return <li><a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}{external && <ExternalLink aria-hidden="true" />}</a></li>
  }
  return <li><span className="pending" aria-disabled="true">{label}</span></li>
}

export function App() {
  const initialLanguage = (): Language => {
    const saved = localStorage.getItem('moonsprite-language')
    if (saved === 'zh' || saved === 'en') return saved
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [theme, setTheme] = useState<SiteTheme>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const langMenuRef = useRef<HTMLDivElement>(null)
  const route = useRoute()
  const t = copy[language]

  useEffect(() => {
    if (!langOpen) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [langOpen])

  useEffect(() => {
    localStorage.setItem('moonsprite-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('moonsprite-site-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#d8dfe7' : '#090a0d')
  }, [theme])

  useEffect(() => {
    const titles: Record<Route['page'], string> = {
      home: t.meta.title,
      market: `${t.marketPage.title} - MoonSprite`,
      docs: `${t.docsPage.title} - MoonSprite`,
      faq: `${t.faqPage.title} - MoonSprite`,
      blog: `${t.blogPage.title} - MoonSprite`,
    }
    document.title = titles[route.page]
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t.meta.title)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t.meta.description)
  }, [route.page, t])

  useEffect(() => {
    if (route.page === 'blog' && route.subId) {
      const timer = setTimeout(() => scrollToId(`post-${route.subId}`), 90)
      return () => clearTimeout(timer)
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [route.page, route.subId])

  useEffect(() => {
    document.body.dataset.menuOpen = String(menuOpen)
    return () => { delete document.body.dataset.menuOpen }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)
  const goSection = (id: string) => {
    closeMenu()
    if (route.page === 'home') {
      scrollToId(id)
      return
    }
    navigate('#/')
    setTimeout(() => scrollToId(id), 90)
  }
  const goHome = () => {
    closeMenu()
    navigate('#/')
  }
  const columns = t.footer.columns

  const navLinks = <>
    <a href="#/" onClick={(event) => { event.preventDefault(); goSection('work') }}>{t.nav.work}</a>
    <a href="#/" onClick={(event) => { event.preventDefault(); goSection('features') }}>{t.nav.features}</a>
    <a href="#/docs" onClick={closeMenu} aria-current={route.page === 'docs' ? 'page' : undefined}>{t.nav.docs}</a>
    <a href="#/market" onClick={closeMenu} aria-current={route.page === 'market' ? 'page' : undefined}>{t.nav.market}</a>
    <a href="#/faq" onClick={closeMenu} aria-current={route.page === 'faq' ? 'page' : undefined}>{t.nav.faq}</a>
    <a href="#/blog" onClick={closeMenu} aria-current={route.page === 'blog' ? 'page' : undefined}>{t.nav.blog}</a>
    <a href={SITE_CONFIG.communityUrl} target="_blank" rel="noopener noreferrer">{t.nav.community}</a>
    <a href={SITE_CONFIG.githubUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
  </>

  return <div className="site-shell">
    <a className="skip-link" href="#main">Skip to content</a>

    <header className="app-chrome">
      <div className="titlebar">
        <a className="titlebar-app" href="#/" onClick={(event) => { event.preventDefault(); goHome() }}>
          <img src="/assets/moonsprite-logo.svg" width="16" height="16" alt="" />
          <span>MoonSprite</span>
          <small>— {t.chrome.docLabel}</small>
        </a>
        <div className="titlebar-controls" aria-hidden="true"><i>—</i><i>▢</i><i className="close">✕</i></div>
      </div>
      <div className="menubar">
        <nav className={menuOpen ? 'menubar-tabs open' : 'menubar-tabs'} aria-label="Primary navigation">{navLinks}</nav>
        <div className="menubar-utils">
          <button className="icon-button" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t.common.themeToLight : t.common.themeToDark}>{theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</button>
          <div className="lang-menu" ref={langMenuRef}>
            <button className="language-button" type="button" onClick={() => setLangOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={langOpen}><Languages aria-hidden="true" />{language === 'zh' ? '中文' : 'EN'}</button>
            {langOpen && <ul className="lang-options" role="listbox" aria-label="Language">
              <li><button type="button" role="option" aria-selected={language === 'zh'} onClick={() => { setLanguage('zh'); setLangOpen(false) }}>中文</button></li>
              <li><button type="button" role="option" aria-selected={language === 'en'} onClick={() => { setLanguage('en'); setLangOpen(false) }}>English</button></li>
            </ul>}
          </div>
          <button className="menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label={menuOpen ? t.nav.close : t.nav.menu}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>

    {route.page === 'home' && <Home t={t} />}
    {route.page === 'market' && (route.subId
      ? <PackDetailPage t={t} language={language} productId={route.subId} />
      : <MarketPage t={t} language={language} />)}
    {route.page === 'docs' && <main id="main"><DocsPage t={t} subId={route.subId} /></main>}
    {route.page === 'faq' && <main id="main"><FaqPage t={t} subId={route.subId} /></main>}
    {route.page === 'blog' && <main id="main"><BlogPage t={t} subId={route.subId} /></main>}

    <footer className="site-footer">
      <div className="content-wrap footer-cols">
        <nav className="footer-col" aria-label={columns.community.title}><h3>{columns.community.title}</h3><ul>{columns.community.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
        <nav className="footer-col" aria-label={columns.follow.title}><h3>{columns.follow.title}</h3><ul>{columns.follow.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
        <nav className="footer-col" aria-label={columns.docs.title}><h3>{columns.docs.title}</h3><ul>{columns.docs.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
        <nav className="footer-col" aria-label={columns.more.title}><h3>{columns.more.title}</h3><ul>{columns.more.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
      </div>
      <div className="content-wrap footer-bottom">
        <div className="footer-logo"><img src="/assets/moonsprite-logo.svg" width="40" height="40" alt="" /><strong>MoonSprite</strong></div>
        <p>{t.footer.copyright}</p>
      </div>
    </footer>
  </div>
}
