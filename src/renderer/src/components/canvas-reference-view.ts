import type { CanvasReference } from '@/store/canvas-references'
import { referenceOutlinePath, referenceScreenBounds, type ReferenceViewport } from './canvas-reference-geometry'

/** Update during the canvas preview RAF, before the browser paints either surface. */
export function synchronizeReferenceViewport(images: readonly CanvasReference[], elements: ReadonlyMap<string, HTMLImageElement>, viewport: ReferenceViewport, selected: string | null, root: HTMLElement | null): void {
  for (const source of images) {
    const element = elements.get(source.id)
    const wrapper = element?.parentElement
    if (!element || !wrapper) continue
    const image = referenceScreenBounds(source, viewport)
    Object.assign(wrapper.style, { left: `${image.x}px`, top: `${image.y}px`, width: `${image.width}px`, height: `${image.height}px`, transform: `rotate(${image.angle}deg)` })
    element.style.transform = `scale(${image.flipX ? -1 : 1}, ${image.flipY ? -1 : 1})`
    if (source.id === selected) {
      const path = referenceOutlinePath(image)
      root?.querySelectorAll('.palette-selection-outline path').forEach(element => element.setAttribute('d', path))
    }
  }
}
