import { PixelCheck, PixelArrowLeft } from './icons'
import type { ReactNode } from 'react'

/*
 * The site's component library. Pages import from here and never assemble these shapes
 * themselves — see docs/ui-design-system.md for the rules each component implements.
 */

/**
 * The one button. `primary` is the single emphasised action in a view; `secondary` is
 * everything else. Passing `href` renders an anchor, so a link that looks like a button
 * is still a link. `compact` is the 32px variant used inside rows and the header.
 */
export function Button({ children, variant = 'secondary', size = 'regular', icon, trailingIcon, href, onClick, type = 'button', disabled, block, className, download, ariaLabel }: {
  children?: ReactNode
  variant?: 'primary' | 'secondary'
  size?: 'regular' | 'compact'
  icon?: ReactNode
  trailingIcon?: ReactNode
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  block?: boolean
  className?: string
  download?: boolean
  ariaLabel?: string
}) {
  const classes = [
    'button',
    variant,
    size === 'compact' ? 'compact' : '',
    block ? 'block' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  const body = <>
    {icon}
    {children}
    {trailingIcon}
  </>

  if (href && !disabled) {
    return <a className={classes} href={href} aria-label={ariaLabel} {...(download ? { download: true } : {})}>
      {body}
    </a>
  }
  // A disabled link is rendered as a button so it cannot be activated, which is what
  // `aria-disabled` on an anchor only claims.
  if (href && disabled) {
    return <button type="button" className={`${classes} disabled`} disabled aria-disabled="true" aria-label={ariaLabel}>
      {body}
    </button>
  }
  return <button type={type} className={classes} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
    {body}
  </button>
}

/** A 32px square icon control. `label` is required: it becomes the accessible name. */
export function IconButton({ label, icon, onClick, href, active, className }: {
  label: string
  icon: ReactNode
  onClick?: () => void
  href?: string
  active?: boolean
  className?: string
}) {
  const classes = ['icon-button', active ? 'active' : '', className ?? ''].filter(Boolean).join(' ')
  if (href) return <a className={classes} href={href} aria-label={label} aria-current={active ? 'page' : undefined}>{icon}</a>
  return <button type="button" className={classes} onClick={onClick} aria-label={label} aria-pressed={active}>{icon}</button>
}

/**
 * The one chip. Filters, preset options and selected tags all use it: they had grown
 * three different paddings and two different active treatments before this.
 */
export function Chip({ children, active, onClick, title, ariaPressed }: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  title?: string
  ariaPressed?: boolean
}) {
  return <button
    type="button"
    className={active ? 'chip active' : 'chip'}
    onClick={onClick}
    title={title}
    aria-pressed={ariaPressed ?? active}>
    {children}
  </button>
}

/** The shared alert. Success and error must not each invent their own colours. */
export function Alert({ tone, title, icon, children, role = 'status' }: {
  tone: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  icon?: ReactNode
  children?: ReactNode
  role?: 'status' | 'alert'
}) {
  return <div className={`alert ${tone}`} role={role}>
    {icon}
    {title && <strong>{title}</strong>}
    {children && <span className="alert-body">{children}</span>}
  </div>
}

/** A page-level block. Nested border-boxes inside a panel are a smell: use rules. */
export function Panel({ title, icon, actions, children, className, tone }: {
  title?: string
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  tone?: 'warning'
}) {
  return <section className={['panel', tone ? `panel-${tone}` : '', className ?? ''].filter(Boolean).join(' ')}>
    {(title || actions) && <header className="panel-head">
      <h2>{icon}{title}</h2>
      {actions && <div className="panel-actions">{actions}</div>}
    </header>}
    <div className="panel-body">{children}</div>
  </section>
}

/**
 * The opening of a page: the way back, the eyebrow, the title and its standfirst. The
 * eyebrow carries a hairline rule out to the column edge, which is how an editor marks
 * a labelled region.
 */
export function PageHeader({ eyebrow, title, subtitle, icon, back, backLabel, actions }: {
  eyebrow?: string
  title: string
  subtitle?: string
  icon?: ReactNode
  back?: string
  backLabel?: string
  actions?: ReactNode
}) {
  return <header className="page-head-block">
    {(back || eyebrow) && <nav className="page-crumbs" aria-label={title}>
      {back && <a className="page-back" href={back}><PixelArrowLeft />{backLabel}</a>}
      {eyebrow && <span>{eyebrow}</span>}
    </nav>}
    <div className="page-head-copy">
      <h1>{icon}{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  </header>
}

/**
 * A checkbox drawn as a square. The OS control is hidden rather than restyled, because its
 * box, tick and focus ring belong to another design language. The input stays in the DOM so
 * it remains focusable, announced, and togglable from the keyboard.
 */
export function Checkbox({ label, checked, onChange, className }: {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return <label className={className ? `checkbox ${className}` : 'checkbox'}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="checkbox-box" aria-hidden="true">
      {checked && <PixelCheck />}
    </span>
    <span className="checkbox-label">{label}</span>
  </label>
}

export { Select } from './Select'
export { ChipField } from './ChipField'
export { Field, FormField, FileField } from './Field'

// Carried over from the single-file ui module, unchanged.


/** Shared marketing section hierarchy; content stays with the page. */
export function SectionHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="section-title">{eyebrow && <span>{eyebrow}</span>}{actions ? <div className="section-title-row"><h2>{title}</h2><div className="section-title-actions">{actions}</div></div> : <h2>{title}</h2>}{description && <p>{description}</p>}</div>
}

export function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><span aria-hidden="true" />{label}</div>
}

export function PageIntro({ children }: { children: ReactNode }) {
  return <section className="page-intro"><div className="content-wrap">{children}</div></section>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><h2>{title}</h2>{description && <p>{description}</p>}{action && <div>{action}</div>}</div>
}
