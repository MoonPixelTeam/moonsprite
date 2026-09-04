import type { Copy } from '../content'
import { OutlineNav, PageShell, useActiveHeading } from '../ui'

export function FaqPage({ t, subId }: { t: Copy; subId?: string }) {
  const faq = t.faqPage
  const categories = faq.categories
  const current = categories.find((category) => category.id === subId) ?? categories[0]
  const rightItems = current.items.map((item) => ({ id: item.id, label: item.q }))
  const activeId = useActiveHeading(rightItems.map((item) => item.id))
  const openQuestion = (item: { id: string }) => {
    const element = document.getElementById(item.id)
    if (element instanceof HTMLDetailsElement) element.open = true
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <PageShell
    left={<OutlineNav
      items={categories.map((category) => ({ id: category.id, label: category.title, href: `#/faq/${category.id}` }))}
      activeId={current.id} />}
    right={rightItems.length
      ? <OutlineNav items={rightItems} activeId={activeId} onJump={openQuestion} />
      : null}>
    <article className="faq-cat">
      <h2>{current.title}</h2>
      <div className="faq-list">
        {current.items.map((item) => <details key={item.id} id={item.id}>
          <summary><strong>{item.q}</strong><span className="faq-toggle" aria-hidden="true" /></summary>
          <p>{item.a}</p>
        </details>)}
      </div>
    </article>
  </PageShell>
}
