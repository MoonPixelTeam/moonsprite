import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Chip, PageHeader } from './primitives'

/** Workbench controls keep native form behaviour and one visual contract. */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} /> }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} /> }

export function WorkspacePage({ children, ...header }: Parameters<typeof PageHeader>[0] & { children: ReactNode }) {
  return <main id="main" className="workspace-page"><PageHeader {...header} /><div className="workspace-body">{children}</div></main>
}

export function NavigationGroup({ title, links, hideTitle = false }: { hideTitle?: boolean; title: string; links: { href: string; label: string; active?: boolean }[] }) {
  return <nav aria-label={title} className="workspace-nav">{!hideTitle && <h2>{title}</h2>}{links.map(({ href, label, active }) => <a href={href} key={href} aria-current={active ? 'page' : undefined}>{label}</a>)}</nav>
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className={`studio-metric${hint ? ' has-tooltip' : ''}`} tabIndex={hint ? 0 : undefined} role="group" aria-label={hint ? `${label}: ${hint}` : label}><span>{label}</span><strong>{value}</strong>{hint && <Tooltip content={hint} />}</div>
}

/** Shared non-native tooltip for compact metrics and controls. */
export function Tooltip({ content }: { content: string }) {
  return <span className="ui-tooltip" role="tooltip">{content}</span>
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`status-badge status-badge-${tone}`}>{children}</span>
}

/** Selection controls are never primary actions. */
export function FilterBar({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="workspace-tabs" role="group" aria-label={label}>{options.map((option) => <Chip key={option.value} active={value === option.value} onClick={() => onChange(option.value)}>{option.label}</Chip>)}</div>
}

export function TaskLinks({ label, items, compact }: { label: string; items: { href: string; title: string; description: string; count?: number }[]; compact?: boolean }) {
  return <nav aria-label={label} className={compact ? 'workspace-task-list' : 'workspace-destinations task-links-framed'}>{items.map((item) => <a key={item.href} href={item.href}><strong>{item.title}</strong><span>{item.description}</span>{item.count !== undefined && <b>{item.count}</b>}</a>)}</nav>
}

/** Separates records inside a panel without nesting more panels. */
export function RecordSection({ title, meta, status, children }: { title: string; meta?: ReactNode; status?: ReactNode; children: ReactNode }) {
  return <section className="record-section"><header><div><h3>{title}</h3>{meta && <small>{meta}</small>}</div>{status}</header><div className="record-section-body">{children}</div></section>
}

/** A setting's explanation and editable controls share one responsive row. */
export function SettingsRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-row"><header><h3>{title}</h3><p>{description}</p></header><div className="settings-row-controls">{children}</div></section>
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details className="ui-disclosure"><summary>{title}</summary><div>{children}</div></details>
}
