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

export const sameTimelineCellWindow = (a: TimelineCellWindow, b: TimelineCellWindow): boolean =>
  a.rowStart === b.rowStart && a.rowEnd === b.rowEnd && a.frameStart === b.frameStart && a.frameEnd === b.frameEnd

export const measureTimelineCellWindow = (panel: Props, viewport: HTMLDivElement): TimelineCellWindow => {
  const all = allTimelineCellsWindow(panel)
  if (viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return all
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
  const horizontalEnd = Math.max(horizontalStart, viewport.scrollLeft + viewport.clientWidth - labelWidth)
  const verticalStart = Math.max(0, viewport.scrollTop - headerHeight)
  const verticalEnd = Math.max(verticalStart, viewport.scrollTop + viewport.clientHeight - headerHeight)
  const columnOverscan = 6
  const rowOverscan = 3
  return {
    rowStart: Math.max(0, Math.floor(verticalStart / rowHeight) - rowOverscan),
    rowEnd: Math.min(panel.displayRows.length, Math.ceil(verticalEnd / rowHeight) + rowOverscan),
    frameStart: Math.max(0, Math.floor(horizontalStart / frameWidth) - columnOverscan),
    frameEnd: Math.min(panel.timeline.frames.length, Math.ceil(horizontalEnd / frameWidth) + columnOverscan)
  }
}
