/** Keep hints that explain icons, add information, or reveal clipped text. */
export function isRedundantTooltip(anchor: HTMLElement, content: string): boolean {
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim()
  const visibleText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (!(node instanceof HTMLElement)) return ''
    const style = getComputedStyle(node)
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return ''
    return Array.from(node.childNodes, visibleText).join('')
  }
  const text = normalize(visibleText(anchor))
  if (!text || text !== normalize(content)) return false
  return ![anchor, ...anchor.querySelectorAll<HTMLElement>('*')].some(element =>
    element.clientWidth > 0 && element.clientHeight > 0 &&
    (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
  )
}
