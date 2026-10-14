import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'
import { initialTimelineCellsWindow, measureTimelineCellWindow, retainTimelineCellWindow, sameTimelineCellWindow, timelineCellWindowCoversViewport, type TimelineCellWindow } from './layer-timeline-cell-window'

type PreparedUpdate = { apply: () => void; urgent: boolean }
type PrepareUpdate = () => PreparedUpdate | null
const viewportUpdates = new WeakMap<HTMLDivElement, { frame: number | null; updates: Set<PrepareUpdate> }>()

export function useLayerTimelineCellWindow(panel: Pick<LayerTimelineCellsProps, 'timeline' | 'displayRows' | 'timelineViewportRef'>): TimelineCellWindow | null {
  // Wait for the scroll host to be measured before mounting cells. This keeps
  // the first render of a huge project cheap and avoids a full-matrix flash.
  const [cellWindow, setCellWindow] = useState<TimelineCellWindow | null>(() => panel.timelineViewportRef ? null : initialTimelineCellsWindow(panel))
  const committedWindow = useRef(cellWindow)
  useLayoutEffect(() => { committedWindow.current = cellWindow }, [cellWindow])
  useEffect(() => {
    const viewport = panel.timelineViewportRef?.current
    if (!viewport) {
      setCellWindow((current) => current && sameTimelineCellWindow(current, initialTimelineCellsWindow(panel)) ? current : initialTimelineCellsWindow(panel))
      return
    }
    let batch = viewportUpdates.get(viewport)
    if (!batch) {
      batch = { frame: null, updates: new Set() }
      viewportUpdates.set(viewport, batch)
    }
    const pending = batch
    const prepare: PrepareUpdate = () => {
      const current = committedWindow.current
      const measured = measureTimelineCellWindow(panel, viewport)
      const next = retainTimelineCellWindow(current, measured, panel)
      if (current && sameTimelineCellWindow(current, next)) return null
      // Compare against committed DOM, not a still-pending React state update.
      const urgent = !timelineCellWindowCoversViewport(current, measured, panel)
      // A distant scrollbar jump needs visible cells immediately, but mounting
      // the entire prefetch reserve synchronously would delay the scroll paint.
      const published = urgent ? measureTimelineCellWindow(panel, viewport, 2, 1) : next
      return { apply: () => setCellWindow(published), urgent }
    }
    const schedule = (): void => {
      pending.updates.add(prepare)
      if (pending.frame !== null) return
      pending.frame = window.requestAnimationFrame(() => {
        pending.frame = null
        const updates = [...pending.updates].map(update => update()).filter((update): update is PreparedUpdate => update !== null)
        pending.updates.clear()
        const apply = () => { updates.forEach(update => update.apply()) }
        // Headers and cells share one commit. Only exhausted coverage needs a
        // synchronous publish; ordinary overscan refreshes can stay batched.
        if (updates.some(update => update.urgent)) flushSync(apply)
        else apply()
      })
    }
    setCellWindow(measureTimelineCellWindow(panel, viewport))
    viewport.addEventListener('scroll', schedule, { passive: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resizeObserver?.observe(viewport)
    return () => {
      viewport.removeEventListener('scroll', schedule)
      resizeObserver?.disconnect()
      pending.updates.delete(prepare)
      if (pending.updates.size === 0 && pending.frame !== null) {
        window.cancelAnimationFrame(pending.frame)
        pending.frame = null
      }
    }
  }, [panel.timelineViewportRef, panel.displayRows.length, panel.timeline.frames.length])
  return cellWindow
}
