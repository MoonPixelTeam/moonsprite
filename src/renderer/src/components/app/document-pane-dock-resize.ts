import { clampDocumentPaneRatio, type DocumentPaneNode } from '@/core/document-pane-layout'
import { freezeDocumentPaneCanvases } from './document-pane-resize'

/** Keep internal dividers stationary: only leaves touching the resized outer
 * edge absorb its movement. Fixed tracks also work through nested splits. */
export function beginDocumentPaneDockResize(workArea: HTMLElement | null, layout: DocumentPaneNode | null, edge: 'left' | 'right' | 'bottom') {
  const root = workArea?.querySelector<HTMLElement>('.split-workspace')
  if (!root || !layout || layout.kind !== 'split') return null
  const horizontal = edge !== 'bottom'
  const dimension = horizontal ? 'width' : 'height'
  const property = horizontal ? 'gridTemplateColumns' : 'gridTemplateRows'
  const splits = [...root.querySelectorAll<HTMLElement>(`.document-pane-split.${horizontal ? 'horizontal' : 'vertical'}`)].map(element => {
    const first = element.children[0] as HTMLElement
    const second = element.children[2] as HTMLElement
    const fixed = edge === 'left' ? second : first
    const size = Number.parseFloat(getComputedStyle(fixed)[dimension])
    return { element, first, second, size, original: element.style[property], originalFixed: element.style.getPropertyValue('--document-pane-fixed-track') }
  }).filter(({ size }) => Number.isFinite(size) && size > 0)
  const canvases = freezeDocumentPaneCanvases(root)
  for (const { element, size } of splits) {
    // Retain usable panes when the outer edge reaches a divider's minimum.
    const fixed = `clamp(10%, ${size}px, calc(90% - 6px))`
    element.style.setProperty('--document-pane-fixed-track', fixed)
    element.style[property] = edge === 'left'
      ? 'minmax(0, 1fr) 6px var(--document-pane-fixed-track)'
      : 'var(--document-pane-fixed-track) 6px minmax(0, 1fr)'
  }
  let finished = false
  return {
    update(): void { if (!finished) canvases.update() },
    finish(cancelled = false): DocumentPaneNode {
      if (finished) return layout
      finished = true
      const ratios = new Map<string, number>()
      if (!cancelled) {
        for (const { element, first, second } of splits) {
          const firstSize = first.getBoundingClientRect()[dimension]
          const secondSize = second.getBoundingClientRect()[dimension]
          if (firstSize + secondSize > 0) ratios.set(element.dataset.documentSplitId!, clampDocumentPaneRatio(firstSize / (firstSize + secondSize)))
        }
      }
      for (const { element, original, originalFixed } of splits) {
        const ratio = ratios.get(element.dataset.documentSplitId!)
        element.style[property] = ratio === undefined ? original : `minmax(0, ${ratio}fr) 6px minmax(0, ${1 - ratio}fr)`
        if (originalFixed) element.style.setProperty('--document-pane-fixed-track', originalFixed)
        else element.style.removeProperty('--document-pane-fixed-track')
      }
      canvases.restore()
      const apply = (node: DocumentPaneNode): DocumentPaneNode => {
        if (node.kind === 'leaf') return node
        const first = apply(node.first), second = apply(node.second)
        const ratio = ratios.get(node.id) ?? node.ratio
        return first === node.first && second === node.second && Math.abs(ratio - node.ratio) < 1e-9
          ? node : { ...node, first, second, ratio }
      }
      return apply(layout)
    }
  }
}
