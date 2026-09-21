import { useState } from 'react'
import { WorkspacePage } from '../workspace/WorkspaceLayout'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { OrderList } from '../account/OrderList'
import { EmptyState, Field, Button, Panel } from '../ui'
import '../styles/account-library.css'

/** Every purchase on the account, with a download for each pack. */
export function PurchasesPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.accountPage
  const { account, orders } = useAccount()
  const [query, setQuery] = useState('')
  const zh = language === 'zh'
  const visibleOrders = orders.filter((order) => `${order.id} ${order.lines.map((line) => line.name).join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <WorkspacePage title={strings.purchasesTitle} subtitle={zh ? '已购作品集中在这里，随时查看订单与下载文件。' : 'Find your purchased products, order details and downloads here.'}>
    {!account
      ? <Panel title={strings.signedInAs}>
        <p className="panel-copy">{strings.purchasesSignedOut}</p>
        <Button variant="primary" href="#/login">{strings.signIn}</Button>
      </Panel>
      : orders.length === 0
        ? <EmptyState title={strings.orders} description={strings.noOrders} action={<Button href="#/market">{t.marketTeaser.cta}</Button>} />
        : <div className="purchase-library">
          <div className="purchase-toolbar">
            <Field label={zh ? '搜索购买记录' : 'Search purchases'}><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '作品名称或订单编号' : 'Product name or order number'} /></Field>
            <p role="status">{zh ? `显示 ${visibleOrders.length} / ${orders.length} 笔订单` : `${visibleOrders.length} of ${orders.length} orders`}</p>
          </div>
          <div className="purchase-ledger">
            {visibleOrders.length
              ? <OrderList orders={visibleOrders} t={t} language={language} />
              : <EmptyState title={zh ? '没有匹配的购买记录' : 'No matching purchases'} description={zh ? '试试其他作品名称，或清除搜索查看全部订单。' : 'Try another product name or clear your search to see all orders.'} action={<Button onClick={() => setQuery('')}>{zh ? '清除搜索' : 'Clear search'}</Button>} />}
          </div>
        </div>}
  </WorkspacePage>
}
