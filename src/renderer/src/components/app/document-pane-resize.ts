import { clampDocumentPaneRatio, type DocumentPaneOrientation } from '@/core/document-pane-layout'
import { beginWorkspaceResize, createResizeFrame, endWorkspaceResize } from '../workspace-resize'

type Point = { clientX: number; clientY: number }

/** Retain the existing canvas surfaces. The pane clips them while its boundary
 * moves; neither backing buffers nor document views change during the gesture. */
export function freezeDocumentPaneCanvases(container: HTMLElement) {
  const surfaces = [...container.querySelectorAll<HTMLElement>('.document-pane-canvas-content > .stage-surface')].flatMap(surface => {
    const parent = surface.parentElement!
    const rect = parent.getBoundingClientRect()
    const style = getComputedStyle(surface)
    const width = Number.parseFloat(style.width), height = Number.parseFloat(style.height)
    if (!(width > 0 && height > 0 && rect.width > 0 && rect.height > 0)) return []
    return [{ surface, parent, rect, width, height, scaleX: rect.width / width, scaleY: rect.height / height,
      original: { width: surface.style.width, height: surface.style.height, transform: surface.style.transform, willChange: surface.style.willChange } }]
  })
  for (const { surface, width, height } of surfaces) {
    surface.dataset.canvasResizeFrozen = 'true'
    surface.style.width = `${width}px`
    surface.style.height = `${height}px`
    surface.style.willChange = 'transform'
  }
  return {
    update(): void {
      // Batch layout reads before transform writes, including nested splits.
      const positions = surfaces.map(({ parent }) => parent.getBoundingClientRect())
      surfaces.forEach(({ surface, rect, scaleX, scaleY }, index) => {
        surface.style.transform = `translate(${(rect.left - positions[index].left) / scaleX}px, ${(rect.top - positions[index].top) / scaleY}px)`
      })
    },
    restore(): void {
      for (const { surface, original } of surfaces) {
        Object.assign(surface.style, original)
        delete surface.dataset.canvasResizeFrozen
      }
    }
  }
}

export function beginDocumentPaneResize(container: HTMLElement, orientation: DocumentPaneOrientation, startRatio: number, start: Point) {
  const horizontal = orientation === 'horizontal'
  const bounds = container.getBoundingClientRect()
  const divider = container.querySelector<HTMLElement>(':scope > .document-pane-resizer')?.getBoundingClientRect()
  const span = horizontal ? bounds.width - (divider?.width ?? 0) : bounds.height - (divider?.height ?? 0)
  const property = horizontal ? 'gridTemplateColumns' : 'gridTemplateRows'
  const originalTemplate = container.style[property]
  const canvases = freezeDocumentPaneCanvases(container)
  beginWorkspaceResize()
  let ratio = startRatio
  let finished = false
  const frame = createResizeFrame(point => {
    if (span <= 0) return
    const delta = horizontal ? point.clientX - start.clientX : point.clientY - start.clientY
    const next = clampDocumentPaneRatio(startRatio + delta / span)
    if (ratio === next) return
    ratio = next
    container.style[property] = `minmax(0, ${ratio}fr) 6px minmax(0, ${1 - ratio}fr)`
    canvases.update()
  })
  return {
    move(point: Point): void { if (!finished) frame.push(point) },
    finish(cancelled: boolean, commit: (ratio: number) => void): void {
      if (finished) return
      finished = true
      try {
        if (cancelled) {
          frame.cancel()
          container.style[property] = originalTemplate
        } else {
          frame.flush()
          if (ratio !== startRatio) commit(ratio)
        }
      } finally {
        canvases.restore()
        endWorkspaceResize()
      }
    }
  }
}
