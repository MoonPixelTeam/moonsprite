import { PixelPlus, PixelMinus } from '../ui/icons'
import { faqPageCopy } from './FaqCopy'
import type { Copy, Language } from '../content'
import { OutlineNav, PageHeader, PageShell } from '../ui'

export function FaqPage({ t, language, subId }: { t: Copy; language: Language; subId?: string }) {
  const faq = faqPageCopy(language)
  const categories = faq.categories
  const current = categories.find((category) => category.id === subId) ?? categories[0]

  return <PageShell className="reading-layout faq-layout"
    left={<><p className="reading-nav-title">{language === 'zh' ? '问题分类' : 'Categories'}</p><OutlineNav
      items={categories.map((category) => ({ id: category.id, label: category.title, href: `#/faq/${category.id}` }))}
      activeId={current.id} /></>}>
    <article className="faq-cat">
      <PageHeader eyebrow={t.nav.faq} title={current.title} subtitle={faq.subtitle} />
      <div className="faq-list">
        {current.items.map((item) => <details key={item.id} id={item.id}>
          <summary><strong>{item.q}</strong><span className="faq-toggle" aria-hidden="true"><PixelPlus className="faq-expand" /><PixelMinus className="faq-collapse" /></span></summary>
          <p>{item.a}</p>
        </details>)}
      </div>
    </article>
  </PageShell>
}
