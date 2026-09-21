import { isLocalAdmin } from '../api/permissions'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { PixelArrowLeft as ArrowLeft } from '../ui/icons'
import type { Language } from '../content'
import type { Route } from '../router'
import { useAccount } from '../account/store'
import { PageHeader } from '../ui'

export function WorkspaceLayout({ route, language, children }: { route: Route; language: Language; children: ReactNode }) {
  const { account } = useAccount()
  const contentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [route.page, route.subId])
  const zh = language === 'zh'
  const groups = [
    { title: zh ? '个人账户' : 'Your account', links: [
      { href: '#/account', label: zh ? '账户概览' : 'Overview', active: route.page === 'account' },
      { href: '#/purchases', label: zh ? '我的购买' : 'Purchases', active: ['purchases', 'orders', 'receipt'].includes(route.page) },
      { href: '#/settings', label: zh ? '账号设置' : 'Settings', active: route.page === 'settings' },
      { href: '#/support', label: zh ? '客服与工单' : 'Support', active: route.page === 'support' },
    ] },
    { title: zh ? '创作者工作室' : 'Creator studio', links: [
      { href: '#/studio', label: zh ? '工作室概览' : 'Studio overview', active: route.page === 'studio' && !route.subId },
      { href: '#/studio/products', label: zh ? '作品管理' : 'Manage products', active: (route.page === 'studio' && route.subId === 'products') || route.page === 'studio-publish' },
      { href: '#/studio/sales', label: zh ? '销售记录' : 'Sales', active: route.page === 'studio' && route.subId === 'sales' },
      { href: '#/studio/settlement', label: zh ? '收益与结算' : 'Payouts', active: route.page === 'settlement' },
    ] },
  ]
  if (route.page === 'admin' || isLocalAdmin()) groups.push({ title: zh ? '平台管理' : 'Administration', links: [
    { href: '#/admin', label: zh ? '管理概览' : 'Admin overview', active: route.page === 'admin' && !route.subId },
    ...[
      ['listings', zh ? '作品审核' : 'Listing review'], ['tickets', zh ? '客服工单' : 'Support tickets'],
      ['reports', zh ? '举报处理' : 'Reports'], ['payouts', zh ? '提现审核' : 'Withdrawal review'], ['settings', zh ? '平台设置' : 'Platform settings'],
    ].map(([id, label]) => ({ href: `#/admin/${id}`, label, active: route.page === 'admin' && route.subId === id })),
  ] })
  return <div className="workspace-shell">
    <aside className="workspace-sidebar">
      <a className="workspace-market-link" href="#/market"><ArrowLeft aria-hidden="true" />{zh ? '返回市场' : 'Back to marketplace'}</a>
      <div className="workspace-identity"><strong>{account?.name ?? (zh ? '个人工作台' : 'Your workspace')}</strong><span>{account?.email ?? (zh ? '购买、创作与支持' : 'Purchases, creation and support')}</span></div>
      {(route.page === 'admin' ? groups.slice(-1) : groups).map((group) => <nav key={group.title} aria-label={group.title} className="workspace-nav"><h2>{group.title}</h2>{group.links.map(({ href, label, active }) => <a href={href} key={href} aria-current={active ? 'page' : undefined}>{label}</a>)}</nav>)}
      {route.page === 'admin' && <a className="workspace-market-link" href="#/account">{zh ? '个人工作台' : 'Personal workspace'}</a>}
    </aside>
    <div className="workspace-content" ref={contentRef}>{children}</div>
  </div>
}

export function WorkspacePage({ title, subtitle, eyebrow, actions, back, backLabel, children }: { title: string; subtitle?: string; eyebrow?: string; actions?: ReactNode; back?: string; backLabel?: string; children: ReactNode }) {
  return <main id="main" className="workspace-page"><PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} actions={actions} back={back} backLabel={backLabel} /><div className="workspace-body">{children}</div></main>
}
