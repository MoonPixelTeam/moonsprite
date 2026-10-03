import type { LayerTimelineCellsProps as Props } from './layer-timeline-cell-types'

export interface TimelineCellWindow {
  rowStart: number
  rowEnd: number
  frameStart: number
  frameEnd: number
}

export const allTimelineCellsWindow = (panel: Props): TimelineCellWindow => ({
  rowStart: 0,
  rowEnd: panel.displayRows.length,
  frameStart: 0,
  frameEnd: panel.timeline.frames.length
})

/** Safe first paint used before a scroll host has a measurable box. */
export const initialTimelineCellsWindow = (panel: Props): TimelineCellWindow => {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return allTimelineCellsWindow(panel)
  const frameWidth = 34
  const rowHeight = 42
  const headerHeight = 34
  const width = 800
  const height = 600
  return {
    rowStart: 0,
    rowEnd: Math.min(panel.displayRows.length, Math.ceil(Math.max(0, height - headerHeight) / rowHeight) + 3),
    frameStart: 0,
    frameEnd: Math.min(panel.timeline.frames.length, Math.ceil(Math.max(0, width - 190) / frameWidth) + 6)
  }
}

export const sameTimelineCellWindow = (a: TimelineCellWindow, b: TimelineCellWindow): boolean =>
  a.rowStart === b.rowStart && a.rowEnd === b.rowEnd && a.frameStart === b.frameStart && a.frameEnd === b.frameEnd

export const measureTimelineCellWindow = (panel: Props, viewport: HTMLDivElement): TimelineCellWindow => {
  const all = allTimelineCellsWindow(panel)
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return all
  // A floating/docked panel can be measured while it is still entering the
  // layout (clientWidth/clientHeight are temporarily zero). Returning the
  // complete matrix here defeats virtualization and mounts tens of thousands
  // of buttons in one synchronous React commit. Keep a conservative bounded
  // window until ResizeObserver reports the real viewport size.
  const viewportWidth = viewport.clientWidth > 0 ? viewport.clientWidth : 800
  const viewportHeight = viewport.clientHeight > 0 ? viewport.clientHeight : 600
  const styles = getComputedStyle(viewport)
  const numberVariable = (name: string, fallback: number): number => {
    const parsed = Number.parseFloat(styles.getPropertyValue(name))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
  const frameWidth = numberVariable('--layer-frame-width', 34)
  const rowHeight = numberVariable('--layer-row-height', 42)
  const headerHeight = numberVariable('--animation-header-height', 34)
  const labelWidth = numberVariable('--layer-effective-label-width', 190)
  const horizontalStart = Math.max(0, viewport.scrollLeft - labelWidth)
  const horizontalEnd = Math.max(horizontalStart, viewport.scrollLeft + viewportWidth - labelWidth)
  const verticalStart = Math.max(0, viewport.scrollTop - headerHeight)
  const verticalEnd = Math.max(verticalStart, viewport.scrollTop + viewportHeight - headerHeight)
  const columnOverscan = 6
  const rowOverscan = 3
  return {
    rowStart: Math.max(0, Math.floor(verticalStart / rowHeight) - rowOverscan),
    rowEnd: Math.min(panel.displayRows.length, Math.ceil(verticalEnd / rowHeight) + rowOverscan),
    frameStart: Math.max(0, Math.floor(horizontalStart / frameWidth) - columnOverscan),
    frameEnd: Math.min(panel.timeline.frames.length, Math.ceil(horizontalEnd / frameWidth) + columnOverscan)
  }
}
