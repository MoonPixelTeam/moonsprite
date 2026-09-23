import { useEffect } from 'react'
import { authHash, navigate, routeHash, isWorkspaceRoute } from '../router'
import { AdminPage } from '../pages/Admin'
import { LoadingState } from '../ui'
import type { Copy, Language } from '../content'
import type { Route } from '../router'
import { useAccount } from '../account/store'
import { WorkspaceLayout } from './WorkspaceLayout'
import { StudioAccess } from './StudioAccess'
import { AccountPage } from '../pages/Account'
import { PurchasesPage } from '../pages/Purchases'
import { StudioPage, StudioSalesOrderPage } from '../pages/Studio'
import { StudioPublishPage } from '../pages/StudioPublish'
import { OrderPage, ReceiptPage } from '../pages/Orders'
import { SettingsPage } from '../pages/Settings'
import { SupportPage } from '../pages/Support'
import { SettlementPage } from '../pages/Settlement'

export function WorkspaceRoutes({ route, t, language }: { route: Route; t: Copy; language: Language }) {
  const { account, ready } = useAccount()
  const isWorkspace = isWorkspaceRoute(route)
  useEffect(() => { if (isWorkspace && ready && !account) navigate(authHash('login', routeHash(route))) }, [isWorkspace, ready, account, route.page, route.subId])
  if (!isWorkspace) return null
  if (!ready || !account) return <main id="main"><LoadingState label={language === 'zh' ? '正在恢复登录状态…' : 'Restoring session…'} /></main>
  const creator = ['studio', 'studio-publish', 'studio-sales-order', 'settlement'].includes(route.page)
  let content
  switch (route.page) {
    case 'admin': content = <AdminPage key={route.subId ?? 'overview'} t={t} language={language} section={route.subId} />; break
    case 'account': content = <AccountPage t={t} language={language} />; break
    case 'purchases': content = <PurchasesPage t={t} language={language} />; break
    case 'studio': content = <StudioPage t={t} language={language} section={route.subId} />; break
    case 'studio-sales-order': content = <StudioSalesOrderPage t={t} language={language} orderId={route.subId} />; break
    case 'studio-publish': content = <StudioPublishPage key={route.subId ?? 'new'} t={t} language={language} productId={route.subId} />; break
    case 'settings': content = <SettingsPage t={t} language={language} />; break
    case 'support': content = <SupportPage t={t} language={language} />; break
    case 'settlement': content = <SettlementPage t={t} language={language} />; break
    case 'orders': content = <OrderPage t={t} language={language} orderId={route.subId} />; break
    case 'receipt': content = <ReceiptPage t={t} language={language} />; break
  }
  return <WorkspaceLayout route={route} language={language}>
    {creator ? <StudioAccess t={t} language={language}>{content}</StudioAccess> : content}
  </WorkspaceLayout>
}
