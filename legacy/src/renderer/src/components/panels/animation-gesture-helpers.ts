import type { AnimationFrame } from '@shared/types-animation'
import type { RefObject, PointerEvent as ReactPointerEvent } from 'react'
import type { AnimationLoopSectionResizeEdge } from './animation-gesture-types'
import { parseAnimationCelKey } from '@/core/animation'

export const timelineSelectionOutlineHit = (listRef: RefObject<HTMLDivElement | null>, event: ReactPointerEvent<HTMLElement>, selector: string): boolean => {
  const outlines = listRef.current?.querySelectorAll<HTMLElement>(selector)
  if (!outlines || outlines.length === 0) return false
  const inset = 6
  for (const outline of outlines) {
    const bounds = outline.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) continue
    const contourData = outline.dataset.animationSelectionContour
    if (contourData) {
      const contour = JSON.parse(contourData) as {columns: number; rows: number; edges: number[][]}
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top
      for (const [x1, y1, x2, y2] of contour.edges) {
        const left = x1 * bounds.width / contour.columns, right = x2 * bounds.width / contour.columns
        const top = y1 * bounds.height / contour.rows, bottom = y2 * bounds.height / contour.rows
        if (x >= left - inset && x <= right + inset && y >= top - inset && y <= bottom + inset) return true
      }
      continue
    }
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    if (inside && (event.clientX - bounds.left <= inset || bounds.right - event.clientX <= inset || event.clientY - bounds.top <= inset || bounds.bottom - event.clientY <= inset)) return true
  }
  return false
}

export const timelineFrameRange = (frames: readonly AnimationFrame[], anchorId: string, targetId: string): string[] => {
  const anchorIndex = frames.findIndex((frame) => frame.id === anchorId)
  const targetIndex = frames.findIndex((frame) => frame.id === targetId)
  if (anchorIndex < 0 || targetIndex < 0) return [anchorId]
  const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
  return frames.slice(from, to + 1).map((frame) => frame.id)
}

export const loopSectionFrameIndexAtPointer = (listRef: RefObject<HTMLDivElement | null>, frameCount: number, clientX: number, edge: AnimationLoopSectionResizeEdge): number | null => {
  const firstHeader = listRef.current?.querySelector<HTMLElement>('[data-animation-frame-id][data-frame-index="0"]')
  if (!firstHeader) return null
  const bounds = firstHeader.getBoundingClientRect()
  if (bounds.width <= 0) return null
  const boundaryIndex = Math.round((clientX - bounds.left) / bounds.width)
  const rawIndex = edge === 'start' ? boundaryIndex : boundaryIndex - 1
  return Math.max(0, Math.min(frameCount - 1, rawIndex))
}

export const animationPointerTargetElement = (event: PointerEvent): Element | null => {
  const pointed = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : null
  const animationTarget = pointed?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key], [data-animation-group-cel-key]')
  if (animationTarget) return animationTarget
  return event.target instanceof Element ? event.target : pointed
}

export const animationFrameTargetFromElement = (target: Element | null): { frameId: string; element: HTMLElement } | null => {
  const header = target?.closest<HTMLElement>('[data-animation-frame-id]')
  if (header?.dataset.animationFrameId) return { frameId: header.dataset.animationFrameId, element: header }
  const cell = target?.closest<HTMLElement>('[data-animation-cel-key]')
  const parsed = cell?.dataset.animationCelKey ? parseAnimationCelKey(cell.dataset.animationCelKey) : null
  const maskCell = target?.closest<HTMLElement>('[data-animation-mask-cel-key]')
  const maskParsed = maskCell?.dataset.animationMaskCelKey ? parseAnimationCelKey(maskCell.dataset.animationMaskCelKey) : null
  const groupCell = target?.closest<HTMLElement>('[data-animation-group-cel-key]')
  const groupParsed = groupCell?.dataset.animationGroupCelKey ? parseAnimationCelKey(groupCell.dataset.animationGroupCelKey) : null
  return groupCell && groupParsed ? { frameId: groupParsed.frameId, element: groupCell } : maskCell && maskParsed ? { frameId: maskParsed.frameId, element: maskCell } : cell && parsed ? { frameId: parsed.frameId, element: cell } : null
}

export const timelineAutoScrollDelta = (listRef: RefObject<HTMLDivElement | null>, clientX: number): number => {
  const list = listRef.current
  if (!list) return 0
  const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth)
  if (maxScrollLeft <= 0) return 0
  const bounds = list.getBoundingClientRect()
  const stickyTreeRight = list.querySelector<HTMLElement>('.layer-animation-tree')?.getBoundingClientRect().right ?? bounds.left
  const timelineLeft = Math.max(bounds.left, stickyTreeRight)
  const edgeSize = 30
  const delta = clientX > bounds.right - edgeSize ? 18 : clientX < timelineLeft + edgeSize ? -18 : 0
  if (delta === 0) return 0
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, list.scrollLeft + delta))
  return nextScrollLeft === list.scrollLeft ? 0 : delta
}
