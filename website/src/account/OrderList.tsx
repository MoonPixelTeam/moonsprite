import { useEffect, useState } from 'react'
import { Download, PackageCheck } from 'lucide-react'
import type { Copy, Language } from '../content'
import { MARKET_PRODUCTS, formatPrice, productCopy } from '../market/catalog'
import { downloadProduct, listFileIds } from '../api/files'
import { marketPackHash } from '../router'
import type { Order } from './store'

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

  return <ul className="order-list">
    {orders.map((order) => <li key={order.id} className="order">
      {/* On the order page the id and date are already in the page header, so the row shows
          only what is not repeated above it. */}
      <header className={showOrderId ? 'order-head' : 'order-head bare'}>
        {showOrderId && <strong>{order.id}</strong>}
        {showOrderId && <span>{new Date(order.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>}
        <em>{formatPrice(order.total)}</em>
      </header>
      <ul className="order-lines">
        {order.lines.map((line) => {
          const product = MARKET_PRODUCTS.find((item) => item.id === line.id)
          const name = product ? productCopy(product.name, language) : line.name
          /*
           * A pack is downloadable when it ships a file in public/ or has one stored from
           * the studio. Anything else says so plainly rather than linking to nothing.
           */
          const file = product?.download
          const hasStored = storedIds.includes(line.id)
          const downloadable = Boolean(file) || hasStored
          return <li key={line.id}>
            <PackageCheck aria-hidden="true" />
            <span className="order-line-name">
              <a href={marketPackHash(line.id)}>{name}</a>
              <small>×{line.quantity} · {product ? productCopy(product.size, language) : ''}</small>
            </span>
            {downloadable
              ? <button
                type="button"
                className="order-download"
                aria-label={`${strings.download} ${name}`}
                onClick={() => { void downloadProduct(line.id, file, `${name}${file ? file.slice(file.lastIndexOf('.')) : ''}`) }}>
                <Download aria-hidden="true" />{strings.download}
              </button>
              : <span className="order-download pending" aria-disabled="true" title={strings.downloadPending}>
                <Download aria-hidden="true" />{strings.downloadPendingShort}
              </span>}
            <span className="order-line-price">{formatPrice(line.price * line.quantity)}</span>
          </li>
        })}
      </ul>
    </li>)}
  </ul>
}
