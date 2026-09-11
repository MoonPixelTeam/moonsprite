import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface TooltipProps {
  children: ReactNode
  content?: ReactNode
  className?: string
}

export function Tooltip({ children, content, className = '' }: TooltipProps) {
  const id = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tooltip = tooltipRef.current?.getBoundingClientRect()
    if (!anchor || !tooltip) return
    const left = Math.max(8, Math.min(window.innerWidth - tooltip.width - 8, anchor.left))
    const top = anchor.bottom + tooltip.height + 6 <= window.innerHeight
      ? anchor.bottom + 5
      : Math.max(8, anchor.top - tooltip.height - 5)
    setPosition({ left, top })
  }, [open, content])

  return <span ref={anchorRef} className={`moon-tooltip-anchor ${className}`.trim()} aria-describedby={open && content ? id : undefined} onPointerEnter={() => setOpen(Boolean(content))} onPointerLeave={() => setOpen(false)} onFocus={() => setOpen(Boolean(content))} onBlur={() => setOpen(false)}>
    {children}
    {open && content && createPortal(<span ref={tooltipRef} id={id} className="moon-tooltip" role="tooltip" style={position}>{content}</span>, document.body)}
  </span>
}

interface NativeTooltipState {
  anchor: HTMLElement
  content: string
}

const NATIVE_TOOLTIP_DELAY_MS = 280

/**
 * Promotes legacy HTML title hints to the shared Tooltip surface.  A large
 * part of the editor is rendered from data-driven controls, so wrapping every
 * title-bearing element would add layout spans and make those controls
 * fragile.  Delegation keeps the DOM unchanged and gives all legacy hints the
 * same behavior as Tooltip without changing their actions or labels.
 */
export function NativeTooltipBridge() {
  const [active, setActive] = useState<NativeTooltipState | null>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const pendingAnchorRef = useRef<HTMLElement | null>(null)
  const pendingTimerRef = useRef<number | null>(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })

  const anchorFor = useCallback((target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null
    const anchor = target.closest<HTMLElement>('[title], [data-moon-tooltip]')
    if (!anchor || anchor.hasAttribute('data-moon-tooltip-disabled') || anchor.closest('.moon-tooltip-anchor')) return null
    const content = (anchor.getAttribute('title') ?? anchor.getAttribute('data-moon-tooltip'))?.trim()
    return content ? anchor : null
  }, [])

  const promote = useCallback((anchor: HTMLElement | null): void => {
    if (!anchor) return
    const content = (anchor.getAttribute('title') ?? anchor.getAttribute('data-moon-tooltip'))?.trim()
    if (!content) return
    // Remove the native hint before the browser's delayed title popup can be
    // scheduled. Keep a data copy so React rerenders cannot lose the text.
    anchor.setAttribute('data-moon-tooltip', content)
    anchor.removeAttribute('title')
    setActive({ anchor, content })
  }, [])

  const cancelPending = useCallback((): void => {
    if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = null
    pendingAnchorRef.current = null
  }, [])

  const schedulePromote = useCallback((anchor: HTMLElement | null): void => {
    if (!anchor) return
    if (pendingAnchorRef.current === anchor) return
    cancelPending()
    pendingAnchorRef.current = anchor
    setActive((current) => current?.anchor === anchor ? current : null)
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null
      pendingAnchorRef.current = null
      promote(anchor)
    }, NATIVE_TOOLTIP_DELAY_MS)
  }, [cancelPending, promote])

  useEffect(() => {
    const pointerOver = (event: PointerEvent): void => {
      const anchor = anchorFor(event.target)
      if (anchor) schedulePromote(anchor)
    }
    const pointerOut = (event: PointerEvent): void => {
      const anchor = active?.anchor
      const pendingAnchor = pendingAnchorRef.current
      const eventAnchor = anchorFor(event.target)
      if (!anchor && !pendingAnchor) return
      const related = event.relatedTarget
      if (related instanceof Node && ((anchor && anchor.contains(related)) || (pendingAnchor && pendingAnchor.contains(related)))) return
      if (eventAnchor === pendingAnchor || (anchor && (event.target === anchor || anchor.contains(event.target as Node)))) cancelPending()
      if (anchor && (event.target === anchor || anchor.contains(event.target as Node))) setActive(null)
    }
    const focusIn = (event: FocusEvent): void => schedulePromote(anchorFor(event.target))
    const focusOut = (event: FocusEvent): void => {
      const anchor = active?.anchor
      const pendingAnchor = pendingAnchorRef.current
      if (!anchor && !pendingAnchor) return
      const related = event.relatedTarget
      if (related instanceof Node && ((anchor && anchor.contains(related)) || (pendingAnchor && pendingAnchor.contains(related)))) return
      cancelPending()
      if (anchor && (event.target === anchor || anchor.contains(event.target as Node))) setActive(null)
    }
    document.addEventListener('pointerover', pointerOver, true)
    document.addEventListener('pointerout', pointerOut, true)
    document.addEventListener('focusin', focusIn, true)
    document.addEventListener('focusout', focusOut, true)
    return () => {
      cancelPending()
      document.removeEventListener('pointerover', pointerOver, true)
      document.removeEventListener('pointerout', pointerOut, true)
      document.removeEventListener('focusin', focusIn, true)
      document.removeEventListener('focusout', focusOut, true)
    }
  }, [active, anchorFor, promote])

  useLayoutEffect(() => {
    if (!active || !tooltipRef.current) return
    const anchor = active.anchor.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(window.innerWidth - tooltip.width - 8, anchor.left))
    const top = anchor.bottom + tooltip.height + 6 <= window.innerHeight
      ? anchor.bottom + 5
      : Math.max(8, anchor.top - tooltip.height - 5)
    setPosition({ left, top })
  }, [active])

  useEffect(() => {
    if (!active) return
    const observer = new MutationObserver(() => {
      if (active.anchor.hasAttribute('data-moon-tooltip-disabled')) setActive(null)
    })
    observer.observe(active.anchor, { attributes: true, attributeFilter: ['data-moon-tooltip-disabled'] })
    return () => observer.disconnect()
  }, [active])

  useEffect(() => {
    if (!active) return
    const reposition = (): void => {
      const anchor = active.anchor.getBoundingClientRect()
      const tooltip = tooltipRef.current?.getBoundingClientRect()
      if (!tooltip) return
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - tooltip.width - 8, anchor.left)),
        top: anchor.bottom + tooltip.height + 6 <= window.innerHeight ? anchor.bottom + 5 : Math.max(8, anchor.top - tooltip.height - 5)
      })
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [active])

  if (!active || active.anchor.hasAttribute('data-moon-tooltip-disabled')) return null
  return createPortal(<span ref={tooltipRef} className="moon-tooltip native-title-tooltip" role="tooltip" style={position}>{active.content}</span>, document.body)
}
