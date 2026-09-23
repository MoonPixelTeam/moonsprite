import { useLayoutEffect, useRef } from 'react'

/** Scroll the single options row while keeping its inline flyouts outside the clip. */
export function useToolOptionsScroll() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    const flyouts = new Map<HTMLElement, string>()
    const place = (): void => {
      for (const panel of row.querySelectorAll<HTMLElement>('[class*="-popover"], .symmetry-thickness-slider')) {
        if (!flyouts.has(panel)) {
          if (getComputedStyle(panel).position !== 'absolute') continue
          flyouts.set(panel, panel.style.cssText)
          Object.assign(panel.style, { position: 'fixed', margin: '0', right: 'auto', bottom: 'auto' })
        }
        const anchor = panel.parentElement!.getBoundingClientRect()
        const bounds = panel.getBoundingClientRect()
        const rowBounds = row.getBoundingClientRect()
        panel.style.visibility = anchor.right <= rowBounds.left || anchor.left >= rowBounds.right ? 'hidden' : ''
        panel.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - bounds.width - 4))}px`
        panel.style.top = `${Math.max(4, Math.min(anchor.bottom + 4, window.innerHeight - bounds.height - 4))}px`
      }
    }
    const wheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey || row.scrollWidth <= row.clientWidth) return
      const target = event.target instanceof Element ? event.target : null
      // Floating menus and sliders retain their own scrolling behavior.
      if (target?.closest('[class*="-popover"], .symmetry-thickness-slider, [role="listbox"]')) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      event.stopPropagation()
      row.scrollLeft += delta * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? row.clientWidth : 1)
    }
    place()
    const observer = new MutationObserver(place)
    observer.observe(row, { childList: true, subtree: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    resize?.observe(row)
    row.addEventListener('wheel', wheel, { passive: false, capture: true })
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      resize?.disconnect()
      row.removeEventListener('wheel', wheel, true)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      for (const [panel, style] of flyouts) panel.style.cssText = style
    }
  })
  return ref
}
