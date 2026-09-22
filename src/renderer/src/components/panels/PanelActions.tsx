import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PixelUtilityIcon } from '../PixelUtilityIcon'
import { useI18n } from '../I18nProvider'

/** Keep complete controls at every size; overflow opens outside the clipped dock. */
export function PanelActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { t } = useI18n()
  const host = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const count = Children.toArray(children).length
  useLayoutEffect(() => {
    const panel = host.current?.closest('.panel')
    if (!panel) return
    const update = () => {
      const width = panel.clientWidth
      if (width <= 0) return
      // Above 220px the title also needs room; below it the header is icon-only.
      setCompact(width < count * 30 + 8 + (width > 220 ? 72 : 0))
      setPosition(null)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [count])
  useEffect(() => {
    if (!position) return
    const dismiss = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !host.current?.contains(event.target as Node)) setPosition(null)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPosition(null); trigger.current?.focus() }
    }
    popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', keydown) }
  }, [position])
  return <span ref={host} className={`panel-actions responsive-panel-actions ${className}`} onPointerDown={event => event.stopPropagation()}>
    {compact ? <button ref={trigger} type="button" title={t('panel.moreActions')} aria-label={t('panel.moreActions')} aria-expanded={!!position} aria-haspopup="dialog" onClick={() => {
      const bounds = trigger.current?.getBoundingClientRect()
      if (!bounds) return
      setPosition(position ? null : { left: Math.max(8, Math.min(window.innerWidth - 208, bounds.right - 200)), top: Math.max(8, Math.min(window.innerHeight - 88, bounds.bottom + 4)) })
    }}><PixelUtilityIcon kind="moreLines" /></button> : children}
    {compact && position && createPortal(<div ref={popup} className={`panel-actions panel-actions-popup ${className}`} role="dialog" aria-label={t('panel.moreActions')} style={position} onPointerDown={event => event.stopPropagation()}>{children}</div>, document.body)}
  </span>
}
