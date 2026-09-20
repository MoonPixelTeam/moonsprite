import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useWorkspace } from '@/store/workspace'

const positions = new Map<string, Map<string, { left: number; top: number }>>()

/** View-only state, deliberately excluded from document history and project files. */
export function useProjectScrollMemory(ref: RefObject<HTMLElement | null>, documentId: string, area: string, timelineTail = false) {
  const restored = useRef(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const openIds = new Set(useWorkspace.getState().sessions.map(session => session.document.id))
    for (const id of positions.keys()) if (id !== documentId && !openIds.has(id)) positions.delete(id)
    const updateTail = () => {
      if (!timelineTail) return
      const grid = element.querySelector<HTMLElement>('.layer-animation-grid')
      const tree = element.querySelector<HTMLElement>('.layer-animation-tree')
      const viewport = Math.max(0, element.clientWidth - (tree?.offsetWidth ?? 0))
      element.style.setProperty('--timeline-tail', `${grid && grid.offsetWidth > viewport ? viewport / 2 : 0}px`)
    }
    updateTail()
    const saved = positions.get(documentId)?.get(area)
    restored.current = Boolean(saved)
    element.scrollLeft = saved?.left ?? 0
    element.scrollTop = saved?.top ?? 0
    // Also synchronize companions such as the loop-section header.
    element.dispatchEvent(new Event('scroll'))
    const remember = () => {
      let areas = positions.get(documentId)
      if (!areas) { areas = new Map(); positions.set(documentId, areas) }
      areas.set(area, { left: element.scrollLeft, top: element.scrollTop })
    }
    element.addEventListener('scroll', remember, { passive: true })
    const observer = timelineTail && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateTail) : null
    observer?.observe(element)
    const grid = element.querySelector('.layer-animation-grid')
    if (grid) observer?.observe(grid)
    return () => {
      // Do not read the old element here: React may already have changed its
      // children, clamping its scroll position to the next project's extent.
      element.removeEventListener('scroll', remember)
      observer?.disconnect()
    }
  }, [ref, documentId, area, timelineTail])
  return restored
}
