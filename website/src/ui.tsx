import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, ExternalLink, Play } from 'lucide-react'
import { SITE_CONFIG } from './config'
import type { DocsOutlineEntry } from './content'

type ProductImageName = 'workspace-v3' | 'timeline-v3' | 'luminance-v3' | 'export'

const imageDimensions: Record<ProductImageName, { width: number; height: number }> = {
  'workspace-v3': { width: 2560, height: 1392 },
  'timeline-v3': { width: 2560, height: 1392 },
  'luminance-v3': { width: 2560, height: 1392 },
  export: { width: 440, height: 621 },
}

export function ProductImage({ name, alt, priority = false }: { name: ProductImageName; alt: string; priority?: boolean }) {
  const dimensions = imageDimensions[name]
  const wide = name !== 'export'
  return <img
    src={`/assets/product/${name}-${wide ? 2560 : 1600}.webp`}
    srcSet={wide ? `/assets/product/${name}-1280.webp 1280w, /assets/product/${name}-2560.webp 2560w` : `/assets/product/${name}-960.webp 960w, /assets/product/${name}-1600.webp 1600w`}
    sizes={wide ? '(max-width: 900px) 94vw, 540px' : '(max-width: 900px) 80vw, 440px'}
    width={dimensions.width}
    height={dimensions.height}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
    alt={alt}
  />
}

export function AppWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="window">
      <figcaption className="window-bar">
        <strong>{title}</strong>
        <span className="window-controls" aria-hidden="true"><i>—</i><i>▢</i><i>✕</i></span>
      </figcaption>
      <div className="window-body">{children}</div>
    </figure>
  )
}

export function SteamButton({ label, soon, compact = false }: { label: string; soon: string; compact?: boolean }) {
  if (!SITE_CONFIG.steamUrl) return <span className={`button primary disabled ${compact ? 'compact' : ''}`} aria-disabled="true"><Play aria-hidden="true" />{soon}</span>
  return <a className={`button primary ${compact ? 'compact' : ''}`} href={SITE_CONFIG.steamUrl} target="_blank" rel="noopener noreferrer"><Play aria-hidden="true" />{label}<ExternalLink aria-hidden="true" /></a>
}

export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function useActiveHeading(ids: string[]): string {
  const key = ids.join('|')
  const [activeId, setActiveId] = useState(ids[0] ?? '')
  useEffect(() => {
    const list = key ? key.split('|') : []
    if (!list.length) return
    const onScroll = () => {
      const offset = 130
      let current = list[0]
      for (const id of list) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top <= offset) current = id
      }
      setActiveId(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])
  return activeId
}

export type OutlineItem = { id: string; label: string; group?: string; href?: string }

export function OutlineNav({ items, activeId, onJump }: { items: OutlineItem[]; activeId?: string; onJump?: (item: OutlineItem) => void }) {
  const groups: { name: string | null; items: OutlineItem[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (item.group !== undefined && last?.name === item.group) last.items.push(item)
    else groups.push({ name: item.group ?? null, items: [item] })
  }
  const jump = (item: OutlineItem) => {
    if (item.href) return
    if (onJump) onJump(item)
    else scrollToId(item.id)
  }
  return (
    <nav className="page-outline" aria-label="Outline">
      {groups.map((group, groupIndex) => <div key={group.name ?? groupIndex}>
        {group.name && <p className="outline-group">{group.name}</p>}
        <ul>{group.items.map((item) => item.href
          ? <li key={item.id}><a href={item.href} className={activeId === item.id ? 'active' : ''}>{item.label}</a></li>
          : <li key={item.id}><button type="button" className={activeId === item.id ? 'active' : ''} onClick={() => jump(item)}>{item.label}</button></li>
        )}</ul>
      </div>)}
    </nav>
  )
}

export function DocsOutline({ outline, sections, currentId }: { outline: DocsOutlineEntry[]; sections: { id: string; title: string }[]; currentId: string }) {
  const titles = new Map(sections.map((section) => [section.id, section.title]))
  const [openIds, setOpenIds] = useState<string[]>([])
  useEffect(() => {
    const group = outline.find((entry): entry is Extract<DocsOutlineEntry, { kind: 'group' }> => entry.kind === 'group' && entry.children.includes(currentId))
    if (group) setOpenIds((prev) => prev.includes(group.id) ? prev : [...prev, group.id])
  }, [currentId, outline])
  const toggle = (id: string) => setOpenIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id])
  return (
    <nav className="page-outline docs-outline" aria-label="Docs">
      <ul>
        {outline.map((entry) => entry.kind === 'page'
          ? <li key={entry.id}><a href={`#/docs/${entry.id}`} className={currentId === entry.id ? 'active' : ''}>{titles.get(entry.id)}</a></li>
          : <li key={entry.id} className="outline-collapsible">
              <button type="button" aria-expanded={openIds.includes(entry.id)} onClick={() => toggle(entry.id)}>
                <span>{entry.title}</span>
                <ChevronRight aria-hidden="true" className={openIds.includes(entry.id) ? 'chevron open' : 'chevron'} />
              </button>
              {openIds.includes(entry.id) && <ul className="outline-children">
                {entry.children.map((childId) => <li key={childId}>
                  <a href={`#/docs/${childId}`} className={currentId === childId ? 'active' : ''}>{titles.get(childId)}</a>
                </li>)}
              </ul>}
            </li>
        )}
      </ul>
    </nav>
  )
}

export function PageShell({ left, right, children }: { left: ReactNode; right?: ReactNode; children: ReactNode }) {
  return <div className={right ? 'page-shell' : 'page-shell no-right'}>
    <aside className="outline-side">{left}</aside>
    <div className="page-body">{children}</div>
    {right && <aside className="outline-side right">{right}</aside>}
  </div>
}
