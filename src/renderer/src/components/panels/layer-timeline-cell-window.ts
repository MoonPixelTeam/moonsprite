import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'

type Props = Pick<LayerTimelineCellsProps, 'timeline' | 'displayRows'>

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

const containsWindow = (current: TimelineCellWindow | null, next: TimelineCellWindow, panel: Props, columns: number, rows: number): boolean =>
  Boolean(current && current.frameEnd <= panel.timeline.frames.length && current.rowEnd <= panel.displayRows.length &&
    (next.frameStart === 0 ? current.frameStart === 0 : current.frameStart <= next.frameStart + columns) &&
    (next.frameEnd === panel.timeline.frames.length ? current.frameEnd === next.frameEnd : current.frameEnd >= next.frameEnd - columns) &&
    (next.rowStart === 0 ? current.rowStart === 0 : current.rowStart <= next.rowStart + rows) &&
    (next.rowEnd === panel.displayRows.length ? current.rowEnd === next.rowEnd : current.rowEnd >= next.rowEnd - rows))

/** Reuse mounted cells while six columns/two rows of reserve still cover the view. */
export const retainTimelineCellWindow = (current: TimelineCellWindow | null, next: TimelineCellWindow, panel: Props): TimelineCellWindow =>
  containsWindow(current, next, panel, 4, 1) ? current! : next

export const timelineCellWindowCoversViewport = (current: TimelineCellWindow | null, next: TimelineCellWindow, panel: Props): boolean =>
  containsWindow(current, next, panel, 10, 3)

export const measureTimelineCellWindow = (panel: Props, viewport: HTMLDivElement, columnOverscan = 10, rowOverscan = 3): TimelineCellWindow => {
  const all = allTimelineCellsWindow(panel)
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
  // Sticky labels/header already occupy space at the viewport origin. Only
  // the visible extent loses that space; subtracting it from the scroll offset
  // mounts a second hidden strip behind the labels on every window update.
  const horizontalStart = Math.max(0, viewport.scrollLeft)
  const horizontalEnd = Math.max(horizontalStart, viewport.scrollLeft + viewportWidth - labelWidth)
  const verticalStart = Math.max(0, viewport.scrollTop)
  const verticalEnd = Math.max(verticalStart, viewport.scrollTop + viewportHeight - headerHeight)
  return {
    rowStart: Math.max(0, Math.floor(verticalStart / rowHeight) - rowOverscan),
    rowEnd: Math.min(panel.displayRows.length, Math.ceil(verticalEnd / rowHeight) + rowOverscan),
    frameStart: Math.max(0, Math.floor(horizontalStart / frameWidth) - columnOverscan),
    frameEnd: Math.min(panel.timeline.frames.length, Math.ceil(horizontalEnd / frameWidth) + columnOverscan)
  }
}
