/** Keep a layout measurement in CSS instead of rerendering the layer tree. */
export function observeToolbarExtent(panel: HTMLElement, header: HTMLElement, toolbar: HTMLElement): () => void {
  let previous = -1
  const publish = (extent: number): void => {
    const next = Math.max(0, Math.ceil(extent))
    if (next === previous) return
    previous = next
    panel.style.setProperty('--animation-toolbar-extent', `${next}px`)
  }
  publish(toolbar.getBoundingClientRect().right - header.getBoundingClientRect().left)
  let inset: number | null = null
  let width: number | null = null
  let height = 0
  // The visible toolbar is the first, left-aligned child of a header with no
  // side borders. contentRect.left supplies that header's current left padding.
  // Consume the whole batch before writing CSS; never force layout in an RO.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === header) inset = entry.contentRect.left
      if (entry.target === toolbar) {
        width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
        height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      }
    }
    if (inset !== null && width !== null) publish(height === 0 ? 0 : inset + width)
  })
  observer?.observe(toolbar, { box: 'border-box' })
  observer?.observe(header)
  return () => {
    observer?.disconnect()
    panel.style.removeProperty('--animation-toolbar-extent')
  }
}
