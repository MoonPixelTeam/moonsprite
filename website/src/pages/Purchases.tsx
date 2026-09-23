import { Input } from '../ui'
import { useState } from 'react'
import { WorkspacePage } from '../ui'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { productCopy } from '../market/catalog'
import { useCatalogue } from '../market/catalogue'
import { PurchaseLedger } from '../account/PurchaseLedger'
import { EmptyState, Field, Button, Panel } from '../ui'

/** Every purchase on the account, with a download for each pack. */
export function PurchasesPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.accountPage
  const { account, orders } = useAccount()
  const { products } = useCatalogue()
  const [query, setQuery] = useState('')
  const zh = language === 'zh'
  const visibleOrders = [...orders].sort((a, b) => b.createdAt - a.createdAt).filter((order) => `${order.id} ${order.lines.map((line) => { const product = products.find((item) => item.id === line.id); return `${line.name} ${product ? productCopy(product.name, language) : ''}` }).join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <WorkspacePage title={strings.purchasesTitle} subtitle={zh ? '按购买时间倒序排列，进入订单查看明细与下载。' : 'Newest orders first. Open an order for details and downloads.'}>
    {!account
      ? <Panel title={strings.signedInAs}>
        <p className="panel-copy">{strings.purchasesSignedOut}</p>
        <Button variant="primary" href="#/login">{strings.signIn}</Button>
      </Panel>
      : orders.length === 0
        ? <Panel><EmptyState title={zh ? '还没有购买记录' : 'No purchases yet'} description={strings.noOrders} action={<Button variant="primary" href="#/market">{t.marketTeaser.cta}</Button>} /></Panel>
        : <div className="purchase-library">
          <div className="purchase-toolbar">
            <Field label={zh ? '搜索购买记录' : 'Search purchases'}><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '作品名称或订单编号' : 'Product name or order number'} /></Field>
            <p role="status">{zh ? `显示 ${visibleOrders.length} / ${orders.length} 笔订单` : `${visibleOrders.length} of ${orders.length} orders`}</p>
          </div>
          <Panel title={zh ? '订单列表' : 'Orders'} className="account-recent-purchases purchase-ledger">
            {visibleOrders.length
              ? <PurchaseLedger orders={visibleOrders} t={t} language={language} />
              : <EmptyState title={zh ? '没有匹配的购买记录' : 'No matching purchases'} description={zh ? '试试其他作品名称，或清除搜索查看全部订单。' : 'Try another product name or clear your search to see all orders.'} action={<Button onClick={() => setQuery('')}>{zh ? '清除搜索' : 'Clear search'}</Button>} />}
          </Panel>
        </div>}
  </WorkspacePage>
}
