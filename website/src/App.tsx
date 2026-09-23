import { useEffect } from 'react'
import { copy } from './content'
import { isWorkspaceRoute, useRoute } from './router'
import { scrollToId } from './ui'
import { RouteOutlet } from './app/RouteOutlet'
import { DocumentMeta } from './app/DocumentMeta'
import { useSitePreferences } from './app/useSitePreferences'
import { SiteNavigation } from './app/SiteNavigation'
import { SiteFooter } from './app/SiteFooter'

export function App() {
  const preferences = useSitePreferences()
  const { language } = preferences
  const route = useRoute()
  const t = copy[language]
  useEffect(() => {
    if (isWorkspaceRoute(route)) return
    if (route.page === 'blog' && route.subId) {
      const timer = setTimeout(() => scrollToId(`post-${route.subId}`), 90)
      return () => clearTimeout(timer)
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [route.page, route.subId])

  return <div className={`site-shell${isWorkspaceRoute(route) ? ' site-workspace' : ''}`}>
    <DocumentMeta route={route} language={language} t={t} />
    <a className="skip-link" href="#main">{language === 'zh' ? '跳到正文' : 'Skip to content'}</a>
    <SiteNavigation preferences={preferences} route={route} t={t} />
    <RouteOutlet route={route} t={t} language={language} />
    <SiteFooter t={t} />
  </div>
}
