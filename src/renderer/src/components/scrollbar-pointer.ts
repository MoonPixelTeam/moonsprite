/** Native scrollbar events target their scroll container, not a DOM thumb. */
export function isScrollbarPointer(event: { target: EventTarget | null; clientX: number; clientY: number }): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  if (target.closest('[role="scrollbar"], .ui-scrollbar')) return true
  if (!(target instanceof HTMLElement) || target.offsetWidth <= 0 || target.offsetHeight <= 0) return false
  const vertical = target.scrollHeight > target.clientHeight
  const horizontal = target.scrollWidth > target.clientWidth
  if (!vertical && !horizontal) return false
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const x = (event.clientX - rect.left) * target.offsetWidth / rect.width
  const y = (event.clientY - rect.top) * target.offsetHeight / rect.height
  const style = getComputedStyle(target)
  const right = target.offsetWidth - (parseFloat(style.borderRightWidth) || 0)
  const bottom = target.offsetHeight - (parseFloat(style.borderBottomWidth) || 0)
  const leftBorder = parseFloat(style.borderLeftWidth) || 0
  return x >= leftBorder && x < right && y >= target.clientTop && y < bottom && (
    (vertical && (x < target.clientLeft || x >= target.clientLeft + target.clientWidth)) ||
    (horizontal && y >= target.clientTop + target.clientHeight)
  )
}
