import { useLayoutEffect, useRef, useState } from 'react'

export interface TimelineCellWindow { rowStart: number; rowEnd: number; frameStart: number; frameEnd: number }
export function timelineVisibleRange(offsets: readonly number[], start: number, end: number, overscan = 2): [number, number] {
  const count = Math.max(0, offsets.length - 1)
  let first = 0, last = count
  while (first < count && offsets[first + 1] <= start) first++
  while (last > first && offsets[last - 1] >= end) last--
  return [Math.max(0, first - overscan), Math.min(count, last + overscan)]
}

/** Keep the full CSS grid tracks while mounting only nearby cell buttons. */
export function useTimelineCellWindow(rows: number, frames: number, suspended: boolean) {
  const ref = useRef<HTMLSpanElement>(null)
  const [window, setWindow] = useState<TimelineCellWindow>({ rowStart: 0, rowEnd: 20, frameStart: 0, frameEnd: 16 })
  useLayoutEffect(() => {
    const grid = ref.current?.parentElement, list = grid?.closest<HTMLElement>('.layer-animation-list')
    if (!grid || !list) return
    const measure = () => {
      // Hidden panels and DOM-only tests have no measurable viewport. Resize
      // observer measures again when a real panel becomes visible.
      if (list.clientWidth <= 0 || list.clientHeight <= 0) {
        setWindow(old => old.rowEnd === rows && old.frameEnd === frames ? old : { rowStart: 0, rowEnd: rows, frameStart: 0, frameEnd: frames })
        return
      }
      const box = grid.getBoundingClientRect(), viewport = list.getBoundingClientRect()
      const treeRight = list.querySelector<HTMLElement>('.layer-animation-tree')?.getBoundingClientRect().right ?? viewport.left
      const computed = getComputedStyle(grid)
      const heights = computed.gridTemplateRows.split(/\s+/).map(Number.parseFloat)
      if (heights.length < rows + 1 || heights.some(h => !Number.isFinite(h))) return
      const rowOffsets = [heights[0]]
      for (let i = 0; i < rows; i++) rowOffsets.push(rowOffsets.at(-1)! + heights[i + 1])
      const frameWidth = box.width / Math.max(1, frames)
      const frameOffsets = Array.from({ length: frames + 1 }, (_, i) => i * frameWidth)
      const [rowStart, rowEnd] = timelineVisibleRange(rowOffsets, Math.max(0, viewport.top - box.top), viewport.bottom - box.top)
      const [frameStart, frameEnd] = timelineVisibleRange(frameOffsets, Math.max(viewport.left, treeRight) - box.left, viewport.right - box.left)
      setWindow(old => old.rowStart === rowStart && old.rowEnd === rowEnd && old.frameStart === frameStart && old.frameEnd === frameEnd ? old : { rowStart, rowEnd, frameStart, frameEnd })
    }
    measure()
    list.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(list); observer?.observe(grid)
    const tree = list.querySelector<HTMLElement>('.layer-animation-tree')
    if (tree) observer?.observe(tree)
    return () => { list.removeEventListener('scroll', measure); observer?.disconnect() }
  }, [rows, frames, suspended])
  return { ref, window: suspended ? { rowStart: 0, rowEnd: rows, frameStart: 0, frameEnd: frames } : window }
}
