import { PixelCheck as Check } from '../ui/icons'
import type { Copy, Language } from '../content'
import { PageHeader, Button, OutlineNav, useActiveHeading } from '../ui'

/**
 * The licence, at its own route so the pack page and the checkout can both link to it and
 * a buyer can reopen it afterwards. The copy is the only source: nothing here restates
 * terms in its own words.
 */
export function LicensePage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.marketPage.license

  const items = [{ id: 'license-grants', label: strings.grantsTitle }, { id: 'license-limits', label: strings.limitsTitle }, { id: 'license-refunds', label: strings.refundsTitle }]
  const active = useActiveHeading(items.map((item) => item.id))

  return <main id="main" className="license-page">
    <PageHeader
          eyebrow={t.marketPage.detail.eyebrow}
          title={strings.title}
          subtitle={strings.subtitle}
          back="#/market"
          backLabel={strings.back} />

    <div className="license-layout">
      <aside className="license-outline"><p>{language === 'zh' ? '许可条款' : 'License terms'}</p><OutlineNav items={items} activeId={active} /></aside>
      <article className="license-body">
        <section id="license-grants" className="license-section"><h2><Check aria-hidden="true" />{strings.grantsTitle}</h2>
          <ul className="license-list granted">
            {strings.grants.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
          </ul>
        </section>

        <section id="license-limits" className="license-section"><h2>{strings.limitsTitle}</h2>
          <ul className="license-list denied">
            {strings.limits.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section id="license-refunds" className="license-section"><h2>{strings.refundsTitle}</h2>
          <ul className="license-list">
            {strings.refunds.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="license-actions">
            <Button href="#/market">{strings.back}</Button><Button href="#/support">{t.supportPage.title}</Button><Button href="#/purchases">{t.accountPage.purchasesTitle}</Button>
          </div>
        </section>
      </article>
    </div>
  </main>
}
