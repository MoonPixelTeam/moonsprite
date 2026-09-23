import { WorkspacePage } from '../workspace/WorkspaceLayout'
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
          title={`${orderStrings.detailTitle} ${order.id}`}
          subtitle={`${orderStrings.date}：${new Date(order.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}`}
          back="#/purchases"
          backLabel={orderStrings.back} >
        <Panel title={orderStrings.items} actions={<span className="order-state">{orderStrings.statusPaid}</span>}>
          <OrderList orders={[order]} t={t} language={language} showOrderId={false} />
          <dl className="order-totals">
            <div><dt>{t.marketPage.cart.subtotal}</dt><dd>{formatPrice(order.total)}</dd></div>
            <div className="grand"><dt>{t.marketPage.checkout.total}</dt><dd>{formatPrice(order.total)}</dd></div>
          </dl>
        </Panel>

        <Panel title={orderStrings.license}>
          <p className="panel-copy">{t.marketPage.detail.licenseBody}</p>
          <div className="receipt-actions">
            <Button href="#/license">{orderStrings.licenseDownload}</Button>
            <Button href="#/support">{orderStrings.support}</Button>
          </div>
        </Panel>

        {/* Says the policy plainly rather than hiding it behind a link. */}
        <Panel tone="warning" title={orderStrings.noRefund}>
          <Alert tone="warning">
            {orderStrings.noRefundBody}
          </Alert>
        </Panel>
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
  const order: Order | undefined = orders[0]

  const downloadAll = async () => {
    if (!order) return
    setBusy(true)
    for (const line of order.lines) {
      const product = products.find((item) => item.id === line.id)
      await downloadProduct(line.id, product?.download, product ? productCopy(product.name, language) : line.name)
    }
    setBusy(false)
  }

  return <WorkspacePage
          eyebrow={t.marketPage.cart.title}
          title={receipt.title}
          subtitle={receipt.subtitle}
          back="#/market"
          backLabel={receipt.keepShopping} >
        {order
          ? <>
            <Panel title={t.marketPage.checkout.items}>
              <OrderList orders={[order]} t={t} language={language} showOrderId={false} />
              <dl className="order-totals">
                <div className="grand"><dt>{t.marketPage.checkout.total}</dt><dd>{formatPrice(order.total)}</dd></div>
              </dl>
            </Panel>
            <Panel>
              <div className="receipt-actions">
                <Button variant="primary" disabled={busy} onClick={() => { void downloadAll() }}>
                  {busy ? t.marketPage.checkout.paying : receipt.downloadAll}
                </Button>
                <Button href={`#/orders/${order.id}`}>{receipt.viewOrder}</Button>
                <Button href="#/market">{receipt.keepShopping}</Button>
              </div>
              <p className="panel-copy">{receipt.emailed}</p>
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
