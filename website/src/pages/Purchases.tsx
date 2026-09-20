import { PackageCheck } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { OrderList } from '../account/OrderList'
import { Button, PageHeader, Panel } from '../ui'

/** Every purchase on the account, with a download for each pack. */
export function PurchasesPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.accountPage
  const { account, orders } = useAccount()

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader
          eyebrow={strings.eyebrow}
          title={strings.purchasesTitle}
          subtitle={strings.purchasesSubtitle}
          icon={<PackageCheck aria-hidden="true" />}
          back="#/account"
          backLabel={strings.backToAccount} />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        {!account
          ? <Panel title={strings.signedInAs}>
            <p className="panel-copy">{strings.purchasesSignedOut}</p>
            <div className="receipt-actions">
              <Button variant="primary" href="#/account">{strings.signIn}</Button>
            </div>
          </Panel>
          : orders.length === 0
            ? <Panel title={strings.orders}>
              <p className="panel-copy">{strings.noOrders}</p>
              <div className="receipt-actions">
                <Button href="#/market">{t.marketTeaser.cta}</Button>
              </div>
            </Panel>
            : <Panel
              title={strings.orders}
              actions={<span className="order-count">{orders.length}</span>}>
              <OrderList orders={orders} t={t} language={language} />
            </Panel>}
      </div>
    </section>
  </main>
}
