import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { Button, EmptyState, Panel } from '../ui'
import { PixelSettings as Settings } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { OrderList } from '../account/OrderList'
import '../styles/account-library.css'

export function AccountPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.accountPage
  const { account, orders, signOut } = useAccount()
  const zh = language === 'zh'
  if (!account) return null
  return <WorkspacePage title={zh ? '账户概览' : 'Account overview'} subtitle={zh ? '管理账户，继续下载你购买的作品。' : 'Manage your account and access your purchases.'}>
    <div className="account-overview">
      <Panel title={zh ? '账户资料' : 'Profile'} actions={<Button size="compact" href="#/settings" icon={<Settings aria-hidden="true" />}>{t.accountSettings.title}</Button>}>
        <div className="account-profile">
          <div className="account-profile-name"><strong>{account.name}</strong><span>{account.email}</span></div>
          <dl className="account-profile-meta">
            <div><dt>{strings.memberSince}</dt><dd>{new Date(account.createdAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</dd></div>
            <div><dt>{zh ? '购买订单' : 'Orders'}</dt><dd>{orders.length}</dd></div>
          </dl>
          <Button size="compact" onClick={() => { void signOut() }}>{strings.signOut}</Button>
        </div>
      </Panel>
      <Panel title={strings.recentOrders} actions={<Button size="compact" href="#/purchases">{strings.viewAll}</Button>}>
        {orders.length === 0
          ? <EmptyState title={strings.noOrders} action={<Button href="#/market">{t.marketTeaser.cta}</Button>} />
          : <div className="purchase-ledger"><OrderList orders={orders.slice(0, 2)} t={t} language={language} /></div>}
      </Panel>
      <nav className="account-utility-links" aria-label={zh ? '更多服务' : 'More services'}>
        <a href="#/studio">{strings.studioHref}</a>
        <a href="#/support">{t.supportPage.title}</a>
      </nav>
    </div>
  </WorkspacePage>
}
