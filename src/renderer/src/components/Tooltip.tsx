import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { loadEditorPreferences } from '@/core/file-preferences'
import { isRedundantTooltip } from './tooltip-content'

interface TooltipProps {
  children: ReactNode
  content?: ReactNode
  className?: string
}

function useTooltipsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => loadEditorPreferences().tooltipsEnabled)

  useEffect(() => {
    const sync = (): void => setEnabled(loadEditorPreferences().tooltipsEnabled)
    window.addEventListener('moonsprite:preferences-changed', sync)
    return () => window.removeEventListener('moonsprite:preferences-changed', sync)
  }, [])

  return enabled
}

export function Tooltip({ children, content, className = '' }: TooltipProps) {
  const tooltipsEnabled = useTooltipsEnabled()
  const id = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const show = (): void => {
    const redundant = anchorRef.current && (typeof content === 'string' || typeof content === 'number')
      ? isRedundantTooltip(anchorRef.current, String(content)) : false
    setOpen(tooltipsEnabled && Boolean(content) && !redundant)
  }

  useLayoutEffect(() => {
    if (!open || !tooltipsEnabled) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tooltip = tooltipRef.current?.getBoundingClientRect()
    if (!anchor || !tooltip) return
    const left = Math.max(8, Math.min(window.innerWidth - tooltip.width - 8, anchor.left))
    const top = anchor.bottom + tooltip.height + 6 <= window.innerHeight
      ? anchor.bottom + 5
      : Math.max(8, anchor.top - tooltip.height - 5)
    setPosition({ left, top })
  }, [open, content, tooltipsEnabled])

  useEffect(() => {
    if (!tooltipsEnabled) setOpen(false)
  }, [tooltipsEnabled])

  return <span ref={anchorRef} className={`moon-tooltip-anchor ${className}`.trim()} aria-describedby={tooltipsEnabled && open && content ? id : undefined} onPointerEnter={show} onPointerLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)}>
    {children}
    {tooltipsEnabled && open && content && createPortal(<span ref={tooltipRef} id={id} className="moon-tooltip" role="tooltip" style={position}>{content}</span>, document.body)}
  </span>
}

interface NativeTooltipState {
  anchor: HTMLElement
  content: string
}

const NATIVE_TOOLTIP_DELAY_MS = 600

/**
 * Promotes legacy HTML title hints to the shared Tooltip surface.  A large
 * part of the editor is rendered from data-driven controls, so wrapping every
 * title-bearing element would add layout spans and make those controls
 * fragile.  Delegation keeps the DOM unchanged and gives all legacy hints the
 * same behavior as Tooltip without changing their actions or labels.
 */
export function NativeTooltipBridge() {
  const tooltipsEnabled = useTooltipsEnabled()
  const [active, setActive] = useState<NativeTooltipState | null>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const pendingAnchorRef = useRef<HTMLElement | null>(null)
  const pendingTimerRef = useRef<number | null>(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })

  useEffect(() => {
    document.documentElement.dataset.tooltipsEnabled = String(tooltipsEnabled)
  }, [tooltipsEnabled])

  const anchorFor = useCallback((target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null
    const anchor = target.closest<HTMLElement>('[title], [data-moon-tooltip]')
    if (!anchor || anchor.hasAttribute('data-moon-tooltip-disabled') || anchor.closest('.moon-tooltip-anchor')) return null
    const content = (anchor.getAttribute('title') ?? anchor.getAttribute('data-moon-tooltip'))?.trim()
    return content ? anchor : null
  }, [])

  const suppressNativeTitle = useCallback((anchor: HTMLElement | null): void => {
    if (!anchor) return
    const title = anchor.getAttribute('title')?.trim()
    if (!title) return
    anchor.setAttribute('data-moon-tooltip', title)
    anchor.removeAttribute('title')
  }, [])

  useLayoutEffect(() => {
    const stripTitles = (root: ParentNode): void => {
      if (root instanceof HTMLElement && root.hasAttribute('title')) suppressNativeTitle(root)
      root.querySelectorAll<HTMLElement>('[title]').forEach(suppressNativeTitle)
    }
    stripTitles(document)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          suppressNativeTitle(mutation.target instanceof HTMLElement ? mutation.target : null)
          continue
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) stripTitles(node)
        })
      }
    })
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] })
    return () => observer.disconnect()
  }, [suppressNativeTitle])

  const promote = useCallback((anchor: HTMLElement | null): void => {
    if (!anchor) return
    const content = (anchor.getAttribute('title') ?? anchor.getAttribute('data-moon-tooltip'))?.trim()
    if (!content) return
    // Remove the native hint before the browser's delayed title popup can be
    // scheduled. Keep a data copy so React rerenders cannot lose the text.
    anchor.setAttribute('data-moon-tooltip', content)
    anchor.removeAttribute('title')
    if (tooltipsEnabled && !isRedundantTooltip(anchor, content)) setActive({ anchor, content })
  }, [tooltipsEnabled])

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
      if (!anchor) return
      if (tooltipsEnabled) schedulePromote(anchor)
      else {
        cancelPending()
        suppressNativeTitle(anchor)
      }
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
    const focusIn = (event: FocusEvent): void => {
      const anchor = anchorFor(event.target)
      if (!anchor) return
      if (tooltipsEnabled) schedulePromote(anchor)
      else {
        cancelPending()
        suppressNativeTitle(anchor)
      }
    }
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
  }, [active, anchorFor, cancelPending, promote, schedulePromote, suppressNativeTitle, tooltipsEnabled])

  useEffect(() => {
    cancelPending()
    setActive(null)
    if (tooltipsEnabled) return
    document.querySelectorAll<HTMLElement>('[title]').forEach(suppressNativeTitle)
  }, [cancelPending, suppressNativeTitle, tooltipsEnabled])

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

  if (!tooltipsEnabled || !active || active.anchor.hasAttribute('data-moon-tooltip-disabled')) return null
  return createPortal(<span ref={tooltipRef} className="moon-tooltip native-title-tooltip" role="tooltip" style={position}>{active.content}</span>, document.body)
}
