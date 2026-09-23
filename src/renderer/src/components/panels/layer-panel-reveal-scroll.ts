import { layerPanelRevealScrollTop } from '@/core/layer-panel-layout'

/** Reveal from the browser's completed layout without blocking canvas input. */
export function observeLayerPanelReveal(list: HTMLElement, row: HTMLElement): () => void {
  let cancelled = false
  const scroll = (bounds: DOMRectReadOnly, rowBounds: DOMRectReadOnly): void => {
    if (cancelled || !list.contains(row) || bounds.height <= 0) return
    const stickyHeaderHeight = Number.parseFloat(getComputedStyle(list).getPropertyValue('--animation-header-height')) || 34
    const next = layerPanelRevealScrollTop({
      scrollTop: list.scrollTop, viewportTop: bounds.top, viewportHeight: bounds.height,
      stickyHeaderHeight, rowTop: rowBounds.top, rowHeight: rowBounds.height
    })
    if (next !== list.scrollTop) list.scrollTop = next
  }
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.target === row)
      if (!entry?.rootBounds) return
      observer.disconnect()
      scroll(entry.rootBounds, entry.boundingClientRect)
      cancelled = true
    }, { root: list })
    observer.observe(row)
    return () => { cancelled = true; observer.disconnect() }
  }
  // Compatibility fallback for hosts without IntersectionObserver.
  const frame = requestAnimationFrame(() => scroll(list.getBoundingClientRect(), row.getBoundingClientRect()))
  return () => { cancelled = true; cancelAnimationFrame(frame) }
}
