import { TaskLinks } from '../ui'
import { WorkspacePage } from '../ui'
import { Button, EmptyState, Panel } from '../ui'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { PurchaseLedger } from '../account/PurchaseLedger'

export function AccountPage({ t, language }: { t: Copy; language: Language }) {
  const { account, orders, signOut } = useAccount()
  const zh = language === 'zh'
  if (!account) return null
  const recent = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)
  const owned = new Set(orders.flatMap((order) => order.lines.map((line) => line.id))).size
  return <WorkspacePage title={zh ? '个人中心' : 'Your account'} subtitle={zh ? '查看已购作品，管理你的账号。' : 'Your purchases and account, in one place.'}>
    <Panel title={account.name} actions={<><Button size="compact" href="#/settings">{t.accountSettings.title}</Button><Button size="compact" onClick={() => { void signOut() }}>{t.accountPage.signOut}</Button></>}>
      <p className="panel-copy">{account.email}</p>
      <dl className="workspace-facts">
        <div><dt>{zh ? '已购作品' : 'Owned products'}</dt><dd>{owned}</dd></div>
        <div><dt>{zh ? '购买订单' : 'Orders'}</dt><dd>{orders.length}</dd></div>
        <div><dt>{zh ? '邮箱状态' : 'Email status'}</dt><dd className={account.emailVerified ? 'verified' : 'unverified'}>{account.emailVerified ? t.accountSettings.emailVerified : t.accountSettings.emailUnverified}</dd></div>
      </dl>
    </Panel>

    <Panel className="account-recent-purchases" title={zh ? '最近购买' : 'Recent purchases'} actions={<Button size="compact" href="#/purchases">{t.accountPage.viewAll}</Button>}>
      {recent.length ? <PurchaseLedger orders={recent} t={t} language={language} /> : <EmptyState title={t.accountPage.noOrders} action={<Button href="#/market">{t.marketTeaser.cta}</Button>} />}
    </Panel>
    <TaskLinks label={language === 'zh' ? '任务入口' : 'Tasks'} items={[
{ href: '#/purchases', title: zh ? '购买与下载' : 'Purchases & downloads', description: zh ? '查找作品、订单和交付文件' : 'Find products, orders and files' },
{ href: '#/settings', title: zh ? '资料与安全' : 'Profile & security', description: zh ? '管理邮箱、密码和账户隐私' : 'Manage email, password and privacy' },
{ href: '#/support', title: zh ? '售后支持' : 'Purchase support', description: zh ? '提交问题、查看客服回复' : 'Create tickets and read replies' }
        ]} />
    <div className="account-home-footer"><a href="#/support">{zh ? '购买或下载遇到问题？联系客服' : 'Need help with a purchase? Contact support'}</a></div>
  </WorkspacePage>
}
