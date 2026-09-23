import type { Copy, Language } from '../content'
import type { Order } from './store'
import { formatPrice, productCopy } from '../market/catalog'
import { useCatalogue } from '../market/catalogue'
import { Button, StatusBadge } from '../ui'

/** Order summaries link to dedicated details and downloads. */
export function PurchaseLedger({ orders, t, language }: { orders: Order[]; t: Copy; language: Language }) {
  const { products } = useCatalogue()
  const zh = language === 'zh'
  return <div className="account-order-index">
    <div className="purchase-register-labels" aria-hidden="true"><span>{zh ? '购买内容 / 订单' : 'Purchase / order'}</span><span>{zh ? '购买日期' : 'Date'}</span><span>{zh ? '实付金额' : 'Total paid'}</span><span>{zh ? '状态' : 'Status'}</span><span>{zh ? '操作' : 'Action'}</span></div>
    {orders.map((order) => {
      const names = order.lines.map((line) => {
        const product = products.find((item) => item.id === line.id)
        return product ? productCopy(product.name, language) : line.name
      })
      return <div className="account-order-row" key={order.id}>
        <span className="purchase-register-product"><strong>{names[0] ?? (zh ? '购买订单' : 'Purchase')}{names.length > 1 && (zh ? ` 等 ${names.length} 件作品` : ` + ${names.length - 1} more`)}</strong><small>{order.id}</small></span>
        <time dateTime={new Date(order.createdAt).toISOString()}>{new Date(order.createdAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</time>
        <span className="purchase-register-amount">{formatPrice(order.total, language)}</span>
        <span className="purchase-status"><StatusBadge tone="success">{t.marketPage.orders.statusPaid}</StatusBadge></span>
        <Button size="compact" href={`#/orders/${order.id}`} ariaLabel={`${zh ? '订单详情与下载' : 'Details and downloads'} ${order.id}`}>{zh ? '详情与下载' : 'Details & downloads'}</Button>
      </div>
    })}
  </div>
}
