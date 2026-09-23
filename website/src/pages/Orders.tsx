import { WorkspacePage } from '../ui'
import { useState } from 'react'

import type { Copy, Language } from '../content'
import { formatPrice, productCopy } from '../market/catalog'
import { useCatalogue } from '../market/catalogue'
import { downloadProduct } from '../api/files'
import { useAccount } from '../account/store'
import type { Order } from '../account/store'
import { Button, Panel, Alert } from '../ui'
import { OrderList } from '../account/OrderList'

/**
 * One order in full: what was bought, what it cost, the licence it was sold under, and
 * the downloads. Reachable from the receipt and from the purchase list, and stable enough
 * to bookmark because the order id is in the URL.
 */
export function OrderPage({ t, language, orderId }: { t: Copy; language: Language; orderId?: string }) {
  const strings = t.accountPage
  const orderStrings = t.marketPage.orders
  const { orders } = useAccount()
  const order = orderId ? orders.find((item) => item.id === orderId) : undefined

  if (!order) {
    return <WorkspacePage
            eyebrow={strings.eyebrow}
            title={orderStrings.notFound}
            subtitle={orderStrings.notFoundBody}
            back="#/purchases"
            backLabel={orderStrings.back} >
          <Panel>
            <div className="receipt-actions">
              <Button variant="primary" href="#/purchases">{orderStrings.viewAll}</Button>
              <Button href="#/market">{t.marketTeaser.cta}</Button>
            </div>
          </Panel>
  </WorkspacePage>
  }

  return <WorkspacePage
          eyebrow={strings.eyebrow}
          title={orderStrings.detailTitle}
          subtitle={language === 'zh' ? '查看购买明细、下载文件与使用许可。' : 'Review your purchase, downloads and licence.'}
          back="#/purchases"
          backLabel={orderStrings.back} >
        <OrderSummary order={order} t={t} language={language} />
        <div className="account-order-detail">
        <Panel title={orderStrings.items}>
          <OrderList orders={[order]} t={t} language={language} showOrderId={false} />
        </Panel>

        <aside className="account-order-notes">
        <Panel title={orderStrings.license}>
          <p className="panel-copy">{t.marketPage.detail.licenseBody}</p>
          <div className="receipt-actions">
            <Button href="#/license">{orderStrings.licenseDownload}</Button>
            <Button href="#/support">{orderStrings.support}</Button>
          </div>
        </Panel>

        <Alert tone="warning" title={orderStrings.noRefund}>{orderStrings.noRefundBody}</Alert>
        </aside>
        </div>
  </WorkspacePage>
}

/**
 * Shown straight after paying. The point of this screen is the download: the old flow
 * dropped the buyer back into an empty cart with no confirmation at all.
 */
export function ReceiptPage({ t, language }: { t: Copy; language: Language }) {
  const receipt = t.marketPage.receipt
  const { orders } = useAccount()
  const { products } = useCatalogue()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const order: Order | undefined = orders[0]

  const downloadAll = async () => {
    if (!order) return
    setBusy(true)
    setProblem(null)
    try {
      for (const line of order.lines) {
        const product = products.find((item) => item.id === line.id)
        await downloadProduct(line.id, product?.download, product ? productCopy(product.name, language) : line.name)
      }
    } catch {
      setProblem(language === 'zh' ? '部分文件下载失败，请在下方逐个重试。' : 'Some downloads failed. Please retry each file below.')
    } finally { setBusy(false) }
  }

  return <WorkspacePage
          eyebrow={t.marketPage.cart.title}
          title={receipt.title}
          subtitle={receipt.subtitle}
          back="#/market"
          backLabel={receipt.keepShopping} >
        {order
          ? <>
            <OrderSummary order={order} t={t} language={language} />
            <Panel>
              <div className="receipt-actions">
                <Button variant="primary" disabled={busy} onClick={() => { void downloadAll() }}>
                  {busy ? (language === 'zh' ? '正在下载…' : 'Downloading…') : receipt.downloadAll}
                </Button>
                <Button href={`#/orders/${order.id}`}>{receipt.viewOrder}</Button>
                <Button href="#/market">{receipt.keepShopping}</Button>
              </div>
              {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
              <p className="panel-copy">{receipt.emailed}</p>
            </Panel>
            <Panel title={t.marketPage.checkout.items}>
              <OrderList orders={[order]} t={t} language={language} showOrderId={false} />
            </Panel>
          </>
          : <Panel>
            <p className="panel-copy">{t.marketPage.cart.empty}</p>
            <div className="receipt-actions">
              <Button variant="primary" href="#/market">{t.marketPage.cart.continue}</Button>
            </div>
          </Panel>}
  </WorkspacePage>
}

function OrderSummary({ order, t, language }: { order: Order; t: Copy; language: Language }) {
  return <Panel title={language === 'zh' ? '订单摘要' : 'Order summary'}><dl className="workspace-facts">
    <div><dt>{language === 'zh' ? '订单编号' : 'Order number'}</dt><dd>{order.id}</dd></div>
    <div><dt>{t.marketPage.orders.date}</dt><dd>{new Date(order.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</dd></div>
    <div><dt>{language === 'zh' ? '订单状态' : 'Status'}</dt><dd className="purchase-status">{t.marketPage.orders.statusPaid}</dd></div>
    <div><dt>{t.marketPage.checkout.total}</dt><dd>{formatPrice(order.total, language)}</dd></div>
  </dl></Panel>
}
