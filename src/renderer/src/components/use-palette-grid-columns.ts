import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { normalizePaletteColumns, paletteGridCapacity } from '@/core/palette-layout'
import { isWorkspaceResizing, onWorkspaceResizeEnd } from './workspace-resize'
import { createPaletteGridResize, type PaletteLayoutMode } from './palette-grid-resize'

/** The visible palette depends on column count, not the number of empty rows below it. */
export function usePaletteGridColumns(gridRef: RefObject<HTMLElement | null>, swatchSize: number, minimumColumns: number, mode: PaletteLayoutMode = 'manual', revision = '', gap = 1): number {
  const [columns, setColumns] = useState(minimumColumns)
  const committed = useRef(columns)
  committed.current = Math.max(columns, minimumColumns)
  const preview = useRef<ReturnType<typeof createPaletteGridResize> | null>(null)
  // Keep the preview until React has committed the matching slot indices.
  useLayoutEffect(() => {
    preview.current?.finish()
    preview.current = null
  }, [columns, minimumColumns, mode, revision])
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    let previous = -1
    const update = (width: number): void => {
      if (width <= 0) return
      const next = Math.max(minimumColumns, normalizePaletteColumns(paletteGridCapacity(width, 0, swatchSize, gap, (Number.parseFloat(getComputedStyle(grid).paddingLeft) || 8)).columns))
      if (next === previous && (isWorkspaceResizing() || (next === committed.current && !preview.current))) return
      previous = next
      if (isWorkspaceResizing()) {
        preview.current ??= createPaletteGridResize(grid, committed.current, mode)
        preview.current.update(next)
        return
      }
      if (next === committed.current) { preview.current?.finish(); preview.current = null }
      setColumns(current => current === next ? current : next)
    }
    const measure = (): void => update(grid.clientWidth)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== grid) continue
        // .swatch-grid has symmetric padding. Use the delivered content box,
        // which already excludes scrollbars, plus both paddings to match
        // integer clientWidth without flushing layout after another RO writes.
        update(Math.round(entry.contentRect.width + entry.contentRect.left * 2))
      }
    })
    observer?.observe(grid)
    if (!observer) window.addEventListener('resize', measure)
    // Read once on release: a final pointer sample can precede the next RO.
    const stopListening = onWorkspaceResizeEnd(measure)
    return () => {
      observer?.disconnect(); window.removeEventListener('resize', measure); stopListening()
      preview.current?.finish(); preview.current = null
    }
  }, [gridRef, swatchSize, minimumColumns, mode, revision, gap])
  return Math.max(columns, minimumColumns)
}
