import type { ReactNode } from 'react'
import { Alert, PageHeader } from './primitives'
import { OutlineNav, PageShell, useActiveHeading } from './legacy'

type LegalText = {
  title: string; version: string; updated: string; notice: string
  sections: readonly { id: string; title: string; paragraphs: readonly string[] }[]
}

/** Legal documents use the same reading grid as documentation and the blog. */
export function LegalPage({ terms, language, backLabel, actions }: {
  terms: LegalText; language: 'zh' | 'en'; backLabel: string; actions: ReactNode
}) {
  const items = terms.sections.map((section, index) => ({ id: section.id, label: `${index + 1}. ${section.title}` }))
  const active = useActiveHeading(items.map((item) => item.id))
  return <main id="main">
    <PageShell className="reading-layout legal-reading" left={<OutlineNav items={items} activeId={active} />}>
      <PageHeader title={terms.title} subtitle={`${terms.version} · ${terms.updated}`} back="#/market" backLabel={backLabel} />
      <article className="license-body">
        <Alert tone="info" title={terms.version}>{terms.notice}</Alert>
        {terms.sections.map((section, index) => <section id={section.id} key={section.id} className="license-section">
          <h2>{index + 1}. {section.title}</h2>
          {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="license-clause"><span>{index + 1}.{paragraphIndex + 1}</span>{paragraph}</p>)}
        </section>)}
        {actions}
      </article>
    </PageShell>
  </main>
}
