import { pendingGradientFor } from '@/core/canvas-gradient-confirmation'

export function applyPendingGradientOnEnter(event: KeyboardEvent, documentId: string): boolean {
  if (event.key !== 'Enter' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) return false
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('input, textarea, select, button, [contenteditable], [role="dialog"], .modal-backdrop') || document.querySelector('.modal-backdrop')) return false
  const pending = pendingGradientFor(documentId)
  if (!pending) return false
  event.preventDefault()
  event.stopImmediatePropagation()
  pending.apply()
  return true
}

const hasVisibleEscapeSurface = (): boolean => Array.from(document.querySelectorAll(
  '.modal-backdrop, [role="menu"], .tool-flyout, .themed-select-popover, .context-menu'
)).some(surface => {
  for (let element: Element | null = surface; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true'
      || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
})

export function cancelPendingGradientOnEscape(event: KeyboardEvent, documentId: string): boolean {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return false
  const target = event.target instanceof Element ? event.target : null
  // History and tileset panels are permanent listboxes, not popup owners.
  if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], .modal-backdrop') || hasVisibleEscapeSurface()) return false
  const pending = pendingGradientFor(documentId)
  if (!pending) return false
  event.preventDefault()
  event.stopImmediatePropagation()
  pending.cancel()
  return true
}
