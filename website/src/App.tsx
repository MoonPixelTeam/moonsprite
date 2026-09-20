import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { IconButton } from './ui'
import { ExternalLink, Languages, Menu, Moon, ShoppingCart, Sun, User, UserCheck, X } from 'lucide-react'
import { SITE_CONFIG } from './config'
import { copy, type Language } from './content'
import { navigate, useRoute, type Route } from './router'
import { scrollToId } from './ui'
import { Home } from './pages/Home'
import { MarketPage, PackDetailPage } from './pages/Market'
import { AccountPage } from './pages/Account'
import { PurchasesPage } from './pages/Purchases'
import { StudioPage } from './pages/Studio'
import { StudioPublishPage } from './pages/StudioPublish'
import { UiPage } from './pages/Ui'
import { LicensePage } from './pages/License'
import { OrderPage, ReceiptPage } from './pages/Orders'
import { SettingsPage } from './pages/Settings'
import { SupportPage } from './pages/Support'
import { SettlementPage } from './pages/Settlement'
import { AdminPage } from './pages/Admin'
import { useAccount } from './account/store'
import { useCartStore } from './market/cart'

/*
 * The docs, FAQ and blog carry long-form copy — 164 kB of it between them — and nobody
 * reads a manual on arrival. Loading them on demand keeps that text out of the first
 * download; react-dom alone is the fixed cost of the entry chunk.
 */
const DocsPage = lazy(() => import('./pages/Docs').then((module) => ({ default: module.DocsPage })))
const FaqPage = lazy(() => import('./pages/Faq').then((module) => ({ default: module.FaqPage })))
const BlogPage = lazy(() => import('./pages/Blog').then((module) => ({ default: module.BlogPage })))

import { LAZY_PAGE_TITLES } from './pages/pageTitles'

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
  const { cart, openCart, hasOpener } = useCartStore()
  const { account } = useAccount()

  /*
   * The header shows the cart on every route, but only the market and pack pages own a
   * drawer. Off those pages the button brings the market up and opens the drawer once it
   * has mounted, so the button always does what it looks like it does.
   */
  const openCartFromHeader = () => {
    if (hasOpener) {
      openCart()
      return
    }
    navigate('#/market')
    window.setTimeout(openCart, 120)
  }

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
      docs: `${LAZY_PAGE_TITLES.docs[language]} - MoonSprite`,
      faq: `${LAZY_PAGE_TITLES.faq[language]} - MoonSprite`,
      blog: `${LAZY_PAGE_TITLES.blog[language]} - MoonSprite`,
      account: `${t.accountPage.title} - MoonSprite`,
      purchases: `${t.accountPage.purchasesTitle} - MoonSprite`,
      studio: `${t.studioPage.title} - MoonSprite`,
      'studio-publish': `${t.studioPage.upload} - MoonSprite`,
      ui: `UI kit - MoonSprite`,
      license: `${t.marketPage.license.title} - MoonSprite`,
      receipt: `${t.marketPage.receipt.title} - MoonSprite`,
      orders: `${t.marketPage.orders.title} - MoonSprite`,
      settings: `${t.accountSettings.title} - MoonSprite`,
      support: `${t.supportPage.title} - MoonSprite`,
      settlement: `${t.studioSettlement.title} - MoonSprite`,
      admin: `${t.adminPage.title} - MoonSprite`,
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

  return <div className={route.page === 'home' ? 'site-shell theme-dark' : 'site-shell'}>
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
          <span className="cart-slot">
            <IconButton className="cart-button-icon" label={t.marketPage.cart.open} onClick={openCartFromHeader} icon={<ShoppingCart aria-hidden="true" />} />
            {cart.count > 0 && <span className="cart-badge">{cart.count}</span>}
          </span>
          <a
            className="icon-button account-button"
            href="#/account"
            onClick={closeMenu}
            aria-label={account ? `${t.accountPage.signedInAs}: ${account.name}` : t.accountPage.title}
            aria-current={route.page === 'account' ? 'page' : undefined}>
            {/* Same neutral treatment either way: the glyph is the only sign of state. */}
            {account ? <UserCheck aria-hidden="true" /> : <User aria-hidden="true" />}
          </a>
          <IconButton label={theme === 'dark' ? t.common.themeToLight : t.common.themeToDark} onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} icon={theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />} />
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

    {route.page === 'home' && <Home t={t} language={language} />}
    {route.page === 'market' && (route.subId
      ? <PackDetailPage t={t} language={language} productId={route.subId} />
      : <MarketPage t={t} language={language} />)}
    <Suspense fallback={<main id="main" className="route-loading" aria-busy="true" />}>
      {route.page === 'docs' && <main id="main"><DocsPage t={t} language={language} subId={route.subId} /></main>}
      {route.page === 'faq' && <main id="main"><FaqPage t={t} language={language} subId={route.subId} /></main>}
      {route.page === 'blog' && <main id="main"><BlogPage t={t} language={language} subId={route.subId} /></main>}
    </Suspense>
    {route.page === 'account' && <AccountPage t={t} language={language} />}
    {route.page === 'purchases' && <PurchasesPage t={t} language={language} />}
    {route.page === 'studio' && <StudioPage t={t} language={language} />}
    {route.page === 'studio-publish' && <StudioPublishPage t={t} language={language} productId={route.subId} />}
    {route.page === 'ui' && <UiPage t={t} language={language} />}
    {route.page === 'license' && <LicensePage t={t} language={language} />}
    {route.page === 'receipt' && <ReceiptPage t={t} language={language} />}
    {route.page === 'orders' && <OrderPage t={t} language={language} orderId={route.subId} />}
    {route.page === 'settings' && <SettingsPage t={t} language={language} />}
    {route.page === 'support' && <SupportPage t={t} language={language} />}
    {route.page === 'settlement' && <SettlementPage t={t} language={language} />}
    {route.page === 'admin' && <AdminPage t={t} language={language} />}

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
