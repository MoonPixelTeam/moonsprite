import type { SelectionRect } from '@shared/types-selection'

/** Keep nearby pans in a bounded source window, independent of display zoom. */
export function compositeRegionWindow(document: { width: number; height: number }, visible: SelectionRect,
  cached: SelectionRect | undefined, maxBytes: number): SelectionRect {
  if (cached && visible.x >= cached.x && visible.y >= cached.y
    && visible.x + visible.width <= cached.x + cached.width && visible.y + visible.height <= cached.y + cached.height) return cached
  const padX = Math.min(256, Math.max(32, Math.ceil(visible.width / 4)))
  const padY = Math.min(256, Math.max(32, Math.ceil(visible.height / 4)))
  const x = Math.max(0, visible.x - padX), y = Math.max(0, visible.y - padY)
  const right = Math.min(document.width, visible.x + visible.width + padX)
  const bottom = Math.min(document.height, visible.y + visible.height + padY)
  const window = { x, y, width: right - x, height: bottom - y }
  return window.width * window.height * 4 <= Math.min(maxBytes, 32 * 1024 * 1024) ? window : visible
}
