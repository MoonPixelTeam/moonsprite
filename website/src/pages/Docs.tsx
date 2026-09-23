import { docsCopy } from './DocsCopy'
import type { Copy, Language } from '../content'
import { DocsOutline, OutlineNav, PageHeader, PageShell, useActiveHeading } from '../ui'

export function DocsPage({ t, language, subId }: { t: Copy; language: Language; subId?: string }) {
  const docs = docsCopy(language)
  const sections = docs.sections
  const current = sections.find((section) => section.id === subId) ?? sections[0]
  const rightItems = current.blocks
    .filter((block) => block.kind === 'h3')
    .map((block) => ({ id: block.id, label: block.text }))
  const activeId = useActiveHeading(rightItems.map((item) => item.id))

  return <PageShell className="reading-layout"
    left={<DocsOutline outline={docs.outline} sections={sections} currentId={current.id} />}
    right={rightItems.length
      ? <OutlineNav items={rightItems} activeId={activeId} />
      : null}>
    <article className="doc-section">
      <PageHeader title={current.title} />
      {current.blocks.map((block, index) => {
        if (block.kind === 'p') return <p key={index}>{block.text}</p>
        if (block.kind === 'h3') return <h3 key={index} id={block.id}>{block.text}</h3>
        if (block.kind === 'code') return <pre key={index} className="code-block"><code>{block.text}</code></pre>
        return <ul key={index}>{block.items.map((text) => <li key={text}>{text}</li>)}</ul>
      })}
    </article>
  </PageShell>
}
