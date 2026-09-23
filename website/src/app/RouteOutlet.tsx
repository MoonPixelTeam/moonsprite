import { CompetitionsPage } from '../pages/Competitions'
import { AuthPage } from '../pages/Auth'
import { Suspense, lazy } from 'react'
import { WorkspaceRoutes } from '../workspace/WorkspaceRoutes'
import { LoadingState } from '../ui'
import type { Copy, Language } from '../content'
import type { Route } from '../router'
import { Home } from '../pages/Home'
import { MarketPage, PackDetailPage } from '../pages/Market'
import { UiPage } from '../pages/Ui'
import { LicensePage } from '../pages/License'
import { PrivacyPage } from '../pages/Privacy'

const DocsPage = lazy(() => import('../pages/Docs').then((module) => ({ default: module.DocsPage })))
const FaqPage = lazy(() => import('../pages/Faq').then((module) => ({ default: module.FaqPage })))
const BlogPage = lazy(() => import('../pages/Blog').then((module) => ({ default: module.BlogPage })))

export function RouteOutlet({ route, t, language }: { route: Route; t: Copy; language: Language }) {
  return <>
    {(route.page === 'login' || route.page === 'register') && <AuthPage key={route.page} mode={route.page} returnTo={route.returnTo} t={t} language={language} />}
    <WorkspaceRoutes route={route} t={t} language={language} />
    {route.page === 'competitions' && <CompetitionsPage language={language} />}
    {route.page === 'home' && <Home t={t} language={language} />}
    {route.page === 'market' && (route.subId ? <PackDetailPage t={t} language={language} productId={route.subId} /> : <MarketPage t={t} language={language} />)}
    <Suspense fallback={<main id="main" className="route-loading" aria-busy="true"><LoadingState label={language === 'zh' ? '正在载入内容…' : 'Loading content…'} /></main>}>
      {route.page === 'docs' && <main id="main"><DocsPage t={t} language={language} subId={route.subId} /></main>}
      {route.page === 'faq' && <main id="main"><FaqPage t={t} language={language} subId={route.subId} /></main>}
      {route.page === 'blog' && <main id="main"><BlogPage t={t} language={language} subId={route.subId} /></main>}
    </Suspense>
    {route.page === 'ui' && <UiPage t={t} language={language} />}
    {route.page === 'privacy' && <PrivacyPage t={t} language={language} />}
    {route.page === 'license' && <LicensePage t={t} language={language} />}
  </>
}
