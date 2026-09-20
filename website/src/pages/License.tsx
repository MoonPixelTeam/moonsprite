import { ArrowLeft, Ban, Check, FileText } from 'lucide-react'
import type { Copy, Language } from '../content'
import { PageHeader, Panel, Button } from '../ui'

/**
 * The licence, at its own route so the pack page and the checkout can both link to it and
 * a buyer can reopen it afterwards. The copy is the only source: nothing here restates
 * terms in its own words.
 */
export function LicensePage({ t }: { t: Copy; language: Language }) {
  const strings = t.marketPage.license

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader
          eyebrow={t.marketPage.detail.eyebrow}
          title={strings.title}
          subtitle={strings.subtitle}
          icon={<FileText aria-hidden="true" />}
          back="#/market"
          backLabel={strings.back} />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        <Panel title={strings.grantsTitle} icon={<Check aria-hidden="true" />}>
          <ul className="license-list granted">
            {strings.grants.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
          </ul>
        </Panel>

        <Panel title={strings.limitsTitle} icon={<Ban aria-hidden="true" />}>
          <ul className="license-list denied">
            {strings.limits.map((item) => <li key={item}><Ban aria-hidden="true" />{item}</li>)}
          </ul>
        </Panel>

        <Panel title={strings.refundsTitle} tone="warning" icon={<ArrowLeft aria-hidden="true" />}>
          <ul className="license-list">
            {strings.refunds.map((item) => <li key={item}><FileText aria-hidden="true" />{item}</li>)}
          </ul>
          <div className="license-actions">
            <Button href="#/market">{strings.back}</Button>
          </div>
        </Panel>
      </div>
    </section>
  </main>
}
