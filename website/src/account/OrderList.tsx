import { useEffect, useState } from 'react'
import { PixelDownload as Download } from '../ui/icons'
import type { Copy, Language } from '../content'
import { formatPrice, productCopy } from '../market/catalog'
import { useCatalogue } from '../market/catalogue'
import { downloadProduct, listFileIds } from '../api/files'
import { marketPackHash } from '../router'
import type { Order } from './store'
import { Button } from '../ui'
import { PackImage } from '../market/PackCard'

/**
 * The purchase list, shared by the account page's recent block and the full purchases
 * page, so an order row looks and behaves the same in both.
 */
export function OrderList({ orders, t, language, showOrderId = true }: {
  orders: Order[]
  t: Copy
  language: Language
  showOrderId?: boolean
}) {
  const strings = t.accountPage
  const { products } = useCatalogue()
  // A published pack's bytes live in IndexedDB rather than at a URL, so the list asks
  // which products actually have a file before deciding what the button does.
  const [storedIds, setStoredIds] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    const load = () => { void listFileIds().then((ids) => { if (alive) setStoredIds(ids) }) }
    load()
    window.addEventListener('moonsprite:files', load)
    window.addEventListener('moonsprite:data', load)
    return () => {
      alive = false
      window.removeEventListener('moonsprite:files', load)
      window.removeEventListener('moonsprite:data', load)
    }
  }, [])

  return <ul className="order-list purchase-orders">
    {orders.map((order) => <li key={order.id} className="order">
      {showOrderId && <header className="order-head">
        <div className="order-head-main">
          <span className="order-label">{language === 'zh' ? '订单编号' : 'Order number'}</span>
          <a href={`#/orders/${order.id}`}><strong>{order.id}</strong></a>
          <time dateTime={new Date(order.createdAt).toISOString()}>{new Date(order.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</time>
        </div>
        <span className="purchase-status">{t.marketPage.orders.statusPaid}</span>
        <div className="order-head-total"><span>{t.marketPage.checkout.total}</span><em>{formatPrice(order.total, language)}</em></div>
      </header>}
      <ul className="order-lines">
        {order.lines.map((line) => {
          const product = products.find((item) => item.id === line.id)
          const name = product ? productCopy(product.name, language) : line.name
          /*
           * A pack is downloadable when it ships a file in public/ or has one stored from
           * the studio. Anything else says so plainly rather than linking to nothing.
           */
          const file = product?.download
          const hasStored = storedIds.includes(line.id)
          const downloadable = Boolean(file) || hasStored
          return <li key={line.id}>
            <span className="order-line-thumb"><PackImage product={product ?? { id: line.id, category: 'assets', name: { zh: line.name, en: line.name }, tagline: { zh: '', en: '' }, body: { zh: '', en: '' }, price: line.price, size: { zh: '', en: '' }, formats: [], includes: [] }} t={t} alt="" /></span>
            <span className="order-line-name">
              <a href={marketPackHash(line.id)}>{name}</a>
              <small>{language === 'zh' ? `数量 ${line.quantity}` : `Qty ${line.quantity}`}{product?.formats.length ? ` · ${product.formats.join(' / ')}` : ''}</small>
            </span>
            {downloadable
              ? <Button
                size="compact"
                className="order-download"
                ariaLabel={`${strings.download} ${name}`}
                onClick={() => { void downloadProduct(line.id, file, `${name}${file ? file.slice(file.lastIndexOf('.')) : ''}`) }}>
                <Download aria-hidden="true" />{strings.download}
              </Button>
              : <span className="order-download pending" aria-disabled="true" title={strings.downloadPending}>
                <Download aria-hidden="true" />{strings.downloadPendingShort}
              </span>}
            <span className="order-line-price"><small>{language === 'zh' ? '商品金额' : 'Item total'}</small>{formatPrice(line.price * line.quantity, language)}</span>
          </li>
        })}
      </ul>
    </li>)}
  </ul>
}
