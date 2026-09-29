import { useLayoutEffect, useSyncExternalStore, type RefObject } from 'react'
import { pendingGradientFor, subscribePendingGradient } from '@/core/canvas-gradient-confirmation'
import { CANVAS_VIEWPORT_EVENT } from '../canvas-viewport-events'

export function useQuickCommandGradientOcclusion(ref: RefObject<HTMLDivElement | null>, documentId: string): void {
  const pending = useSyncExternalStore(subscribePendingGradient, () => pendingGradientFor(documentId), () => null)
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar || !pending) return
    const scope = bar.closest('.document-tab-stage, .document-pane-canvas') ?? bar.parentElement
    if (!scope) return
    let notice: HTMLElement | null = null
    const update = () => {
      const next = scope.querySelector<HTMLElement>('.gradient-confirm-bar')
      if (next !== notice) {
        if (notice) resize.unobserve(notice)
        notice = next
        if (notice) resize.observe(notice)
      }
      if (!notice) { bar.removeAttribute('data-gradient-occluded'); return }
      const a = bar.getBoundingClientRect(), b = notice.getBoundingClientRect()
      const overlaps = a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
        && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      bar.toggleAttribute('data-gradient-occluded', overlaps)
    }
    // Visibility preserves the bar's measured bounds, avoiding hide/show loops
    // and preserving its configured position and expanded state.
    const resize = new ResizeObserver(update)
    for (const element of [bar, scope]) resize.observe(element)
    const move = new MutationObserver(update)
    move.observe(bar, { attributes: true, attributeFilter: ['style', 'class'] })
    move.observe(scope, { childList: true, subtree: true })
    update()
    window.addEventListener(CANVAS_VIEWPORT_EVENT, update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      resize.disconnect()
      move.disconnect()
      window.removeEventListener(CANVAS_VIEWPORT_EVENT, update)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      bar.removeAttribute('data-gradient-occluded')
    }
  }, [pending, documentId, ref])
}
