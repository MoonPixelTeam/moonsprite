import { useEffect, useState } from 'react'
import type { LayerTimelineCellsProps as Props } from './layer-timeline-cell-types'
import { initialTimelineCellsWindow, measureTimelineCellWindow, sameTimelineCellWindow, type TimelineCellWindow } from './layer-timeline-cell-window'

export function useLayerTimelineCellWindow(panel: Props): TimelineCellWindow | null {
  // Wait for the scroll host to be measured before mounting cells. This keeps
  // the first render of a huge project cheap and avoids a full-matrix flash.
  const [cellWindow, setCellWindow] = useState<TimelineCellWindow | null>(() => panel.timelineViewportRef ? null : initialTimelineCellsWindow(panel))
  useEffect(() => {
    const viewport = panel.timelineViewportRef?.current
    if (!viewport) {
      setCellWindow((current) => current && sameTimelineCellWindow(current, initialTimelineCellsWindow(panel)) ? current : initialTimelineCellsWindow(panel))
      return
    }
    let frame: number | null = null
    const update = (): void => {
      frame = null
      const next = measureTimelineCellWindow(panel, viewport)
      setCellWindow((current) => current && sameTimelineCellWindow(current, next) ? current : next)
    }
    const schedule = (): void => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(update)
    }
    update()
    viewport.addEventListener('scroll', schedule, { passive: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resizeObserver?.observe(viewport)
    return () => {
      viewport.removeEventListener('scroll', schedule)
      resizeObserver?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [panel.timelineViewportRef, panel.displayRows.length, panel.timeline.frames.length])
  return cellWindow
}
